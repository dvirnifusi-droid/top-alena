(function ($) {
  'use strict';
  if (!window.AlenaOrderAlerts) return;

  let lastSeen = AlenaOrderAlerts.lastSeen || 0;
  let pollTimer = null;
  const originalTitle = document.title;

  function playDing() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const beep = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.value = 0.001;
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur + 0.05);
      };
      beep(880, 0,   0.18);
      beep(1175, 0.22, 0.18);
      beep(1480, 0.44, 0.30);
    } catch (e) {}
  }

  function showToast(order) {
    const html =
      '<div class="alena-alert-toast">' +
        '<div class="alena-alert-toast-emoji">🛵</div>' +
        '<div class="alena-alert-toast-body">' +
          '<strong>הזמנה חדשה #' + order.id + '</strong>' +
          '<span>' + (order.name || 'לקוח') + ' · ₪' + Number(order.total).toFixed(2) + ' · ' + order.items + ' פריטים</span>' +
        '</div>' +
        '<a class="alena-alert-toast-cta" href="' + AlenaOrderAlerts.ordersUrl + '">פתח →</a>' +
        '<button class="alena-alert-toast-close">×</button>' +
      '</div>';
    const $t = $(html).appendTo('body');
    setTimeout(() => $t.addClass('show'), 10);
    $t.find('.alena-alert-toast-close').on('click', () => $t.remove());
    setTimeout(() => { $t.removeClass('show'); setTimeout(() => $t.remove(), 400); }, 12000);
  }

  function injectToastStyles() {
    if (document.getElementById('alena-alert-styles')) return;
    const style = document.createElement('style');
    style.id = 'alena-alert-styles';
    style.textContent = `
      .alena-alert-toast {
        position: fixed; top: 60px; inset-inline-end: 20px;
        z-index: 100000;
        background: linear-gradient(135deg, #1e4a3a, #2e6850);
        color: #fff; padding: 14px 18px;
        border-radius: 14px; box-shadow: 0 12px 36px rgba(30,74,58,0.4);
        display: flex; align-items: center; gap: 12px;
        min-width: 320px; max-width: 420px;
        transform: translateX(120%); opacity: 0;
        transition: all .35s cubic-bezier(.34,1.2,.64,1);
        direction: rtl; font-family: inherit;
      }
      .alena-alert-toast.show { transform: none; opacity: 1; }
      .alena-alert-toast-emoji { font-size: 28px; line-height: 1; }
      .alena-alert-toast-body { flex: 1; display: flex; flex-direction: column; }
      .alena-alert-toast-body strong { font-size: 15px; font-weight: 800; }
      .alena-alert-toast-body span { font-size: 12px; opacity: 0.92; font-weight: 600; }
      .alena-alert-toast-cta {
        background: #f4a895; color: #1c1c1c !important;
        padding: 8px 14px; border-radius: 999px;
        font-weight: 800; font-size: 13px; text-decoration: none !important;
        white-space: nowrap;
      }
      .alena-alert-toast-close {
        background: rgba(255,255,255,0.18); color: #fff; border: none;
        width: 26px; height: 26px; border-radius: 999px; cursor: pointer;
        font-size: 16px; line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function setTitleBadge(count) {
    if (count > 0) document.title = `(${count}) 🛵 הזמנה חדשה — ` + originalTitle;
    else           document.title = originalTitle;
  }

  function poll() {
    $.post(AlenaOrderAlerts.ajaxUrl, {
      action: 'alena_alerts_poll',
      nonce:  AlenaOrderAlerts.nonce,
      since:  lastSeen
    }).done(function (r) {
      if (!r || !r.success) return;
      const orders = r.data.orders || [];
      lastSeen = r.data.now || lastSeen;
      if (orders.length) {
        injectToastStyles();
        playDing();
        orders.forEach(showToast);
        setTitleBadge(orders.length);
        // Reset badge after 30s if user doesn't engage
        setTimeout(() => setTitleBadge(0), 30000);
      }
    });
  }

  $(function () {
    injectToastStyles();
    poll(); // first poll on load
    pollTimer = setInterval(poll, 15000);
  });
})(jQuery);
