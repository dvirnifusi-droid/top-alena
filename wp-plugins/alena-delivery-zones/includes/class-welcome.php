<?php
if (!defined('ABSPATH')) exit;

/**
 * Welcome / onboarding overlay shown to first-time visitors.
 *
 * Two steps:
 *   1. Pick fulfillment (delivery vs pickup) + address (if delivery)
 *   2. Club options: login / register / continue as guest
 *
 * Persists the choice in WC session so checkout pre-fills it, and in a
 * sessionStorage flag so it doesn't re-appear on every page navigation.
 */
class Alena_DZ_Welcome {

    const SESS_KEY_MODE     = 'alena_fulfillment_mode';
    const SESS_KEY_ADDRESS  = 'alena_initial_address';

    public function __construct() {
        add_action('wp_enqueue_scripts',               [$this, 'enqueue']);
        add_action('wp_ajax_alena_welcome_save',       [$this, 'ajax_save']);
        add_action('wp_ajax_nopriv_alena_welcome_save',[$this, 'ajax_save']);
        add_action('wp_ajax_alena_set_mode',           [$this, 'ajax_set_mode']);
        add_action('wp_ajax_nopriv_alena_set_mode',    [$this, 'ajax_set_mode']);
    }

    /**
     * Whether to show the welcome screen instead of the regular /shop content.
     * Returns true if the customer hasn't picked a fulfillment mode yet, OR if
     * they explicitly want to see the gate again (?welcome=1).
     */
    public static function should_show(): bool {
        if (function_exists('is_admin') && is_admin()) return false;

        // The gate is OPT-IN only (?welcome=1). Blocking the menu behind a
        // mode/address/login wall killed the funnel — customers could not see a
        // single dish before committing. Fulfillment + address are collected at
        // checkout, where they actually matter.
        if (!empty($_GET['welcome'])) {
            if (function_exists('WC') && WC()->session) {
                WC()->session->set(self::SESS_KEY_MODE, '');
            }
            return true;
        }

        // Default everyone to delivery so downstream shipping/zone code still
        // has a mode to work with without ever showing the gate.
        if (function_exists('WC') && WC()->session && !WC()->session->get(self::SESS_KEY_MODE)) {
            WC()->session->set(self::SESS_KEY_MODE, 'delivery');
        }
        return false;
    }

    public function enqueue() {
        if (is_admin()) return;
        wp_enqueue_style('alena-welcome',  ALENA_DZ_URL . 'assets/welcome.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-welcome', ALENA_DZ_URL . 'assets/welcome.js',  ['jquery'], ALENA_DZ_VERSION, true);
        // Public club registration page on TOPALENA — opens in new tab from
        // "הרשמה למועדון לקוחות" so the canonical UX lives in one place.
        $club_base = class_exists('Alena_DZ_Club') ? Alena_DZ_Club::api_base() : 'https://topalena.com';
        wp_localize_script('alena-welcome', 'AlenaWelcome', [
            'ajaxUrl'    => admin_url('admin-ajax.php'),
            'nonce'      => wp_create_nonce('alena_welcome'),
            'shopUrl'    => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/',
            'accountUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/',
            'clubUrl'    => rtrim($club_base, '/') . '/Club',
            'isLoggedIn' => is_user_logged_in(),
        ]);
    }

    public function render() {
        $site_icon = get_site_icon_url(160);
        // Hero image URL — try a hero attachment by name or fall back to a known wp upload path
        $hero_url  = $this->hero_image_url();
        ?>
        <section class="alena-welcome-page" id="alena-welcome" dir="rtl">
          <div class="alena-welcome-photo" <?php if ($hero_url): ?>style="background-image:url('<?php echo esc_url($hero_url); ?>')"<?php endif; ?>></div>
          <div class="alena-welcome-pane">
          <div class="alena-welcome-card">

            <div class="alena-welcome-logo">
              <?php if ($site_icon): ?>
                <img src="<?php echo esc_url($site_icon); ?>" alt="עלינא בפיתה" />
              <?php else: ?>
                <div class="alena-welcome-mark">עלינא</div>
              <?php endif; ?>
              <div class="alena-welcome-tagline">מטבח ים-תיכוני שמח וצבעוני</div>
            </div>

            <!-- Step 1: fulfillment + address -->
            <div class="alena-welcome-step" data-step="1">
              <h2 class="alena-welcome-title">ברוכים הבאים!</h2>
              <p class="alena-welcome-sub">איך תעדיפו לקבל את ההזמנה?</p>

              <div class="alena-welcome-modes">
                <button type="button" class="alena-welcome-mode" data-mode="pickup">
                  <span class="alena-welcome-mode-icon" aria-hidden="true">🥡</span>
                  <span class="alena-welcome-mode-label">איסוף עצמי</span>
                  <span class="alena-welcome-mode-sub">~15-25 דק'</span>
                </button>
                <button type="button" class="alena-welcome-mode is-active" data-mode="delivery">
                  <span class="alena-welcome-mode-icon" aria-hidden="true">🛵</span>
                  <span class="alena-welcome-mode-label">משלוח</span>
                  <span class="alena-welcome-mode-sub">~40-60 דק'</span>
                </button>
              </div>

              <div class="alena-welcome-address" id="alena-welcome-address">
                <label for="alena-welcome-address-input">כתובת מלאה למשלוח</label>
                <input type="text"
                       id="alena-welcome-address-input"
                       placeholder="לדוגמה: הרצל 123, ראשון לציון"
                       autocomplete="street-address" />
                <p class="alena-welcome-address-hint">משלוחים לראשון לציון, משמר השבעה ובית דגן</p>
              </div>

              <button type="button" class="alena-welcome-next" id="alena-welcome-next">המשך</button>
            </div>

            <!-- Step 2: club — different UI for logged-in vs guest -->
            <div class="alena-welcome-step" data-step="2" hidden>
              <?php $this->render_step2_body(); ?>
            </div>

          </div>
          </div>
        </section>
        <?php
    }

