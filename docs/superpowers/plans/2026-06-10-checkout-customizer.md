# Plan 6 — Alena Checkout Customizer

**Goal:** התאמת עמוד הקופה של WooCommerce לדרישות של Dvir — להסיר שדות מיותרים, להוסיף שדות רלוונטיים למשלוח (כניסה / קומה / דירה), להפוך טלפון לחובה, ולאפשר ללקוח לסמן את הכתובת המדויקת על מפה.

**Where:** קוד נוסף בתוך הפלאגין `alena-delivery-zones`. אין צורך בפלאגין חדש — קל יותר ניהול.

**Tech:** PHP filters (`woocommerce_checkout_fields`, `woocommerce_checkout_get_value`, וכו') + Google Maps JS API + AJAX לעדכון התרגום של pin → polygon.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `includes/class-checkout-fields.php` | Create | מסיר/מוסיף/משנה שדות checkout |
| `includes/class-checkout-map.php` | Create | מטפל ב-pin על מפה + שילוב עם הפוליגונים |
| `assets/checkout-map.js` | Create | מפה ב-checkout עם marker, אינטראקציה |
| `assets/checkout-map.css` | Create | סגנון מפה ב-checkout |
| `alena-delivery-zones.php` | Modify | require + register classes חדשים |
| `includes/class-shipping-method.php` | Modify | להעדיף `pin_lat/pin_lng` מה-session על פני geocoding של כתובת |

---

## Task 1: הסרת/שינוי שדות checkout

הוצאות הקטנות: state field, postal code, וכו' — וגם hook לאופציה להפוך טלפון לחובה.

```php
// includes/class-checkout-fields.php
<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Checkout_Fields {
    public function __construct() {
        add_filter('woocommerce_checkout_fields', [$this, 'tune_fields']);
        add_filter('woocommerce_default_address_fields', [$this, 'tune_address_fields']);
        add_filter('woocommerce_billing_fields', [$this, 'tune_billing_fields']);
        add_filter('woocommerce_shipping_fields', [$this, 'tune_shipping_fields']);
        add_action('woocommerce_checkout_update_order_meta', [$this, 'save_custom_meta']);
        add_action('woocommerce_admin_order_data_after_shipping_address', [$this, 'show_in_admin']);
    }

    /** Remove state + postcode globally; phone required */
    public function tune_address_fields($fields) {
        // Remove state (district) — we don't need it for delivery
        unset($fields['state']);
        // Remove postcode requirement
        if (isset($fields['postcode'])) {
            $fields['postcode']['required'] = false;
            // Keep it but optional, in case future shipping providers want it
        }
        return $fields;
    }

    public function tune_billing_fields($fields) {
        // Phone required
        if (isset($fields['billing_phone'])) {
            $fields['billing_phone']['required'] = true;
            $fields['billing_phone']['label'] = 'טלפון';
            $fields['billing_phone']['placeholder'] = '05X-XXXXXXX';
        }
        unset($fields['billing_company']);  // No company field for restaurant
        return $fields;
    }

    public function tune_shipping_fields($fields) {
        unset($fields['shipping_company']);
        unset($fields['shipping_state']);

        // Add: כניסה, קומה, דירה — between address_2 and city
        $fields['shipping_entrance'] = [
            'label'       => 'כניסה',
            'placeholder' => 'א / ב / ראשית',
            'required'    => false,
            'class'       => ['form-row-third'],
            'priority'    => 55,
        ];
        $fields['shipping_floor'] = [
            'label'       => 'קומה',
            'placeholder' => 'קרקע / 1 / 2',
            'required'    => false,
            'class'       => ['form-row-third'],
            'priority'    => 56,
        ];
        $fields['shipping_apartment'] = [
            'label'       => 'דירה',
            'placeholder' => 'מס׳ דירה',
            'required'    => false,
            'class'       => ['form-row-third'],
            'priority'    => 57,
        ];
        return $fields;
    }

    public function tune_fields($fields) {
        return $fields;
    }

    public function save_custom_meta($order_id) {
        foreach (['shipping_entrance', 'shipping_floor', 'shipping_apartment'] as $k) {
            if (!empty($_POST[$k])) {
                update_post_meta($order_id, '_' . $k, sanitize_text_field(wp_unslash($_POST[$k])));
            }
        }
        // Save the pinned location too if present
        foreach (['alena_pin_lat', 'alena_pin_lng'] as $k) {
            if (!empty($_POST[$k])) {
                update_post_meta($order_id, '_' . $k, (float) $_POST[$k]);
            }
        }
    }

    public function show_in_admin($order) {
        $id = $order->get_id();
        $entrance = get_post_meta($id, '_shipping_entrance', true);
        $floor    = get_post_meta($id, '_shipping_floor', true);
        $apt      = get_post_meta($id, '_shipping_apartment', true);
        $pin_lat  = get_post_meta($id, '_alena_pin_lat', true);
        $pin_lng  = get_post_meta($id, '_alena_pin_lng', true);

        $parts = array_filter([
            $entrance ? "כניסה: $entrance" : '',
            $floor    ? "קומה: $floor"     : '',
            $apt      ? "דירה: $apt"       : '',
        ]);
        if ($parts) echo '<p><strong>פרטי משלוח:</strong><br />' . esc_html(implode(' | ', $parts)) . '</p>';
        if ($pin_lat && $pin_lng) {
            $url = sprintf('https://www.google.com/maps?q=%s,%s', $pin_lat, $pin_lng);
            printf('<p><strong>מיקום מדויק:</strong> <a href="%s" target="_blank">%s, %s ↗</a></p>',
                esc_url($url), esc_html($pin_lat), esc_html($pin_lng));
        }
    }
}
```

---

## Task 2: מפה לבחירת מיקום בעמוד הקופה

הרעיון: אחרי שהלקוח מזין כתובת, מתחת לשדות יש מפה קטנה עם marker שהוא יכול לגרור למיקום המדויק (כניסה למשרד / חנייה / שער אחורי).

```php
// includes/class-checkout-map.php
<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Checkout_Map {
    public function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue']);
        add_action('woocommerce_after_checkout_billing_form', [$this, 'render_map']);
    }

    public function enqueue() {
        if (!is_checkout()) return;
        $key = get_option('alena_dz_google_key', '');
        if (!$key) return;
        wp_enqueue_script('alena-dz-checkout-maps',
            "https://maps.googleapis.com/maps/api/js?key={$key}&libraries=geometry&language=he&loading=async",
            [], null, true);
        wp_enqueue_script('alena-dz-checkout-map', ALENA_DZ_URL . 'assets/checkout-map.js',
            ['alena-dz-checkout-maps','jquery'], ALENA_DZ_VERSION, true);
        wp_enqueue_style('alena-dz-checkout-map', ALENA_DZ_URL . 'assets/checkout-map.css',
            [], ALENA_DZ_VERSION);
        wp_localize_script('alena-dz-checkout-map', 'AlenaDZCheckout', [
            'center' => ['lat' => 31.9637, 'lng' => 34.8044],
        ]);
    }

    public function render_map() {
        echo '<div class="alena-dz-checkout-map-wrap">';
        echo '<h3>סמן את המיקום המדויק על המפה</h3>';
        echo '<p>אופציונלי — תעזור לשליח למצוא אותך מהר יותר (כניסה לחנייה, שער צדדי, וכו׳)</p>';
        echo '<div id="alena-dz-checkout-map"></div>';
        echo '<input type="hidden" name="alena_pin_lat" id="alena_pin_lat" />';
        echo '<input type="hidden" name="alena_pin_lng" id="alena_pin_lng" />';
        echo '<p id="alena-dz-pin-status" style="color:#666;font-size:13px"></p>';
        echo '</div>';
    }
}
```

---

## Task 3: JS לאינטגרציית המפה

```javascript
// assets/checkout-map.js
(function ($) {
  let map, marker, geocoder, lastAddrHash = '';

  function init() {
    const el = document.getElementById('alena-dz-checkout-map');
    if (!el || typeof google === 'undefined') return;
    map = new google.maps.Map(el, {
      center: AlenaDZCheckout.center,
      zoom: 13,
      streetViewControl: false,
      mapTypeControl: false,
    });
    geocoder = new google.maps.Geocoder();
    map.addListener('click', e => placeMarker(e.latLng));
    // Watch address fields — when address+city are filled, geocode + center
    $(document).on('change blur', '#shipping_address_1, #shipping_city, #billing_address_1, #billing_city', recenterFromAddress);
  }

  function placeMarker(latlng) {
    if (!marker) {
      marker = new google.maps.Marker({ map, draggable: true });
      marker.addListener('dragend', e => writeFields(e.latLng));
    }
    marker.setPosition(latlng);
    map.panTo(latlng);
    writeFields(latlng);
  }

  function writeFields(latlng) {
    $('#alena_pin_lat').val(latlng.lat());
    $('#alena_pin_lng').val(latlng.lng());
    $('#alena-dz-pin-status').text(
      'נשמר: ' + latlng.lat().toFixed(5) + ', ' + latlng.lng().toFixed(5)
    );
  }

  function recenterFromAddress() {
    const addr = ($('#shipping_address_1').val() || $('#billing_address_1').val() || '');
    const city = ($('#shipping_city').val() || $('#billing_city').val() || '');
    if (!addr || !city) return;
    const full = addr + ', ' + city + ', ישראל';
    const hash = full.toLowerCase().replace(/\s+/g, '');
    if (hash === lastAddrHash) return;
    lastAddrHash = hash;
    geocoder.geocode({ address: full, language: 'he', region: 'il' }, (res, st) => {
      if (st !== 'OK' || !res || !res[0]) return;
      const loc = res[0].geometry.location;
      placeMarker(loc);
      map.setZoom(16);
    });
  }

  $(init);
})(jQuery);
```

---

## Task 4: CSS למפה ב-Checkout

```css
.alena-dz-checkout-map-wrap {
  margin: 16px 0;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f9f9f9;
}
.alena-dz-checkout-map-wrap h3 { margin: 0 0 4px; font-size: 16px; }
#alena-dz-checkout-map { width: 100%; height: 320px; border-radius: 6px; border: 1px solid #ccc; }
```

---

## Task 5: עדיפות ל-Pin על geocoding בשיטת המשלוח

ב-`class-shipping-method.php` — אם הלקוח סימן pin על המפה, נשתמש בקואורדינטות הללו ולא בכתובת:

```php
public function calculate_shipping($package = []) {
    // Prefer the customer-pinned location (saved in session by checkout JS)
    $session = WC()->session;
    $pin_lat = $session ? (float) $session->get('alena_pin_lat') : 0;
    $pin_lng = $session ? (float) $session->get('alena_pin_lng') : 0;

    if ($pin_lat && $pin_lng) {
        $coords = ['lat' => $pin_lat, 'lng' => $pin_lng];
    } else {
        // ... existing address-geocoding logic
    }
    // ... rest unchanged
}
```

ו-AJAX hook לקבל את ה-pin כאשר הלקוח גרור אותו:

```php
// In class-checkout-map.php
public function __construct() {
    // ...
    add_action('wp_ajax_nopriv_alena_dz_save_pin', [$this, 'ajax_save_pin']);
    add_action('wp_ajax_alena_dz_save_pin', [$this, 'ajax_save_pin']);
}

public function ajax_save_pin() {
    $lat = isset($_POST['lat']) ? (float)$_POST['lat'] : 0;
    $lng = isset($_POST['lng']) ? (float)$_POST['lng'] : 0;
    if ($lat && $lng && WC()->session) {
        WC()->session->set('alena_pin_lat', $lat);
        WC()->session->set('alena_pin_lng', $lng);
        wp_send_json_success();
    }
    wp_send_json_error('bad', 400);
}
```

And update checkout-map.js to POST pin to AJAX on drag-end.

---

## Verification

1. עמוד checkout: שדה state נעלם, postcode אופציונלי, טלפון חובה, שדות "כניסה/קומה/דירה" קיימים
2. מפה מופיעה מתחת לפרטי החיוב, ממורכזת על ראשון לציון
3. אחרי הזנת כתובת — marker זז לכתובת אוטומטית
4. גרירת marker → עדכון hidden inputs + הצגת קואורדינטות
5. שיטת המשלוח משתמשת ב-pin אם הלקוח גרר, אחרת בכתובת
6. בעמוד הזמנה באדמין — רואים את הפרטים החדשים + קישור Google Maps לקואורדינטות
