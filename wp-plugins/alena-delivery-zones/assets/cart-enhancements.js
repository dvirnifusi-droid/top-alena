(function ($) {
  'use strict';

  // ----- Tip picker -----
  $(document).on('click', '.alena-dz-tip-opt', function () {
    const amount = parseFloat($(this).data('amount')) || 0;
    const nonce  = $(this).data('nonce');
    $('.alena-dz-tip-opt').removeClass('active');
    $(this).addClass('active');
    $('.alena-dz-tip-custom').val('');
    setTip(amount, nonce);
  });
  $(document).on('change input', '.alena-dz-tip-custom', function () {
    const amount = parseFloat($(this).val()) || 0;
    const nonce = $(this).data('nonce');
    $('.alena-dz-tip-opt').removeClass('active');
    setTip(amount, nonce);
  });
  function setTip(amount, nonce) {
    $.post(AlenaDZCart.ajaxUrl, {
      action: 'alena_dz_set_tip',
      nonce: nonce,
      amount: amount,
    }).done(function () {
      // Trigger WC checkout to recalc totals
      $('body').trigger('update_checkout');
    });
  }

  // ----- Mini cart refresh after add_to_cart events AND on every page load -----
  $(document.body).on('added_to_cart updated_cart_totals wc_fragments_refreshed removed_from_cart', refreshMiniCart);
  // Self-heal on initial load — server-rendered count may be stale due to caching
  // or persistent-cart restore. AJAX-pull the truth from the server within 100ms.
  $(function () { setTimeout(refreshMiniCart, 100); });
  // Defensive: ensure the floating shop cart bar exists in the DOM.
  // Some themes / plugins (Popup Maker, Elementor wrappers) can strip footer
  // content. We re-create the bar at the end of body on DOM ready, then update
  // it from refreshMiniCart. The PHP render is still kept for SSR fidelity.
  function ensureShopCartBar() {
    if (document.getElementById('alena-shop-cart-bar')) return;
    if (!AlenaDZCart || !AlenaDZCart.cartUrl) return;
    // Don't show on cart / checkout / account
    const path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('/cart') !== -1) return;
    if (path.indexOf('/checkout') !== -1) return;
    if (path.indexOf('/my-account') !== -1) return;
    const a = document.createElement('a');
    a.id = 'alena-shop-cart-bar';
    a.className = 'alena-shop-cart-bar';
    a.href = AlenaDZCart.cartUrl;
    a.setAttribute('aria-label', 'מעבר לסל הקניות');
    a.innerHTML =
      '<span class="alena-shop-cart-bar-left">' +
        '<span class="alena-shop-cart-bar-icon" aria-hidden="true">🛒</span>' +
        '<span class="alena-shop-cart-bar-count alena-dz-mini-cart-count">0</span>' +
        '<span class="alena-shop-cart-bar-label">פריטים בסל</span>' +
      '</span>' +
      '<span class="alena-shop-cart-bar-cta">' +
        '<span class="alena-shop-cart-bar-total alena-dz-mini-cart-total"></span>' +
        '<span class="alena-shop-cart-bar-go">מעבר לסל ←</span>' +
      '</span>';
    document.body.appendChild(a);
  }

  $(function () {
    ensureShopCartBar();
    refreshMiniCart();
    // Re-check periodically in case some script removed it
    setTimeout(ensureShopCartBar, 1200);
    setTimeout(ensureShopCartBar, 3000);
  });

  function refreshMiniCart() {
    ensureShopCartBar();
    $.post(AlenaDZCart.ajaxUrl, { action: 'alena_dz_minicart', nonce: AlenaDZCart.nonce }, function (r) {
      if (!r || !r.success) return;
      const count = parseInt(r.data.count, 10) || 0;
      $('.alena-dz-mini-cart-count').text(count);
      $('.alena-dz-mini-cart-total').html(r.data.total || '');
      $('.alena-dz-mini-cart').toggleClass('has-items', count > 0);
      $('.alena-dz-bn-badge').text(count);
      // Floating bottom cart bar — slides up when first item lands
      $('.alena-shop-cart-bar').toggleClass('has-items', count > 0);
    });
  }
})(jQuery);

/* Top-up chips inside the "under the minimum" notice. Adding must NOT reload
   the checkout: the customer has already typed their name and address, and a
   page load would throw it away. WooCommerce's AJAX endpoint adds the item and
   the checkout is refreshed in place. */
jQuery(function ($) {
  $(document.body).on('click', '.alena-topup-item', function (e) {
    e.preventDefault();
    var $a = $(this);
    var ids = String($a.data('ids') || '').split(',').filter(Boolean);
    if (!ids.length || $a.hasClass('is-busy')) return;
    $a.addClass('is-busy');
    var url = (window.wc_add_to_cart_params && wc_add_to_cart_params.wc_ajax_url
      ? wc_add_to_cart_params.wc_ajax_url.replace('%%endpoint%%', 'add_to_cart')
      : '/?wc-ajax=add_to_cart');
    // A deal can be more than one product; add them all before refreshing once.
    $.when.apply($, ids.map(function (id) {
      return $.post(url, { product_id: id, quantity: 1 });
    })).always(function () {
      $a.removeClass('is-busy');
      $(document.body).trigger('update_checkout');
      $(document.body).trigger('wc_fragment_refresh');
    });
  });
});


/* Checkout: fold what the customer has already decided, and keep the pay
   button reachable. The complaint was scrolling, not missing information --
   nothing is removed, only folded, and every fold opens. */
