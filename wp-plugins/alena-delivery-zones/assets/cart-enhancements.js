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
