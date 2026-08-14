(function ($) {
  'use strict';

  const $welcome = $('#alena-welcome');
  if (!$welcome.length) return;

  $('body').addClass('alena-welcome-active');

  // Defensive fallback handlers on document — even if $welcome.on()
  // delegation breaks due to DOM swaps, these always fire.
  $(document).on('click', '.alena-welcome-option', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const $btn = $(this);
    const action = $btn.data('action') || $btn.attr('data-action');
    if (!action) return;
    try {
      const cfg = window.AlenaWelcome || {};
      if (action === 'skip') {
        window.location.href = cfg.shopUrl || '/shop/';
        return;
      }
      if (cfg.isLoggedIn) {
        window.location.href = cfg.shopUrl || '/shop/';
        return;
      }
      const next = encodeURIComponent(cfg.shopUrl || '/shop/');
      const base = cfg.accountUrl || '/my-account/';
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      const params = (action === 'register' ? 'mode=register&' : '') + 'next=' + next;
      window.location.href = base + sep + params;
    } catch (err) {
      // Last-resort fallback: just go to /shop
      window.location.href = '/shop/';
    }
  });

  let chosenMode = 'delivery';

  function setMode(m) {
    chosenMode = m;
    $('.alena-welcome-mode').removeClass('is-active').filter('[data-mode="' + m + '"]').addClass('is-active');
    const isDelivery = (m === 'delivery');
    $('#alena-welcome-address').attr('hidden', !isDelivery);
    if (isDelivery) {
      setTimeout(function () { $('#alena-welcome-address-input').trigger('focus'); }, 80);
    }
  }
  setMode(chosenMode);

  $welcome.on('click', '.alena-welcome-mode', function () {
    setMode($(this).data('mode'));
  });

  // Step 1 → Step 2
  $welcome.on('click', '#alena-welcome-next', function () {
    const $btn   = $(this);
    const address = ($('#alena-welcome-address-input').val() || '').trim();
    if (chosenMode === 'delivery' && address.length < 5) {
      $('#alena-welcome-address-input').trigger('focus').css('border-color', '#c83a3a');
      return;
    }
    const orig = $btn.text();
    $btn.prop('disabled', true).text('שומר…');
    $.post(AlenaWelcome.ajaxUrl, {
      action:  'alena_welcome_save',
      nonce:   AlenaWelcome.nonce,
      mode:    chosenMode,
      address: address
    }).always(function () {
      // Move to step 2 whether the save succeeded or not — fail-soft
      $btn.prop('disabled', false).text(orig);
      $welcome.find('[data-step="1"]').attr('hidden', true);
      $welcome.find('[data-step="2"]').removeAttr('hidden');
    });
  });

  // Step 2: 3 options — always the same UI, but logged-in users skip the OTP flow
  $welcome.on('click', '.alena-welcome-option', function () {
    const action = $(this).data('action');
    if (!action) return;

    if (action === 'register' || action === 'login') {
      // Already authenticated? skip the OTP page and go straight to the menu.
      if (AlenaWelcome.isLoggedIn) {
        window.location.href = AlenaWelcome.shopUrl;
        return;
      }
      // Everything stays on alenabepita.co.il — no domain hop.
      // Register goes to the form with name + phone + consent; login is phone-only.
      // Either way, after success bounce back to /shop so the customer can order.
      const next = encodeURIComponent(AlenaWelcome.shopUrl);
      let url = AlenaWelcome.accountUrl;
      const params = ['next=' + next];
      if (action === 'register') params.unshift('mode=register');
      url += (url.indexOf('?') >= 0 ? '&' : '?') + params.join('&');
      window.location.href = url;
      return;
    }
    // skip → straight to the menu as a guest
    window.location.href = AlenaWelcome.shopUrl;
  });

  $('#alena-welcome-address-input').on('input', function () {
    $(this).css('border-color', '');
  });
})(jQuery);