    /**
     * Step 2 body — always shows the same 3 options (login / register / continue as guest).
     * For logged-in customers the JS routes "login" straight to /shop, not the OTP page.
     */
    private function render_step2_body(): void {
        $this->render_step2_guest();
    }

    /** Kept for reference; not currently rendered. */
    private function render_step2_logged_in(): void {
        $user  = wp_get_current_user();
        $phone = (string) get_user_meta($user->ID, 'billing_phone', true);
        $first = (string) get_user_meta($user->ID, 'billing_first_name', true);
        $name  = $first ?: ($user->display_name ?: 'לקוח');

        $balance  = 0;
        $tier     = 'regular';
        $visits   = 0;
        $benefits = [];
        $coin_v   = Alena_DZ_Club::coin_value_ils();

        try {
            $club = new Alena_DZ_Club();
            if ($phone) {
                $info = $club->lookup_phone($phone);
                if ($info && !empty($info['found'])) {
                    $balance = (int) ($info['coin_balance'] ?? 0);
                    $tier    = (string) ($info['loyalty_tier'] ?? 'regular');
                    $visits  = (int) ($info['visit_count'] ?? 0);
                }
                $benefits = $club->get_benefits($phone);
            }
        } catch (\Throwable $e) { /* swallow */ }

        $tier_labels = [
            'regular' => ['name' => 'מועדון רגיל', 'emoji' => '🥙'],
            'silver'  => ['name' => 'כסף',         'emoji' => '🥈'],
            'gold'    => ['name' => 'זהב',         'emoji' => '👑'],
        ];
        $t = $tier_labels[$tier] ?? $tier_labels['regular'];
        ?>
        <h2 class="alena-welcome-title">שלום <?php echo esc_html($name); ?>! 👋</h2>
        <p class="alena-welcome-sub">שמחים לראות אותך שוב במועדון עלינא</p>

        <div class="alena-welcome-benefits">
          <div class="alena-welcome-benefits-row">
            <div class="alena-welcome-stat">
              <div class="alena-welcome-stat-num"><?php echo (int) $balance; ?></div>
              <div class="alena-welcome-stat-label">נקודות צבירה</div>
            </div>
            <div class="alena-welcome-stat alena-welcome-stat-accent">
              <div class="alena-welcome-stat-num">₪<?php echo number_format($balance * $coin_v, 0); ?></div>
              <div class="alena-welcome-stat-label">להנחה בהזמנה</div>
            </div>
            <div class="alena-welcome-stat">
              <div class="alena-welcome-stat-num"><?php echo $t['emoji']; ?></div>
              <div class="alena-welcome-stat-label"><?php echo esc_html($t['name']); ?></div>
            </div>
          </div>
          <?php if (!empty($benefits)): ?>
            <ul class="alena-welcome-benefits-list">
              <?php foreach (array_slice($benefits, 0, 3) as $b): ?>
                <li>🎁 <?php echo esc_html($b['description'] ?? ''); ?></li>
              <?php endforeach; ?>
            </ul>
          <?php else: ?>
            <p class="alena-welcome-benefits-empty">כל ₪100 בהזמנה = נקודה אחת · כל נקודה שווה ₪<?php echo (int) $coin_v; ?> הנחה</p>
          <?php endif; ?>
        </div>

        <button type="button" class="alena-welcome-next" data-action="continue-to-shop">
          המשך לתפריט →
        </button>
        <button type="button" class="alena-welcome-option alena-welcome-option-ghost" data-action="logout">
          <span class="alena-welcome-option-icon" aria-hidden="true">🚪</span>
          <span class="alena-welcome-option-label">התנתק והתחבר עם מספר אחר</span>
        </button>
        <?php
    }

