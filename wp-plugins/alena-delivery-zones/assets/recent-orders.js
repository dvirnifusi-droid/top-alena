(function ($) {
  'use strict';

  $(document).on('click', '.alena-recent-card-cta', function (e) {
    e.preventDefault();
    const $btn = $(this);
    if ($btn.data('busy')) return;
    $btn.data('busy', 1);

    const orderId = $btn.data('order-id');
    const nonce   = $btn.data('nonce');
    const origText = $btn.text();
    $btn.prop('disabled', true).text('מעלה לסל…');

    $.post(AlenaDZRecent.ajaxUrl, {
      action:   'alena_dz_reorder',
      order_id: orderId,
      nonce:    nonce
    })
    .done(function (r) {
      if (r && r.success) {
        $btn.text('✓ נטען! מעביר לסל…');
        window.location.href = (r.data && r.data.redirect) || AlenaDZRecent.cartUrl;
      } else {
        const msg = (r && r.data) || 'שגיאה';
        $btn.text(origText).prop('disabled', false).removeData('busy');
        alert('לא ניתן לשכפל את ההזמנה: ' + msg);
      }
    })
    .fail(function () {
      $btn.text(origText).prop('disabled', false).removeData('busy');
      alert('שגיאת רשת — נסה שוב');
    });
  });
})(jQuery);
