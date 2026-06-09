<?php
if (!defined('ABSPATH')) exit;

/**
 * Adjusts the WooCommerce checkout fields to match the restaurant's delivery
 * needs:
 *   - removes state/district, company
 *   - makes phone required
 *   - relaxes postal code requirement (Israel addresses often have no zip)
 *   - adds entrance / floor / apartment to the shipping address
 *   - persists the customer's pinned location (set by the map JS) as order meta
 *   - shows the extra info on the order detail page in the admin
 */
class Alena_DZ_Checkout_Fields {

    public function __construct() {
        add_filter('woocommerce_default_address_fields', [$this, 'tune_address_fields'], 20);
        add_filter('woocommerce_billing_fields',         [$this, 'tune_billing_fields'],  20);
        add_filter('woocommerce_shipping_fields',        [$this, 'tune_shipping_fields'], 20);
        add_action('woocommerce_checkout_update_order_meta', [$this, 'save_custom_meta']);
        add_action('woocommerce_admin_order_data_after_shipping_address', [$this, 'show_in_admin']);
    }

    public function tune_address_fields($fields) {
        // Drop the district/state selector — caused the "DC/CA" confusion.
        unset($fields['state']);
        // Make postcode optional. Some Israeli addresses don't have one and
        // we use coords (geocoding/pin) for delivery matching anyway.
        if (isset($fields['postcode'])) {
            $fields['postcode']['required'] = false;
            $fields['postcode']['label']    = 'מיקוד (אופציונלי)';
        }
        return $fields;
    }

    public function tune_billing_fields($fields) {
        // Phone is required.
        if (isset($fields['billing_phone'])) {
            $fields['billing_phone']['required']    = true;
            $fields['billing_phone']['label']       = 'טלפון';
            $fields['billing_phone']['placeholder'] = '05X-XXXXXXX';
        }
        // No "company" field in a restaurant checkout.
        unset($fields['billing_company']);
        // We removed the state field via default_address_fields, but billing
        // pulls its own copy — remove here too defensively.
        unset($fields['billing_state']);
        return $fields;
    }

    public function tune_shipping_fields($fields) {
        unset($fields['shipping_company']);
        unset($fields['shipping_state']);

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

    public function save_custom_meta($order_id) {
        foreach (['shipping_entrance', 'shipping_floor', 'shipping_apartment'] as $k) {
            if (isset($_POST[$k]) && $_POST[$k] !== '') {
                update_post_meta($order_id, '_' . $k, sanitize_text_field(wp_unslash($_POST[$k])));
            }
        }
        // Persist the pinned location too, if the customer dragged the marker.
        if (!empty($_POST['alena_pin_lat']) && !empty($_POST['alena_pin_lng'])) {
            update_post_meta($order_id, '_alena_pin_lat', (float) $_POST['alena_pin_lat']);
            update_post_meta($order_id, '_alena_pin_lng', (float) $_POST['alena_pin_lng']);
        }
    }

    public function show_in_admin($order) {
        $id       = $order->get_id();
        $entrance = get_post_meta($id, '_shipping_entrance', true);
        $floor    = get_post_meta($id, '_shipping_floor', true);
        $apt      = get_post_meta($id, '_shipping_apartment', true);
        $pin_lat  = get_post_meta($id, '_alena_pin_lat', true);
        $pin_lng  = get_post_meta($id, '_alena_pin_lng', true);

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
                esc_html(number_format((float)$pin_lat, 5)),
                esc_html(number_format((float)$pin_lng, 5))
            );
        }
    }
}
