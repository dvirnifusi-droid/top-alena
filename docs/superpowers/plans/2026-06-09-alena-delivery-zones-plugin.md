# Alena Delivery Zones — תכנית 3 מתוך 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** פלאגין וורדפרס/WooCommerce מותאם שמאפשר לבעלים לצייר פוליגונים על מפת Google, לשייך לכל אחד דמי משלוח + מינ' הזמנה, וב-checkout — לאתר אוטומטית באיזה פוליגון נופלת כתובת הלקוח.

**Architecture:** פלאגין PHP נפרד בשם `alena-delivery-zones`. כולל: (1) דף אדמין עם מפת Google ו-Drawing Tools לציור פוליגונים; (2) שמירה ב-WP option כ-JSON; (3) שיטת משלוח חדשה ב-WooCommerce ("Alena Polygon Delivery") שעושה point-in-polygon בצד שרת בעת checkout; (4) הצגת שם הפוליגון + דמי משלוח ללקוח.

**Tech Stack:** PHP 8 · WooCommerce 9.9 hooks · Google Maps JavaScript API (Drawing + Geocoding) · WordPress AJAX · WP_Options · ray-casting point-in-polygon (אין צורך בספרייה חיצונית)

**Dependencies (ממתינים מהבעלים):**
- 🔑 **Google Maps API Key** — חינמי. הבעלים יוצר בעצמו ב-`console.cloud.google.com` (פרויקט חדש → APIs & Services → Credentials → Create API Key → להגביל ל-Maps JavaScript API + Geocoding API + להגדיר HTTP referrers ל-`*.alenabepita.co.il/*`). בלי המפתח אי אפשר להתקדם.

---

## File Structure

הפלאגין הולך לכאן באתר: `/wp-content/plugins/alena-delivery-zones/`. בשביל גרסה מבוקרת ב-git, נשמור גם עותק ב-repo הראשי:

| נתיב (ב-repo) | פעולה | אחריות |
|---------------|------|--------|
| `wp-plugins/alena-delivery-zones/alena-delivery-zones.php` | יצירה | קובץ ראשי — header, hooks, init |
| `wp-plugins/alena-delivery-zones/includes/class-admin.php` | יצירה | מסך אדמין: מפת ציור + שמירת פוליגונים |
| `wp-plugins/alena-delivery-zones/includes/class-shipping-method.php` | יצירה | WC_Shipping_Method חדש — point-in-polygon לוגיקה |
| `wp-plugins/alena-delivery-zones/includes/class-geocoder.php` | יצירה | קריאה ל-Google Geocoding API מצד שרת |
| `wp-plugins/alena-delivery-zones/includes/class-polygon-store.php` | יצירה | קריאה/כתיבה ל-`wp_options` כ-JSON |
| `wp-plugins/alena-delivery-zones/assets/admin.js` | יצירה | Google Maps Drawing UI |
| `wp-plugins/alena-delivery-zones/assets/admin.css` | יצירה | סגנון מסך אדמין |
| `wp-plugins/alena-delivery-zones/assets/checkout.js` | יצירה | (אופציונלי בשלב 1) בדיקה צד-לקוח של כתובת לפני submit |

**מבנה הנתונים (JSON ב-`wp_options.alena_delivery_polygons`):**
```json
[
  {
    "id": "p1",
    "name": "ראשון לציון - מרכז",
    "color": "#3388ff",
    "delivery_fee": 20,
    "min_order": 80,
    "coords": [[31.9637, 34.8044], [31.9650, 34.8100], ...]
  }
]
```

---

## Task 1: שלד הפלאגין

**Files:** Create `wp-plugins/alena-delivery-zones/alena-delivery-zones.php`

- [ ] **Step 1: Write the main plugin file**

