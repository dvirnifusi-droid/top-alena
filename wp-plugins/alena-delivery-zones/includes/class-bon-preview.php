<?php
if (!defined('ABSPATH')) exit;

/**
 * A faithful preview of the bon (order slip) that goes OUT to Miley/בתאבון,
 * without waiting for real trading hours and without printing anything at the
 * restaurant.
 *
 * Why this exists: the only honest way to prove the Zohara line prints as
 * "מטבח: חומוס זוהרה" (and that a pickup carries no address, and that prices
 * are gross) is to run a real order through the SAME code path Miley receives.
 * A storefront test can't do that right now — the brand guard correctly blocks
 * adding a Zohara dish while Zohara is closed — so this builds the order server
 * side, asks WooCommerce for the exact webhook payload (which fires
 * Alena_DZ_Webhook_Payload::shape, the real transform), shows it, then deletes
 * the order.
 *
 * Nothing reaches Miley: webhook DELIVERY is force-disabled for the duration of
 * the build, so even the order.created that WooCommerce raises on save is never
 * dispatched. The throwaway order is force-deleted before the page renders.
 */
class Alena_DZ_Bon_Preview {

    /**
     * True only while a preview order is being built. Other subsystems check
     * this to stay out of the way — the throwaway order must not ring the
     * kitchen's new-order alert or fan out to Pushover/Telegram.
     */
    public static $running = false;

