<?php
if (!defined('ABSPATH')) exit;

/**
 * TOPALENA Customer Club integration.
 *
 * Hooks into the WP plugin to:
 *   1. On order completion, POST /api/club/orders to award coins (100₪ = 1 coin).
 *   2. During checkout, look up the phone in /api/club/lookup — show points balance / club tier.
 *   3. On My Account page, render the club card with current balance + tier + perks.
 *   4. Allow club join via a CTA at checkout (POST /api/club/register).
 *   5. Future: phone-OTP-based login (WhatsApp Cloud API or Twilio).
 *
 * Settings stored as WP options under `alena_club_*`:
 *   - alena_club_api_base   (e.g. https://topalena.com)
 *   - alena_club_api_key    (CLUB_API_KEY value on the TOPALENA API)
 *   - alena_club_coin_value (₪ per redeemed coin; default 4)
 *   - alena_club_earn_per   (₪ per earned coin; default 100)
 */
class Alena_DZ_Club {

    const OPT_BASE      = 'alena_club_api_base';
    const OPT_KEY       = 'alena_club_api_key';
    const OPT_COIN_VAL  = 'alena_club_coin_value';
    const OPT_EARN_PER  = 'alena_club_earn_per';
    const OPT_JOIN      = 'alena_club_join_incentive';

    const SESSION_REDEEM_COINS = 'alena_club_redeem_coins';

    public function __construct() {
        add_action('admin_menu',                       [$this, 'menu'], 28);
        add_action('admin_init',                       [$this, 'register_settings']);
        add_action('wp_enqueue_scripts',               [$this, 'enqueue']);

        // Award + redeem on order completion
        add_action('woocommerce_order_status_completed',  [$this, 'on_order_complete'], 10, 1);
        add_action('woocommerce_order_status_processing', [$this, 'on_order_complete'], 10, 1);

        // My Account widget — show points balance, tier, perks
        add_action('woocommerce_account_dashboard',    [$this, 'render_club_widget'], 8);

        // Redemption UI in cart + checkout
        add_action('woocommerce_cart_totals_before_order_total',     [$this, 'render_redemption_box']);
        add_action('woocommerce_review_order_before_order_total',    [$this, 'render_redemption_box']);
        add_action('woocommerce_cart_calculate_fees',                [$this, 'apply_redemption_fee']);
        add_action('woocommerce_checkout_create_order',              [$this, 'attach_redemption_to_order'], 10, 2);
        add_action('woocommerce_cart_emptied',                       [$this, 'clear_redemption']);

        // AJAX endpoints
        add_action('wp_ajax_alena_club_lookup',        [$this, 'ajax_lookup']);
        add_action('wp_ajax_nopriv_alena_club_lookup', [$this, 'ajax_lookup']);
        add_action('wp_ajax_alena_club_register',      [$this, 'ajax_register']);
        add_action('wp_ajax_nopriv_alena_club_register',[$this, 'ajax_register']);
        add_action('wp_ajax_alena_club_apply_redeem', [$this, 'ajax_apply_redeem']);
        add_action('wp_ajax_alena_club_clear_redeem', [$this, 'ajax_clear_redeem']);
    }

    public function enqueue() {
        // Load on every WC-related page so the /shop banner is styled too
        $on_wc = function_exists('is_woocommerce') && (
            (function_exists('is_shop') && is_shop()) ||
            is_woocommerce() ||
            (function_exists('is_account_page') && is_account_page()) ||
            (function_exists('is_checkout') && is_checkout()) ||
            (function_exists('is_cart') && is_cart())
        );
        if (!$on_wc) return;
        wp_enqueue_style('alena-club',  ALENA_DZ_URL . 'assets/club.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-club', ALENA_DZ_URL . 'assets/club.js',  ['jquery'], ALENA_DZ_VERSION, true);
    }