```php
<?php
/**
 * Plugin Name: Alena Delivery Zones
 * Description: Google Maps polygon-based delivery zones for WooCommerce
 * Version: 0.1.0
 * Author: Alena / TOPALENA
 * Requires PHP: 8.0
 * Requires at least: 6.5
 * WC tested up to: 9.9
 */
if (!defined('ABSPATH')) exit;

define('ALENA_DZ_VERSION', '0.1.0');
define('ALENA_DZ_PATH', plugin_dir_path(__FILE__));
define('ALENA_DZ_URL',  plugin_dir_url(__FILE__));

require_once ALENA_DZ_PATH . 'includes/class-polygon-store.php';
require_once ALENA_DZ_PATH . 'includes/class-admin.php';
require_once ALENA_DZ_PATH . 'includes/class-geocoder.php';

add_action('plugins_loaded', function() {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function() {
            echo '<div class="error"><p>Alena Delivery Zones requires WooCommerce.</p></div>';
        });
        return;
    }
    new Alena_DZ_Admin();
});

// Register shipping method (loaded only when WC ready)
add_action('woocommerce_shipping_init', function() {
    require_once ALENA_DZ_PATH . 'includes/class-shipping-method.php';
});
add_filter('woocommerce_shipping_methods', function($methods) {
    $methods['alena_polygon'] = 'Alena_DZ_Shipping_Method';
    return $methods;
});
```

- [ ] **Step 2: Commit skeleton**

```bash
cd "C:/Users/97253/TOP ALENA"
mkdir -p wp-plugins/alena-delivery-zones/includes wp-plugins/alena-delivery-zones/assets
# (write the file via your editor)
git add wp-plugins/alena-delivery-zones/
git commit -m "feat(delivery-zones): plugin skeleton"
```

---

## Task 2: PolygonStore — שמירה/טעינה של פוליגונים

**Files:** Create `wp-plugins/alena-delivery-zones/includes/class-polygon-store.php`

- [ ] **Step 1: Write the class**

```php
<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Polygon_Store {
    const OPTION_KEY = 'alena_delivery_polygons';

    public static function all(): array {
        $json = get_option(self::OPTION_KEY, '[]');
        $arr = json_decode($json, true);
        return is_array($arr) ? $arr : [];
    }

    public static function save(array $polygons): bool {
        // Basic validation
        foreach ($polygons as $p) {
            if (!isset($p['id'], $p['name'], $p['delivery_fee'], $p['min_order'], $p['coords'])) {
                return false;
            }
            if (!is_array($p['coords']) || count($p['coords']) < 3) {
                return false;
            }
        }
        return update_option(self::OPTION_KEY, wp_json_encode($polygons));
    }

    /**
     * Returns the polygon a given lat/lng falls into, or null.
     * Ray-casting algorithm.
     */
    public static function find_containing(float $lat, float $lng): ?array {
        foreach (self::all() as $p) {
            if (self::point_in_polygon($lat, $lng, $p['coords'])) {
                return $p;
            }
        }
        return null;
    }

    private static function point_in_polygon(float $lat, float $lng, array $coords): bool {
        $inside = false;
        $n = count($coords);
        $j = $n - 1;
        for ($i = 0; $i < $n; $i++) {
            [$xi, $yi] = $coords[$i];
            [$xj, $yj] = $coords[$j];
            $intersect = (($yi > $lng) !== ($yj > $lng)) &&
                         ($lat < ($xj - $xi) * ($lng - $yi) / (($yj - $yi) ?: 1e-12) + $xi);
            if ($intersect) $inside = !$inside;
            $j = $i;
        }
        return $inside;
    }
}
```

- [ ] **Step 2: Commit**
```bash
git add wp-plugins/alena-delivery-zones/includes/class-polygon-store.php
git commit -m "feat(delivery-zones): polygon store + point-in-polygon"
```

---

## Task 3: Admin screen — מסך הניהול עם המפה

**Files:** Create `class-admin.php`, `assets/admin.js`, `assets/admin.css`

- [ ] **Step 1: PHP — admin screen + AJAX handlers**

