/**
 * Real address autocomplete on the checkout street field.
 *
 * The point is not convenience — it is that the string reaching the geocoder
 * resolves. Freehand text like "hrzael 34" produced no delivery rate at all,
 * which silently blocked the order.
 *
 * Uses PlaceAutocompleteElement. The legacy google.maps.places.Autocomplete
 * class was closed to new customers on 2025-03-01 and answers REQUEST_DENIED,
 * so it is not an option here regardless of how the key is configured.
 *
 * Maps is loaded on demand rather than with a script tag, because another
 * plugin already loads it and two copies on one page break the API.
 */
(function ($) {
  'use strict';

  var wired = false;

  function field() {
    return document.querySelector('#billing_address_1, #shipping_address_1');
  }

  function status(msg, kind) {
    var host = field();
    if (!host) return;
    var el = document.getElementById('alena-addr-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'alena-addr-status';
      host.parentNode.appendChild(el);
    }
    el.className = 'alena-addr-status' + (kind ? ' is-' + kind : '');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function sendCoords(lat, lng) {
    return $.post(AlenaAddr.ajaxUrl, {
      action: 'alena_addr_coords',
      nonce: AlenaAddr.nonce,
      lat: lat || '',
      lng: lng || ''
    });
  }

  /** Resolves once google.maps.places is usable, loading Maps only if absent. */
  function loadMaps() {
    if (window.google && google.maps && google.maps.importLibrary) {
      return google.maps.importLibrary('places');
    }
    if (window.__alenaMapsPromise) return window.__alenaMapsPromise;

    window.__alenaMapsPromise = new Promise(function (resolve, reject) {
      // Another plugin may already have a tag in flight — wait for it instead
      // of adding a second one.
      var existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
      if (existing) {
        var tries = 0;
        var poll = setInterval(function () {
          if (window.google && google.maps && google.maps.importLibrary) {
            clearInterval(poll);
            google.maps.importLibrary('places').then(resolve, reject);
          } else if (++tries > 100) {
            clearInterval(poll);
            reject(new Error('maps_timeout'));
          }
        }, 100);
        return;
      }

      if (!AlenaAddr.key) { reject(new Error('no_key')); return; }
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(AlenaAddr.key) +
              '&libraries=places&language=he&region=IL&loading=async&v=weekly';
      s.onerror = function () { reject(new Error('maps_load_failed')); };
      s.onload = function () { google.maps.importLibrary('places').then(resolve, reject); };
      document.head.appendChild(s);
    });
    return window.__alenaMapsPromise;
  }

  function componentOf(place, type) {
    var c = (place.addressComponents || []).find(function (x) {
      return (x.types || []).indexOf(type) !== -1;
    });
    return c ? (c.longText || c.long_name || '') : '';
  }

  function attach() {
    var f = field();
    if (!f || f.dataset.alenaAc === '1') return;

    loadMaps().then(function (places) {
      var Element = places && places.PlaceAutocompleteElement;
      if (!Element) return $.Deferred().reject().promise();

      // Loading the library proves nothing about whether the project may call
      // it — "Places API (New) is disabled" only surfaces on the first real
      // query. Ask for one suggestion up front so a disabled API leaves the
      // plain field working instead of a picker that never returns anything.
      return places.AutocompleteSuggestion
        .fetchAutocompleteSuggestions({ input: 'רוטשילד', includedRegionCodes: ['il'] })
        .then(function () { return places; });
    }).then(function (places) {
      var Element = places.PlaceAutocompleteElement;
      if (f.dataset.alenaAc === '1') return;
      f.dataset.alenaAc = '1';

      var el = new Element({ componentRestrictions: { country: ['il'] } });
      el.className = 'alena-addr-ac';
      if (f.value) el.value = f.value;

      // The real WooCommerce input stays in the DOM so the form still submits
      // it — it is just driven by the picker instead of typed into.
      f.classList.add('alena-addr-hidden');
      f.parentNode.insertBefore(el, f.nextSibling);

      el.addEventListener('gmp-select', function (ev) {
        var pred = ev.placePrediction;
        if (!pred) return;
        var place = pred.toPlace();
        status('בודקים אם אנחנו מגיעים לכתובת…', '');

        place.fetchFields({ fields: ['addressComponents', 'location', 'formattedAddress'] })
          .then(function () {
            var street = componentOf(place, 'route');
            var number = componentOf(place, 'street_number');
            var city   = componentOf(place, 'locality') ||
                         componentOf(place, 'administrative_area_level_2');
            var line   = (street + ' ' + number).trim() || place.formattedAddress || '';

            f.value = line;
            $(f).trigger('change');

            var cityField = document.querySelector('#billing_city, #shipping_city');
            if (cityField && city) { cityField.value = city; $(cityField).trigger('change'); }

            var loc = place.location;
            var lat = loc && (typeof loc.lat === 'function' ? loc.lat() : loc.lat);
            var lng = loc && (typeof loc.lng === 'function' ? loc.lng() : loc.lng);

            // .always() used to print a green ✓ for anything Google resolved,
            // so an address well outside every zone looked accepted and the
            // customer only found out at the shipping step. The server now
            // says whether the point falls inside a delivery polygon.
            return sendCoords(lat, lng).done(function (resp) {
              $(document.body).trigger('update_checkout');
              var zone = resp && resp.data ? resp.data.zone : null;
              var where = line + (city ? ', ' + city : '');

              if (!zone) {
                status('לא מגיעים לכתובת הזו 😕 — ' + where +
                       ' מחוץ לאזורי החלוקה שלנו. אפשר לבחור איסוף עצמי.', 'err');
                return;
              }
              if (!number) {
                status('חסר מספר בית — הוסיפו אותו כדי שהשליח ימצא אתכם', 'warn');
                return;
              }
              var extra = ' · משלוח ₪' + Math.round(zone.fee);
              if (zone.min > 0) extra += ' · מינ׳ הזמנה ₪' + Math.round(zone.min);
              status('✓ ' + where + extra, 'ok');
            }).fail(function () {
              $(document.body).trigger('update_checkout');
              status('לא הצלחנו לבדוק את הכתובת — נסו שוב', 'warn');
            });
          })
          .catch(function () {
            status('לא הצלחנו לאמת את הכתובת — נסו שוב', 'warn');
          });
      });
    }).catch(function () {
      // No key, no Places, or the API is blocked — leave the plain field usable
      // rather than leaving the customer with a dead control.
      f.dataset.alenaAc = '';
      f.classList.remove('alena-addr-hidden');
    });
  }

  $(function () {
    if (wired) return;
    wired = true;
    attach();
    // WooCommerce replaces the form on every update; re-attach afterwards.
    $(document.body).on('updated_checkout', attach);
  });
})(jQuery);
