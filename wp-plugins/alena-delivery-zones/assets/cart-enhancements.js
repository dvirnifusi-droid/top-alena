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

  // ----- Mini cart refresh after add_to_cart events -----
  $(document.body).on('added_to_cart updated_cart_totals wc_fragments_refreshed', refreshMiniCart);
  function refreshMiniCart() {
    $.post(AlenaDZCart.ajaxUrl, { action: 'alena_dz_minicart', nonce: AlenaDZCart.nonce }, function (r) {
      if (!r || !r.success) return;
      $('.alena-dz-mini-cart-count').text(r.data.count);
      $('.alena-dz-mini-cart-total').html(r.data.total);
      $('.alena-dz-mini-cart').toggleClass('has-items', r.data.count > 0);
      $('.alena-dz-bn-badge').text(r.data.count);
    });
  }
})(jQuery);