    // Hardcoded default so the WP side is configured automatically — saves
    // the owner from having to paste two values in admin. Can still be overridden
    // by saving a value through the settings page.
    const DEFAULT_API_BASE = 'https://topalena.com';
    const DEFAULT_API_KEY  = '42Ga0yY9IzRAVR679LQLdsLnQCRa8ZYAaWOInZIt9pg';

    public static function api_base(): string {
        $base = (string) get_option(self::OPT_BASE, self::DEFAULT_API_BASE);
        return rtrim($base, '/');
    }

    public static function api_key(): string {
        $stored = (string) get_option(self::OPT_KEY, '');
        return $stored !== '' ? $stored : self::DEFAULT_API_KEY;
    }

    public static function coin_value_ils(): float {
        $v = (float) get_option(self::OPT_COIN_VAL, 4);
        return $v > 0 ? $v : 4.0;
    }

    public static function earn_per_ils(): float {
        $v = (float) get_option(self::OPT_EARN_PER, 100);
        return $v > 0 ? $v : 100.0;
    }

    /**
     * The join incentive shown on the login button. Owner-editable, because the
     * benefit is the owner's promise to honour — the club API grants no automatic
     * welcome gift. Defaults to a line that is already true today (the points
     * economy), so it never over-promises until the owner sets a real offer.
     */
    public static function join_incentive(): string {
        $custom = trim((string) get_option(self::OPT_JOIN, ''));
        if ($custom !== '') return $custom;
        $coin = (int) round(self::coin_value_ils());
        return 'צוברים נקודות על כל הזמנה — כל נקודה ₪' . $coin . ' בקופה';
    }

    public static function is_configured(): bool {
        return self::api_base() !== '' && self::api_key() !== '';
    }

    /* ===========================================================
       HTTP — talk to TOPALENA club API
       =========================================================== */

    private function api_request(string $path, string $method = 'GET', array $body = null): array {
        if (!self::is_configured()) {
            return ['ok' => false, 'error' => 'club_not_configured'];
        }
        $url = self::api_base() . $path;
        $args = [
            'method'  => $method,
            'timeout' => 12,
            'headers' => [
                'X-Alena-Club-Key' => self::api_key(),
                'Accept'           => 'application/json',
            ],
        ];
        if ($body !== null) {
            $args['headers']['Content-Type'] = 'application/json';
            $args['body'] = wp_json_encode($body);
        }
        $resp = wp_remote_request($url, $args);
        if (is_wp_error($resp)) {
            return ['ok' => false, 'error' => 'network', 'detail' => $resp->get_error_message()];
        }
        $code = wp_remote_retrieve_response_code($resp);
        $data = json_decode(wp_remote_retrieve_body($resp), true);
        return [
            'ok'   => $code >= 200 && $code < 300,
            'code' => $code,
            'data' => is_array($data) ? $data : null,
        ];
    }

    public function lookup_phone(string $phone): ?array {
        $r = $this->api_request('/api/club/lookup', 'POST', ['phone' => $phone]);
        if (!$r['ok']) return null;
        return $r['data'];
    }

    public function register_phone(string $phone, string $name = '', bool $consent = true, array $extra = []): ?array {
        $body = [
            'phone'             => $phone,
            'name'              => $name,
            'marketing_consent' => $consent,
        ];
        // Optional profile fields — mirror topalena.com/Club
        foreach (['email', 'city', 'birthday', 'anniversary'] as $k) {
            if (!empty($extra[$k])) $body[$k] = $extra[$k];
        }
        $r = $this->api_request('/api/club/register', 'POST', $body);
        if (!$r['ok']) return null;
        return $r['data'];
    }

    public function record_order(string $phone, float $total, string $order_id): ?array {
        $r = $this->api_request('/api/club/orders', 'POST', [
            'phone'       => $phone,
            'order_total' => $total,
            'order_id'    => $order_id,
        ]);
        if (!$r['ok']) return null;
        return $r['data'];
    }