jQuery(function ($) {
  if (!$('body').hasClass('woocommerce-checkout')) return;

  function foldSummary() {
    var $rev = $('.woocommerce-checkout-review-order-table').first();
    if (!$rev.length || $rev.data('alenaFolded')) return;
    $rev.data('alenaFolded', 1);
    // WooCommerce REPLACES this table on every update, so the flag above rides
    // away with the old node while its bar stays behind. Clear stale bars or
    // they stack up, one per refresh.
    $('.alena-fold-bar').not('.alena-fold-extra').remove();
    var count = $rev.find('.cart_item, .alena-co-line').length;
    // FIRST amount in the total row: the row reads "159 (\u05db\u05d5\u05dc\u05dc 24.25 \u05de\u05e2\u05f4\u05de)",
    // so .last() was picking up the VAT and calling it the total.
    var total = ($rev.find('.order-total .amount').first().text() || '').trim();
    var $bar = $('<button type="button" class="alena-fold-bar"></button>')
      .html('<span>סיכום ההזמנה · ' + count + ' פריטים</span>' +
            '<span class="alena-fold-total">' + total + ' <i class="alena-fold-caret">&#9662;</i></span>');
    // OPEN by default: the summary is what a customer checks before paying,
    // so hiding it costs more than the scroll it saves. The bar stays as a
    // way to collapse it, not as a wall in front of it.
    $rev.before($bar);
    $bar.addClass('is-open');
    $bar.on('click', function () {
      $rev.toggleClass('alena-folded');
      $bar.toggleClass('is-open', !$rev.hasClass('alena-folded'));
    });
  }

  function foldOptional() {
    var $host = $('.alena-dz-extra-fields');
    if (!$host.length || $host.data('alenaFolded')) return;
    $host.data('alenaFolded', 1);
    var $t = $('<button type="button" class="alena-fold-bar alena-fold-extra">' +
               'פרטים נוספים (קומה, כניסה, הערות) <i class="alena-fold-caret">&#9662;</i></button>');
    $host.before($t).addClass('alena-folded');
    $t.on('click', function () {
      $host.toggleClass('alena-folded');
      $t.toggleClass('is-open', !$host.hasClass('alena-folded'));
    });
  }

  function run() { foldSummary(); foldOptional(); }
  run();
  $(document.body).on('updated_checkout', run);
});


/* Second pass: the blocks that still eat the page. */
jQuery(function ($) {
  if (!$('body').hasClass('woocommerce-checkout')) return;

  /* The address block. Once an address is chosen there is no reason to keep
     eight fields on screen -- one line and a way back in is enough. */
  function foldAddress() {
    var $wrap = $('.woocommerce-billing-fields__field-wrapper').first();
    if (!$wrap.length || $wrap.data('alenaAddrFold')) return;
    var addr = ($('#billing_address_1').val() || '').trim();
    var city = ($('#billing_city').val() || '').trim();
    var name = ($('#billing_first_name').val() || '').trim();
    if (!addr) return;                       // nothing saved yet -- leave it open
    $wrap.data('alenaAddrFold', 1);

    var line = [name, addr, city].filter(Boolean).join(' \u00b7 ');
    $('.alena-addr-fold').remove();
    var $bar = $('<button type="button" class="alena-fold-bar alena-addr-fold"></button>')
      .html('<span>\u05e9\u05dc\u05d9\u05d7\u05d4 \u05d0\u05dc \u00b7 ' + $('<div>').text(line).html() +
            '</span><span class="alena-fold-total">\u05e9\u05d9\u05e0\u05d5\u05d9 <i class="alena-fold-caret">&#9662;</i></span>');
    $wrap.before($bar).addClass('alena-folded');
    $bar.on('click', function () {
      $wrap.toggleClass('alena-folded');
      $bar.toggleClass('is-open', !$wrap.hasClass('alena-folded'));
    });
  }

  /* Payment methods. Four gateways with their logos and blurbs is the tallest
     block on the page; the chosen one is all a customer needs to see. */
  function foldPayment() {
    var $list = $('#payment ul.payment_methods');
    if (!$list.length || $list.data('alenaPayFold')) return;
    $list.data('alenaPayFold', 1);
    $('.alena-pay-fold').remove();

    function label() {
      var $on = $list.find('input[type=radio]:checked').closest('li').find('label').first();
      var t = ($on.text() || '').replace(/\s+/g, ' ').trim();
      return t || '\u05d1\u05d7\u05e8\u05d5 \u05d0\u05de\u05e6\u05e2\u05d9 \u05ea\u05e9\u05dc\u05d5\u05dd';
    }
    var $bar = $('<button type="button" class="alena-fold-bar alena-pay-fold"></button>');
    function paint() {
      $bar.html('<span>\ud83d\udcb3 ' + $('<div>').text(label()).html() +
                '</span><span class="alena-fold-total">\u05d4\u05d7\u05dc\u05e4\u05d4 <i class="alena-fold-caret">&#9662;</i></span>');
    }
    paint();
    $list.before($bar).addClass('alena-folded');
    $bar.on('click', function () {
      $list.toggleClass('alena-folded');
      $bar.toggleClass('is-open', !$list.hasClass('alena-folded'));
    });
    // Picking a method closes the list and shows the choice on the bar.
    $list.on('change', 'input[type=radio]', function () {
      paint();
      $list.addClass('alena-folded');
      $bar.removeClass('is-open');
    });
  }

  function run2() { foldAddress(); foldPayment(); }
  run2();
  $(document.body).on('updated_checkout', run2);
});
