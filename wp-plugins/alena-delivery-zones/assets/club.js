(function ($) {
  'use strict';

  // Live preview as the customer types a redeem amount
  $(document).on('input', '.alena-club-redeem-input', function () {
    const v = parseInt($(this).val(), 10) || 0;
    const coinV = parseFloat($(this).data('coin-value')) || 4;
    $(this).siblings('.alena-club-redeem-preview').text('= ₪' + (v * coinV));
  });

  // Apply redemption
  $(document).on('click', '.alena-club-redeem-apply', function () {
    const $btn   = $(this);
    const $input = $btn.closest('.alena-club-redeem-form').find('.alena-club-redeem-input');
    const coins  = parseInt($input.val(), 10) || 0;
    const nonce  = $btn.data('nonce');
    if (coins < 1) return;
    const orig = $btn.text();
    $btn.prop('disabled', true).text('…');
    $.post(window.ajaxurl || '/wp-admin/admin-ajax.php', {
      action: 'alena_club_apply_redeem',
      coins:  coins,
      nonce:  nonce,
    }).done(function (r) {
      if (r && r.success) {
        window.location.reload();
      } else {
        $btn.text(orig).prop('disabled', false);
        alert('שגיאה: ' + ((r && r.data) || 'unknown'));
      }
    }).fail(function () {
      $btn.text(orig).prop('disabled', false);
      alert('שגיאת רשת');
    });
  });

  // Clear redemption
  $(document).on('click', '.alena-club-redeem-clear', function () {
    const $btn  = $(this);
    const nonce = $btn.data('nonce');
    $btn.prop('disabled', true);
    $.post(window.ajaxurl || '/wp-admin/admin-ajax.php', {
      action: 'alena_club_clear_redeem',
      nonce:  nonce,
    }).done(function () { window.location.reload(); })
      .fail(function () { $btn.prop('disabled', false); alert('שגיאת רשת'); });
  });

  $(document).on('click', '.alena-club-join-btn', function () {
    const $btn = $(this);
    if ($btn.prop('disabled')) return;
    const phone = $btn.data('phone');
    const nonce = $btn.data('nonce');
    if (!phone) return;
    const orig = $btn.text();
    $btn.prop('disabled', true).text('מצטרף…');
    $.post(window.ajaxurl || '/wp-admin/admin-ajax.php', {
      action: 'alena_club_register',
      phone:  phone,
      nonce:  nonce
    })
    .done(function (r) {
      if (r && r.success) {
        $btn.text('✓ הצטרפת!');
        setTimeout(function () { window.location.reload(); }, 700);
      } else {
        $btn.text(orig).prop('disabled', false);
        alert('שגיאה: ' + ((r && r.data) || 'unknown'));
      }
    })
    .fail(function () {
      $btn.text(orig).prop('disabled', false);
      alert('שגיאת רשת');
    });
  });
})(jQuery);
