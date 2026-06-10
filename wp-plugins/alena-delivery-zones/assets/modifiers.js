(function ($) {
  'use strict';

  // wp_localize_script serializes all values as strings — must parse.
  const base = (typeof AlenaDZModifiers !== 'undefined')
    ? (parseFloat(AlenaDZModifiers.basePrice) || 0)
    : 0;

  function recalc() {
    let extra = 0;
    $('.alena-dz-modifiers input:checked').each(function () {
      extra += parseFloat($(this).data('price') || 0);
    });
    const total = base + extra;
    $('#alena-dz-running-price').text('₪' + Math.round(total * 100) / 100);
  }

  function enforceMaxOnCheckboxes() {
    $('.alena-dz-mod-group[data-type="Multichoice"]').each(function () {
      const max = parseInt($(this).data('max'), 10) || 0;
      if (max <= 0) return;
      const $boxes = $(this).find('input[type="checkbox"]');
      const checked = $boxes.filter(':checked').length;
      $boxes.each(function () {
        if (!this.checked) this.disabled = (checked >= max);
      });
    });
  }

  function validateAndBlockAdd() {
    let firstError = null;
    $('.alena-dz-mod-group').each(function () {
      const min = parseInt($(this).data('min'), 10) || 0;
      if (min <= 0) return;
      const checked = $(this).find('input:checked').length;
      const title = $(this).find('.alena-dz-mod-title').text().replace('*', '').trim();
      if (checked < min) {
        if (!firstError) firstError = 'בחרו ב-"' + title + '" ' + (min === 1 ? 'אופציה אחת' : (min + ' אופציות'));
      }
    });
    if (firstError) {
      alert(firstError);
      return false;
    }
    return true;
  }

  $(function () {
    $('.alena-dz-modifiers').on('change', 'input', function () {
      enforceMaxOnCheckboxes();
      recalc();
    });
    recalc();
    enforceMaxOnCheckboxes();

    // Show the sticky bar once modifiers exist on the page
    if ($('.alena-dz-modifiers').length) {
      $('#alena-dz-sticky-bar').css('display', 'flex');
      // Wire the sticky CTA to the WC add-to-cart form
      $('#alena-dz-sticky-bar .alena-dz-sticky-cta').on('click', function (e) {
        e.preventDefault();
        const $form = $('form.cart');
        if (!validateAndBlockAdd()) return false;
        $form.trigger('submit');
      });
    }

    // Block add-to-cart if required modifiers missing
    $('form.cart').on('submit', function (e) {
      if (!validateAndBlockAdd()) {
        e.preventDefault();
        return false;
      }
    });
  });
})(jQuery);