```php
<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Admin {
    public function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('wp_ajax_alena_dz_save', [$this, 'ajax_save']);
        add_action('wp_ajax_alena_dz_load', [$this, 'ajax_load']);
    }

    public function menu() {
        add_menu_page(
            'אזורי חלוקה',
            'אזורי חלוקה',
            'manage_woocommerce',
            'alena-delivery-zones',
            [$this, 'render'],
            'dashicons-location-alt',
            56
        );
    }

    public function enqueue($hook) {
        if ($hook !== 'toplevel_page_alena-delivery-zones') return;
        $api_key = get_option('alena_dz_google_key', '');
        if (!$api_key) {
            // Will show inline notice in render()
            return;
        }
        wp_enqueue_script(
            'google-maps',
            "https://maps.googleapis.com/maps/api/js?key={$api_key}&libraries=drawing,geometry&language=he",
            [], null, true
        );
        wp_enqueue_script('alena-dz-admin', ALENA_DZ_URL . 'assets/admin.js', ['google-maps', 'jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-dz-admin', 'AlenaDZ', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('alena_dz'),
            'center'  => ['lat' => 31.9637, 'lng' => 34.8044], // Rishon LeZion center
        ]);
        wp_enqueue_style('alena-dz-admin', ALENA_DZ_URL . 'assets/admin.css', [], ALENA_DZ_VERSION);
    }

    public function render() {
        $api_key = get_option('alena_dz_google_key', '');
        echo '<div class="wrap" dir="rtl"><h1>אזורי חלוקה</h1>';
        if (!$api_key) {
            echo '<div class="notice notice-warning"><p>חסר מפתח Google Maps API.</p>';
            echo '<form method="post" action="options.php">';
            settings_fields('alena_dz');
            echo '<input type="text" name="alena_dz_google_key" style="width:400px" placeholder="AIza..." />';
            submit_button('שמור מפתח');
            echo '</form></div></div>';
            return;
        }
        echo '<div id="alena-dz-map" style="height:600px;width:100%;border:1px solid #ccc"></div>';
        echo '<div id="alena-dz-list"></div>';
        echo '<button id="alena-dz-save-all" class="button button-primary">שמור את כל הפוליגונים</button>';
        echo '</div>';
    }

    public function ajax_load() {
        check_ajax_referer('alena_dz', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
        wp_send_json_success(Alena_DZ_Polygon_Store::all());
    }

    public function ajax_save() {
        check_ajax_referer('alena_dz', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
        $payload = json_decode(wp_unslash($_POST['polygons'] ?? '[]'), true);
        if (!is_array($payload)) wp_send_json_error('bad_payload', 400);
        if (Alena_DZ_Polygon_Store::save($payload)) wp_send_json_success();
        wp_send_json_error('save_failed', 500);
    }
}

// Register the option for the settings_fields() call
add_action('admin_init', function() {
    register_setting('alena_dz', 'alena_dz_google_key', ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
});
```

- [ ] **Step 2: Admin JS — drawing tools + save/load**

```javascript
// assets/admin.js
(function($) {
  let map, drawingManager, polygons = [];
  let editing = null;

  function init() {
    map = new google.maps.Map(document.getElementById('alena-dz-map'), {
      center: AlenaDZ.center, zoom: 13,
    });
    drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: ['polygon'],
      },
      polygonOptions: { editable: true, fillOpacity: 0.35 },
    });
    drawingManager.setMap(map);
    google.maps.event.addListener(drawingManager, 'polygoncomplete', onPolygonDrawn);
    loadExisting();
    $('#alena-dz-save-all').on('click', saveAll);
  }

  function onPolygonDrawn(poly) {
    const name = prompt('שם הפוליגון:', 'אזור חדש');
    if (!name) { poly.setMap(null); return; }
    const fee = parseFloat(prompt('דמי משלוח (₪):', '20')) || 0;
    const min = parseFloat(prompt('מינ׳ הזמנה (₪):', '60')) || 0;
    polygons.push({ id: 'p' + Date.now(), name, color: '#3388ff', delivery_fee: fee, min_order: min, googlePoly: poly });
    renderList();
  }

  function loadExisting() {
    $.post(AlenaDZ.ajaxUrl, { action: 'alena_dz_load', nonce: AlenaDZ.nonce }, function(res) {
      if (!res.success) return;
      res.data.forEach(p => {
        const path = p.coords.map(([lat, lng]) => ({ lat, lng }));
        const gp = new google.maps.Polygon({ paths: path, map, fillOpacity: 0.35, fillColor: p.color || '#3388ff', editable: true });
        polygons.push({ ...p, googlePoly: gp });
      });
      renderList();
    });
  }

  function renderList() {
    const $list = $('#alena-dz-list').empty();
    polygons.forEach((p, idx) => {
      const $row = $('<div class="alena-dz-row">')
        .append($('<strong>').text(p.name))
        .append(' — ').append($('<span>').text('₪' + p.delivery_fee))
        .append(' | מינ׳ ').append($('<span>').text('₪' + p.min_order))
        .append(' <button class="button button-small alena-dz-del">מחק</button>');
      $row.find('.alena-dz-del').on('click', () => {
        p.googlePoly.setMap(null);
        polygons.splice(idx, 1);
        renderList();
      });
      $list.append($row);
    });
  }

  function saveAll() {
    const payload = polygons.map(p => {
      const path = p.googlePoly.getPath();
      const coords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const c = path.getAt(i);
        coords.push([c.lat(), c.lng()]);
      }
      return { id: p.id, name: p.name, color: p.color, delivery_fee: p.delivery_fee, min_order: p.min_order, coords };
    });
    $.post(AlenaDZ.ajaxUrl, {
      action: 'alena_dz_save', nonce: AlenaDZ.nonce, polygons: JSON.stringify(payload)
    }, function(res) {
      alert(res.success ? 'נשמר!' : 'שגיאה: ' + (res.data || ''));
    });
  }

  $(init);
})(jQuery);
```