    public function redeem_coins(string $phone, int $coins, string $order_id = ''): ?array {
        $r = $this->api_request('/api/club/redeem', 'POST', [
            'phone'           => $phone,
            'coins_to_redeem' => $coins,
            'order_id'        => $order_id,
        ]);
        if (!$r['ok']) return null;
        return $r['data'];
    }

    public function get_benefits(string $phone): array {
        $phone = preg_replace('/\D/', '', $phone);
        $r = $this->api_request('/api/club/benefits/' . $phone);
        if (!$r['ok']) return [];
        return $r['data']['benefits'] ?? [];
    }

    /* ===========================================================
       Order lifecycle
       =========================================================== */

    public function on_order_complete($order_id) {
        try {
            if (!self::is_configured()) return;
            $order = wc_get_order($order_id);
            if (!$order) return;
            $phone = (string) $order->get_billing_phone();
            if (!$phone) return;

            // 1. Debit any redeemed coins BEFORE awarding new ones, so a customer can't
            //    redeem coins they're about to earn on the same order.
            $redeem_planned = (int) $order->get_meta('_alena_club_redeem_coins_planned');
            $redeem_done    = (int) $order->get_meta('_alena_club_redeem_coins_done');
            if ($redeem_planned > 0 && $redeem_done < 1) {
                $r = $this->redeem_coins($phone, $redeem_planned, (string) $order_id);
                if ($r && isset($r['coins_redeemed'])) {
                    $order->update_meta_data('_alena_club_redeem_coins_done', (int) $r['coins_redeemed']);
                    $order->update_meta_data('_alena_club_redeem_balance_after', (int) ($r['new_balance'] ?? 0));
                    $order->add_order_note(sprintf(
                        '💰 מועדון TOPALENA: נפדו %d נקודות (-₪%d). יתרה: %d',
                        (int) $r['coins_redeemed'],
                        (int) ($r['ils_discount'] ?? 0),
                        (int) ($r['new_balance'] ?? 0)
                    ));
                } else {
                    $order->add_order_note('⚠️ מועדון: ניסיון לפדות ' . $redeem_planned . ' נקודות נכשל — נא לבדוק ידנית');
                }
            }

            // 2. Award points for this order (idempotent)
            $already = $order->get_meta('_alena_club_awarded');
            if (!$already) {
                $total = (float) $order->get_total();
                $resp  = $this->record_order($phone, $total, (string) $order_id);
                if ($resp && isset($resp['coins_earned'])) {
                    $order->update_meta_data('_alena_club_awarded',       1);
                    $order->update_meta_data('_alena_club_coins_earned',  (int) $resp['coins_earned']);
                    $order->update_meta_data('_alena_club_balance_after', (int) ($resp['new_balance'] ?? 0));
                    $order->update_meta_data('_alena_club_tier',          (string) ($resp['new_tier'] ?? ''));
                    $order->add_order_note(sprintf(
                        '🎁 מועדון TOPALENA: %d נקודות צבירה הוענקו. יתרה: %d (%s)',
                        (int) $resp['coins_earned'],
                        (int) ($resp['new_balance'] ?? 0),
                        (string) ($resp['new_tier'] ?? '')
                    ));
                }
            }
            $order->save();
        } catch (\Throwable $e) {
            // Swallow — club integration failures should NEVER break order processing
            if (function_exists('error_log')) {
                error_log('Alena_DZ_Club::on_order_complete error: ' . $e->getMessage());
            }
        }
    }

    /* ===========================================================
       Redemption: cart UI + WC fee + AJAX
       =========================================================== */

    private function get_redeem_session(): int {
        if (!function_exists('WC') || !WC()->session) return 0;
        return (int) WC()->session->get(self::SESSION_REDEEM_COINS, 0);
    }

    private function set_redeem_session(int $coins): void {
        if (!function_exists('WC') || !WC()->session) return;
        WC()->session->set(self::SESSION_REDEEM_COINS, max(0, $coins));
    }

    public function clear_redemption(): void {
        $this->set_redeem_session(0);
    }

