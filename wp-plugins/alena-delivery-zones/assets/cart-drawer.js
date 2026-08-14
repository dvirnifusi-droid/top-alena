(function ($) {
  'use strict';

  const $drawer   = $('#alena-drawer');
  const $backdrop = $('#alena-drawer-backdrop');
  const $body     = $('#alena-drawer-body');
  if (!$drawer.length) return;

  function open() {
    $drawer.removeAttr('hidden');
    $backdrop.removeAttr('hidden');
    setTimeout(() => { $drawer.addClass('open'); $backdrop.addClass('open'); }, 10);
    $('body').addClass('alena-drawer-open');
    refresh();
  }
  function close() {
    $drawer.removeClass('open');
    $backdrop.removeClass('open');
    setTimeout(() => { $drawer.attr('hidden', true); $backdrop.attr('hidden', true); }, 280);
    $('body').removeClass('alena-drawer-open');
  }
  function drawerError(msg) {
    $body.html(
      '<div class="alena-drawer-empty">' +
        '<p>' + (msg || 'לא הצלחנו לטעון את הסל') + '</p>' +
        '<button type="button" class="alena-drawer-retry">נסה שוב</button> ' +
        '<a class="alena-drawer-cta-secondary" href="/cart/">פתח את הסל המלא →</a>' +
      '</div>'
    );
  }

  function refresh() {
    $body.html('<div class="alena-drawer-skeleton">טוען…</div>');
    $.post(AlenaCartDrawer.ajaxUrl, {
      action: 'alena_cart_drawer',
      nonce:  AlenaCartDrawer.nonce
    }).done(function (r) {
      // A success:false response used to fall through silently, leaving the
      // skeleton up forever — the drawer looked like it was loading for good.
      if (r && r.success && r.data && typeof r.data.html === 'string') {
        $body.html(r.data.html);
        return;
      }
      const m = (r && r.data && (r.data.message || r.data)) || '';
      drawerError(typeof m === 'string' && m ? m : 'לא הצלחנו לטעון את הסל');
    }).fail(function (xhr) {
      drawerError('שגיאת טעינה (' + (xhr && xhr.status ? xhr.status : '?') + ')');
    });
  }

  $body.on('click', '.alena-drawer-retry', refresh);

  // Open triggers — every control that means "show me my cart".
  // #alena-dz-mini-cart is the floating bar rendered by Alena_DZ_Cart_Enhancements;
  // it was missing here, so the main cart button just navigated to /cart/ and the
  // drawer looked permanently stuck on its initial "טוען…" placeholder.
  const OPEN_SELECTOR = [
    '#alena-shop-cart-bar',
    '#alena-dz-mini-cart',
    '.alena-dz-mini-cart',
    'a.alena-tn-cart-pill',
    'a.alena-tn-link[href*="/cart"]',
  ].join(', ');

  $(document).on('click', OPEN_SELECTOR, function (e) {
    // Allow Ctrl/Cmd-click and middle-click to open full /cart page in new tab
    if (e.ctrlKey || e.metaKey || e.which === 2) return;
    e.preventDefault();
    open();
  });

  // Close triggers
  $(document).on('click', '#alena-drawer-close, #alena-drawer-backdrop', close);
  $(document).on('keydown', function (e) {
    if (e.key === 'Escape' && $drawer.hasClass('open')) close();
  });

  // Writes a line quantity through the plugin's own admin-ajax action.
  // 0 removes the line. Optimistic UI, reverted if the server disagrees.
  function setQty($item, next, $btn) {
    const key = $item.data('key');
    if (!key) return;
    if ($btn) $btn.prop('disabled', true);
    $item.addClass('is-busy');

    $.post(AlenaCartDrawer.ajaxUrl, {
      action:        'alena_cart_set_qty',
      nonce:         AlenaCartDrawer.nonce,
      cart_item_key: key,
      quantity:      next,
    })
      .done(function (r) {
        if (!r || !r.success) { window.location.reload(); return; }
        refresh();
        $(document.body).trigger('updated_cart_totals');
      })
      .fail(function () { window.location.reload(); })
      .always(function () {
        if ($btn) $btn.prop('disabled', false);
        $item.removeClass('is-busy');
      });
  }

  // Stepper inside drawer (delegated). Minus at qty 1 removes the line.
  $body.on('click', '.alena-drawer-step-plus, .alena-drawer-step-minus', function () {
    const $btn    = $(this);
    const $item   = $btn.closest('.alena-drawer-item');
    const $qtyEl  = $item.find('.alena-drawer-step-qty');
    const isPlus  = $btn.hasClass('alena-drawer-step-plus');
    const current = parseInt($qtyEl.text(), 10) || 0;
    const next    = isPlus ? current + 1 : Math.max(0, current - 1);
    $qtyEl.text(next);
    setQty($item, next, $btn);
  });

  // Explicit remove — one tap regardless of quantity.
  $body.on('click', '.alena-drawer-item-remove', function () {
    const $btn  = $(this);
    const $item = $btn.closest('.alena-drawer-item');
    $item.css('opacity', 0.45);
    setQty($item, 0, $btn);
  });

  // Cross-sell — single tap add (only works for products without required mods).
  $body.on('click', '.alena-drawer-cross-card', function () {
    const $card = $(this);
    const pid = parseInt($card.data('product-id'), 10);
    if (!pid) return;
    $card.css('opacity', 0.5);
    const fd = new FormData();
    fd.append('product_id', pid);
    fd.append('quantity', '1');
    $.ajax({
      url: '/?wc-ajax=add_to_cart', type: 'POST', data: fd,
      processData: false, contentType: false, dataType: 'json'
    }).always(function () {
      refresh();
      $(document.body).trigger('added_to_cart');
    });
  });

  // Note chips
  $body.on('click', '.alena-drawer-chip', function () {
    const $chip = $(this);
    const text  = $chip.data('text');
    const $ta   = $('#alena-drawer-note-input');
    const cur   = ($ta.val() || '').trim();
    if (cur.indexOf(text) === -1) {
      $ta.val(cur ? cur + ' · ' + text : text);
      $chip.addClass('is-active');
    } else {
      $ta.val(cur.replace(new RegExp('\\s*·?\\s*' + text, 'g'), '').replace(/^·\s*/, '').trim());
      $chip.removeClass('is-active');
    }
    $ta.trigger('input');
  });

  // Persist note text to WC session via AJAX (debounced)
  let noteTimer = null;
  $body.on('input', '#alena-drawer-note-input', function () {
    clearTimeout(noteTimer);
    const val = $(this).val();
    noteTimer = setTimeout(() => {
      $.post(AlenaCartDrawer.ajaxUrl, { action: 'alena_cart_drawer_note', nonce: AlenaCartDrawer.nonce, note: val });
    }, 600);
  });
})(jQuery);
