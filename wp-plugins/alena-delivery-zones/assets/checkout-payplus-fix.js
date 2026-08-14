(function ($) {
  'use strict';

  // Only run on the checkout page
  if (!$('body').hasClass('woocommerce-checkout')) return;

  /**
   * PayPlus plugin sometimes injects its iframe high up in the DOM
   * (e.g. directly under <body>), not inside the WC payment method area.
   * This script hunts for stray PayPlus iframes and relocates them
   * into the correct slot so the customer sees them in context.
   */
  function relocatePayPlusIframes() {
    const $paymentArea = $('#payment .payment_box, .woocommerce-checkout-payment .payment_methods + .place-order, #order_review');
    const $target = $paymentArea.first().length ? $paymentArea.first() : $('#order_review');
    if (!$target.length) return;

    // Hide any PayPlus iframe that lives above the payment area
    $('iframe').each(function () {
      const $f = $(this);
      const src  = ($f.attr('src')  || '').toLowerCase();
      const name = ($f.attr('name') || '').toLowerCase();
      const id   = ($f.attr('id')   || '').toLowerCase();
      const isPP = src.indexOf('payplus') >= 0 ||
                   name.indexOf('payplus') >= 0 ||
                   id.indexOf('payplus')   >= 0;
      if (!isPP) return;

      // Check if it's already inside the payment area
      if ($f.closest('#payment').length) return;

      // It's stray — relocate it next to PayPlus's payment method radio
      const $payplusLi = $('li.payment_method_payplus-payment-gateway, li[class*="payplus"], #payment li:has(label:contains("PayPlus"))').first();
      if ($payplusLi.length) {
        let $box = $payplusLi.find('.payment_box');
        if (!$box.length) {
          $box = $('<div class="payment_box payment_method_payplus-payment-gateway"></div>').appendTo($payplusLi);
        }
        $f.appendTo($box);
        $box.show();
      } else {
        // No PayPlus method visible — just hide the stray iframe
        $f.hide();
      }
    });

    // Also hide any standalone PayPlus container divs above the payment area
    $('body > div[id*="payplus"], body > div[class*="payplus"]').each(function () {
      const $div = $(this);
      if ($div.closest('#payment').length || $div.closest('.alena-checkout-wrap').length) return;
      // If it contains an iframe we already relocated, hide the wrapper
      $div.hide();
    });
  }

  // Run on multiple events to catch the iframe whenever PayPlus appends it
  $(document).ready(relocatePayPlusIframes);
  $(document.body).on('updated_checkout payment_method_selected', relocatePayPlusIframes);
  setTimeout(relocatePayPlusIframes, 800);
  setTimeout(relocatePayPlusIframes, 2000);
  setTimeout(relocatePayPlusIframes, 4000);

  // Watch DOM for any new iframe and relocate it immediately
  if (window.MutationObserver) {
    const obs = new MutationObserver(function (muts) {
      let found = false;
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (!n.tagName) return;
          if (n.tagName === 'IFRAME' || (n.querySelector && n.querySelector('iframe[src*="payplus"]'))) {
            found = true;
          }
        });
      });
      if (found) setTimeout(relocatePayPlusIframes, 100);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
})(jQuery);
