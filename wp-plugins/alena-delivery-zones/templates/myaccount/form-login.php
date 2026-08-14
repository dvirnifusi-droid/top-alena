<?php
/**
 * Phone+OTP login / registration template — overrides WC's default form-login.php
 *
 * Two modes (via ?mode= URL param):
 *   - login    (default): phone → code → done
 *   - register: full profile form → code → done (also POSTs to /api/club/register)
 *
 * The register form mirrors topalena.com/Club so the same customer record gets
 * captured regardless of where the customer signs up.
 */
if (!defined('ABSPATH')) exit;

$mode_param = isset($_GET['mode']) ? sanitize_text_field((string) $_GET['mode']) : 'login';
$is_register = ($mode_param === 'register');

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
    <div class="alena-otp-emoji" aria-hidden="true">📱</div>

    <div class="alena-otp-tabs" role="tablist">
      <a href="<?php echo esc_url(wc_get_page_permalink('myaccount')); ?>"
         class="alena-otp-tab <?php echo !$is_register ? 'is-active' : ''; ?>">התחברות</a>
      <a href="<?php echo esc_url(add_query_arg('mode', 'register', wc_get_page_permalink('myaccount'))); ?>"
         class="alena-otp-tab <?php echo $is_register ? 'is-active' : ''; ?>">הרשמה למועדון</a>
    </div>

    <h2 class="alena-otp-title">
      <?php echo $is_register ? '🌿 מועדון הלקוחות של עלינא' : 'התחברות מהירה'; ?>
    </h2>
    <p class="alena-otp-sub">
      <?php echo $is_register
        ? 'הצטרפו חינם — הטבות, מתנה ביום ההולדת, ועדכונים על מנות חדשות לפני כולם'
        : 'תכניסו טלפון, נשלח לכם קוד בוואטסאפ'; ?>
    </p>

    <!-- Step 1 -->
    <form class="alena-otp-form" id="alena-otp-step-phone" autocomplete="off" novalidate>
      <?php if ($is_register): ?>

      <label class="alena-otp-label">שם מלא *
        <input type="text" id="alena-otp-name" name="name"
               placeholder="ישראל ישראלי" autocomplete="name" required />
      </label>

      <label class="alena-otp-label">טלפון נייד *
        <input type="tel" inputmode="tel" id="alena-otp-phone" name="phone"
               placeholder="050-0000000" autocomplete="tel" required dir="ltr" />
      </label>

      <label class="alena-otp-label">עיר מגורים *
        <select id="alena-otp-city" name="city" required>
          <option value="">— בחרו עיר —</option>
          <?php foreach ($cities as $c): ?>
            <option value="<?php echo esc_attr($c); ?>"><?php echo esc_html($c); ?></option>
          <?php endforeach; ?>
        </select>
      </label>

      <div class="alena-otp-row">
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

      <label class="alena-otp-label">אימייל (אופציונלי)
        <input type="email" id="alena-otp-email" name="email"
               placeholder="you@email.com" autocomplete="email" />
      </label>

      <label class="alena-otp-consent">
        <input type="checkbox" id="alena-otp-consent" checked />
        <span>אני מאשר/ת קבלת הודעות והטבות מעלינא ב-WhatsApp/SMS/אימייל. ניתן להסיר בכל רגע — משיבים "הסר" לכל הודעה.</span>
      </label>

      <?php else: ?>

      <label class="alena-otp-label">מספר טלפון
        <input type="tel" inputmode="tel" id="alena-otp-phone" name="phone"
               placeholder="050-1234567" autocomplete="tel" required dir="ltr" />
      </label>

      <?php endif; ?>

      <button type="submit" class="alena-otp-cta">
        <?php echo $is_register ? '🌿 הצטרפו למועדון' : 'שלחו לי קוד ←'; ?>
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
      <button type="submit" class="alena-otp-cta"><?php echo $is_register ? '✓ הצטרף' : '✓ התחבר'; ?></button>
      <p class="alena-otp-meta">
        לא קיבלתם? <a href="#" id="alena-otp-resend">שלחו שוב</a>
        <span id="alena-otp-cooldown" hidden> · בעוד <span id="alena-otp-cooldown-sec">60</span> שניות</span>
      </p>
      <p class="alena-otp-error" id="alena-otp-code-error" hidden></p>
    </form>

    <p class="alena-otp-legal">
      <?php if ($is_register): ?>
        עלינא · רוטשילד 104, ראשון לציון · 03-6228055
      <?php else: ?>
        בהמשך אתם מסכימים ל<a href="<?php echo esc_url(get_privacy_policy_url() ?: '#'); ?>">תקנון ומדיניות הפרטיות</a>
      <?php endif; ?>
    </p>
  </div>
</div>

<?php do_action('woocommerce_after_customer_login_form'); ?>