    public function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_post_alena_bon_preview', [$this, 'run']);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'תצוגת בון (בדיקה)',
            'תצוגת בון (בדיקה)',
            'manage_options',
            'alena-bon-preview',
            [$this, 'render']
        );
    }

    public function render() {
        $rep = get_transient('alena_bon_preview_result');
        ?>
        <div class="wrap" dir="rtl">
          <h1>תצוגת בון (בדיקה)</h1>
          <p>בונה הזמנת בדיקה, מריץ אותה דרך <strong>אותו קוד בדיוק</strong> ששולח למיילי, ומראה את הבון.
             <br>שום דבר לא נשלח למיילי ושום דבר לא מודפס — משלוח ה-webhook מושבת לאורך הבדיקה וההזמנה נמחקת מיד.</p>

          <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin:18px 0">
            <input type="hidden" name="action" value="alena_bon_preview">
            <?php wp_nonce_field('alena_bon_preview'); ?>
            <table class="form-table" style="max-width:560px">
              <tr>
                <th scope="row">מטבח</th>
                <td>
                  <label style="margin-inline-end:18px"><input type="radio" name="brand" value="zohara" checked> חומוס זוהרה</label>
                  <label><input type="radio" name="brand" value="alena"> עלינא בפיתה</label>
                </td>
              </tr>
              <tr>
                <th scope="row">אופן מסירה</th>
                <td>
                  <label style="margin-inline-end:18px"><input type="radio" name="fulfillment" value="pickup" checked> איסוף עצמי</label>
                  <label><input type="radio" name="fulfillment" value="delivery"> משלוח</label>
                </td>
              </tr>
            </table>
            <p><button class="button button-primary">בנה תצוגת בון</button></p>
          </form>

          <?php if (is_array($rep)): ?>
            <h2>הבון שמיילי יקבל</h2>
            <table class="widefat" style="max-width:720px;margin-bottom:16px">
              <tr><td>מטבח (שורת המנה)</td><td><strong><?php echo esc_html($rep['brand_line'] ?: '—'); ?></strong></td></tr>
              <tr><td>אופן מסירה</td><td><strong><?php echo esc_html($rep['fulfillment']); ?></strong></td></tr>
              <tr><td>כתובת משלוח על הבון</td><td><strong><?php echo esc_html($rep['ship_to'] ?: '(ריק — איסוף)'); ?></strong></td></tr>
              <tr><td>מחיר שורה (כולל מע״מ)</td><td><strong>₪<?php echo esc_html($rep['line_total']); ?></strong> — מע״מ בשדה: <?php echo esc_html($rep['line_tax']); ?></td></tr>
              <tr><td>הערות שנשמרו על הבון</td><td><strong><?php echo esc_html($rep['kept_meta'] ?: '—'); ?></strong></td></tr>
              <tr><td>מה סוּנן החוצה</td><td><?php echo esc_html($rep['stripped'] ?: '—'); ?></td></tr>
            </table>
            <details>
              <summary style="cursor:pointer;font-weight:600">ה-JSON המלא של הבון</summary>
              <pre style="direction:ltr;text-align:left;background:#111;color:#0f0;padding:14px;border-radius:8px;overflow:auto;max-height:480px"><?php
                echo esc_html($rep['json']);
              ?></pre>
            </details>
          <?php endif; ?>
        </div>
        <?php
    }

    public function run() {
        if (!current_user_can('manage_options')) wp_die('forbidden');
        check_admin_referer('alena_bon_preview');

        $brand   = ($_POST['brand'] ?? 'zohara') === 'alena' ? 'alena' : 'zohara';
        $pickup  = ($_POST['fulfillment'] ?? 'pickup') !== 'delivery';

        // Belt and suspenders: nothing may be dispatched to Miley during the
        // build. order.created fires on save; this makes its delivery a no-op.
        add_filter('woocommerce_webhook_should_deliver', '__return_false', 999);
        self::$running = true;   // silence the kitchen alert for this fake order

        $result = ['error' => ''];
        $order_id = 0;
        try {
            $pid = $this->sample_product($brand);
            if (!$pid) throw new Exception('לא נמצאה מנה למטבח שנבחר');

            $order = wc_create_order();
            $item_id = $order->add_product(wc_get_product($pid), 1);

            // Meta a real order would carry, so the preview also proves the
            // cleaning: the JSON blob and the "לא, תודה" answer must vanish,
            // the real choice must stay.
            $line = $order->get_item($item_id);
            $line->add_meta_data('_alena_modifiers_raw', '{"groups":[{"name":"רטבים","values":["טחינה"]}]}', true);
            $line->add_meta_data('רוטב', 'טחינה', true);
            $line->add_meta_data('חריף?', 'לא, תודה', true);
            $line->save();

            if ($pickup) {
                $ship = new WC_Order_Item_Shipping();
                $ship->set_method_title('איסוף עצמי');
                $ship->set_method_id('local_pickup');
                $ship->set_total('0');
                $order->add_item($ship);
                // Pickup carries no delivery address — that is the fix Miley asked for.
            } else {
                $order->set_shipping_first_name('בדיקה');
                $order->set_shipping_address_1('רוטשילד 104');
                $order->set_shipping_city('ראשון לציון');
                $ship = new WC_Order_Item_Shipping();
                $ship->set_method_title('משלוח');
                $ship->set_method_id('alena_polygon');
                $ship->set_total('20');
                $order->add_item($ship);
            }

            $order->calculate_totals();
            $order->save();
            $order_id = $order->get_id();

            // Ask WooCommerce for the exact webhook body. Building it here runs
            // the woocommerce_webhook_payload filter — i.e. the real shape().
            if (!class_exists('WC_Webhook')) throw new Exception('WC_Webhook לא זמין');
            $webhook = new WC_Webhook();
            $webhook->set_topic('order.created');
            $webhook->set_user_id(get_current_user_id());
            $payload = $webhook->build_payload($order_id);

            $result = $this->summarize($payload, $pickup) + ['error' => ''];

        } catch (Throwable $e) {
            $result = ['error' => $e->getMessage()];
        } finally {
            // wp_delete_post is a no-op on HPOS orders (they aren't posts), so
            // the throwaway would survive. Delete through the order object,
            // which routes to the right data store either way.
            if ($order_id) {
                $o = wc_get_order($order_id);
                if ($o) $o->delete(true);
            }
            self::$running = false;
            remove_filter('woocommerce_webhook_should_deliver', '__return_false', 999);
        }

        set_transient('alena_bon_preview_result', $result, 600);
        wp_safe_redirect(admin_url('admin.php?page=alena-bon-preview&done=1'));
        exit;
    }

    private function sample_product(string $brand): int {
        $term = get_term_by('slug', $brand, 'alena_brand');
        $args = [
            'post_type'      => 'product',
            'posts_per_page' => 1,
            'fields'         => 'ids',
            'post_status'    => 'publish',
            'orderby'        => 'title',
        ];
        if ($term && !is_wp_error($term)) {
            $args['tax_query'] = [[
                'taxonomy' => 'alena_brand',
                'field'    => 'term_id',
                'terms'    => $term->term_id,
            ]];
        }
        $q = get_posts($args);
        return $q ? (int) $q[0] : 0;
    }

    /** Pull the handful of facts that decide whether the bon is right. */
    private function summarize(array $payload, bool $pickup): array {
        $item = $payload['line_items'][0] ?? [];
        $brand_line = '';
        $kept = [];
        foreach (($item['meta_data'] ?? []) as $m) {
            $key = is_array($m) ? ($m['key'] ?? '') : ($m->key ?? '');
            $val = is_array($m) ? ($m['value'] ?? '') : ($m->value ?? '');
            if ($key === 'מטבח') { $brand_line = (string) $val; continue; }
            $kept[] = $key . ': ' . (is_scalar($val) ? $val : wp_json_encode($val, JSON_UNESCAPED_UNICODE));
        }

        $ship = $payload['shipping'] ?? [];
        $ship_to = trim(implode(' ', array_filter([
            $ship['first_name'] ?? '', $ship['address_1'] ?? '', $ship['city'] ?? '',
        ])));

        return [
            'brand_line'  => $brand_line,
            'fulfillment' => $pickup ? 'איסוף עצמי' : 'משלוח',
            'ship_to'     => $ship_to,
            'line_total'  => (string) ($item['total'] ?? ''),
            'line_tax'    => (string) ($item['total_tax'] ?? ''),
            'kept_meta'   => implode(' · ', $kept),
            'stripped'    => 'בלוק ה-JSON הפנימי, וכל תשובת "לא/ללא" — לא מופיעים למעלה',
            'json'        => wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        ];
    }
}
