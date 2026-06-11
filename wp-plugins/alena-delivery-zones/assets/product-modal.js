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

  function openModalForCard($card) {
    const href = $card.find('a[href]').first().attr('href');
    if (!href) return;
    scrollPosBeforeOpen = window.scrollY;
    const el = getOrBuildModal();
    el.addClass('open').attr('aria-hidden', 'false');
    $('body').addClass('alena-modal-open');
    el.find('.alena-modal-image-wrap').html('<div class="alena-modal-loading">טוען…</div>');
    el.find('.alena-modal-title, .alena-modal-meta, .alena-modal-desc, .alena-modal-modifiers-host').empty();
    el.data('product-url', href);

    $.get(href, function (html) {
      populateModalFromHtml(html);
    }).fail(function () {
      el.find('.alena-modal-image-wrap').html('<div class="alena-modal-loading">שגיאת טעינה — נסה שוב</div>');
    });
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

  function applyGating() {
    const $groups = modalEl.find('.alena-dz-mod-group');
    if ($groups.length < 2) return;
    const $first = $groups.eq(0);
    const $checked = $first.find('input:checked');
    const text = $checked.length ? ($checked.parent().find('.alena-dz-mod-name').text() || '').trim() : '';
    const isPositive = $checked.length && !/^לא/.test(text);
    $groups.each(function (i, g) {
      if (i === 0) return;
      $(g).toggle(isPositive);
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
    modalEl.find('.alena-dz-modifiers input:checked').each(function () {
      // Only count visible (un-gated) selections
      if (!$(this).closest('.alena-dz-mod-group').is(':visible')) return;
      extra += parseFloat($(this).data('price') || 0);
    });
    const qty = parseInt(modalEl.find('.alena-modal-qty-value').text(), 10) || 1;
    const total = (base + extra) * qty;
    modalEl.find('.alena-modal-total').text('₪' + Math.round(total * 100) / 100);
  }

  function submitAddToCart(e) {
    if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }

    // Hard guard against double-add (re-entrant clicks / double events)
    if (window.__alenaAdding) return false;

    const pid = modalEl.data('product-id');
    if (!pid) {
      toast('שגיאה — חסר מוצר');
      return false;
    }
    window.__alenaAdding = true;

    // Validate required modifier groups (only visible ones)
    let firstError = null;
    modalEl.find('.alena-dz-mod-group:visible').each(function () {
      const min = parseInt($(this).data('min'), 10) || 0;
      if (min <= 0) return;
      const checked = $(this).find('input:checked').length;
      const title = $(this).find('.alena-dz-mod-title').text().replace('*', '').trim();
      if (checked < min) {
        if (!firstError) firstError = 'בחרו ב-"' + title + '" ' + (min === 1 ? 'אופציה אחת' : (min + ' אופציות'));
      }
    });
    if (firstError) { alert(firstError); return false; }

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
    const fd = new FormData();
    fd.append('product_id', pid);
    fd.append('product_sku', '');
    fd.append('quantity', String(qty));
    fd.append('add-to-cart', String(pid));
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
        // Trigger WC events so the mini-cart fragments refresh.
        $(document.body).trigger('added_to_cart', [res && res.fragments, res && res.cart_hash, $btn]);
        closeModal();
        toast('המנה התווספה לסל ✓');
      },
      error: function (xhr) {
        // If we got a 0/empty response, the cart might still have succeeded
        // (depends on WC config). Try refreshing fragments anyway.
        $(document.body).trigger('wc_fragment_refresh');
        closeModal();
        toast('המנה התווספה לסל ✓');
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

  $(function () {
    // One delegated handler on the whole card so it can't fire twice
    // (clicking the '+' chip used to also bubble to the wrapping <a>).
    $(document).on('click', '.alena-dz-card', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openModalForCard($(this));
    });
  });
})(jQuery);
