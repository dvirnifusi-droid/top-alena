(function ($) {
  'use strict';

  // Animate qty change — pulse the total in summary
  $(document.body).on('updated_cart_totals', function () {
    const $total = $('.cart_totals .order-total .amount, .alena-cart-mega-total');
    if (!$total.length) return;
    $total.css('animation', 'none');
    void $total[0].offsetWidth; // reflow
    $total.css('animation', 'alena-cart-pulse 0.5s ease');
  });

  // Add a keyframe for pulse on the fly
  $('<style>').text(
    '@keyframes alena-cart-pulse { 0% { transform: scale(1); } 40% { transform: scale(1.10); color: #1e4a3a; } 100% { transform: scale(1); } }'
  ).appendTo('head');
})(jQuery);
