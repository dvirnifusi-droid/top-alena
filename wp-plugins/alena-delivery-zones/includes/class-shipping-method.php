<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Shipping_Method extends WC_Shipping_Method {
    public function __construct($instance_id = 0) {
        $this->id                 = 'alena_polygon';
        $this->instance_id        = absint($instance_id);
        $this->method_title       = 'משלוח לפי אזור (פוליגון)';
        $this->method_description = 'בודק את הכתובת ומחשב דמי משלוח לפי הפוליגון בו היא נופלת.';
        $this->title              = 'משלוח עד הבית';
        $this->enabled            = 'yes';
        $this->supports           = ['shipping-zones', 'instance-settings', 'instance-settings-modal'];
        $this->init();
    }

    public function init() {
        $this->init_form_fields();
        $this->init_settings();
        $this->title = $this->get_option('title', 'משלוח עד הבית');
        add_action('woocommerce_update_options_shipping_' . $this->id, [$this, 'process_admin_options']);
    }

    public function init_form_fields() {
        $this->instance_form_fields = [
            'title' => [
                'title'       => 'שם בתצוגה',
                'type'        => 'text',
                'default'     => 'משלוח עד הבית',
                'description' => 'מה הלקוח רואה בעמוד התשלום',
            ],
        ];
    }

    /** Records where the last rate calculation ended, for the admin diagnostic. */
    private function trace(string $step, $extra = null) {
        set_transient('alena_dz_ship_trace', [
            'step'  => $step,
            'extra' => $extra,
            'at'    => current_time('mysql'),
        ], 10 * MINUTE_IN_SECONDS);
    }

    public function calculate_shipping($package = []) {
        $this->trace('entered');
        // Customer-pinned location wins over text geocoding when available.
        $session = function_exists('WC') ? WC()->session : null;
        $pin_lat = $session ? (float) $session->get('alena_pin_lat') : 0.0;
        $pin_lng = $session ? (float) $session->get('alena_pin_lng') : 0.0;

        // Coordinates from the address the customer picked in autocomplete are
        // authoritative — they came from Google with the address itself, so
        // there is nothing to re-resolve and nothing to mis-resolve.
        $picked = class_exists('Alena_DZ_Address_Autocomplete')
            ? Alena_DZ_Address_Autocomplete::session_coords()
            : null;

        if ($pin_lat && $pin_lng) {
            $coords = ['lat' => $pin_lat, 'lng' => $pin_lng];
        } elseif ($picked) {
            $coords = $picked;
        } else {
            $dest = $package['destination'] ?? [];
            $address_parts = array_filter([
                $dest['address']   ?? '',
                $dest['address_2'] ?? '',
                $dest['city']      ?? '',
                $dest['postcode']  ?? '',
                ($dest['country'] ?? '') === 'IL' ? 'Israel' : ($dest['country'] ?? ''),
            ]);
            $full_address = trim(implode(', ', $address_parts));
            if ($full_address === '') { $this->trace('no_address'); return; }

            $coords = Alena_DZ_Geocoder::geocode($full_address);
            if (!$coords) {
                // Address could not be geocoded — don't offer this rate
                $this->trace('geocode_failed', $full_address);
                return;
            }
        }

        $polygon = Alena_DZ_Polygon_Store::find_containing($coords['lat'], $coords['lng']);
        if (!$polygon) {
            $this->trace('no_polygon', $coords);
            return;
        }

        // Enforce min order
        // MUST include tax. contents_cost and get_subtotal() are both EX-tax,
        // while every price on this menu is quoted inc-VAT -- so a 116 cart
        // was measured as 98.31 and a 100 minimum silently became 118.
        $cart_total = 0.0;
        if (function_exists('WC') && WC()->cart) {
            $cart_total = (float) WC()->cart->get_subtotal() + (float) WC()->cart->get_subtotal_tax();
        }
        if ($cart_total <= 0) {
            $cart_total = (float) ($package['contents_cost'] ?? 0)
                        + (float) ($package['contents_taxes'] ? array_sum((array) $package['contents_taxes']) : 0);
        }

        $polygon_name = sanitize_text_field($polygon['name']);
        $min_order    = (float) $polygon['min_order'];
        $fee          = (float) $polygon['delivery_fee'];

        if ($min_order > 0 && $cart_total < $min_order) {
            // No rate at all. This used to add a rate that was still selectable,
            // so a ₪40 cart in a ₪70 zone could check out for delivery -- the
            // minimum was a label, not a limit. Owner approved enforcing it.
            // The shortfall goes into the session so the "no delivery" box can
            // say what is missing instead of blaming the address.
            if (function_exists('WC') && WC()->session) {
                WC()->session->set('alena_dz_under_min', [
                    'zone' => $polygon_name,
                    'min'  => $min_order,
                    'need' => max(0, $min_order - $cart_total),
                ]);
            }
            $this->trace('under_min_blocked', ['cart' => $cart_total, 'min' => $min_order]);
            return;
        }
        if (function_exists('WC') && WC()->session) {
            WC()->session->set('alena_dz_under_min', null);
        }

        $this->trace('rate_added', ['zone' => $polygon_name, 'fee' => $fee]);
        $this->add_rate([
            'id'    => $this->id . ':' . $polygon['id'],
            'label' => sprintf('משלוח לאזור "%s"', $polygon_name),
            'cost'  => $fee,
            'meta_data' => ['alena_dz_polygon_id' => $polygon['id']],
        ]);
    }
}
