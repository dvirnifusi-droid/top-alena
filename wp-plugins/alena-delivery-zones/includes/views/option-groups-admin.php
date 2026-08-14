<?php
/**
 * Admin screen for the shared option-group library.
 * Expects $nonce, $library, $dishes from Alena_DZ_Option_Groups::render().
 */
if (!defined('ABSPATH')) exit;
?>
<div class="wrap alena-og" dir="rtl">
  <h1>אופציות ותוספות</h1>
  <p class="alena-og-lede">
    קבוצה נערכת <strong>פעם אחת</strong> ומתעדכנת בכל המנות שמשויכות אליה.
    השיוך לכל מנה קובע אם הבחירה חובה, כמה אפשר לבחור, וכמה מהן חינם.
  </p>

  <div id="alena-og-status" class="alena-og-status" hidden></div>

  <?php if (!$library): ?>
    <div class="alena-og-empty-state">
      <h2>אין עדיין ספריית קבוצות</h2>
      <p>
        התוספות שמורות כרגע בעותק נפרד בתוך כל מנה. ההמרה תאסוף אותן לקבוצות
        משותפות — בלי לשנות מה שהלקוח רואה.
      </p>
      <p><button class="button button-primary button-hero" id="alena-og-migrate">המר את התוספות הקיימות</button></p>
      <pre id="alena-og-migrate-log" hidden></pre>
    </div>
  <?php endif; ?>

  <div class="alena-og-cols">

    <!-- ============ library ============ -->
    <section class="alena-og-pane">
      <div class="alena-og-pane-head">
        <h2>ספריית קבוצות</h2>
        <button class="button" id="alena-og-new">+ קבוצה חדשה</button>
      </div>

      <ul class="alena-og-list" id="alena-og-groups">
        <?php foreach ($library as $g): ?>
          <li class="alena-og-group" data-id="<?php echo esc_attr($g['id']); ?>">
            <span class="alena-og-group-name"><?php echo esc_html($g['name']); ?></span>
            <span class="alena-og-group-meta">
              <?php echo ($g['type'] ?? 'single') === 'multi' ? 'מרובה' : 'יחיד'; ?>
              · <?php echo count($g['values'] ?? []); ?> ערכים
            </span>
          </li>
        <?php endforeach; ?>
      </ul>

      <div class="alena-og-editor" id="alena-og-editor" hidden>
        <label class="alena-og-field">
          <span>שם הקבוצה</span>
          <input type="text" id="og-name" placeholder="למשל: תוספת צ׳יפס אמיתי">
        </label>

        <label class="alena-og-field">
          <span>סוג בחירה</span>
          <select id="og-type">
            <option value="single">בחירה יחידה (רדיו)</option>
            <option value="multi">בחירה מרובה (צ׳קבוקס)</option>
          </select>
        </label>

        <h3>ערכים</h3>
        <ul class="alena-og-values" id="og-values"></ul>
        <button class="button" id="og-add-value">+ הוסף ערך</button>

        <p class="alena-og-actions">
          <button class="button button-primary" id="og-save">שמור קבוצה</button>
          <button class="button" id="og-cancel">בטל</button>
          <button class="button alena-og-danger" id="og-delete">מחק</button>
        </p>
        <p class="alena-og-hint" id="og-usage"></p>
      </div>
    </section>

    <!-- ============ attach to dish ============ -->
    <section class="alena-og-pane">
      <div class="alena-og-pane-head"><h2>שיוך למנה</h2></div>

      <label class="alena-og-field">
        <span>בחר מנה</span>
        <select id="og-dish">
          <option value="">— בחר מנה —</option>
          <?php foreach ($dishes as $d): ?>
            <option value="<?php echo (int) $d->ID; ?>"><?php echo esc_html($d->post_title); ?></option>
          <?php endforeach; ?>
        </select>
      </label>

      <div id="og-dish-panel" hidden>
        <ul class="alena-og-refs" id="og-refs"></ul>
        <p class="alena-og-actions">
          <select id="og-add-group"></select>
          <button class="button" id="og-attach">+ שייך קבוצה</button>
        </p>
        <p class="alena-og-actions">
          <button class="button button-primary" id="og-save-refs">שמור שיוכים למנה</button>
        </p>
      </div>
    </section>
  </div>