    /**
     * Returns the current user's club balance, or 0 if not logged in / not a member.
     */
    private function current_user_balance(): array {
        $result = ['balance' => 0, 'phone' => '', 'is_member' => false];
        if (!is_user_logged_in()) return $result;
        $phone = (string) get_user_meta(get_current_user_id(), 'billing_phone', true);
        if (!$phone || !self::is_configured()) return $result;
        $info = $this->lookup_phone($phone);
        if (!$info || empty($info['found'])) return $result;
        $result['balance']   = (int) ($info['coin_balance'] ?? 0);
        $result['phone']     = $phone;
        $result['is_member'] = true;
        return $result;
    }

    public function render_redemption_box(): void {
        $info = $this->current_user_balance();
        if (!$info['is_member'] || $info['balance'] < 1) return;

        $applied = $this->get_redeem_session();
        $coin_v  = self::coin_value_ils();
        $subtotal = function_exists('WC') && WC()->cart ? (float) WC()->cart->get_subtotal() : 0;
        // Max redeem is limited by both: customer balance AND cart subtotal divided by coin value
        $max_by_cart = $subtotal > 0 ? (int) floor($subtotal / $coin_v) : 0;
        $max_redeem  = min($info['balance'], $max_by_cart);

        $nonce = wp_create_nonce('alena_club_redeem');
        ?>
        <tr class="alena-club-redeem-row">
          <td colspan="2">
            <div class="alena-club-redeem">
              <div class="alena-club-redeem-head">
                <span class="alena-club-redeem-emoji">💰</span>
                <div>
                  <strong>יש לך <?php echo (int) $info['balance']; ?> נקודות מועדון</strong>
                  <span class="alena-club-redeem-sub">שווה עד ₪<?php echo number_format($info['balance'] * $coin_v, 0); ?> הנחה</span>
                </div>
              </div>
              <?php if ($applied > 0): ?>
                <div class="alena-club-redeem-applied">
                  ✓ נפדים <?php echo (int) $applied; ?> נקודות (-₪<?php echo number_format($applied * $coin_v, 0); ?>)
                  <button type="button" class="alena-club-redeem-clear" data-nonce="<?php echo esc_attr($nonce); ?>">הסר</button>
                </div>
              <?php elseif ($max_redeem >= 1): ?>
                <div class="alena-club-redeem-form">
                  <label>
                    כמה לפדות?
                    <input type="number"
                           class="alena-club-redeem-input"
                           min="1"
                           max="<?php echo (int) $max_redeem; ?>"
                           step="1"
                           value="<?php echo (int) $max_redeem; ?>"
                           data-coin-value="<?php echo esc_attr($coin_v); ?>" />
                    <span class="alena-club-redeem-preview">= ₪<?php echo number_format($max_redeem * $coin_v, 0); ?></span>
                  </label>
                  <button type="button" class="alena-club-redeem-apply" data-nonce="<?php echo esc_attr($nonce); ?>">פדה</button>
                </div>
              <?php else: ?>
                <div class="alena-club-redeem-form">
                  <span class="alena-club-redeem-sub">סכום ההזמנה קטן מערך נקודה — הוסף עוד פריטים לסל כדי לפדות</span>
                </div>
              <?php endif; ?>
            </div>
          </td>
        </tr>
        <?php
    }

