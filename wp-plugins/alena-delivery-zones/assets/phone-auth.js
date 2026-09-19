(function ($) {
  'use strict';

  const $phoneForm = $('#alena-otp-step-phone');
  const $codeForm  = $('#alena-otp-step-code');
  const $phoneIn   = $('#alena-otp-phone');
  const $codeIn    = $('#alena-otp-code');
  const $shown     = $('#alena-otp-shown-phone');
  const $resend    = $('#alena-otp-resend');
  const $change    = $('#alena-otp-change-phone');
  const $errPhone  = $('#alena-otp-phone-error');
  const $errCode   = $('#alena-otp-code-error');
  const $cool      = $('#alena-otp-cooldown');
  const $coolSec   = $('#alena-otp-cooldown-sec');

  if (!$phoneForm.length) return;

  let cooldownTimer = null;
  function startCooldown(sec) {
    let n = sec || 60;
    $cool.removeAttr('hidden');
    $coolSec.text(n);
    $resend.css('pointer-events', 'none').css('opacity', 0.5);
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(function () {
      n--;
      $coolSec.text(n);
      if (n <= 0) {
        clearInterval(cooldownTimer);
        $cool.attr('hidden', true);
        $resend.css('pointer-events', '').css('opacity', '');
      }
    }, 1000);
  }

  function showError($el, msg) { $el.text(msg).removeAttr('hidden'); }
  function hideError($el)      { $el.attr('hidden', true).text(''); }

  function showDevBanner(code, notice) {
    let $b = $('#alena-otp-dev-banner');
    if (!$b.length) {
      $b = $('<div id="alena-otp-dev-banner" class="alena-otp-dev"></div>');
      $codeForm.prepend($b);
    }
    $b.html(
      '<strong>🛠️ ' + (notice || 'מצב פיתוח') + '</strong>' +
      '<div class="alena-otp-dev-code">' + code + '</div>' +
      '<div class="alena-otp-dev-hint">הוקלד אוטומטית למטה — לחץ "התחבר ✓"</div>'
    );
  }

  function normalize(raw) { return (raw || '').replace(/\D/g, ''); }

  function sendCode(phone, channel) {
    return $.ajax({
      url: AlenaPhoneAuth.apiUrl + 'send',
      method: 'POST',
      headers: { 'X-WP-Nonce': AlenaPhoneAuth.nonce },
      data: { phone: phone, channel: channel || 'whatsapp' }
    });
  }

  // "Didn't get the code? send by SMS" — the reliable escape hatch. Appears a
  // few seconds after a WhatsApp send; resends the SAME live code by SMS.
  let smsFallbackTimer = null;
  function offerSmsFallback(phone) {
    if (smsFallbackTimer) clearTimeout(smsFallbackTimer);
    let $link = $('#alena-otp-sms-fallback');
    if ($link.length) $link.remove();
    smsFallbackTimer = setTimeout(function () {
      $link = $('<button type="button" id="alena-otp-sms-fallback" class="alena-otp-link">לא קיבלת קוד? שלח ב-SMS 📩</button>');
      $codeForm.find('.alena-otp-actions').first().append($link);
      if (!$codeForm.find('.alena-otp-actions').length) $codeForm.append($link);
      $link.on('click', function (e) {
        e.preventDefault();
        $link.prop('disabled', true).text('שולח SMS…');
        sendCode(phone, 'sms')
          .done(function () { $link.text('נשלח ב-SMS ✓'); })
          .fail(function () { $link.prop('disabled', false).text('לא קיבלת קוד? שלח ב-SMS 📩'); });
      });
    }, 15000);
  }

  function verifyCode(phone, code) {
    const data = { phone: phone, code: code };
    if (window.__alenaRegName) data.name = window.__alenaRegName;
    return $.ajax({
      url: AlenaPhoneAuth.apiUrl + 'verify',
      method: 'POST',
      headers: { 'X-WP-Nonce': AlenaPhoneAuth.nonce },
      data: data
    });
  }

  // Mode is read LIVE, not once — the tabs flip it client-side with no reload.
  const $wrap = $('.alena-otp-wrap');
  function isReg() { return $wrap.attr('data-mode') === 'register'; }

  $('.alena-otp-tab').on('click', function () {
    const mode = $(this).data('mode');
    if ($wrap.attr('data-mode') === mode) return;
    $wrap.attr('data-mode', mode);
    $('.alena-otp-tab').removeClass('is-active');
    $(this).addClass('is-active');
    // Show the fields that belong to this mode, hide the others.
    $('.alena-otp-only-register').prop('hidden', mode !== 'register');
    $('.alena-otp-only-login').prop('hidden', mode !== 'login');
    hideError($errPhone);
    // Back to step 1 if they had opened the code step.
    $codeForm.attr('hidden', true);
    $phoneForm.removeAttr('hidden');
    setTimeout(function () {
      (mode === 'register' ? $('#alena-otp-name') : $phoneIn).trigger('focus');
    }, 30);
  });

  $phoneForm.on('submit', function (e) {
    e.preventDefault();
    hideError($errPhone);
    const phone = normalize($phoneIn.val());
    if (!/^0\d{8,9}$/.test(phone)) {
      showError($errPhone, 'מספר לא תקין — לדוגמה 0501234567');
      return;
    }
    let name = '', city = '', birthday = '', anniversary = '', email = '';
    let consent = false;
    if (isReg()) {
      name = ($('#alena-otp-name').val() || '').trim();
      if (name.length < 2) {
        $('#alena-otp-name').trigger('focus').css('border-color', '#c83a3a');
        showError($errPhone, 'אנא הזינו שם מלא');
        return;
      }
      city = ($('#alena-otp-city').val() || '').trim();
      if (!city) {
        $('#alena-otp-city').trigger('focus').css('border-color', '#c83a3a');
        showError($errPhone, 'אנא בחרו עיר מגורים');
        return;
      }
      birthday    = ($('#alena-otp-birthday').val() || '').trim();
      anniversary = ($('#alena-otp-anniversary').val() || '').trim();
      email       = ($('#alena-otp-email').val() || '').trim();
      consent = $('#alena-otp-consent').is(':checked');
    }
    const $btn = $(this).find('.alena-otp-cta');
    const orig = $btn.html();   // html, not text — the button holds mode spans
    $btn.prop('disabled', true).text('שולח…');

    // For register: first hit /api/club/register via WP proxy, THEN send OTP
    // Must return a jQuery Deferred, not a native Promise — the caller uses
    // .always(), which native promises don't have (login path used to throw
    // TypeError here and leave the button stuck on "שולח…").
    const registerThenSend = function () {
      if (!isReg()) return $.Deferred().resolve().promise();
      return $.post(window.ajaxurl || '/wp-admin/admin-ajax.php', {
        action:      'alena_club_register',
        nonce:       AlenaPhoneAuth.registerNonce || '',
        phone:       phone,
        name:        name,
        city:        city,
        birthday:    birthday,
        anniversary: anniversary,
        email:       email,
        consent:     consent ? 1 : 0,
      });
    };

    registerThenSend().always(function () {
      sendCode(phone)
        .done(function (r) {
          $btn.prop('disabled', false).html(orig);
          if (!r || !r.ok) {
            showError($errPhone, (r && r.message) || 'שליחה נכשלה');
            return;
          }
          // Stash name for the verify step
          if (isReg()) window.__alenaRegName = name;
          $shown.text(phone);
          $phoneForm.attr('hidden', true);
          $codeForm.removeAttr('hidden');
          if (r.dev_code) {
            showDevBanner(r.dev_code, r.dev_notice);
            $codeIn.val(r.dev_code);
          }
          setTimeout(function () { $codeIn.trigger('focus'); }, 100);
          startCooldown(60);
          // Offer the SMS fallback only when the code went out on WhatsApp.
          if (r.via !== 'sms') offerSmsFallback(phone);
        })
        .fail(function (xhr) {
          $btn.prop('disabled', false).html(orig);
          const r = xhr.responseJSON || {};
          showError($errPhone, r.message || ('שליחה נכשלה (HTTP ' + xhr.status + ')'));
        });
    });
  });

  $codeForm.on('submit', function (e) {
    e.preventDefault();
    hideError($errCode);
    const code  = normalize($codeIn.val());
    const phone = normalize($phoneIn.val());
    if (code.length < 4) {
      showError($errCode, 'הכנס את הקוד שקיבלת');
      return;
    }
    const $btn = $(this).find('.alena-otp-cta');
    const orig = $btn.html();
    $btn.prop('disabled', true).text('מתחבר…');

    verifyCode(phone, code)
      .done(function (r) {
        if (r && r.ok) {
          $btn.text('✓ מתחבר…');
          // Honor a ?next=... param from the URL so the welcome flow lands
          // the customer back on /shop, ready to order — not on /my-account.
          let dest = r.redirect || AlenaPhoneAuth.accountUrl;
          try {
            const params = new URLSearchParams(window.location.search);
            const next = params.get('next');
            if (next && next.startsWith('/')) dest = next;
          } catch (e) {}
          window.location.href = dest;
        } else {
          $btn.prop('disabled', false).html(orig);
          showError($errCode, (r && r.message) || 'שגיאה');
        }
      })
      .fail(function (xhr) {
        $btn.prop('disabled', false).html(orig);
        const r = xhr.responseJSON || {};
        showError($errCode, r.message || ('קוד שגוי (HTTP ' + xhr.status + ')'));
      });
  });

  $resend.on('click', function (e) {
    e.preventDefault();
    if ($resend.css('pointer-events') === 'none') return;
    const phone = normalize($phoneIn.val());
    if (!phone) return;
    sendCode(phone).done(function () { startCooldown(60); });
  });

  $change.on('click', function (e) {
    e.preventDefault();
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (smsFallbackTimer) clearTimeout(smsFallbackTimer);
    $('#alena-otp-sms-fallback').remove();
    $codeForm.attr('hidden', true);
    $phoneForm.removeAttr('hidden');
    $phoneIn.trigger('focus');
    hideError($errPhone);
    hideError($errCode);
    $codeIn.val('');
  });

  // Auto-format Israeli phone as user types
  $phoneIn.on('input', function () {
    let v = normalize($(this).val());
    if (v.length > 10) v = v.slice(0, 10);
    $(this).val(v);
  });
  $codeIn.on('input', function () {
    let v = normalize($(this).val());
    if (v.length > 6) v = v.slice(0, 6);
    $(this).val(v);
    if (v.length === 6) $codeForm.trigger('submit');
  });
})(jQuery);
