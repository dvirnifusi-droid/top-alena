<?php
/**
 * Phone+OTP login / registration template — overrides WC's default form-login.php
 *
 * One card, two modes. The tabs switch CLIENT-SIDE (no page reload) — both field
 * sets live in the DOM and phone-auth.js toggles them by flipping data-mode on
 * the wrapper. The old version linked ?mode=register and reloaded the whole page
 * on every tab tap, which felt slow.
 *
 * The register fields mirror topalena.com/Club so the same customer record is
 * captured wherever the customer signs up.
 */
if (!defined('ABSPATH')) exit;

$mode_param  = isset($_GET['mode']) ? sanitize_text_field((string) $_GET['mode']) : 'login';
$is_register = ($mode_param === 'register');

// Which mode a given block starts hidden in (JS flips these on tab switch).
$reg_hidden = $is_register ? '' : 'hidden';
$log_hidden = $is_register ? 'hidden' : '';

$incentive = class_exists('Alena_DZ_Club') ? Alena_DZ_Club::join_incentive() : '';

// City dropdown — delivery area first, then the rest of the country
$cities = [
    'ראשון לציון', 'משמר השבעה', 'בית דגן',
    'תל אביב', 'רמת גן', 'גבעתיים', 'חולון', 'בת ים', 'הרצליה', 'רעננה',
    'פתח תקווה', 'נס ציונה', 'רחובות', 'ירושלים', 'חיפה', 'אשדוד', 'אשקלון',
    'באר שבע', 'נתניה', 'כפר סבא', 'מודיעין', 'אחר',
];

do_action('woocommerce_before_customer_login_form');
?>

