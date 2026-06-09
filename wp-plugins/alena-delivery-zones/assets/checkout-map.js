/**
 * Checkout page map — auto-centers on the entered address and lets the
 * customer drag a marker to the exact spot. The pin is also POSTed to a
 * WC AJAX endpoint so the shipping method can use it on the next totals
 * refresh.
 */
(function ($) {
  'use strict';

  let map, marker, geocoder;
  let lastAddrKey = '';
  let pinSaveTimer = null;

  function init() {
    const el = document.getElementById('alena-dz-checkout-map');
    if (!el || typeof google === 'undefined' || !google.maps) return;

    map = new google.maps.Map(el, {
      center: AlenaDZCheckout.center,
      zoom: 17,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
    geocoder = new google.maps.Geocoder();

    map.addListener('click', e => placeMarker(e.latLng));

    // Whenever the address fields change, re-geocode and re-center
    const sel = '#shipping_address_1, #shipping_city, #billing_address_1, #billing_city';
    $(document).on('change blur', sel, debounce(recenterFromAddress, 600));

    // Initial geocoding from prefilled fields, if any
    recenterFromAddress();
  }

  function placeMarker(latlng) {
    if (!marker) {
      marker = new google.maps.Marker({
        map: map,
        draggable: true,
        animation: google.maps.Animation.DROP,
      });
      marker.addListener('dragend', e => onPinChanged(e.latLng));
    }
    marker.setPosition(latlng);
    map.panTo(latlng);
    map.setZoom(18); // close-in view so the customer can see entrances/parking
    onPinChanged(latlng);
  }

  function onPinChanged(latlng) {
    const lat = latlng.lat();
    const lng = latlng.lng();
    $('#alena_pin_lat').val(lat);
    $('#alena_pin_lng').val(lng);
    $('#alena-dz-pin-status').text(
      '✓ נשמר: ' + lat.toFixed(5) + ', ' + lng.toFixed(5)
    );
    // Debounce the server-side save so dragging doesn't spam AJAX
    if (pinSaveTimer) clearTimeout(pinSaveTimer);
    pinSaveTimer = setTimeout(() => savePinToServer(lat, lng), 500);
  }

  function savePinToServer(lat, lng) {
    $.post(AlenaDZCheckout.ajaxUrl, {
      action: 'alena_dz_save_pin',
      nonce: AlenaDZCheckout.nonce,
      lat: lat,
      lng: lng,
    }).done(function () {
      // Trigger WooCommerce to refresh shipping totals
      $('body').trigger('update_checkout');
    });
  }

  function recenterFromAddress() {
    const addr = ($('#shipping_address_1').val() || $('#billing_address_1').val() || '').trim();
    const city = ($('#shipping_city').val()      || $('#billing_city').val()      || '').trim();
    if (!addr || !city) return;
    const full = addr + ', ' + city + ', ישראל';
    const key = full.toLowerCase().replace(/\s+/g, '');
    if (key === lastAddrKey) return;
    lastAddrKey = key;
    geocoder.geocode({ address: full, language: 'he', region: 'il' }, (res, status) => {
      if (status !== 'OK' || !res || !res[0]) return;
      placeMarker(res[0].geometry.location);
    });
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      const ctx  = this;
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  // Google Maps loader will invoke this when the API is ready
  window.alenaDzCheckoutMapInit = init;

  // Also try on DOM ready, in case the Maps API loaded before our script
  $(function () {
    if (typeof google !== 'undefined' && google.maps && !map) init();
  });
})(jQuery);
