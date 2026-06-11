(function ($) {
  'use strict';

  function init() {
    initHeroMap();
    bindQtyControls();
    bindFulfillmentTabs();
    bindUpsell();
    applyFulfillmentMode((typeof AlenaDZCheckoutR !== 'undefined' && AlenaDZCheckoutR.fulfillment) || 'delivery');
    woltSummary();
    $(document.body).on('updated_checkout', woltSummary);
  }

  // ---------- One-click upsell add ----------
  function bindUpsell() {
    $(document).on('click', '.alena-co-up-add', function (e) {
      e.preventDefault();
      const pid = $(this).data('pid');
      const $card = $(this).closest('.alena-co-up-card');
      if (!pid) return;
      $(this).prop('disabled', true).text('✓');
      const fd = new FormData();
      fd.append('product_id', pid);
      fd.append('quantity', '1');
      fd.append('add-to-cart', pid);
      $.ajax({
        url: '/?wc-ajax=add_to_cart', type: 'POST', data: fd,
        processData: false, contentType: false,
        complete: function () {
          $card.slideUp(220, function () { $(this).remove(); });
          $('body').trigger('update_checkout');
        }
      });
    });
  }

  // ---------- Delivery / Pickup tabs ----------
  function bindFulfillmentTabs() {
    $(document).on('click', '.alena-co-tab', function () {
      const mode = $(this).data('mode');
      if ($(this).hasClass('active')) return;
      $('.alena-co-tab').removeClass('active');
      $(this).addClass('active');
      applyFulfillmentMode(mode);
      $.post('/?wc-ajax=alena_set_fulfillment', { mode: mode }).always(function () {
        $('body').trigger('update_checkout');
      });
    });
  }

  function applyFulfillmentMode(mode) {
    $('.alena-checkout-wrap').toggleClass('alena-pickup-mode', mode === 'pickup');
  }

  // ---------- Wolt-style summary card polish ----------
  function woltSummary() {
    const $review = $('#order_review');
    if (!$review.length) return;
    // Inject "סיכום" title once
    if (!$review.find('.alena-co-summary-title').length) {
      $review.prepend(
        '<h3 class="alena-co-summary-title">סיכום</h3>' +
        '<p class="alena-co-summary-sub">כולל מיסים (אם רלוונטי)</p>'
      );
    }
    // Append the live total to the place-order button
    const totalText = $review.find('tr.order-total .amount').first().text().trim();
    const $btn = $('#place_order');
    if ($btn.length && totalText) {
      if (!$btn.find('.alena-co-btn-total').length) {
        $btn.html('<span>להזמין</span><span class="alena-co-btn-total"></span>');
      }
      $btn.find('.alena-co-btn-total').text(totalText);
    }
  }

  // ---------- Hero map showing business + customer + polygons ----------
  function initHeroMap() {
    const el = document.getElementById('alena-checkout-overview-map');
    if (!el || typeof google === 'undefined' || !google.maps) {
      setTimeout(initHeroMap, 400);
      return;
    }
    const biz = AlenaDZCheckoutR.business;
    const map = new google.maps.Map(el, {
      center: biz,
      zoom: 13,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      disableDefaultUI: true,
      gestureHandling: 'none',
    });

    // Business marker
    new google.maps.Marker({
      position: biz,
      map: map,
      title: 'עלינא בפיתה',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#1e4a3a',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
    });

    // Polygons
    (AlenaDZCheckoutR.polygons || []).forEach(p => {
      const path = (p.coords || []).map(c => ({ lat: c[0], lng: c[1] }));
      new google.maps.Polygon({
        paths: path,
        map: map,
        strokeColor: '#f4a895',
        strokeOpacity: 0.85,
        strokeWeight: 1.5,
        fillColor: '#f4a895',
        fillOpacity: 0.18,
      });
    });

    // Customer marker — updated from session pin if available
    let customerMarker = null;
    function updateCustomer(lat, lng) {
      if (!lat || !lng) return;
      const pos = { lat: lat, lng: lng };
      if (!customerMarker) {
        customerMarker = new google.maps.Marker({
          position: pos,
          map: map,
          title: 'הכתובת שלך',
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#c83a3a',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
        // Draw line between business and customer
        new google.maps.Polyline({
          path: [biz, pos],
          map: map,
          strokeColor: '#1e4a3a',
          strokeOpacity: 0.5,
          strokeWeight: 2,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
            offset: '0',
            repeat: '12px',
          }],
        });
      } else {
        customerMarker.setPosition(pos);
      }
      // Fit bounds to both
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(biz);
      bounds.extend(pos);
      map.fitBounds(bounds, { top: 60, bottom: 30, left: 30, right: 30 });
    }

    // Watch the existing #alena_pin_lat/lng inputs (set by the smaller checkout map)
    function pickup() {
      const lat = parseFloat($('#alena_pin_lat').val() || '0');
      const lng = parseFloat($('#alena_pin_lng').val() || '0');
      if (lat && lng) updateCustomer(lat, lng);
    }
    $(document).on('change', '#alena_pin_lat, #alena_pin_lng', pickup);
    setInterval(pickup, 2000); // also poll in case of programmatic change
    pickup();
  }

  // ---------- Inline qty controls ----------
  function bindQtyControls() {
    $(document).on('click', '.alena-co-qty-plus, .alena-co-qty-minus', function (e) {
      e.preventDefault();
      const $wrap = $(this).closest('.alena-co-qty');
      const $val  = $wrap.find('.alena-co-qty-val');
      const cur   = parseInt($val.text(), 10) || 1;
      const next  = $(this).hasClass('alena-co-qty-plus') ? cur + 1 : Math.max(1, cur - 1);
      if (next === cur) return;
      $val.text(next);
      const key = $wrap.data('key');
      updateQty(key, next, $wrap);
    });
  }

  function updateQty(key, qty, $wrap) {
    $wrap.css('opacity', '0.6');
    $.post('/?wc-ajax=update_cart_qty', { cart_item_key: key, quantity: qty }).always(function () {
      // Refresh checkout
      $('body').trigger('update_checkout');
      setTimeout(() => $wrap.css('opacity', ''), 400);
    });
  }

  $(init);
})(jQuery);
