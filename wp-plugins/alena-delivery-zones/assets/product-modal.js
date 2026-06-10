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

    if (modsHost) {
      modalEl.find('.alena-modal-modifiers-host').html(modsHost.outerHTML);
      // Need the WP form/inputs to be inside our own form so submit works
      const productId = cartForm?.querySelector('input[name="add-to-cart"]')?.value;
      modalEl.data('product-id', productId || '');
      // Build a real form to wrap the modifier inputs
      const $wrap = modalEl.find('.alena-modal-modifiers-host .alena-dz-modifiers');
      const $form = $('<form class="alena-modal-form" method="post"></form>');
      $form.attr('action', cartForm?.action || (modalEl.data('product-url') + '?add-to-cart=' + productId));
      $form.append('<input type="hidden" name="add-to-cart" value="' + (productId || '') + '" />');
      $form.append('<input type="hidden" name="quantity" value="1" class="alena-modal-form-qty" />');
      $wrap.before($form);
      $form.append($wrap.detach());
      // Per-item notes textarea
      $form.append(
        '<div class="alena-modal-note">' +
          '<label>הערה למנה (אופציונלי)</label>' +
          '<textarea name="alena_item_note" rows="2" placeholder="פחות חריף, ללא קצף, וכו׳" maxlength="240"></textarea>' +
        '</div>'
      );
      // WhatsApp share button
      $form.append(
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

  function submitAddToCart() {
    const $form = modalEl.find('.alena-modal-form');
    if (!$form.length) {
      window.location.href = modalEl.data('product-url') || '/shop/';
      return;
    }
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
    if (firstError) { alert(firstError); return; }

    // Set quantity, build payload, send via WC's AJAX endpoint so we
    // stay on the shop page and just close the modal afterwards.
    const qty = parseInt(modalEl.find('.alena-modal-qty-value').text(), 10) || 1;
    $form.find('.alena-modal-form-qty').val(qty);

    const $btn = modalEl.find('.alena-modal-add');
    const originalLabel = $btn.html();
    $btn.prop('disabled', true).text('מוסיף לסל…');

    // Build a FormData from the form
    const fd = new FormData($form[0]);
    // WC's add-to-cart AJAX expects 'product_id'
    const pid = $form.find('input[name="add-to-cart"]').val();
    fd.append('product_id', pid);

    $.ajax({
      url: '/?wc-ajax=add_to_cart',
      type: 'POST',
      data: fd,
      processData: false,
      contentType: false,
      success: function (res) {
        // WC returns a JSON object with cart fragments + error info
        if (res && res.error && res.product_url) {
          // Server says we should navigate (e.g. variation required)
          window.location.href = res.product_url;
          return;
        }
        // Trigger WC events so the mini-cart updates
        $(document.body).trigger('added_to_cart', [res && res.fragments, res && res.cart_hash, $btn]);
        closeModal();
        toast('המנה התווספה לסל ✓');
      },
      error: function () {
        toast('שגיאה — נסה שוב');
        $btn.prop('disabled', false).html(originalLabel);
      },
      complete: function () {
        $btn.prop('disabled', false).html(originalLabel);
      }
    });
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
    // Intercept product card clicks on the shop loop only
    $(document).on('click', '.alena-dz-card a, .alena-dz-card .alena-dz-card-add', function (e) {
      const $card = $(this).closest('.alena-dz-card');
      if (!$card.length) return;
      // Don't intercept the explicit cart-add (the "+") — it should still work
      // straight away without opening the modal for items without modifiers.
      // But if the product has modifiers we WANT to show the modal.
      e.preventDefault();
      e.stopPropagation();
      openModalForCard($card);
    });
  });
})(jQuery);
