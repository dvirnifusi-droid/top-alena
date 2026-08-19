<?php
if (!defined('ABSPATH')) exit;

/**
 * Operational alerts to the restaurant when a new order lands.
 *
 *   - Distinct sound + browser push notification on /wp-admin/edit.php?post_type=shop_order
 *     (whenever someone is logged in there).
 *   - Optional Pushover, Telegram, or webhook fanout via settings.
 *   - Customer-facing customer note prompt at checkout (handled separately).
 *
 * Goal: kitchen owner sees + hears every order the moment payment confirms.
 */
class Alena_DZ_Order_Alerts {

    const OPT_BASE = 'alena_alerts_';

    public function __construct() {
        add_action('admin_enqueue_scripts',                [$this, 'enqueue_admin']);
        add_action('wp_ajax_alena_alerts_poll',            [$this, 'ajax_poll']);

        // Fire on payment-complete + on new order created (catches COD too)
        add_action('woocommerce_payment_complete',         [$this, 'on_new_order']);
        add_action('woocommerce_new_order',                [$this, 'on_new_order']);
        add_action('woocommerce_order_status_processing',  [$this, 'on_new_order']);

        add_action('admin_menu',                           [$this, 'menu'], 32);
        add_action('admin_init',                           [$this, 'register_settings']);
    }

    public function on_new_order($order_id) {
        try {
            // The bon-preview diagnostic builds a throwaway order to render the
            // slip; it must never ring the kitchen or fan out anywhere.
            if (class_exists('Alena_DZ_Bon_Preview') && Alena_DZ_Bon_Preview::$running) return;

            $order = wc_get_order($order_id);
            if (!$order) return;

            // Idempotent: only alert once per order
            if ($order->get_meta('_alena_alerted')) return;
            $order->update_meta_data('_alena_alerted', 1);
            $order->update_meta_data('_alena_alert_ts', current_time('mysql'));
            $order->save();

            // Append to alerts queue (consumed by browser poll)
            $queue = (array) get_option(self::OPT_BASE . 'queue', []);
            $queue[] = [
                'id'     => (int) $order_id,
                'ts'     => time(),
                'total'  => (float) $order->get_total(),
                'name'   => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
                'phone'  => (string) $order->get_billing_phone(),
                'items'  => count($order->get_items()),
            ];
            // Cap queue at last 50
            $queue = array_slice($queue, -50);
            update_option(self::OPT_BASE . 'queue', $queue, false);

            // Fanout integrations
            $this->maybe_notify_pushover($order);
            $this->maybe_notify_telegram($order);
            $this->maybe_notify_webhook($order);
        } catch (\Throwable $e) {
            if (function_exists('error_log')) error_log('Alena_DZ_Order_Alerts::on_new_order ' . $e->getMessage());
        }
    }

    public function enqueue_admin($hook) {
        // Run on every admin page so the alert system can fire from anywhere
        wp_enqueue_script('alena-order-alerts', ALENA_DZ_URL . 'assets/order-alerts.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-order-alerts', 'AlenaOrderAlerts', [
            'ajaxUrl'    => admin_url('admin-ajax.php'),
            'nonce'      => wp_create_nonce('alena_alerts_poll'),
            'lastSeen'   => (int) get_user_meta(get_current_user_id(), '_alena_alerts_last_seen', true),
            'ordersUrl'  => admin_url('edit.php?post_type=shop_order'),
        ]);
    }

    public function ajax_poll() {
        check_ajax_referer('alena_alerts_poll', 'nonce');
        $since = isset($_POST['since']) ? (int) $_POST['since'] : 0;
        $queue = (array) get_option(self::OPT_BASE . 'queue', []);
        $new   = array_values(array_filter($queue, fn($e) => (int) ($e['ts'] ?? 0) > $since));
        update_user_meta(get_current_user_id(), '_alena_alerts_last_seen', time());
        wp_send_json_success(['orders' => $new, 'now' => time()]);
    }

    /* -------- Pushover -------- */
    private function maybe_notify_pushover(\WC_Order $order): void {
        $user_key  = get_option(self::OPT_BASE . 'pushover_user');
        $app_token = get_option(self::OPT_BASE . 'pushover_token');
        if (!$user_key || !$app_token) return;
        wp_remote_post('https://api.pushover.net/1/messages.json', [
            'timeout' => 8,
            'body' => [
                'token'   => $app_token,
                'user'    => $user_key,
                'title'   => '🛵 הזמנה חדשה — עלינא בפיתה',
                'message' => sprintf(
                    "#%d · ₪%s · %s\n%d פריטים · %s",
                    $order->get_id(),
                    number_format((float) $order->get_total(), 2),
                    $order->get_billing_first_name() ?: '—',
                    count($order->get_items()),
                    $order->get_billing_phone() ?: '—'
                ),
                'priority' => 1,
                'sound'    => 'incoming',
                'url'      => admin_url('post.php?post=' . $order->get_id() . '&action=edit'),
                'url_title'=> 'פתח את ההזמנה',
            ],
        ]);
    }