- [ ] **Step 3: Basic admin CSS**

```css
/* assets/admin.css */
.alena-dz-row { padding: 8px; border-bottom: 1px solid #eee; }
.alena-dz-row strong { display: inline-block; min-width: 200px; }
#alena-dz-save-all { margin-top: 16px; }
```

- [ ] **Step 4: Smoke test**

1. בעלים נכנס ל-WP admin → תפריט "אזורי חלוקה"
2. אם אין מפתח — מופיע שדה הזנה. מזין → שומר.
3. אחרי שמירת מפתח — המפה נטענת על ראשון לציון
4. בעלים מצייר פוליגון → modal שואל שם/מחיר/מינ' → רשימה מתעדכנת
5. לוחץ "שמור הכל" → AJAX → "נשמר!"
6. רענון דף → הפוליגונים חוזרים מהשרת

- [ ] **Step 5: Commit**
```bash
git add wp-plugins/alena-delivery-zones/
git commit -m "feat(delivery-zones): admin map UI + AJAX save/load"
```

---

## Task 4: Geocoder — תרגום כתובת ל-lat/lng (צד שרת)

**Files:** Create `class-geocoder.php`

- [ ] **Step 1**

```php
<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Geocoder {
    public static function geocode(string $address): ?array {
        $key = get_option('alena_dz_google_key', '');
        if (!$key) return null;
        $url = add_query_arg([
            'address' => $address,
            'key' => $key,
            'language' => 'he',
            'region' => 'il',
        ], 'https://maps.googleapis.com/maps/api/geocode/json');
        $r = wp_remote_get($url, ['timeout' => 8]);
        if (is_wp_error($r)) return null;
        $body = json_decode(wp_remote_retrieve_body($r), true);
        if (($body['status'] ?? '') !== 'OK') return null;
        $loc = $body['results'][0]['geometry']['location'] ?? null;
        return $loc ? ['lat' => (float)$loc['lat'], 'lng' => (float)$loc['lng']] : null;
    }
}
```

- [ ] **Step 2: Commit**
```bash
git add wp-plugins/alena-delivery-zones/includes/class-geocoder.php
git commit -m "feat(delivery-zones): server-side Google Geocoding"
```

---

## Task 5: Shipping method — חיבור ל-WC checkout

**Files:** Create `class-shipping-method.php`

- [ ] **Step 1**