<div class="alena-otp-wrap" dir="rtl" data-mode="<?php echo esc_attr($is_register ? 'register' : 'login'); ?>">
  <div class="alena-otp-card">
    <div class="alena-otp-emoji" aria-hidden="true">🥙</div>

    <div class="alena-otp-tabs" role="tablist">
      <button type="button" class="alena-otp-tab <?php echo !$is_register ? 'is-active' : ''; ?>" data-mode="login">התחברות</button>
      <button type="button" class="alena-otp-tab <?php echo $is_register ? 'is-active' : ''; ?>" data-mode="register">הרשמה למועדון</button>
    </div>

    <h2 class="alena-otp-title alena-otp-only-login"  <?php echo $log_hidden; ?>>התחברות מהירה</h2>
    <h2 class="alena-otp-title alena-otp-only-register" <?php echo $reg_hidden; ?>>🌿 מועדון הלקוחות של עלינא</h2>

    <p class="alena-otp-sub alena-otp-only-login"  <?php echo $log_hidden; ?>>מכניסים טלפון, מקבלים קוד בוואטסאפ — וזהו</p>
    <p class="alena-otp-sub alena-otp-only-register" <?php echo $reg_hidden; ?>>הצטרפות חינם — הטבות, מתנה ביום ההולדת ועדכונים על מנות חדשות לפני כולם</p>

    <?php if ($incentive): ?>
      <div class="alena-otp-incentive alena-otp-only-register" <?php echo $reg_hidden; ?>>🎁 <?php echo esc_html($incentive); ?></div>
    <?php endif; ?>

    <!-- Step 1 -->
    <form class="alena-otp-form" id="alena-otp-step-phone" autocomplete="off" novalidate>

      <label class="alena-otp-label alena-otp-only-register" <?php echo $reg_hidden; ?>>שם מלא *
        <input type="text" id="alena-otp-name" name="name" placeholder="ישראל ישראלי" autocomplete="name" />
      </label>

      <label class="alena-otp-label">טלפון נייד
        <input type="tel" inputmode="tel" id="alena-otp-phone" name="phone"
               placeholder="050-0000000" autocomplete="tel" required dir="ltr" />
      </label>

      <label class="alena-otp-label alena-otp-only-register" <?php echo $reg_hidden; ?>>עיר מגורים *
        <select id="alena-otp-city" name="city">
          <option value="">— בחרו עיר —</option>
          <?php foreach ($cities as $c): ?>
            <option value="<?php echo esc_attr($c); ?>"><?php echo esc_html($c); ?></option>
          <?php endforeach; ?>
        </select>
      </label>

      <div class="alena-otp-row alena-otp-only-register" <?php echo $reg_hidden; ?>>
        <label class="alena-otp-label">
          <span>🎂 תאריך לידה</span>
          <input type="date" id="alena-otp-birthday" name="birthday" />
          <small>מתנה ביום ההולדת 🎁</small>
        </label>
        <label class="alena-otp-label">
          <span>💍 יום נישואין</span>
          <input type="date" id="alena-otp-anniversary" name="anniversary" />
          <small>אם יש — חוגגים יחד</small>
        </label>
      </div>

      <label class="alena-otp-label alena-otp-only-register" <?php echo $reg_hidden; ?>>אימייל (אופציונלי)
        <input type="email" id="alena-otp-email" name="email" placeholder="you@email.com" autocomplete="email" />
      </label>

      <label class="alena-otp-consent alena-otp-only-register" <?php echo $reg_hidden; ?>>
        <input type="checkbox" id="alena-otp-consent" checked />
        <span>אני מאשר/ת קבלת הודעות והטבות מעלינא ב-WhatsApp/SMS/אימייל. ניתן להסיר בכל רגע — משיבים "הסר" לכל הודעה.</span>
      </label>

      <button type="submit" class="alena-otp-cta">
        <span class="alena-otp-only-login"  <?php echo $log_hidden; ?>>שלחו לי קוד ←</span>
        <span class="alena-otp-only-register" <?php echo $reg_hidden; ?>>🌿 הצטרפו למועדון</span>
      </button>
      <p class="alena-otp-error" id="alena-otp-phone-error" hidden></p>
    </form>

    <!-- Step 2: code -->
    <form class="alena-otp-form" id="alena-otp-step-code" autocomplete="off" novalidate hidden>
      <p class="alena-otp-step-info">
        שלחנו קוד 6 ספרות ל-<strong id="alena-otp-shown-phone"></strong>
        · <a href="#" id="alena-otp-change-phone">שנה מספר</a>
      </p>
      <label class="alena-otp-label">קוד אימות
        <input type="text" inputmode="numeric" pattern="\d{6}" maxlength="6"
               id="alena-otp-code" name="code" placeholder="123456"
               autocomplete="one-time-code" required dir="ltr" />
      </label>
      <button type="submit" class="alena-otp-cta">
        <span class="alena-otp-only-login"  <?php echo $log_hidden; ?>>✓ התחבר</span>
        <span class="alena-otp-only-register" <?php echo $reg_hidden; ?>>✓ הצטרף</span>
      </button>
      <p class="alena-otp-meta">
        לא קיבלתם? <a href="#" id="alena-otp-resend">שלחו שוב</a>
        <span id="alena-otp-cooldown" hidden> · בעוד <span id="alena-otp-cooldown-sec">60</span> שניות</span>
      </p>
      <p class="alena-otp-error" id="alena-otp-code-error" hidden></p>
    </form>

    <p class="alena-otp-legal alena-otp-only-register" <?php echo $reg_hidden; ?>>עלינא · <?php echo esc_html(class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::address_full() : 'רוטשילד 104, ראשון לציון'); ?> · <?php echo esc_html(class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::phone() : '03-6228055'); ?></p>
    <p class="alena-otp-legal alena-otp-only-login" <?php echo $log_hidden; ?>>בהמשך אתם מסכימים ל<a href="<?php echo esc_url(get_privacy_policy_url() ?: '#'); ?>">תקנון ומדיניות הפרטיות</a></p>
  </div>
</div>

<?php do_action('woocommerce_after_customer_login_form'); ?>
