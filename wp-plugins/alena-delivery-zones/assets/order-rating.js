(function ($) {
  'use strict';

  let chosenStars = 0;

  // Hover preview
  $(document).on('mouseenter', '.alena-rate-star', function () {
    const n = parseInt($(this).data('stars'), 10);
    $('.alena-rate-star').each(function () {
      $(this).toggleClass('hover', parseInt($(this).data('stars'), 10) <= n);
    });
  });
  $(document).on('mouseleave', '.alena-rate-stars', function () {
    $('.alena-rate-star').removeClass('hover');
  });

  // Click selects
  $(document).on('click', '.alena-rate-star', function () {
    chosenStars = parseInt($(this).data('stars'), 10);
    $('.alena-rate-star').each(function () {
      $(this).toggleClass('selected', parseInt($(this).data('stars'), 10) <= chosenStars);
    });
  });

  // Submit
  $(document).on('click', '.alena-rate-submit', function () {
    const $btn = $(this);
    const $card = $btn.closest('.alena-rate-card');
    const orderId = $card.data('order-id');
    const comment = $card.find('.alena-rate-comment').val() || '';
    const nonce   = $btn.data('nonce');
    if (chosenStars < 1) {
      alert('בחר/י בין 1 ל-5 כוכבים');
      return;
    }
    const orig = $btn.text();
    $btn.prop('disabled', true).text('שולח…');
    $.post(window.ajaxurl || '/wp-admin/admin-ajax.php', {
      action:   'alena_rate_order',
      order_id: orderId,
      stars:    chosenStars,
      comment:  comment,
      nonce:    nonce
    }).done(function (r) {
      if (r && r.success) {
        $card.html('<div class="alena-rate-thanks">תודה על הדירוג! 🙏</div>');
        setTimeout(() => $card.fadeOut(400, () => $card.remove()), 2400);
      } else {
        $btn.prop('disabled', false).text(orig);
        alert('שגיאה: ' + ((r && r.data) || 'unknown'));
      }
    }).fail(function () {
      $btn.prop('disabled', false).text(orig);
      alert('שגיאת רשת');
    });
  });
})(jQuery);
