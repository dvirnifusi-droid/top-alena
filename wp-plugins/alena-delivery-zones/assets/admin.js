(function ($) {
  'use strict';

  let map, drawingManager;
  // Each entry: { id, name, color, delivery_fee, min_order, coords?, googlePoly }
  let polygons = [];

  function init() {
    const mapEl = document.getElementById('alena-dz-map');
    if (!mapEl || typeof google === 'undefined' || !google.maps) {
      console.error('AlenaDZ: Google Maps not loaded');
      return;
    }

    map = new google.maps.Map(mapEl, {
      center: AlenaDZ.center,
      zoom: 13,
      streetViewControl: false,
      mapTypeControl: true,
    });

    drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: ['polygon'],
      },
      polygonOptions: {
        editable: true,
        draggable: false,
        fillOpacity: 0.35,
        strokeWeight: 2,
        fillColor: '#3388ff',
        strokeColor: '#3388ff',
      },
    });
    drawingManager.setMap(map);
    google.maps.event.addListener(drawingManager, 'polygoncomplete', onPolygonDrawn);

    loadExisting();
    $('#alena-dz-save-all').on('click', saveAll);
  }

  function onPolygonDrawn(poly) {
    const name = prompt('שם הפוליגון (לדוגמה: ראשון לציון – מרכז):', 'אזור חדש');
    if (!name) { poly.setMap(null); return; }
    const feeStr = prompt('דמי משלוח (₪):', '20');
    const fee = parseFloat(feeStr);
    if (isNaN(fee) || fee < 0) { poly.setMap(null); alert('מחיר לא תקין'); return; }
    const minStr = prompt('מינ׳ הזמנה (₪) — 0 לבטל:', '60');
    const min = parseFloat(minStr);
    if (isNaN(min) || min < 0) { poly.setMap(null); alert('מינימום לא תקין'); return; }

    polygons.push({
      id: 'p' + Date.now(),
      name: name,
      color: '#3388ff',
      delivery_fee: fee,
      min_order: min,
      googlePoly: poly,
    });
    poly.addListener('click', () => focusOnPolygon(poly));
    renderList();
    drawingManager.setDrawingMode(null);
  }

  function focusOnPolygon(poly) {
    const bounds = new google.maps.LatLngBounds();
    poly.getPath().forEach(c => bounds.extend(c));
    map.fitBounds(bounds);
  }

  function loadExisting() {
    setStatus('טוען פוליגונים קיימים…');
    $.post(AlenaDZ.ajaxUrl, { action: 'alena_dz_load', nonce: AlenaDZ.nonce }, function (res) {
      if (!res || !res.success) { setStatus('שגיאה בטעינה'); return; }
      (res.data || []).forEach(p => {
        const path = (p.coords || []).map(c => ({ lat: c[0], lng: c[1] }));
        const gp = new google.maps.Polygon({
          paths: path,
          map: map,
          editable: true,
          fillOpacity: 0.35,
          fillColor: p.color || '#3388ff',
          strokeColor: p.color || '#3388ff',
          strokeWeight: 2,
        });
        gp.addListener('click', () => focusOnPolygon(gp));
        polygons.push({
          id: p.id,
          name: p.name,
          color: p.color || '#3388ff',
          delivery_fee: parseFloat(p.delivery_fee) || 0,
          min_order: parseFloat(p.min_order) || 0,
          googlePoly: gp,
        });
      });
      renderList();
      setStatus(polygons.length + ' פוליגונים נטענו');
    }).fail(() => setStatus('כשלון רשת'));
  }

  function renderList() {
    const $list = $('#alena-dz-list').empty();
    if (polygons.length === 0) {
      $list.append('<p style="color:#666">אין עדיין פוליגונים. צייר אחד על המפה (לחץ על הסמל בחלק העליון).</p>');
      return;
    }
    polygons.forEach((p, idx) => {
      const $row = $('<div class="alena-dz-row">');
      $row.append($('<strong>').text(p.name));
      $row.append(' — דמי משלוח: ₪').append($('<span>').text(p.delivery_fee));
      $row.append(' | מינ׳: ₪').append($('<span>').text(p.min_order));
      const $edit = $('<button class="button button-small">עריכה</button>').on('click', () => editPolygon(idx));
      const $focus = $('<button class="button button-small">מרכז במפה</button>').on('click', () => focusOnPolygon(p.googlePoly));
      const $del = $('<button class="button button-small button-link-delete">מחק</button>').on('click', () => {
        if (!confirm('למחוק את "' + p.name + '"?')) return;
        p.googlePoly.setMap(null);
        polygons.splice(idx, 1);
        renderList();
      });
      $row.append(' ').append($edit).append(' ').append($focus).append(' ').append($del);
      $list.append($row);
    });
  }

  function editPolygon(idx) {
    const p = polygons[idx];
    const name = prompt('שם:', p.name);
    if (name === null) return;
    const fee = parseFloat(prompt('דמי משלוח (₪):', p.delivery_fee));
    if (isNaN(fee) || fee < 0) return;
    const min = parseFloat(prompt('מינ׳ הזמנה (₪):', p.min_order));
    if (isNaN(min) || min < 0) return;
    p.name = name; p.delivery_fee = fee; p.min_order = min;
    renderList();
  }

  function saveAll() {
    const payload = polygons.map(p => {
      const path = p.googlePoly.getPath();
      const coords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const c = path.getAt(i);
        coords.push([c.lat(), c.lng()]);
      }
      return {
        id: p.id,
        name: p.name,
        color: p.color || '#3388ff',
        delivery_fee: p.delivery_fee,
        min_order: p.min_order,
        coords: coords,
      };
    });
    setStatus('שומר…');
    $.post(AlenaDZ.ajaxUrl, {
      action: 'alena_dz_save',
      nonce: AlenaDZ.nonce,
      polygons: JSON.stringify(payload),
    }, function (res) {
      if (res && res.success) {
        setStatus('נשמרו ' + (res.data && res.data.count) + ' פוליגונים ✓');
      } else {
        setStatus('שגיאה: ' + (res && res.data ? res.data : 'לא ידוע'));
      }
    }).fail(() => setStatus('כשלון רשת בשמירה'));
  }

  function setStatus(t) {
    $('#alena-dz-status').text(t);
  }

  $(init);
})(jQuery);