```php
<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Shipping_Method extends WC_Shipping_Method {
    public function __construct($instance_id = 0) {
        $this->id = 'alena_polygon';
        $this->method_title = 'משלוח לפי אזור פוליגון';
        $this->method_description = 'בודק את הכתובת ומחשב דמי משלוח לפי הפוליגון בו היא נופלת.';
        $this->title = 'משלוח עד הבית';
        $this->enabled = 'yes';
        $this->supports = ['shipping-zones', 'instance-settings'];
        $this->init();
    }

    public function init() {
        $this->init_form_fields();
        $this->init_settings();
        add_action('woocommerce_update_options_shipping_' . $this->id, [$this, 'process_admin_options']);
    }

    public function calculate_shipping($package = []) {
        $addr = trim(
            ($package['destination']['address'] ?? '') . ' ' .
            ($package['destination']['city'] ?? '')    . ' ' .
            ($package['destination']['postcode'] ?? '')
        );
        if (!$addr) return;
        $coords = Alena_DZ_Geocoder::geocode($addr);
        if (!$coords) return; // No address → no rate
        $polygon = Alena_DZ_Polygon_Store::find_containing($coords['lat'], $coords['lng']);
        if (!$polygon) return; // Outside all zones → no rate shown

        // Enforce min order
        $cart_total = (float) ($package['contents_cost'] ?? WC()->cart->get_subtotal());
        if ($cart_total < (float)$polygon['min_order']) {
            // Add rate with disabled flag (display only as info)
            $this->add_rate([
                'id'    => $this->id . ':under_min',
                'label' => sprintf('מינ\' הזמנה לאזור "%s": ₪%s', $polygon['name'], $polygon['min_order']),
                'cost'  => $polygon['delivery_fee'],
                'meta_data' => ['under_min' => true],
            ]);
            return;
        }

        $this->add_rate([
            'id'    => $this->id . ':' . $polygon['id'],
            'label' => sprintf('משלוח לאזור "%s"', $polygon['name']),
            'cost'  => (float) $polygon['delivery_fee'],
        ]);
    }
}
```

- [ ] **Step 2: Verify**

1. ב-WC → Settings → Shipping → להוסיף zone (לדוגמה "ישראל"), להוסיף לה את "משלוח לפי אזור פוליגון"
2. ללכת לעמוד תשלום, להזין כתובת ב-ראשון לציון רוטשילד
3. אמור להופיע: "משלוח לאזור 'ראשון לציון – מרכז' ₪20"
4. להזין כתובת בתל אביב — אמור להיעלם / לא להציע משלוח

- [ ] **Step 3: Commit**

```bash
git add wp-plugins/alena-delivery-zones/includes/class-shipping-method.php
git commit -m "feat(delivery-zones): WC shipping method with polygon lookup"
```

---

## Task 6: התקנת הפלאגין באתר החי

הפלאגין יושב ב-repo שלנו ב-`wp-plugins/alena-delivery-zones/`. צריך לדחוף אותו לאתר ה-WP.

- [ ] **Step 1: יצירת zip**
```bash
cd "C:/Users/97253/TOP ALENA/wp-plugins"
powershell -Command "Compress-Archive -Path alena-delivery-zones -DestinationPath alena-delivery-zones.zip -Force"
```

- [ ] **Step 2: העלאה לאתר**

או דרך wp-admin → Plugins → Add → Upload (אם הקובץ קטן יותר מהמותר ב-PHP) או דרך FTP. בעלים יכריע.

- [ ] **Step 3: הפעלה** וקליק על תפריט "אזורי חלוקה" החדש.

- [ ] **Step 4: בעלים מזין את מפתח Google Maps** (שכבר יצר בשלב dependency).

- [ ] **Step 5: בעלים מצייר את כל הפוליגונים** ושומר.

- [ ] **Step 6: ב-WC Settings → Shipping → מוסיף את שיטת המשלוח החדשה לאזור ישראל.**

---

## Self-Review

- [ ] כל 5 הקבצים מהמפרט קיימים
- [ ] אין placeholders (TBD/TODO)
- [ ] שמות פונקציות עקביים בין קבצים (Alena_DZ_*)
- [ ] גרסת WC נתמכת (9.9)
- [ ] שימוש ב-nonces ו-current_user_can בכל AJAX
- [ ] ה-Google Maps API key תמיד נטען מ-DB, אף פעם לא hardcoded
- [ ] point-in-polygon עובד גם על פוליגון בקיט שלם וגם פוליגון מעובד
- [ ] no-address או address-לא-מוזהה לא יוצר rate (לא חוסם, לא מאפשר משלוח)