</div>

<style>
.alena-og-lede { max-width: 780px; color: #50575e; }
.alena-og-status { margin: 12px 0; padding: 10px 14px; border-radius: 6px; background: #edfaef; border: 1px solid #b7e0be; }
.alena-og-status.is-error { background: #fdeded; border-color: #e5aaaa; }
.alena-og-empty-state { max-width: 720px; margin: 16px 0; padding: 18px; background: #fff; border: 1px solid #dcdcde; border-radius: 10px; }
.alena-og-empty-state h2 { margin-top: 0; }
.alena-og-cols { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 20px; margin-top: 18px; align-items: start; }
@media (max-width: 1100px) { .alena-og-cols { grid-template-columns: 1fr; } }
.alena-og-pane { padding: 16px; background: #fff; border: 1px solid #dcdcde; border-radius: 10px; }
.alena-og-pane-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.alena-og-pane-head h2 { margin: 0 0 8px; font-size: 16px; }
.alena-og-list { max-height: 320px; overflow: auto; margin: 8px 0 0; padding: 0; list-style: none; border: 1px solid #f0f0f1; border-radius: 8px; }
.alena-og-group { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border-bottom: 1px solid #f0f0f1; cursor: pointer; }
.alena-og-group:last-child { border-bottom: 0; }
.alena-og-group:hover { background: #f6f7f7; }
.alena-og-group.is-active { background: #f0f6fc; box-shadow: inset 3px 0 0 #2271b1; }
.alena-og-group-name { font-weight: 600; }
.alena-og-group-meta { color: #646970; font-size: 12px; white-space: nowrap; }
.alena-og-editor { margin-top: 16px; padding-top: 14px; border-top: 1px solid #f0f0f1; }
.alena-og-field { display: block; margin: 0 0 12px; }
.alena-og-field > span { display: block; margin-bottom: 4px; font-weight: 600; font-size: 13px; }
.alena-og-field input[type=text], .alena-og-field select { width: 100%; max-width: 420px; }
.alena-og-values { margin: 6px 0 10px; padding: 0; list-style: none; }
.alena-og-value { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.alena-og-value input[type=text] { flex: 1 1 auto; }
.alena-og-value input[type=number] { width: 92px; }
.alena-og-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.alena-og-danger { color: #b32d2e !important; border-color: #b32d2e !important; }
.alena-og-hint { color: #646970; font-size: 12px; }
.alena-og-refs { margin: 8px 0 0; padding: 0; list-style: none; }
.alena-og-ref { padding: 10px 12px; margin-bottom: 8px; background: #fbfbfb; border: 1px solid #e5e5e5; border-radius: 8px; }
.alena-og-ref-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.alena-og-ref-name { font-weight: 700; }
.alena-og-ref-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.alena-og-ref-grid label { font-size: 12px; color: #50575e; }
.alena-og-ref-grid input { width: 74px; display: block; }
</style>

<script>
(function ($) {
  const NONCE = '<?php echo esc_js($nonce); ?>';
  let LIB = <?php echo wp_json_encode($library, JSON_UNESCAPED_UNICODE); ?> || [];
  let current = null;   // group being edited
  let refs = [];        // refs of the selected dish

  function status(msg, err) {
    $('#alena-og-status').text(msg).toggleClass('is-error', !!err).removeAttr('hidden');
  }
  function post(action, data) {
    return $.post(ajaxurl, Object.assign({ action: action, nonce: NONCE }, data || {}));
  }
  function groupById(id) { return LIB.find(g => g.id === id) || null; }

  /* ---------------- library ---------------- */

  function renderGroupList() {
    const $l = $('#alena-og-groups').empty();
    LIB.forEach(g => {
      $l.append(
        $('<li class="alena-og-group">').attr('data-id', g.id)
          .append($('<span class="alena-og-group-name">').text(g.name))
          .append($('<span class="alena-og-group-meta">').text(
            (g.type === 'multi' ? 'מרובה' : 'יחיד') + ' · ' + (g.values || []).length + ' ערכים'))
      );
    });
  }

  function valueRow(v) {
    return $('<li class="alena-og-value">')
      .append($('<input type="text" placeholder="שם הערך">').val(v ? v.name : '').addClass('og-v-name'))
      .append($('<input type="number" step="0.5" placeholder="₪">').val(v ? v.price : 0).addClass('og-v-price'))
      .append($('<button class="button og-v-del" type="button">✕</button>'))
      .data('id', v ? v.id : '');
  }

  function openGroup(g) {
    current = g;
    $('#alena-og-editor').removeAttr('hidden');
    $('#og-name').val(g ? g.name : '');
    $('#og-type').val(g ? g.type : 'single');
    const $v = $('#og-values').empty();
    ((g && g.values) || [{ name: '', price: 0 }]).forEach(v => $v.append(valueRow(v)));
    $('#og-usage').text('');
    $('.alena-og-group').removeClass('is-active');
    if (g) $('.alena-og-group[data-id="' + g.id + '"]').addClass('is-active');
  }

  function collectGroup() {
    const values = [];
    $('#og-values .alena-og-value').each(function () {
      const name = $(this).find('.og-v-name').val().trim();
      if (!name) return;
      values.push({ id: $(this).data('id') || '', name: name, price: parseFloat($(this).find('.og-v-price').val()) || 0 });
    });
    return { id: current ? current.id : '', name: $('#og-name').val().trim(), type: $('#og-type').val(), values: values };
  }

  $(document).on('click', '.alena-og-group', function () { openGroup(groupById($(this).data('id'))); });
  $('#alena-og-new').on('click', function () { openGroup(null); });
  $('#og-add-value').on('click', function () { $('#og-values').append(valueRow(null)); });
  $(document).on('click', '.og-v-del', function () { $(this).closest('.alena-og-value').remove(); });
  $('#og-cancel').on('click', function () { $('#alena-og-editor').attr('hidden', true); current = null; });

  $('#og-save').on('click', function () {
    const g = collectGroup();
    if (!g.name) { status('חסר שם לקבוצה', true); return; }
    if (!g.values.length) { status('צריך לפחות ערך אחד', true); return; }
    post('alena_og_save_group', { group: JSON.stringify(g) })
      .done(function (r) {
        if (!r || !r.success) { status('השמירה נכשלה', true); return; }
        g.id = r.data.id;
        const i = LIB.findIndex(x => x.id === g.id);
        if (i >= 0) LIB[i] = g; else LIB.push(g);
        renderGroupList(); fillGroupPicker(); openGroup(g);
        status('נשמר ✓ · עודכנו ' + r.data.dishes_updated + ' מנות');
      })
      .fail(function (x) { status('השמירה נכשלה (HTTP ' + x.status + ')', true); });
  });

  $('#og-delete').on('click', function () {
    if (!current || !confirm('למחוק את הקבוצה "' + current.name + '"?')) return;
    post('alena_og_delete_group', { id: current.id })
      .done(function (r) {
        if (!r || !r.success) { status((r && r.data && r.data.message) || 'המחיקה נכשלה', true); return; }
        LIB = LIB.filter(x => x.id !== current.id);
        current = null;
        renderGroupList(); fillGroupPicker();
        $('#alena-og-editor').attr('hidden', true);
        status('נמחק ✓');
      })
      .fail(function (x) {
        const m = x.responseJSON && x.responseJSON.data && x.responseJSON.data.message;
        status(m || 'המחיקה נכשלה', true);
      });
  });

  /* ---------------- dish refs ---------------- */

  function fillGroupPicker() {
    const $s = $('#og-add-group').empty();
    LIB.forEach(g => $s.append($('<option>').val(g.id).text(g.name)));
  }

  function refRow(ref) {
    const g = groupById(ref.group_id);
    if (!g) return $();
    const $li = $('<li class="alena-og-ref">').attr('data-id', ref.group_id);
    $li.append(
      $('<div class="alena-og-ref-top">')
        .append($('<span class="alena-og-ref-name">').text(g.name +
          ' (' + (g.type === 'multi' ? 'מרובה' : 'יחיד') + ', ' + g.values.length + ' ערכים)'))
        .append($('<button class="button og-ref-del" type="button">הסר</button>'))
    );
    const $grid = $('<div class="alena-og-ref-grid">');
    [['min', 'מינימום'], ['max', 'מקסימום'], ['free', 'חינם'], ['max_single', 'מקס׳ מכל ערך']].forEach(function (f) {
      $grid.append($('<label>').text(f[1]).append(
        $('<input type="number" min="0">').addClass('og-f-' + f[0]).val(ref[f[0]] != null ? ref[f[0]] : (f[0] === 'max_single' ? 1 : 0))
      ));
    });
    $grid.append($('<label>').text('שם מותאם (לא חובה)').append(
      $('<input type="text" style="width:190px">').addClass('og-f-label').val(ref.label || '')
    ));
    return $li.append($grid);
  }

  function renderRefs() {
    const $l = $('#og-refs').empty();
    refs.forEach(r => $l.append(refRow(r)));
  }

  $('#og-dish').on('change', function () {
    const pid = $(this).val();
    if (!pid) { $('#og-dish-panel').attr('hidden', true); return; }
    post('alena_og_dish', { product_id: pid }).done(function (r) {
      refs = (r && r.success && r.data.refs) || [];
      renderRefs();
      $('#og-dish-panel').removeAttr('hidden');
    });
  });

  $('#og-attach').on('click', function () {
    const gid = $('#og-add-group').val();
    if (!gid || refs.some(r => r.group_id === gid)) return;
    refs.push({ group_id: gid, label: '', min: 0, max: 0, free: 0, max_single: 1 });
    renderRefs();
  });

  $(document).on('click', '.og-ref-del', function () {
    const id = $(this).closest('.alena-og-ref').data('id');
    refs = refs.filter(r => r.group_id !== id);
    renderRefs();
  });

  $('#og-save-refs').on('click', function () {
    const out = [];
    $('#og-refs .alena-og-ref').each(function () {
      const $r = $(this);
      out.push({
        group_id:   $r.data('id'),
        label:      $r.find('.og-f-label').val(),
        min:        parseInt($r.find('.og-f-min').val(), 10) || 0,
        max:        parseInt($r.find('.og-f-max').val(), 10) || 0,
        free:       parseInt($r.find('.og-f-free').val(), 10) || 0,
        max_single: parseInt($r.find('.og-f-max_single').val(), 10) || 1
      });
    });
    post('alena_og_save_refs', { product_id: $('#og-dish').val(), refs: JSON.stringify(out) })
      .done(function (r) {
        status(r && r.success ? ('נשמרו ' + r.data.saved + ' קבוצות למנה ✓') : 'השמירה נכשלה', !(r && r.success));
      })
      .fail(function (x) { status('השמירה נכשלה (HTTP ' + x.status + ')', true); });
  });

  /* ---------------- migration ---------------- */

  $('#alena-og-migrate').on('click', function () {
    const $b = $(this).prop('disabled', true).text('ממיר…');
    post('alena_og_migrate')
      .done(function (r) {
        if (!r || !r.success) { status('ההמרה נכשלה', true); $b.prop('disabled', false).text('נסה שוב'); return; }
        const d = r.data;
        $('#alena-og-migrate-log').removeAttr('hidden').text(
          'מנות שהומרו: ' + d.dishes + '\n' +
          'קבוצות חדשות בספרייה: ' + d.groups + '\n' +
          'שיוכים: ' + d.attached + '\n' +
          'מנות שכבר היו מומרות: ' + d.skipped + '\n' +
          'סה"כ בספרייה: ' + d.library
        );
        status('ההמרה הושלמה — ' + d.attached + ' שיוכים קופלו ל-' + d.library + ' קבוצות. רענן את הדף.');
        $b.prop('disabled', false).text('הרץ שוב');
      })
      .fail(function (x) { status('ההמרה נכשלה (HTTP ' + x.status + ')', true); $b.prop('disabled', false).text('נסה שוב'); });
  });

  fillGroupPicker();
})(jQuery);
</script>