    public function apply_redemption_fee(\WC_Cart $cart): void {
        $coins = $this->get_redeem_session();
        if ($coins <= 0) return;
        $info = $this->current_user_balance();
        // Re-validate against current balance + cart size — customer might have changed cart
        $coin_v   = self::coin_value_ils();
        $subtotal = (float) $cart->get_subtotal();
        $max_by_cart = (int) floor($subtotal / $coin_v);
        $effective = min($coins, $info['balance'], $max_by_cart);
        if ($effective <= 0) return;
        // The customer is promised a number of shekels off the price they see,
        // and menu prices here INCLUDE VAT. A flat non-taxable fee of that
        // amount came off as amount x 1.18 (13 points promised ₪52 and took
        // ₪61.36), because WooCommerce treats a fee as a net figure and grosses
        // the displayed total back up. So the fee is entered net and marked
        // taxable: WooCommerce then grosses it to exactly the promised sum.
        $gross = $effective * $coin_v;
        if (function_exists('wc_prices_include_tax') && wc_prices_include_tax()) {
            $rate = 0.0;
            if (class_exists('WC_Tax')) {
                $rates = WC_Tax::get_rates();
                if ($rates) {
                    $first = reset($rates);
                    $rate  = (float) ($first['rate'] ?? 0);
                }
            }
            if ($rate <= 0) $rate = 18.0;   // Israel, and what this store is set to
            $net = $gross / (1 + ($rate / 100));
            $cart->add_fee('הנחת מועדון (' . $effective . ' נקודות)', -1 * $net, true);
            return;
        }
        $cart->add_fee('הנחת מועדון (' . $effective . ' נקודות)', -1 * $gross, false);
    }

    public function attach_redemption_to_order(\WC_Order $order, $data): void {
        $coins = $this->get_redeem_session();
        if ($coins <= 0) return;
        $order->update_meta_data('_alena_club_redeem_coins_planned', $coins);
    }

    public function ajax_apply_redeem(): void {
        check_ajax_referer('alena_club_redeem', 'nonce');
        $coins = isset($_POST['coins']) ? max(1, (int) $_POST['coins']) : 0;
        if ($coins < 1) wp_send_json_error('bad_amount', 400);

        $info = $this->current_user_balance();
        if (!$info['is_member']) wp_send_json_error('not_a_member', 403);
        if ($coins > $info['balance']) wp_send_json_error('insufficient_balance', 400);

        $this->set_redeem_session($coins);
        WC()->cart->calculate_totals();
        wp_send_json_success(['applied' => $coins]);
    }

    public function ajax_clear_redeem(): void {
        check_ajax_referer('alena_club_redeem', 'nonce');
        $this->clear_redemption();
        if (function_exists('WC') && WC()->cart) WC()->cart->calculate_totals();
        wp_send_json_success(['cleared' => true]);
    }

    /* ===========================================================
       My Account widget
       =========================================================== */

