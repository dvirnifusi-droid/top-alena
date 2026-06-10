<?php
if (!defined('ABSPATH')) exit;

/**
 * Adjusts the WooCommerce checkout fields to match the restaurant's delivery
 * needs. Uses both filter-based and direct-injection approaches because some
 * themes / WC modes ignore the standard filters.
 */
class Alena_DZ_Checkout_Fields {

    const META_ENTRANCE = '_shipping_entrance';
    const META_FLOOR    = '_shipping_floor';
    const META_APT      = '_shipping_apartment';
    const META_PIN_LAT  = '_alena_pin_lat';
    const META_PIN_LNG  = '_alena_pin_lng';

    public function __construct() {
        // Filter-based adjustments (caught by most themes)
        add_filter('woocommerce_default_address_fields', [$this, 'tune_address_fields'], 20);
        add_filter('woocommerce_billing_fields',         [$this, 'tune_billing_fields'],  20);
        add_filter('woocommerce_shipping_fields',        [$this, 'tune_shipping_fields'], 20);
        add_filter('woocommerce_checkout_fields',        [$this, 'tune_checkout_fields'], 20);

        // Inject right after the address field via JS — see inline_js_polish().
        // Falls back to the after-billing-form hook if JS is disabled.
        add_action('woocommerce_after_checkout_billing_form', [$this, 'render_direct_fields'], 5);

        // Persistence
        add_action('woocommerce_checkout_update_order_meta', [$this, 'save_custom_meta']);
        add_action('woocommerce_admin_order_data_after_shipping_address', [$this, 'show_in_admin']);

        // JS: force phone required regardless of filter behavior
        add_action('wp_footer', [$this, 'inline_js_polish']);
    }

    /* ----------------------- Filter-based ----------------------- */

    public function tune_address_fields($fields) {
        // Strip noise: state, postcode, the "address line 2" duplicate of apartment.
        unset($fields['state']);
        unset($fields['postcode']);
        unset($fields['address_2']);
        // Lock the country dropdown to Israel (handled separately in tune_billing_fields)
        return $fields;
    }

    public function tune_billing_fields($fields) {
        if (isset($fields['billing_phone'])) {
            $fields['billing_phone']['required']    = true;
            $fields['billing_phone']['label']       = 'טלפון';
            $fields['billing_phone']['placeholder'] = '05X-XXXXXXX';
        }
        // Lock country to Israel — pre-filled, not editable
        if (isset($fields['billing_country'])) {
            $fields['billing_country']['type']     = 'hidden';
            $fields['billing_country']['default']  = 'IL';
            $fields['billing_country']['required'] = false;
        }
        unset($fields['billing_company']);
        unset($fields['billing_state']);
        unset($fields['billing_postcode']);
        unset($fields['billing_address_2']);
        return $fields;
    }

    public function tune_shipping_fields($fields) {
        unset($fields['shipping_company']);
        unset($fields['shipping_state']);
        return $fields;
    }

    public function tune_checkout_fields($fields) {
        // Extra-strong phone required
        if (isset($fields['billing']['billing_phone'])) {
            $fields['billing']['billing_phone']['required'] = true;
        }
        unset($fields['billing']['billing_state']);
        unset($fields['billing']['billing_company']);
        unset($fields['shipping']['shipping_state']);
        unset($fields['shipping']['shipping_company']);
        return $fields;
    }

    /* ----------------------- Direct injection ----------------------- */