    /* -------- Telegram -------- */
    private function maybe_notify_telegram(\WC_Order $order): void {
        $token   = get_option(self::OPT_BASE . 'telegram_token');
        $chat_id = get_option(self::OPT_BASE . 'telegram_chat');
        if (!$token || !$chat_id) return;
        $text = sprintf(
            "🛵 *הזמנה חדשה* — עלינא בפיתה\n#%d · ₪%s · %s\n%d פריטים · %s",
            $order->get_id(),
            number_format((float) $order->get_total(), 2),
            $order->get_billing_first_name() ?: '—',
            count($order->get_items()),
            $order->get_billing_phone() ?: '—'
        );
        wp_remote_post('https://api.telegram.org/bot' . $token . '/sendMessage', [
            'timeout' => 8,
            'body' => [
                'chat_id'    => $chat_id,
                'text'       => $text,
                'parse_mode' => 'Markdown',
            ],
        ]);
    }

    /* -------- Generic webhook -------- */
    private function maybe_notify_webhook(\WC_Order $order): void {
        $url = get_option(self::OPT_BASE . 'webhook_url');
        if (!$url) return;
        wp_remote_post($url, [
            'timeout' => 8,
            'headers' => ['Content-Type' => 'application/json'],
            'body' => wp_json_encode([
                'event'   => 'new_order',
                'id'      => $order->get_id(),
                'total'   => (float) $order->get_total(),
                'name'    => $order->get_billing_first_name(),
                'phone'   => $order->get_billing_phone(),
                'items'   => count($order->get_items()),
                'edit_url'=> admin_url('post.php?post=' . $order->get_id() . '&action=edit'),
            ]),
        ]);
    }

    /* -------- Admin settings page -------- */
    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'התראות הזמנות',
            'התראות הזמנות',
            'manage_woocommerce',
            'alena-order-alerts',
            [$this, 'render_admin']
        );
    }

    public function register_settings() {
        foreach (['pushover_user', 'pushover_token', 'telegram_token', 'telegram_chat', 'webhook_url', 'sound_enabled'] as $k) {
            register_setting('alena_alerts', self::OPT_BASE . $k);
        }
    }

    public function render_admin() {
        ?>
        <div class="wrap" dir="rtl">
          <h1>🛵 התראות הזמנות חדשות</h1>
          <p>כל הזמנה חדשה תפעיל צליל + popup ב-wp-admin. אם תגדיר Pushover / Telegram / webhook — תקבל גם שם.</p>
          <form method="post" action="options.php">
            <?php settings_fields('alena_alerts'); ?>
            <h2>Pushover (אפליקציה למובייל)</h2>
            <p class="description">צור חשבון ב-pushover.net (₪35 חד-פעמי), קבל User Key + App Token, הכנס פה.</p>
            <table class="form-table">
              <tr><th>User Key</th><td><input type="text" name="<?php echo self::OPT_BASE; ?>pushover_user" value="<?php echo esc_attr(get_option(self::OPT_BASE . 'pushover_user')); ?>" style="width:380px" /></td></tr>
              <tr><th>App Token</th><td><input type="text" name="<?php echo self::OPT_BASE; ?>pushover_token" value="<?php echo esc_attr(get_option(self::OPT_BASE . 'pushover_token')); ?>" style="width:380px" /></td></tr>
            </table>

            <h2>Telegram Bot</h2>
            <p class="description">פתח בוט עם @BotFather, שלח לו /start, ותקבל token. ה-chat_id הוא של הקבוצה/הפרטי שתשלח אליהם.</p>
            <table class="form-table">
              <tr><th>Bot Token</th><td><input type="text" name="<?php echo self::OPT_BASE; ?>telegram_token" value="<?php echo esc_attr(get_option(self::OPT_BASE . 'telegram_token')); ?>" style="width:380px" /></td></tr>
              <tr><th>Chat ID</th><td><input type="text" name="<?php echo self::OPT_BASE; ?>telegram_chat" value="<?php echo esc_attr(get_option(self::OPT_BASE . 'telegram_chat')); ?>" style="width:380px" /></td></tr>
            </table>

            <h2>Webhook (Zapier / Make / שרת משלך)</h2>
            <table class="form-table">
              <tr><th>Webhook URL</th><td><input type="url" name="<?php echo self::OPT_BASE; ?>webhook_url" value="<?php echo esc_attr(get_option(self::OPT_BASE . 'webhook_url')); ?>" style="width:520px" /></td></tr>
            </table>

            <?php submit_button('שמור הגדרות'); ?>
          </form>

          <h2>איך זה עובד</h2>
          <ol>
            <li>בכל פתיחת wp-admin (גם בטאב ברקע) פועל סקריפט שמתשאל כל 15 שניות אם נכנסה הזמנה חדשה.</li>
            <li>אם כן — מנגן צליל + popup ב-DOM + כותב את מספר ההזמנה בכרטיסיית הדפדפן.</li>
            <li>במקביל, ההזמנה נשלחת ל-Pushover / Telegram / webhook לפי מה שהוגדר.</li>
            <li>אפילו אם הכל סגור — הטלגרם / Pushover יזעיק את הטלפון.</li>
          </ol>
        </div>
        <?php
    }
}