    /**
     * Slim club banner — rendered at the top of /shop for logged-in members.
     * Shows balance, ILS-discount-value, tier, and an explicit "use in checkout" hint.
     */
    public function render_shop_banner() {
        if (class_exists('Alena_DZ_Features') && !Alena_DZ_Features::on('club_banner')) return;
        if (!self::is_configured()) return;
        if (!is_user_logged_in()) return;

        $user  = wp_get_current_user();
        $phone = (string) get_user_meta($user->ID, 'billing_phone', true);
        if (!$phone) return;

        $info = $this->lookup_phone($phone);
        if (!$info || empty($info['found'])) return;

        $balance = (int) ($info['coin_balance'] ?? 0);
        $tier    = (string) ($info['loyalty_tier'] ?? 'regular');
        $visits  = (int) ($info['visit_count'] ?? 0);
        $coin_v  = self::coin_value_ils();
        $value_ils = $balance * $coin_v;

        // TOPALENA writes regular / frequent / vip (see syncQueueToCustomer).
        // Only regular was mapped here, so every returning customer — including
        // one with 18 orders — fell through to the same label. silver/gold are
        // kept in case anything older still writes them.
        $tier_labels = [
            'regular'  => ['name' => 'חבר מועדון', 'emoji' => '🥙'],
            'frequent' => ['name' => 'לקוח קבוע',  'emoji' => '⭐'],
            'vip'      => ['name' => 'מהמשפחה',    'emoji' => '👑'],
            'silver'   => ['name' => 'לקוח קבוע',  'emoji' => '⭐'],
            'gold'     => ['name' => 'מהמשפחה',    'emoji' => '👑'],
        ];
        $t = $tier_labels[$tier] ?? $tier_labels['regular'];
        $first = (string) get_user_meta($user->ID, 'billing_first_name', true);
        $name  = $first ?: $user->display_name ?: 'לקוח';
        ?>
        <div class="alena-club-shop-banner">
          <div class="alena-club-shop-banner-greeting">
            <span class="alena-club-shop-banner-tier-emoji"><?php echo $t['emoji']; ?></span>
            <div>
              <strong>היי <?php echo esc_html($name); ?> 👋</strong>
              <span class="alena-club-shop-banner-tier"><span class="alena-club-tier-chip"><?php echo esc_html($t['name']); ?></span><?php if ($visits > 0): ?> <?php echo (int) $visits; ?> הזמנות קודמות<?php endif; ?></span>
              <?php
              // Says something true about this particular customer rather than
              // repeating the tier name back at them.
              $personal = '';
              if     ($visits >= 10) $personal = 'מהלקוחות הקבועים שלנו — תודה 💙';
              elseif ($visits >= 3)  $personal = 'כיף שחזרת אלינו';
              elseif ($visits >= 1)  $personal = 'טוב לראות אותך שוב';
              else                   $personal = 'ברוך הבא למועדון';
              ?>
              <span class="alena-club-shop-banner-personal"><?php echo esc_html($personal); ?></span>
            </div>
            <a class="alena-club-shop-banner-account"
               href="<?php echo esc_url(function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/'); ?>">
              האיזור שלי ←
            </a>
          </div>
          <div class="alena-club-shop-banner-stats">
            <div class="alena-club-shop-banner-stat">
              <strong><?php echo (int) $balance; ?></strong>
              <span>נקודות שצברת</span>
            </div>
            <div class="alena-club-shop-banner-stat alena-club-shop-banner-stat-accent">
              <strong>₪<?php echo number_format($value_ils, 0); ?></strong>
              <span>מחכים לך בקופה 🎁</span>
            </div>
          </div>
          <?php if ($balance > 0): ?>
          <div class="alena-club-shop-banner-hint">💡 הפדיון מתבצע אוטומטית בעמוד הסל</div>
          <?php else: ?>
          <div class="alena-club-shop-banner-hint">כל ₪100 בהזמנה צוברים נקודה · כל נקודה שווה ₪<?php echo (int) $coin_v; ?></div>
          <?php endif; ?>
        </div>
        <?php
    }

    public function render_club_widget() {
        if (!self::is_configured()) return;

        $phone = '';
        $user_id = get_current_user_id();
        if ($user_id) {
            $phone = get_user_meta($user_id, 'billing_phone', true);
        }
        if (!$phone) return;

        $info = $this->lookup_phone($phone);
        if (!$info || empty($info['found'])) {
            // Show a "join the club" CTA
            $this->render_join_cta($phone);
            return;
        }

        $balance = (int) ($info['coin_balance'] ?? 0);
        $tier    = (string) ($info['loyalty_tier'] ?? 'regular');
        $visits  = (int) ($info['visit_count'] ?? 0);
        $coin_v  = self::coin_value_ils();
        $value_ils = $balance * $coin_v;

        // TOPALENA writes regular / frequent / vip (see syncQueueToCustomer).
        // Only regular was mapped here, so every returning customer — including
        // one with 18 orders — fell through to the same label. silver/gold are
        // kept in case anything older still writes them.
        $tier_labels = [
            'regular'  => ['name' => 'חבר מועדון', 'emoji' => '🥙'],
            'frequent' => ['name' => 'לקוח קבוע',  'emoji' => '⭐'],
            'vip'      => ['name' => 'מהמשפחה',    'emoji' => '👑'],
            'silver'   => ['name' => 'לקוח קבוע',  'emoji' => '⭐'],
            'gold'     => ['name' => 'מהמשפחה',    'emoji' => '👑'],
        ];
        $t = $tier_labels[$tier] ?? $tier_labels['regular'];
        ?>
        <div class="alena-club-widget">
          <div class="alena-club-head">
            <span class="alena-club-emoji"><?php echo $t['emoji']; ?></span>
            <div>
              <strong class="alena-club-title">מועדון לקוחות עלינא</strong>
              <span class="alena-club-tier"><?php echo esc_html($t['name']); ?> · <?php echo $visits; ?> הזמנות</span>
            </div>
          </div>
          <div class="alena-club-balance">
            <div class="alena-club-balance-num"><?php echo $balance; ?></div>
            <div>
              <div class="alena-club-balance-label">נקודות צבירה</div>
              <div class="alena-club-balance-value">שווה ₪<?php echo number_format($value_ils, 0); ?> בקופה</div>
            </div>
          </div>
          <div class="alena-club-meta">
            כל ₪<?php echo (int) self::earn_per_ils(); ?> בהזמנה = נקודה אחת · כל נקודה שווה ₪<?php echo number_format($coin_v, 0); ?>
          </div>
        </div>
        <?php
    }