    public function render_direct_fields($checkout) {
        $entrance = $checkout ? $checkout->get_value('shipping_entrance') : '';
        $floor    = $checkout ? $checkout->get_value('shipping_floor')    : '';
        ?>
        <div class="alena-dz-extra-fields">
          <h3>פרטי כתובת נוספים</h3>
          <div class="alena-dz-extra-row">
            <p class="form-row form-row-first">
              <label for="shipping_entrance">כניסה</label>
              <input type="text" class="input-text" name="shipping_entrance" id="shipping_entrance"
                     placeholder="א / ב / ראשית" value="<?php echo esc_attr($entrance); ?>" />
            </p>
            <p class="form-row form-row-last">
              <label for="shipping_floor">קומה</label>
              <input type="text" class="input-text" name="shipping_floor" id="shipping_floor"
                     placeholder="קרקע / 1 / 2" value="<?php echo esc_attr($floor); ?>" />
            </p>
            <div style="clear:both"></div>
          </div>
        </div>
        <?php
    }

    /* ----------------------- Persistence ----------------------- */

    public function save_custom_meta($order_id) {
        foreach (['shipping_entrance' => self::META_ENTRANCE,
                  'shipping_floor'    => self::META_FLOOR,
                  'shipping_apartment'=> self::META_APT] as $post_key => $meta_key) {
            if (isset($_POST[$post_key]) && $_POST[$post_key] !== '') {
                update_post_meta($order_id, $meta_key, sanitize_text_field(wp_unslash($_POST[$post_key])));
            }
        }
        if (!empty($_POST['alena_pin_lat']) && !empty($_POST['alena_pin_lng'])) {
            update_post_meta($order_id, self::META_PIN_LAT, (float) $_POST['alena_pin_lat']);
            update_post_meta($order_id, self::META_PIN_LNG, (float) $_POST['alena_pin_lng']);
        }
    }

    public function show_in_admin($order) {
        $id       = $order->get_id();
        $entrance = get_post_meta($id, self::META_ENTRANCE, true);
        $floor    = get_post_meta($id, self::META_FLOOR,    true);
        $apt      = get_post_meta($id, self::META_APT,      true);
        $pin_lat  = get_post_meta($id, self::META_PIN_LAT,  true);
        $pin_lng  = get_post_meta($id, self::META_PIN_LNG,  true);

        $parts = array_filter([
            $entrance ? 'כניסה: ' . $entrance : '',
            $floor    ? 'קומה: '   . $floor   : '',
            $apt      ? 'דירה: '   . $apt     : '',
        ]);
        if ($parts) {
            echo '<p><strong>פרטי בית:</strong><br />' . esc_html(implode(' | ', $parts)) . '</p>';
        }
        if ($pin_lat && $pin_lng) {
            $url = sprintf('https://www.google.com/maps?q=%s,%s', $pin_lat, $pin_lng);
            printf(
                '<p><strong>מיקום מדויק:</strong> <a href="%s" target="_blank" rel="noopener">%s, %s ↗</a></p>',
                esc_url($url),
                esc_html(number_format((float) $pin_lat, 5)),
                esc_html(number_format((float) $pin_lng, 5))
            );
        }
    }

    /* ----------------------- JS polish ----------------------- */

    public function inline_js_polish() {
        if (!function_exists('is_checkout') || !is_checkout()) return;
        ?>
        <script>
        (function ($) {
          function polish() {
            var $phone = $('#billing_phone');
            if ($phone.length) {
              $phone.prop('required', true).attr('required', 'required');
              var $label = $('label[for="billing_phone"]');
              if ($label.length && !$label.find('.required').length) {
                $label.append(' <abbr class="required" title="חובה">*</abbr>');
              }
              $('#billing_phone_field').removeClass('woocommerce-validated').addClass('validate-required');
              $('#billing_phone_field').find('.optional').remove();
            }
            // Move the entrance/floor block to right after the address field
            var $extra = $('.alena-dz-extra-fields');
            var $addr  = $('#billing_address_1_field');
            if ($extra.length && $addr.length && $extra.prev('.alena-dz-anchor').length === 0) {
              $extra.detach();
              $addr.after($extra);
              $extra.before('<div class="alena-dz-anchor" style="display:none"></div>');
            }
          }
          $(document).ready(polish);
          $(document.body).on('updated_checkout', polish);
        })(jQuery);
        </script>
        <?php
    }
}
