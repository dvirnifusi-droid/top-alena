<?php
if (!defined('ABSPATH')) exit;

/**
 * Phone-based authentication with OTP — Wolt/10bis style.
 *
 * Flow:
 *   1. Customer enters phone → POST /wp-json/alena/v1/otp/send
 *      Server generates 6-digit code, stores in transient (5 min TTL),
 *      sends via the active OTP provider (WhatsApp/SMS/Console).
 *   2. Customer enters code → POST /wp-json/alena/v1/otp/verify
 *      Server compares, on success finds/creates WP user keyed by
 *      billing_phone, calls wp_set_auth_cookie, returns success.
 *   3. Frontend redirects to /my-account.
 *
 * Providers (alena_otp_provider option):
 *   - 'console'      — code logged to wp_options + admin notice (DEV/TEST)
 *   - 'whatsapp_cloud' — Meta WhatsApp Cloud API (PROD)
 *   - 'twilio_sms'   — Twilio SMS fallback (PROD)
 *
 * Rate limits: 1 send / 60s / phone · 5 verify attempts per code.
 */
class Alena_DZ_Phone_Auth {

    const OPT_PROVIDER         = 'alena_otp_provider';        // console|whatsapp_cloud|twilio_sms
    const OPT_WA_TOKEN         = 'alena_otp_wa_token';        // Meta WA Cloud token
    const OPT_WA_PHONE_ID      = 'alena_otp_wa_phone_id';     // Meta WA Cloud phone_number_id
    const OPT_WA_TEMPLATE      = 'alena_otp_wa_template';     // Approved template name
    const OPT_TWILIO_SID       = 'alena_otp_twilio_sid';
    const OPT_TWILIO_TOKEN     = 'alena_otp_twilio_token';
    const OPT_TWILIO_FROM      = 'alena_otp_twilio_from';
    const OPT_LAST_CONSOLE     = 'alena_otp_last_console';    // For dev: stores last code shown to admin
    // Console mode normally refuses to serve a customer, because handing the
    // code to whoever asked let anyone sign in as any customer. This switch
    // brings that behaviour back deliberately, for testing the flow before a
    // provider is configured. Off unless someone turns it on, and it says so.
    const OPT_TEST_MODE        = 'alena_otp_test_mode';

    const TRANSIENT_PREFIX     = 'alena_otp_';
    const RATE_TRANSIENT       = 'alena_otp_rate_';
    const CODE_TTL_SECONDS     = 300; // 5 min
    const SEND_COOLDOWN        = 60;  // 60s between sends per phone
    const MAX_VERIFY_ATTEMPTS  = 5;

    public function __construct() {
        add_action('rest_api_init',        [$this, 'register_routes']);
        add_action('admin_menu',           [$this, 'menu'], 30);
        add_action('admin_init',           [$this, 'register_settings']);
        add_action('wp_enqueue_scripts',   [$this, 'enqueue']);
        add_filter('woocommerce_locate_template', [$this, 'override_template'], 10, 3);
        add_action('admin_notices',        [$this, 'admin_notice_last_code']);
        add_action('admin_notices',        [$this, 'admin_notice_test_mode']);
        // Make sure phone-based users don't need email
        add_filter('woocommerce_registration_errors', [$this, 'strip_email_required'], 10, 3);

        // Keep a phone-verified customer signed in for a good while — they log in
        // with a WhatsApp code, so re-entering it every 2 weeks is friction with
        // no security upside. Remembered sessions last 60 days.
        add_filter('auth_cookie_expiration', function ($len, $user_id, $remember) {
            return $remember ? 60 * DAY_IN_SECONDS : $len;
        }, 10, 3);
    }

    public function enqueue() {
        if (!function_exists('is_account_page')) return;
        if (!is_account_page() && !is_checkout()) return;
        wp_enqueue_style('alena-phone-auth', ALENA_DZ_URL . 'assets/phone-auth.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-phone-auth', ALENA_DZ_URL . 'assets/phone-auth.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-phone-auth', 'AlenaPhoneAuth', [
            'apiUrl'        => esc_url_raw(rest_url('alena/v1/otp/')),
            'nonce'         => wp_create_nonce('wp_rest'),
            'registerNonce' => wp_create_nonce('alena_club_register'),
            'accountUrl'    => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/',
            'cartUrl'       => function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/',
        ]);
    }