    private function render_step2_guest(): void {
        ?>
        <h2 class="alena-welcome-title">התחברות למערכת</h2>
        <p class="alena-welcome-sub">חברי מועדון צוברים ופודים בכל הזמנה — בחר איך להתחיל</p>

        <button type="button" class="alena-welcome-option" data-action="login">
          <span class="alena-welcome-option-icon" aria-hidden="true">📱</span>
          <span class="alena-welcome-option-label">התחברות כחבר מועדון</span>
        </button>
        <button type="button" class="alena-welcome-option" data-action="register">
          <span class="alena-welcome-option-icon" aria-hidden="true">📝</span>
          <span class="alena-welcome-option-label">הרשמה למועדון הלקוחות</span>
        </button>
        <button type="button" class="alena-welcome-option alena-welcome-option-ghost" data-action="skip">
          <span class="alena-welcome-option-icon" aria-hidden="true">→</span>
          <span class="alena-welcome-option-label">המשך ללא התחברות</span>
        </button>
        <?php
    }

    /**
     * Best-effort lookup for a hero food image to use as the left-half photo.
     * Prefers an image titled "alena-welcome-hero" in the media library, then
     * the site logo, then nothing (CSS gradient fallback).
     */
    private function hero_image_url(): string {
        // Look for an explicit hero image
        $hero = get_posts([
            'post_type'   => 'attachment',
            'post_status' => 'inherit',
            'title'       => 'alena-welcome-hero',
            'numberposts' => 1,
        ]);
        if (!empty($hero)) {
            $url = wp_get_attachment_image_url($hero[0]->ID, 'full');
            if ($url) return $url;
        }
        // Otherwise look for a product image from the "פיתות עלינא" / "בצלחת" category
        $products = get_posts([
            'post_type'   => 'product',
            'numberposts' => 1,
            'meta_query'  => [['key' => '_thumbnail_id', 'compare' => 'EXISTS']],
            'tax_query'   => [[
                'taxonomy' => 'product_cat',
                'field'    => 'slug',
                'terms'    => ['pitot-alena', 'pitot', 'platot', 'plates'],
            ]],
        ]);
        if (!empty($products)) {
            $url = get_the_post_thumbnail_url($products[0]->ID, 'full');
            if ($url) return $url;
        }
        return '';
    }

    /**
     * Switch fulfilment mode on its own, from the header selector.
     *
     * Deliberately separate from ajax_save(): that one always writes the
     * address too, so reusing it for a mode toggle would blank the delivery
     * address the customer already entered the moment they looked at pickup
     * prices.
     */
    public function ajax_set_mode() {
        check_ajax_referer('alena_welcome', 'nonce');
        $mode = isset($_POST['mode']) ? sanitize_text_field((string) $_POST['mode']) : '';
        if (!in_array($mode, ['delivery', 'pickup'], true)) {
            wp_send_json_error('bad_mode', 400);
        }
        if (function_exists('WC') && WC()->session) {
            // A guest with an empty cart has no session cookie yet, and without
            // one WooCommerce keeps the values in memory for this request only
            // and throws them away. The switch then "did nothing": the write
            // succeeded, the reload read back the old mode. Logged-in admins
            // already have a session, which is why it worked while testing.
            if (!WC()->session->has_session()) {
                WC()->session->set_customer_session_cookie(true);
            }
            WC()->session->set(self::SESS_KEY_MODE, $mode);
            WC()->session->set(
                'chosen_shipping_methods',
                ($mode === 'pickup') ? ['local_pickup'] : ['alena_polygon']
            );
        }
        wp_send_json_success(['mode' => $mode]);
    }

    public function ajax_save() {
        check_ajax_referer('alena_welcome', 'nonce');
        $mode    = isset($_POST['mode']) ? sanitize_text_field((string) $_POST['mode']) : '';
        $address = isset($_POST['address']) ? sanitize_text_field((string) $_POST['address']) : '';
        if (!in_array($mode, ['delivery', 'pickup'], true)) {
            wp_send_json_error('bad_mode', 400);
        }
        if (function_exists('WC') && WC()->session) {
            WC()->session->set(self::SESS_KEY_MODE,    $mode);
            WC()->session->set(self::SESS_KEY_ADDRESS, $address);
            // Also feed into the existing fulfillment system if present
            $methods = ($mode === 'pickup') ? ['local_pickup'] : ['alena_polygon'];
            WC()->session->set('chosen_shipping_methods', $methods);
        }
        wp_send_json_success(['mode' => $mode]);
    }
}