    private function render_join_cta(string $phone) {
        $earn_per = (int) self::earn_per_ils();
        $coin_v   = self::coin_value_ils();
        ?>
        <div class="alena-club-widget alena-club-widget-join">
          <div class="alena-club-head">
            <span class="alena-club-emoji">🎁</span>
            <strong class="alena-club-title">הצטרפו למועדון עלינא — חינם</strong>
          </div>
          <p class="alena-club-perks">
            כל ₪<?php echo $earn_per; ?> בהזמנה צוברים נקודה · כל נקודה שווה ₪<?php echo number_format($coin_v, 0); ?> בקופה הבאה ·
            הטבות אישיות ליום הולדת ולחגים
          </p>
          <button type="button"
                  class="alena-club-join-btn"
                  data-phone="<?php echo esc_attr($phone); ?>"
                  data-nonce="<?php echo wp_create_nonce('alena_club_register'); ?>">
            הצטרפות מהירה ↻
          </button>
        </div>
        <?php
    }

    public function ajax_lookup() {
        $phone = isset($_POST['phone']) ? sanitize_text_field((string) $_POST['phone']) : '';
        if (!$phone) wp_send_json_error('no_phone', 400);
        $info = $this->lookup_phone($phone);
        if (!$info) wp_send_json_error('lookup_failed', 502);
        wp_send_json_success($info);
    }

    public function ajax_register() {
        check_ajax_referer('alena_club_register', 'nonce');
        $phone   = isset($_POST['phone'])   ? sanitize_text_field((string) $_POST['phone'])   : '';
        $name    = isset($_POST['name'])    ? sanitize_text_field((string) $_POST['name'])    : '';
        $consent = !empty($_POST['consent']);
        if (!$phone) wp_send_json_error('no_phone', 400);

        $extra = [
            'email'       => isset($_POST['email'])       ? sanitize_email((string) $_POST['email'])         : '',
            'city'        => isset($_POST['city'])        ? sanitize_text_field((string) $_POST['city'])     : '',
            'birthday'    => isset($_POST['birthday'])    ? sanitize_text_field((string) $_POST['birthday']) : '',
            'anniversary' => isset($_POST['anniversary']) ? sanitize_text_field((string) $_POST['anniversary']) : '',
        ];
        $resp = $this->register_phone($phone, $name, $consent, $extra);
        if (!$resp) wp_send_json_error('register_failed', 502);
        wp_send_json_success($resp);
    }