    /* ===========================================================
       Template override — replace WC login form with phone+OTP UI
       =========================================================== */
    public function override_template($template, $template_name, $template_path) {
        $overrides = [
            'myaccount/form-login.php' => 'templates/myaccount/form-login.php',
            'myaccount/dashboard.php'  => 'templates/myaccount/dashboard.php',
            'myaccount/orders.php'     => 'templates/myaccount/orders.php',
            'myaccount/my-address.php' => 'templates/myaccount/my-address.php',
        ];
        if (isset($overrides[$template_name])) {
            $custom = ALENA_DZ_PATH . $overrides[$template_name];
            if (file_exists($custom)) return $custom;
        }
        return $template;
    }

    public function strip_email_required($errors, $username, $email) {
        // We don't gather email — phone is the identity. Remove any "email required" errors.
        if (is_wp_error($errors)) {
            $errors->remove('registration-error-missing-email');
            $errors->remove('registration-error-email-exists');
        }
        return $errors;
    }

    /* ===========================================================
       REST endpoints
       =========================================================== */
    public function register_routes() {
        register_rest_route('alena/v1', '/otp/send', [
            'methods'  => 'POST',
            'callback' => [$this, 'route_send'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('alena/v1', '/otp/verify', [
            'methods'  => 'POST',
            'callback' => [$this, 'route_verify'],
            'permission_callback' => '__return_true',
        ]);
    }

    public function route_send(\WP_REST_Request $req) {
        $phone = self::normalize_phone((string) $req->get_param('phone'));
        if (!self::is_valid_phone($phone)) {
            return new \WP_Error('bad_phone', 'מספר טלפון לא תקין', ['status' => 400]);
        }
        $channel = $req->get_param('channel') === 'sms' ? 'sms' : 'whatsapp';
        $key     = self::TRANSIENT_PREFIX . md5($phone);
        $existing = get_transient($key);

        // The SMS fallback ("didn't get it? send by SMS") RESENDS the same live
        // code by SMS — no new code, and no rate-limit block, so it works the
        // moment the customer taps it even seconds after the first send.
        if ($channel === 'sms' && is_array($existing) && !empty($existing['code'])) {
            $code = (string) $existing['code'];
        } else {
            // Rate limit (fresh code only)
            $rate_key = self::RATE_TRANSIENT . md5($phone);
            if (get_transient($rate_key)) {
                return new \WP_Error('rate_limit', 'נסה שוב בעוד דקה', ['status' => 429]);
            }
            set_transient($rate_key, 1, self::SEND_COOLDOWN);

            // Generate code
            $code = self::generate_code();
            set_transient($key, [
                'code'     => $code,
                'attempts' => 0,
                'phone'    => $phone,
            ], self::CODE_TTL_SECONDS);
        }

        // Send via provider
        $sent = $this->send_via_provider($phone, $code, $channel);
        $response = [
            'ok'      => $sent['ok'],
            'via'     => $sent['via'] ?? $channel,
            'message' => $sent['ok'] ? 'הקוד נשלח' : ('שליחה נכשלה — ' . ($sent['error'] ?? '')),
            'expires_in' => self::CODE_TTL_SECONDS,
        ];
        // Console mode returns the code so a tester can self-serve — but ONLY to
        // a logged-in administrator. Returning it to anyone meant a visitor could
        // type any customer's phone number, read the code off the screen, and be
        // signed in as them, with their address, order history and club balance.
        if (get_option(self::OPT_PROVIDER, 'console') === 'console') {
            if (current_user_can('manage_woocommerce')) {
                $response['dev_code']   = $code;
                $response['dev_notice'] = 'מצב פיתוח (מוצג למנהלים בלבד) — לא הוגדר ספק WhatsApp/SMS';
            } elseif (get_option(self::OPT_TEST_MODE)) {
                // Explicitly switched on. Anyone can read the code for any
                // number while this is set, which is the whole hole — it exists
                // so the flow can be tested end to end, and the settings page
                // says as much next to the switch.
                $response['dev_code']   = $code;
                $response['dev_notice'] = 'מצב בדיקה פעיל — הקוד מוצג על המסך. לכבות לפני שהאתר פתוח ללקוחות.';
            } else {
                // A customer must not be told the code, and must not be left
                // waiting for a message that no provider will ever send.
                $response['ok']      = false;
                $response['message'] = 'ההתחברות בטלפון אינה זמינה כרגע. אפשר להזמין ללא חשבון, או להתקשר אלינו.';
            }
        }
        return rest_ensure_response($response);
    }

    public function route_verify(\WP_REST_Request $req) {
        $phone = self::normalize_phone((string) $req->get_param('phone'));
        $code  = preg_replace('/\D/', '', (string) $req->get_param('code'));

        if (!self::is_valid_phone($phone)) {
            return new \WP_Error('bad_phone', 'מספר לא תקין', ['status' => 400]);
        }
        if (strlen($code) < 4) {
            return new \WP_Error('bad_code', 'קוד לא תקין', ['status' => 400]);
        }

        $key  = self::TRANSIENT_PREFIX . md5($phone);
        $data = get_transient($key);
        if (!$data || !is_array($data)) {
            return new \WP_Error('expired', 'הקוד פג. בקש קוד חדש.', ['status' => 410]);
        }
        if (($data['attempts'] ?? 0) >= self::MAX_VERIFY_ATTEMPTS) {
            delete_transient($key);
            return new \WP_Error('too_many', 'יותר מדי ניסיונות. בקש קוד חדש.', ['status' => 429]);
        }
        if (!hash_equals((string) $data['code'], $code)) {
            $data['attempts']++;
            set_transient($key, $data, self::CODE_TTL_SECONDS);
            return new \WP_Error('wrong_code', 'קוד שגוי', ['status' => 401]);
        }

        // Success — log the customer in
        delete_transient($key);
        $user_id = $this->find_or_create_user_by_phone($phone);
        if (is_wp_error($user_id)) {
            return $user_id;
        }
        // Optional name from registration flow — set as billing_first_name + display_name
        $name = trim((string) $req->get_param('name'));
        if ($name !== '') {
            update_user_meta($user_id, 'billing_first_name', $name);
            $u = get_user_by('ID', $user_id);
            // Only overwrite display_name if it's the auto-generated placeholder
            if ($u && preg_match('/^לקוח /u', (string) $u->display_name)) {
                wp_update_user(['ID' => $user_id, 'display_name' => $name]);
            }
        }
        wp_set_current_user($user_id);
        wp_set_auth_cookie($user_id, true);

        // Sync with TOPALENA club if configured
        $club_info = null;
        if (class_exists('Alena_DZ_Club') && Alena_DZ_Club::is_configured()) {
            $club = new Alena_DZ_Club();
            $club_info = $club->lookup_phone($phone);
            // If not a member yet, register them
            if (!$club_info || empty($club_info['found'])) {
                $user = get_user_by('ID', $user_id);
                $name = $user ? trim($user->display_name) : '';
                $club_info = $club->register_phone($phone, $name, true);
            }
        }

        return rest_ensure_response([
            'ok'         => true,
            'user_id'    => $user_id,
            'club'       => $club_info,
            'redirect'   => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/',
        ]);
    }

    /* ===========================================================
       User management — phone is the identity
       =========================================================== */
    private function find_or_create_user_by_phone(string $phone) {
        // Find by billing_phone meta first
        $existing = get_users([
            'meta_key'   => 'billing_phone',
            'meta_value' => $phone,
            'number'     => 1,
            'fields'     => 'ID',
        ]);
        if (!empty($existing)) return (int) $existing[0];

        // Create new — synthetic email + username derived from phone
        $username = 'tel_' . $phone;
        $email    = $phone . '@phone.alena.local';
        $password = wp_generate_password(24, true, true);

        $user_id = wp_insert_user([
            'user_login'    => $username,
            'user_pass'     => $password,
            'user_email'    => $email,
            'display_name'  => 'לקוח ' . substr($phone, -4),
            'role'          => 'customer',
        ]);
        if (is_wp_error($user_id)) return $user_id;

        update_user_meta($user_id, 'billing_phone', $phone);
        update_user_meta($user_id, '_alena_phone_signup', current_time('mysql'));
        return (int) $user_id;
    }

    /* ===========================================================
       Provider dispatch
       =========================================================== */
    private function send_via_provider(string $phone, string $code, string $channel = 'whatsapp'): array {
        $provider = get_option(self::OPT_PROVIDER, 'console');
        switch ($provider) {
            case 'topalena':       return $this->send_via_topalena($phone, $code, $channel);
            case 'whatsapp_cloud': return $this->send_whatsapp_cloud($phone, $code);
            case 'twilio_sms':     return $this->send_twilio_sms($phone, $code);
            case 'console':
            default:
                return $this->send_console($phone, $code);
        }
    }

    /**
     * Relay the code through the TOP ALENA app, which sends it on its own Twilio
     * pipeline (the same one already delivering staff notifications). WP holds no
     * SMS/WhatsApp credentials in this mode — one messaging stack for everything.
     * The app decides WhatsApp-template vs SMS; $channel='sms' forces SMS (the
     * "didn't get it? send by SMS" fallback).
     */
    private function send_via_topalena(string $phone, string $code, string $channel = 'whatsapp'): array {
        $url = trim((string) get_option('alena_otp_relay_url', 'https://topalena.com/api/delivery/send-otp'));
        $key = class_exists('Alena_DZ_Control_API') ? Alena_DZ_Control_API::key() : (string) get_option('alena_control_key', '');
        if ($url === '' || $key === '') {
            return ['ok' => false, 'error' => 'TOP ALENA לא מחובר (חסר כתובת או מפתח)'];
        }
        $resp = wp_remote_post($url, [
            'timeout' => 15,
            'headers' => ['X-Alena-Control-Key' => $key, 'Content-Type' => 'application/json'],
            'body'    => wp_json_encode([
                'phone'   => self::to_international($phone),
                'code'    => $code,
                'channel' => $channel === 'sms' ? 'sms' : 'whatsapp',
            ]),
        ]);
        if (is_wp_error($resp)) return ['ok' => false, 'error' => $resp->get_error_message()];
        $http = wp_remote_retrieve_response_code($resp);
        $body = json_decode(wp_remote_retrieve_body($resp), true);
        if ($http < 200 || $http >= 300) {
            return ['ok' => false, 'error' => 'HTTP ' . $http . ' ' . (is_array($body) ? ($body['error'] ?? '') : '')];
        }
        return [
            'ok'    => !empty($body['ok']),
            'via'   => is_array($body) ? ($body['via'] ?? '') : '',
            'error' => is_array($body) ? ($body['error'] ?? '') : '',
        ];
    }

    private function send_console(string $phone, string $code): array {
        // DEV mode — store the code in an option so admin can see it.
        update_option(self::OPT_LAST_CONSOLE, [
            'phone' => $phone,
            'code'  => $code,
            'when'  => current_time('mysql'),
        ], false);
        if (function_exists('error_log')) {
            error_log('[ALENA OTP][console] phone=' . $phone . ' code=' . $code);
        }
        return ['ok' => true];
    }

    private function send_whatsapp_cloud(string $phone, string $code): array {
        $token    = get_option(self::OPT_WA_TOKEN);
        $phone_id = get_option(self::OPT_WA_PHONE_ID);
        $template = get_option(self::OPT_WA_TEMPLATE);
        if (!$token || !$phone_id || !$template) {
            return ['ok' => false, 'error' => 'WhatsApp לא הוגדר במלואו'];
        }
        $url = 'https://graph.facebook.com/v18.0/' . rawurlencode($phone_id) . '/messages';
        $to  = self::to_international($phone);
        $body = [
            'messaging_product' => 'whatsapp',
            'to'                => $to,
            'type'              => 'template',
            'template'          => [
                'name'     => $template,
                'language' => ['code' => 'he'],
                'components' => [
                    [
                        'type' => 'body',
                        'parameters' => [
                            ['type' => 'text', 'text' => $code],
                        ],
                    ],
                    [
                        'type' => 'button',
                        'sub_type' => 'url',
                        'index' => '0',
                        'parameters' => [
                            ['type' => 'text', 'text' => $code],
                        ],
                    ],
                ],
            ],
        ];
        $resp = wp_remote_post($url, [
            'timeout' => 12,
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode($body),
        ]);
        if (is_wp_error($resp)) {
            return ['ok' => false, 'error' => $resp->get_error_message()];
        }
        $code_http = wp_remote_retrieve_response_code($resp);
        if ($code_http < 200 || $code_http >= 300) {
            return ['ok' => false, 'error' => 'HTTP ' . $code_http . ': ' . wp_remote_retrieve_body($resp)];
        }
        return ['ok' => true];
    }

    private function send_twilio_sms(string $phone, string $code): array {
        $sid   = get_option(self::OPT_TWILIO_SID);
        $token = get_option(self::OPT_TWILIO_TOKEN);
        $from  = get_option(self::OPT_TWILIO_FROM);
        if (!$sid || !$token || !$from) {
            return ['ok' => false, 'error' => 'Twilio לא הוגדר'];
        }
        $url = 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages.json';
        $resp = wp_remote_post($url, [
            'timeout' => 12,
            'headers' => [
                'Authorization' => 'Basic ' . base64_encode($sid . ':' . $token),
            ],
            'body' => [
                'From' => $from,
                'To'   => self::to_international($phone),
                'Body' => "קוד הכניסה שלך לעלינא: $code",
            ],
        ]);
        if (is_wp_error($resp)) {
            return ['ok' => false, 'error' => $resp->get_error_message()];
        }
        $code_http = wp_remote_retrieve_response_code($resp);
        if ($code_http < 200 || $code_http >= 300) {
            return ['ok' => false, 'error' => 'HTTP ' . $code_http];
        }
        return ['ok' => true];
    }

    /* ===========================================================
       Helpers
       =========================================================== */
    private static function generate_code(): string {
        // Cryptographically random 6-digit code, with leading zeros preserved
        $n = random_int(0, 999999);
        return str_pad((string) $n, 6, '0', STR_PAD_LEFT);
    }

    public static function normalize_phone(string $raw): string {
        $digits = preg_replace('/\D/', '', $raw);
        if (strpos($digits, '972') === 0) {
            $digits = '0' . substr($digits, 3);
        }
        return $digits;
    }

    public static function is_valid_phone(string $phone): bool {
        return (bool) preg_match('/^0\d{8,9}$/', $phone);
    }

    private static function to_international(string $phone): string {
        // 0501234567 → 972501234567
        $p = self::normalize_phone($phone);
        if (strpos($p, '0') === 0) $p = '972' . substr($p, 1);
        return $p;
    }

    /* ===========================================================
       Admin settings + dev notice
       =========================================================== */
    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'התחברות בטלפון (OTP)',
            'התחברות + OTP',
            'manage_options',
            'alena-phone-auth',
            [$this, 'render_admin']
        );
    }

    public function register_settings() {
        register_setting('alena_otp', self::OPT_PROVIDER);
        register_setting('alena_otp', self::OPT_WA_TOKEN);
        register_setting('alena_otp', self::OPT_WA_PHONE_ID);
        register_setting('alena_otp', self::OPT_WA_TEMPLATE);
        register_setting('alena_otp', self::OPT_TWILIO_SID);
        register_setting('alena_otp', self::OPT_TWILIO_TOKEN);
        register_setting('alena_otp', self::OPT_TWILIO_FROM);
        register_setting('alena_otp', self::OPT_TEST_MODE);
    }

    /** Loud, on every admin screen — this one must not be forgotten. */
    public function admin_notice_test_mode() {
        if (!get_option(self::OPT_TEST_MODE)) return;
        echo '<div class="notice notice-error"><p>⚠️ <strong>מצב בדיקת התחברות פעיל</strong> — '
           . 'קוד ההתחברות מוצג על המסך לכל מי שמזין מספר טלפון, כולל מספרים של לקוחות. '
           . 'לכבות ב<a href="' . esc_url(admin_url('admin.php?page=alena-phone-auth')) . '">התחברות + OTP</a> '
           . 'לפני שהאתר פתוח ללקוחות.</p></div>';
    }

    public function admin_notice_last_code() {
        $provider = get_option(self::OPT_PROVIDER, 'console');
        if ($provider !== 'console') return;
        $last = get_option(self::OPT_LAST_CONSOLE);
        if (!$last || empty($last['code'])) return;
        // Only on plugin admin pages, to avoid clutter
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || strpos((string) $screen->id, 'alena') === false) return;
        echo '<div class="notice notice-info"><p>📱 <strong>OTP אחרון (Console mode):</strong> טלפון ' .
             esc_html($last['phone']) . ' · קוד <code style="font-size:18px;background:#1e4a3a;color:#fff;padding:4px 10px;border-radius:6px">' .
             esc_html($last['code']) . '</code> · נשלח ב-' . esc_html($last['when']) . '</p></div>';
    }

