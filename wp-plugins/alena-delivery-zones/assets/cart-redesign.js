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

  // Inject the actual cart total into the "מעבר לתשלום" CTA so it stays accurate
  // as items change. Pulls from .cart_totals order-total.
  function injectCheckoutCtaTotal() {
    const $cta = $('.wc-proceed-to-checkout a.checkout-button');
    if (!$cta.length) return;
    const totalText = $('.cart_totals tr.order-total .amount').first().text().trim();
    if (!totalText) return;
    let baseLabel = ($cta.data('base-label') || $cta.text().replace(/\s*\d+([.,]\d+)?\s*₪?\s*→?\s*$/, '').replace(/\s*→\s*$/, '').trim());
    if (!$cta.data('base-label')) $cta.data('base-label', baseLabel);
    // Render: "מעבר לתשלום · ₪123 →"
    $cta.text(baseLabel + ' · ' + totalText);
  }
  injectCheckoutCtaTotal();
  $(document.body).on('updated_cart_totals updated_wc_div', injectCheckoutCtaTotal);

  // Add a keyframe for pulse on the fly
  $('<style>').text(
    '@keyframes alena-cart-pulse { 0% { transform: scale(1); } 40% { transform: scale(1.10); color: #1e4a3a; } 100% { transform: scale(1); } }'
  ).appendTo('head');

  // Replace WC's default "×" with a trash-can icon so users grok it as a delete control.
  const TRASH_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
    '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
    '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>' +
    '</svg>';
  function swapRemoveIcons() {
    $('.woocommerce-cart td.product-remove a.remove').each(function () {
      const $a = $(this);
      if ($a.data('alena-iconified')) return;
      $a.data('alena-iconified', 1).html(TRASH_SVG).addClass('alena-trash-btn').attr('title', 'הסר מהסל').attr('aria-label', 'הסר מהסל');
    });
  }
  swapRemoveIcons();
  $(document.body).on('updated_cart_totals updated_wc_div', swapRemoveIcons);

  // Smooth AJAX remove — intercept the default WC × link, fade+slide the row, reload to refresh totals
  $(document).on('click', '.woocommerce-cart td.product-remove a.remove', function (e) {
    e.preventDefault();
    const $link = $(this);
    const $row  = $link.closest('tr');
    const url   = $link.attr('href');
    if (!url || $link.data('removing')) return;
    $link.data('removing', 1);
    $row.css({ 'pointer-events': 'none', 'transition': 'opacity .2s', 'opacity': '0.35' });
    $.ajax({ url: url, type: 'GET' })
      .done(function () {
        $row.slideUp(260, function () { window.location.reload(); });
      })
      .fail(function () {
        $row.css({ 'pointer-events': 'auto', 'opacity': '1' });
        $link.removeData('removing');
        alert('שגיאה במחיקה, נסו שוב');
      });
  });
})(jQuery);
