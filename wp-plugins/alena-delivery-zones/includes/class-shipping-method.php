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

    public function calculate_shipping($package = []) {
        $dest = $package['destination'] ?? [];
        $address_parts = array_filter([
            $dest['address']   ?? '',
            $dest['address_2'] ?? '',
            $dest['city']      ?? '',
            $dest['postcode']  ?? '',
            ($dest['country'] ?? '') === 'IL' ? 'Israel' : ($dest['country'] ?? ''),
        ]);
        $full_address = trim(implode(', ', $address_parts));
        if ($full_address === '') return;

        $coords = Alena_DZ_Geocoder::geocode($full_address);
        if (!$coords) {
            // Address could not be geocoded — don't offer this rate
            return;
        }

        $polygon = Alena_DZ_Polygon_Store::find_containing($coords['lat'], $coords['lng']);
        if (!$polygon) {
            // Address is outside every delivery polygon — don't offer this rate
            return;
        }

        // Enforce min order
        $cart_total = (float) ($package['contents_cost'] ?? 0);
        if ($cart_total <= 0 && function_exists('WC') && WC()->cart) {
            $cart_total = (float) WC()->cart->get_subtotal();
        }

        $polygon_name = sanitize_text_field($polygon['name']);
        $min_order    = (float) $polygon['min_order'];
        $fee          = (float) $polygon['delivery_fee'];

        if ($min_order > 0 && $cart_total < $min_order) {
            // Show an info rate that's still selectable; WC will display the message in the label.
            $this->add_rate([
                'id'    => $this->id . ':under_min:' . $polygon['id'],
                'label' => sprintf('משלוח לאזור "%s" — מינ׳ הזמנה ₪%s', $polygon_name, number_format($min_order, 0)),
                'cost'  => $fee,
                'meta_data' => [
                    'alena_dz_polygon_id' => $polygon['id'],
                    'alena_dz_under_min'  => true,
                ],
            ]);
            return;
        }

        $this->add_rate([
            'id'    => $this->id . ':' . $polygon['id'],
            'label' => sprintf('משלוח לאזור "%s"', $polygon_name),
            'cost'  => $fee,
            'meta_data' => ['alena_dz_polygon_id' => $polygon['id']],
        ]);
    }
}