    /* ===========================================================
       Admin settings page
       =========================================================== */

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'מועדון לקוחות',
            'מועדון לקוחות',
            'manage_woocommerce',
            'alena-club-settings',
            [$this, 'render_admin']
        );
    }

    public function register_settings() {
        register_setting('alena_club', self::OPT_BASE,     ['type' => 'string', 'sanitize_callback' => 'esc_url_raw']);
        register_setting('alena_club', self::OPT_KEY,      ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
        register_setting('alena_club', self::OPT_COIN_VAL, ['type' => 'number', 'sanitize_callback' => 'floatval']);
        register_setting('alena_club', self::OPT_EARN_PER, ['type' => 'number', 'sanitize_callback' => 'floatval']);
        register_setting('alena_club', self::OPT_JOIN,     ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
    }

    public function render_admin() {
        $base    = self::api_base();
        $key     = self::api_key();
        $coin_v  = self::coin_value_ils();
        $earn_p  = self::earn_per_ils();
        $ping    = null;
        if (self::is_configured()) {
            $r = $this->api_request('/api/club/ping');
            $ping = $r;
        }
        ?>
        <div class="wrap" dir="rtl">
          <h1>מועדון לקוחות TOPALENA — הגדרות</h1>
          <form method="post" action="options.php">
            <?php settings_fields('alena_club'); ?>
            <table class="form-table">
              <tr>
                <th>כתובת API</th>
                <td>
                  <input type="url" name="<?php echo self::OPT_BASE; ?>" value="<?php echo esc_attr($base); ?>" style="width:420px" placeholder="https://topalena.com" />
                  <p class="description">כתובת השרת של TOPALENA, ללא נתיב. לדוגמה: <code>https://topalena.com</code></p>
                </td>
              </tr>
              <tr>
                <th>מפתח API (CLUB_API_KEY)</th>
                <td>
                  <input type="text" name="<?php echo self::OPT_KEY; ?>" value="<?php echo esc_attr($key); ?>" style="width:420px" />
                  <p class="description">אותו ערך שמוגדר ב-env של TOPALENA כ-<code>CLUB_API_KEY</code></p>
                </td>
              </tr>
              <tr>
                <th>₪ לכל נקודה (פדיון)</th>
                <td>
                  <input type="number" step="0.5" min="0" name="<?php echo self::OPT_COIN_VAL; ?>" value="<?php echo esc_attr($coin_v); ?>" /> ש״ח
                  <p class="description">כמה כל נקודה שווה בקופה. ברירת מחדל: 4</p>
                </td>
              </tr>
              <tr>
                <th>₪ לכל נקודה (צבירה)</th>
                <td>
                  <input type="number" step="1" min="1" name="<?php echo self::OPT_EARN_PER; ?>" value="<?php echo esc_attr($earn_p); ?>" /> ש״ח להזמנה = נקודה אחת
                  <p class="description">ברירת מחדל: 100 ש״ח להזמנה = נקודה אחת</p>
                </td>
              </tr>
              <tr>
                <th>תמריץ הצטרפות (בכפתור ההתחברות)</th>
                <td>
                  <input type="text" name="<?php echo self::OPT_JOIN; ?>" value="<?php echo esc_attr(get_option(self::OPT_JOIN, '')); ?>" style="width:420px" placeholder="<?php echo esc_attr(self::join_incentive()); ?>" />
                  <p class="description">מה שכתוב פה מופיע כהטבת-הצטרפות על כפתור ההתחברות בדף הכניסה. השאירו ריק כדי להשתמש בברירת המחדל (ערך הנקודות). <strong>מה שתבטיחו כאן — כדאי לכבד בפועל</strong> (למשל: "קינוח מתנה בהזמנה הראשונה").</p>
                </td>
              </tr>
            </table>
            <?php submit_button('שמור הגדרות'); ?>
          </form>

          <?php if ($ping): ?>
            <h2>סטטוס חיבור</h2>
            <?php if (!empty($ping['ok'])): ?>
              <p style="color:#0a7c45;font-weight:700">✓ חיבור תקין — TOPALENA הגיב</p>
            <?php else: ?>
              <p style="color:#c83a3a;font-weight:700">✗ חיבור נכשל (HTTP <?php echo (int)($ping['code'] ?? 0); ?>): <?php echo esc_html($ping['error'] ?? ''); ?></p>
              <p>בדוק: (1) הכתובת נכונה (2) מפתח API תואם בדיוק לערך ב-env של השרת.</p>
            <?php endif; ?>
          <?php endif; ?>
        </div>
        <?php
    }
}