    public function render_admin() {
        $provider = get_option(self::OPT_PROVIDER, 'console');
        ?>
        <div class="wrap" dir="rtl">
          <h1>התחברות לקוחות בטלפון + OTP</h1>
          <form method="post" action="options.php">
            <?php settings_fields('alena_otp'); ?>
            <h2>מצב בדיקה</h2>
            <table class="form-table">
              <tr>
                <th>הצגת הקוד על המסך</th>
                <td>
                  <label>
                    <input type="checkbox" name="<?php echo self::OPT_TEST_MODE; ?>" value="1"
                           <?php checked(get_option(self::OPT_TEST_MODE), '1'); ?> />
                    להציג את קוד ההתחברות באתר עצמו (רק כשהספק הוא Console)
                  </label>
                  <p class="description" style="color:#a00">
                    ⚠️ בזמן שזה מסומן, <strong>כל אחד</strong> יכול להזין מספר טלפון של לקוח,
                    לקרוא את הקוד מהמסך ולהיכנס לחשבון שלו — כולל כתובת, היסטוריית הזמנות ונקודות מועדון.
                    מיועד לבדיקה בלבד. לכבות לפני שהאתר פתוח ללקוחות.
                  </p>
                </td>
              </tr>
            </table>

            <h2>ספק לשליחת הקוד</h2>
            <select name="<?php echo self::OPT_PROVIDER; ?>">
              <option value="console" <?php selected($provider, 'console'); ?>>Console (פיתוח — הקוד מוצג ב-wp-admin)</option>
              <option value="whatsapp_cloud" <?php selected($provider, 'whatsapp_cloud'); ?>>WhatsApp Cloud API (Meta)</option>
              <option value="twilio_sms" <?php selected($provider, 'twilio_sms'); ?>>Twilio SMS</option>
            </select>

            <h2>WhatsApp Cloud API</h2>
            <table class="form-table">
              <tr><th>Access Token</th><td><input type="text" style="width:520px" name="<?php echo self::OPT_WA_TOKEN; ?>" value="<?php echo esc_attr(get_option(self::OPT_WA_TOKEN)); ?>" /></td></tr>
              <tr><th>Phone Number ID</th><td><input type="text" name="<?php echo self::OPT_WA_PHONE_ID; ?>" value="<?php echo esc_attr(get_option(self::OPT_WA_PHONE_ID)); ?>" /></td></tr>
              <tr><th>שם תבנית מאושרת</th><td><input type="text" name="<?php echo self::OPT_WA_TEMPLATE; ?>" value="<?php echo esc_attr(get_option(self::OPT_WA_TEMPLATE)); ?>" placeholder="alena_otp_he" /><p class="description">תבנית עברית עם משתנה אחד לקוד</p></td></tr>
            </table>

            <h2>Twilio SMS (גיבוי)</h2>
            <table class="form-table">
              <tr><th>Account SID</th><td><input type="text" name="<?php echo self::OPT_TWILIO_SID; ?>" value="<?php echo esc_attr(get_option(self::OPT_TWILIO_SID)); ?>" /></td></tr>
              <tr><th>Auth Token</th><td><input type="text" name="<?php echo self::OPT_TWILIO_TOKEN; ?>" value="<?php echo esc_attr(get_option(self::OPT_TWILIO_TOKEN)); ?>" /></td></tr>
              <tr><th>שולח (מספר/Sender ID)</th><td><input type="text" name="<?php echo self::OPT_TWILIO_FROM; ?>" value="<?php echo esc_attr(get_option(self::OPT_TWILIO_FROM)); ?>" placeholder="+12345678901 או Alena" /></td></tr>
            </table>

            <?php submit_button('שמור'); ?>
          </form>

          <h2>איך זה עובד</h2>
          <ol>
            <li>לקוח נכנס ל-<code>/my-account</code> או לקופה</li>
            <li>מקליד מספר טלפון → <code>POST /wp-json/alena/v1/otp/send</code></li>
            <li>השרת מגריל קוד 6 ספרות, שומר בטרנזיינט (5 דק'), שולח דרך הספק שנבחר</li>
            <li>לקוח מקליד קוד → <code>POST /wp-json/alena/v1/otp/verify</code></li>
            <li>השרת בודק, יוצר/מוצא משתמש WP לפי <code>billing_phone</code>, מחבר אותו, ומסנכרן מועדון TOPALENA</li>
          </ol>
        </div>
        <?php
    }
}
