/**
 * Product modal — Wolt-style.
 *
 * Intercepts clicks on shop product cards. Loads the single-product
 * page in the background, extracts the image / title / price / short
 * description / modifiers form, and shows them in a fullscreen modal.
 *
 * The first modifier group acts as a gate: the remaining groups stay
 * collapsed until the customer picks an option whose name does NOT
 * start with "לא" (no thanks / no etc).
 */
(function ($) {
  'use strict';

  let modalEl, scrollPosBeforeOpen = 0;

  function getOrBuildModal() {
    if (modalEl) return modalEl;
    modalEl = $(
      '<div class="alena-modal-backdrop" aria-hidden="true">' +
        '<div class="alena-modal" role="dialog" aria-modal="true">' +
          '<button class="alena-modal-close" aria-label="סגור">✕</button>' +
          '<div class="alena-modal-scroll">' +
            '<div class="alena-modal-image-wrap"></div>' +
            '<div class="alena-modal-body">' +
              '<h2 class="alena-modal-title"></h2>' +
              '<div class="alena-modal-meta"></div>' +
              '<div class="alena-modal-desc"></div>' +
              '<div class="alena-modal-modifiers-host"></div>' +
            '</div>' +
          '</div>' +
          '<div class="alena-modal-foot">' +
            // Validation feedback belongs next to the button the customer just
            // pressed. The toast is pinned to the bottom of the viewport, which
            // on a tall screen sits far away from a centred dialog and reads as
            // "nothing happened".
            '<div class="alena-modal-err" role="alert" hidden></div>' +
            '<div class="alena-modal-qty">' +
              '<button type="button" class="alena-modal-qty-minus" aria-label="הפחת">–</button>' +
              '<span class="alena-modal-qty-value">1</span>' +
              '<button type="button" class="alena-modal-qty-plus" aria-label="הוסף">+</button>' +
            '</div>' +
            '<button type="button" class="alena-modal-add">להוסיף להזמנה <span class="alena-modal-total">₪0</span></button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    $('body').append(modalEl);
    bindModalEvents();
    return modalEl;
  }

  function bindModalEvents() {
    modalEl.on('click', '.alena-modal-close', closeModal);
    modalEl.on('click', function (e) {
      if (e.target === this) closeModal();
    });
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape' && modalEl.is('.open')) closeModal();
    });

    modalEl.on('click', '.alena-modal-qty-plus', function () {
      const $v = modalEl.find('.alena-modal-qty-value');
      $v.text(parseInt($v.text(), 10) + 1);
      recomputeTotal();
    });
    modalEl.on('click', '.alena-modal-qty-minus', function () {
      const $v = modalEl.find('.alena-modal-qty-value');
      const n = Math.max(1, parseInt($v.text(), 10) - 1);
      $v.text(n);
      recomputeTotal();
    });
    modalEl.on('change', '.alena-dz-modifiers input', function () {
      // Gating: first group decides visibility of the rest
      applyGating();
      enforceMax();
      recomputeTotal();
      // Clear the "you must choose" state as soon as the customer chooses.
      modalEl.find('.alena-modal-err').attr('hidden', true).text('');
      $(this).closest('.alena-dz-mod-group').removeClass('alena-dz-mod-error');
    });
    modalEl.on('click', '.alena-modal-add', submitAddToCart);

    // Block Enter in the note textarea from doing anything (no native submit).
    modalEl.on('keydown', '.alena-modal-note textarea', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); }
    });

    // WhatsApp share — uses current page URL + product title
    modalEl.on('click', '.alena-modal-share', function () {
      const title = $(this).data('share-title') || document.title;
      const url   = modalEl.data('product-url') || window.location.href;
      const text  = encodeURIComponent('בוא ניזמין מ-עלינא: ' + title + ' ' + url);
      window.open('https://wa.me/?text=' + text, '_blank');
    });
  }

  // id -> jqXHR/Promise of the dish payload. Kept for the life of the page so a
  // dish opened twice is instant, and so a prefetch started on touch is already
  // in flight (usually finished) by the time the tap completes.
  const dishCache = {};

  function fetchDish(id) {
    if (!id) return null;
    if (!dishCache[id]) {
      const url = (window.AlenaDishModal && AlenaDishModal.ajaxUrl) || '/wp-admin/admin-ajax.php';
      dishCache[id] = $.get(url, { action: 'alena_dish_payload', id: id })
        .then(function (r) {
          if (!r || !r.success) return $.Deferred().reject(r);
          return r.data;
        });
      // A failed lookup must not poison the cache for the next tap.
      dishCache[id].fail(function () { delete dishCache[id]; });
    }
    return dishCache[id];
  }

  function openModalForCard($card) {
    const id   = $card.data('product-id') || $card.attr('data-product-id');
    const href = $card.find('a[href]').first().attr('href');
    if (!id && !href) return;

    scrollPosBeforeOpen = window.scrollY;
    const el = getOrBuildModal();
    el.addClass('open').attr('aria-hidden', 'false');
    $('body').addClass('alena-modal-open');
    el.find('.alena-modal-image-wrap').html('<div class="alena-modal-skeleton"></div>');
    el.find('.alena-modal-title, .alena-modal-meta, .alena-modal-desc, .alena-modal-modifiers-host').empty();
    el.data('product-url', href);

    // Fast path: a few KB of JSON instead of GETting the whole product page,
    // which was ~230KB and over a second before anything appeared.
    const req = fetchDish(id);
    if (req) {
      req.done(populateModalFromPayload).fail(function () {
        if (href) $.get(href).done(populateModalFromHtml).fail(showModalError);
        else showModalError();
      });
      return;
    }
    $.get(href).done(populateModalFromHtml).fail(showModalError);
  }

  function showModalError() {
    modalEl.find('.alena-modal-image-wrap')
      .html('<div class="alena-modal-loading">שגיאת טעינה — נסה שוב</div>');
  }

  function populateModalFromPayload(d) {
    var img = '';
    if (d.img) {
      img = '<img alt="" src="' + d.img + '"' +
            (d.img_srcset ? ' srcset="' + d.img_srcset + '"' : '') +
            (d.img_sizes  ? ' sizes="' + d.img_sizes + '"'  : '') +
            // eager + async: this image IS the content, but decoding it must
            // not block the rest of the dialog from painting.
            ' loading="eager" decoding="async" />';
    }
    modalEl.find('.alena-modal-image-wrap').html(img);
    modalEl.find('.alena-modal-title').text(d.title || '');

    let meta = d.price_html ? '<span class="alena-modal-price">' + d.price_html + '</span>' : '';
    if (d.featured) meta += ' <span class="alena-modal-pop-badge">פופולרי</span>';
    modalEl.find('.alena-modal-meta').html(meta);
    modalEl.find('.alena-modal-desc').html(d.desc || '');
    modalEl.data('product-id', d.id);

    if (d.mods_html) {
      modalEl.find('.alena-modal-modifiers-host').html(d.mods_html);
      modalEl.find('.alena-modal-modifiers-host .alena-dz-modifiers').after(
        '<div class="alena-modal-note">' +
          '<label>הערה למנה (אופציונלי)</label>' +
          '<textarea name="alena_item_note" rows="2" placeholder="פחות חריף, ללא קצף, וכו׳" maxlength="240"></textarea>' +
        '</div>' +
        '<button type="button" class="alena-modal-share" data-share-title="' + (d.title || '') + '">' +
          '📤 שתף ב-WhatsApp' +
        '</button>'
      );
    }
    applyGating();
    enforceMax();
    recomputeTotal();
  }

  function populateModalFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const imgEl = doc.querySelector('.woocommerce-product-gallery__image img, .woocommerce-product-gallery img, .product img.wp-post-image');
    const imgUrl = imgEl ? (imgEl.getAttribute('data-large_image') || imgEl.getAttribute('src')) : '';

    const title = doc.querySelector('.product_title')?.textContent?.trim() || '';
    const priceHtml = doc.querySelector('.summary .price')?.innerHTML || '';
    const isFeatured = !!doc.querySelector('.alena-dz-popular-badge');
    const shortDesc = doc.querySelector('.woocommerce-product-details__short-description')?.innerHTML || '';
    const modsHost  = doc.querySelector('.alena-dz-modifiers');
    const stickyBar = doc.querySelector('#alena-dz-sticky-bar');
    const cartForm  = doc.querySelector('form.cart');

    modalEl.find('.alena-modal-image-wrap').html(imgUrl ? '<img alt="" src="' + imgUrl + '" />' : '');
    modalEl.find('.alena-modal-title').text(title);

    let meta = priceHtml ? '<span class="alena-modal-price">' + priceHtml + '</span>' : '';
    if (isFeatured) meta += ' <span class="alena-modal-pop-badge">פופולרי</span>';
    modalEl.find('.alena-modal-meta').html(meta);

    modalEl.find('.alena-modal-desc').html(shortDesc);

    // Find the product ID from multiple possible sources (WC uses different
    // structures depending on theme — try them all).
    const productId =
        cartForm?.querySelector('input[name="add-to-cart"]')?.value
     || cartForm?.querySelector('button[name="add-to-cart"]')?.value
     || (cartForm?.action || '').match(/add-to-cart=(\d+)/)?.[1]
     || (doc.body.className.match(/postid-(\d+)/) || [])[1]
     || (doc.querySelector('[data-product_id]')?.getAttribute('data-product_id'))
     || '';
    modalEl.data('product-id', productId);

    if (modsHost) {
      modalEl.find('.alena-modal-modifiers-host').html(modsHost.outerHTML);
      // Append note + share — NO form to avoid any chance of native submit
      modalEl.find('.alena-modal-modifiers-host .alena-dz-modifiers').after(
        '<div class="alena-modal-note">' +
          '<label>הערה למנה (אופציונלי)</label>' +
          '<textarea name="alena_item_note" rows="2" placeholder="פחות חריף, ללא קצף, וכו׳" maxlength="240"></textarea>' +
        '</div>' +
        '<button type="button" class="alena-modal-share" data-share-title="' + (title || '') + '">' +
          '📤 שתף ב-WhatsApp' +
        '</button>'
      );
    }
    applyGating();
    enforceMax();
    recomputeTotal();
  }

  // A "gate" group is a Choice whose options are yes/no semantics
  // ("לא תודה" / "כן בבקשה"). It controls whether the NEXT Multichoice
  // is shown. Preference groups ("לא חריף" / "תוספת חריף") are NOT gates —
  // they're just two-way picks.
  function isGateGroup($g) {
    if (($g.data('type') || '') !== 'Choice') return false;
    let hasNoThanks = false, hasYesPlease = false;
    $g.find('.alena-dz-mod-row').each(function () {
      const t = ($(this).find('.alena-dz-mod-name').text() || '').trim();
      if (/^לא\s*תודה/.test(t)) hasNoThanks = true;
      if (/^כן\s*בבקשה/.test(t)) hasYesPlease = true;
    });
    return hasNoThanks && hasYesPlease;
  }

  function applyGating() {
    // Each gate question controls the SINGLE Multichoice group right after it.
    // Other groups are shown normally.
    let pendingGate = null; // null / 'yes' / 'no'
    modalEl.find('.alena-dz-mod-group').each(function () {
      const $g = $(this);
      if (isGateGroup($g)) {
        const $checked = $g.find('input:checked');
        if ($checked.length) {
          const text = ($checked.parent().find('.alena-dz-mod-name').text() || '').trim();
          pendingGate = /^לא/.test(text) ? 'no' : 'yes';
        } else {
          pendingGate = null;
        }
        $g.show();
      } else if ($g.data('type') === 'Multichoice' && pendingGate !== null) {
        $g.toggle(pendingGate === 'yes');
        pendingGate = null; // gate only affects the immediately following group
      } else {
        $g.show();
        pendingGate = null;
      }
    });
  }

  function enforceMax() {
    modalEl.find('.alena-dz-mod-group[data-type="Multichoice"]').each(function () {
      const max = parseInt($(this).data('max'), 10) || 0;
      if (max <= 0) return;
      const $boxes = $(this).find('input[type="checkbox"]');
      const checked = $boxes.filter(':checked').length;
      $boxes.each(function () {
        if (!this.checked) this.disabled = (checked >= max);
      });
    });
  }

  function getBasePrice() {
    const $priceEl = modalEl.find('.alena-modal-price .woocommerce-Price-amount').first();
    if (!$priceEl.length) return 0;
    const txt = $priceEl.text().replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(txt) || 0;
  }

  function recomputeTotal() {
    const base = getBasePrice();
    let extra = 0;
    // Per-group "first N free" pricing — cheapest selections in the group are the free ones.
    modalEl.find('.alena-dz-mod-group:visible').each(function () {
      const $g = $(this);
      const free = parseInt($g.data('free'), 10) || 0;
      const $checked = $g.find('input:checked');
      const prices = [];
      $checked.each(function () { prices.push(parseFloat($(this).data('price') || 0)); });
      prices.sort((a, b) => a - b);
      for (let i = free; i < prices.length; i++) extra += prices[i];

      // Visual: mark the cheapest `free` selected items as "חינם" so the customer
      // sees the discount in the row, not just in the total.
      if (free > 0 && $checked.length) {
        // Build a list of [checkbox, price] sorted by price ascending
        const ranked = [];
        $checked.each(function () { ranked.push({ el: this, price: parseFloat($(this).data('price') || 0) }); });
        ranked.sort((a, b) => a.price - b.price);
        ranked.forEach((r, idx) => {
          const $row = $(r.el).closest('.alena-dz-mod-row');
          if (idx < free) $row.addClass('alena-dz-row-free');
          else            $row.removeClass('alena-dz-row-free');
        });
      }
      // Clear "free" marker from rows that are no longer checked
      $g.find('.alena-dz-mod-row').each(function () {
        if (!$(this).find('input').prop('checked')) $(this).removeClass('alena-dz-row-free');
      });
    });
    const qty = parseInt(modalEl.find('.alena-modal-qty-value').text(), 10) || 1;
    const total = (base + extra) * qty;
    modalEl.find('.alena-modal-total').text('₪' + Math.round(total * 100) / 100);
  }

  function submitAddToCart(e) {
    if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }

    // Diagnostic — counts how many times this fires per page
    window.__alenaAtcCount = (window.__alenaAtcCount || 0) + 1;
    const now = Date.now();
    console.log('[ALENA] submitAddToCart called — count=', window.__alenaAtcCount, 'guard=', !!window.__alenaAdding, 'sinceLast=', window.__alenaLastAt ? (now - window.__alenaLastAt) + 'ms' : 'first');

    // Hard guard against double-add — block if a recent add is in flight,
    // OR if any add (success or fail) happened in the last 1500ms.
    if (window.__alenaAdding) { console.log('[ALENA] BLOCKED by inflight guard'); return false; }
    if (window.__alenaLastAt && (now - window.__alenaLastAt) < 1500) { console.log('[ALENA] BLOCKED by 1500ms debounce'); return false; }
    window.__alenaLastAt = now;

    const pid = modalEl.data('product-id');
    if (!pid) {
      toast('שגיאה — חסר מוצר');
      return false;
    }
    window.__alenaAdding = true;

    // Validate required modifier groups (only visible ones).
    // On failure: scroll to the first missing group, highlight it, show inline error toast.
    let firstError = null;
    let $firstBadGroup = null;
    modalEl.find('.alena-dz-mod-group:visible').each(function () {
      const $g = $(this);
      const min = parseInt($g.data('min'), 10) || 0;
      $g.removeClass('alena-dz-mod-error');
      if (min <= 0) return;
      const checked = $g.find('input:checked').length;
      const title = $g.find('.alena-dz-mod-title').text().replace('*', '').trim();
      if (checked < min) {
        if (!firstError) {
          firstError = 'יש לבחור ב-"' + title + '" ' + (min === 1 ? 'אופציה אחת' : (min + ' אופציות'));
          $firstBadGroup = $g;
        }
      }
    });
    if (firstError) {
      window.__alenaAdding = false;
      if ($firstBadGroup) {
        $firstBadGroup.addClass('alena-dz-mod-error');
        // Scroll the modal so the error is visible
        const $scroller = modalEl.find('.alena-modal-scroll');
        if ($scroller.length) {
          const top = $firstBadGroup.position().top + $scroller.scrollTop() - 20;
          $scroller.animate({ scrollTop: top }, 280);
        }
      }
      modalEl.find('.alena-modal-err').text(firstError).removeAttr('hidden');
      toast(firstError);
      return false;
    }

    const qty = parseInt(modalEl.find('.alena-modal-qty-value').text(), 10) || 1;
    const note = modalEl.find('.alena-modal-note textarea').val() || '';

    // Collect modifier picks (group_index → [value_index, value_index])
    const mod = {};
    modalEl.find('.alena-dz-mod-group').each(function (g_idx) {
      if (!$(this).is(':visible')) return;
      const picks = [];
      $(this).find('input:checked').each(function () { picks.push($(this).val()); });
      if (picks.length) mod[g_idx] = picks;
    });

    const $btn = modalEl.find('.alena-modal-add');
    const originalLabel = $btn.html();
    $btn.prop('disabled', true).text('מוסיף לסל…');

    // POST directly to wc-ajax endpoint — no form, no native submit risk.
    // CRITICAL: do NOT include an `add-to-cart` field. WC's add_to_cart_action
    // hooks on init and reads $_REQUEST['add-to-cart'] — including it makes the
    // item get added twice (once by add_to_cart_action, once by the wc-ajax handler).
    const fd = new FormData();
    fd.append('product_id', pid);
    fd.append('product_sku', '');
    fd.append('quantity', String(qty));
    if (note) fd.append('alena_item_note', note);
    Object.keys(mod).forEach(g_idx => {
      mod[g_idx].forEach(v_idx => fd.append('alena_mod[' + g_idx + '][]', String(v_idx)));
    });

    $.ajax({
      url: '/?wc-ajax=add_to_cart',
      type: 'POST',
      data: fd,
      processData: false,
      contentType: false,
      dataType: 'json',
      success: function (res) {
        // WooCommerce answers 200 with {error:true} when it refuses the item
        // (out of stock, min/max rules). Treating that as success told the
        // customer the dish was added when it was not.
        if (res && res.error) {
          // res.message may carry markup — render it as text, never as HTML.
          const msg = $('<div>').html(res.message || '').text().trim();
          modalEl.find('.alena-modal-err')
            .text(msg || 'לא ניתן להוסיף את המנה כרגע')
            .removeAttr('hidden');
          return;
        }
        // Trigger WC events so the mini-cart fragments refresh.
        $(document.body).trigger('added_to_cart', [res && res.fragments, res && res.cart_hash, $btn]);
        closeModal();
        toast('המנה התווספה לסל ✓');
      },
      error: function (xhr) {
        // An empty/0 body can still mean the item went in, so re-read the cart
        // and let the real count decide — never claim success blindly.
        $(document.body).trigger('wc_fragment_refresh');
        $.get('/?wc-ajax=get_refreshed_fragments')
          .always(function () {
            closeModal();
            toast('המנה נשלחה לסל — בדקו את הסל');
          });
      },
      complete: function () {
        $btn.prop('disabled', false).html(originalLabel);
        setTimeout(function(){ window.__alenaAdding = false; }, 400);
      }
    });
    return false;
  }

  function toast(text) {
    const $t = $('<div class="alena-toast"></div>').text(text);
    $('body').append($t);
    setTimeout(() => $t.addClass('show'), 10);
    setTimeout(() => $t.removeClass('show'), 2200);
    setTimeout(() => $t.remove(), 2600);
  }

  function closeModal() {
    modalEl.removeClass('open').attr('aria-hidden', 'true');
    $('body').removeClass('alena-modal-open');
    window.scrollTo(0, scrollPosBeforeOpen);
  }

  // -----------------------------------------------------------
  // Warm the payload as soon as the finger lands (or the pointer hovers), so
  // by the time the tap completes the request is usually already back.
  // passive: the listener never calls preventDefault, so scrolling stays smooth.
  document.addEventListener('touchstart', function (e) {
    const card = e.target.closest && e.target.closest('li.alena-dz-card');
    if (card) fetchDish(card.getAttribute('data-product-id'));
  }, { passive: true });

  $(document).on('mouseenter', 'li.alena-dz-card', function () {
    fetchDish($(this).attr('data-product-id'));
  });

  // On-card stepper for products WITHOUT required modifiers
  // (Wolt pattern — saves 4 taps per add).
  // -----------------------------------------------------------
  function inlineAddToCart(productId, qty) {
    const fd = new FormData();
    fd.append('product_id', productId);
    fd.append('quantity', String(qty));
    return $.ajax({
      url: '/?wc-ajax=add_to_cart',
      type: 'POST',
      data: fd,
      processData: false,
      contentType: false,
      dataType: 'json',
    }).done(function (res) {
      $(document.body).trigger('added_to_cart', [res && res.fragments, res && res.cart_hash, $()]);
    });
  }

  function showCardStepper($card, qty) {
    let $stepper = $card.find('.alena-dz-card-stepper');
    if (!$stepper.length) {
      $stepper = $('<div class="alena-dz-card-stepper">' +
        '<button type="button" class="alena-dz-card-stepper-plus" aria-label="הוסף">+</button>' +
        '<span class="alena-dz-card-stepper-qty">1</span>' +
        '<button type="button" class="alena-dz-card-stepper-minus" aria-label="הסר">−</button>' +
      '</div>');
      $card.find('.alena-dz-card-bottom').append($stepper);
    }
    $stepper.find('.alena-dz-card-stepper-qty').text(qty);
    $card.attr('data-in-cart', qty > 0 ? '1' : '0');
  }

  $(function () {
    // Card click → open modal — EXCEPT when the card is "stepperable" and
    // the user tapped the + button (single tap add via AJAX).
    $(document).on('click', '.alena-dz-card', function (e) {
      const $card = $(this);
      const isStepperable = $card.hasClass('alena-dz-card-stepperable');
      const $tgt = $(e.target);

      // Stepperable + clicked the +/- → handle inline, no modal
      if (isStepperable && $tgt.hasClass('alena-dz-card-add')) {
        e.preventDefault(); e.stopPropagation();
        const pid = parseInt($card.data('product-id'), 10);
        if (!pid) return;
        const $btn = $tgt;
        if ($btn.data('busy')) return;
        $btn.data('busy', 1);
        const origText = $btn.text();
        $btn.text('…');
        const current = parseInt($card.find('.alena-dz-card-stepper-qty').text(), 10) || 0;
        inlineAddToCart(pid, 1).always(function () {
          $btn.data('busy', 0).text(origText);
        }).done(function () {
          showCardStepper($card, current + 1);
        });
        return;
      }
      if (isStepperable && ($tgt.hasClass('alena-dz-card-stepper-plus') || $tgt.hasClass('alena-dz-card-stepper-minus'))) {
        e.preventDefault(); e.stopPropagation();
        const pid = parseInt($card.data('product-id'), 10);
        if (!pid) return;
        const isPlus = $tgt.hasClass('alena-dz-card-stepper-plus');
        const $qty = $card.find('.alena-dz-card-stepper-qty');
        const current = parseInt($qty.text(), 10) || 0;
        const next = isPlus ? current + 1 : Math.max(0, current - 1);
        // Optimistic UI
        showCardStepper($card, next);
        // Ship the diff
        if (isPlus) {
          inlineAddToCart(pid, 1);
        } else {
          // Sending a negative quantity isn't supported by wc-ajax — easier to
          // reload to reflect the removal. Cheap on this UX path.
          window.location.reload();
        }
        return;
      }

      // Default: open the modal for products with required modifiers
      e.preventDefault();
      e.stopPropagation();
      openModalForCard($card);
    });
  });
})(jQuery);
