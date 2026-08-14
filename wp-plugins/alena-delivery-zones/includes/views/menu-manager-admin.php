<?php
/**
 * Listing Manager screen. Expects $nonce, $terms, $library.
 */
if (!defined('ABSPATH')) exit;
?>
<div class="wrap alena-mm" dir="rtl">
  <h1>ניהול תפריט</h1>

  <div id="mm-status" class="mm-status" hidden></div>

  <div class="mm-layout">

    <!-- ============ sidebar ============ -->
    <aside class="mm-side">
      <p class="mm-side-title">כל התפריט</p>
      <ul class="mm-filters">
        <li class="mm-filter is-active" data-filter="all"><span>כל הפריטים</span><b id="c-all">–</b></li>
        <li class="mm-filter" data-filter="options"><span>כל האפשרויות</span><b id="c-opt">–</b></li>
        <li class="mm-filter" data-filter="inactive"><span>כל הלא פעילים</span><b id="c-inactive">–</b></li>
        <li class="mm-filter" data-filter="uncategorised"><span>פריטים שלא בקטגוריה</span><b id="c-uncat">–</b></li>
      </ul>

      <p class="mm-side-title">קטגוריות</p>
      <ul class="mm-cats">
        <?php foreach ($terms as $t): ?>
          <li class="mm-cat" data-term="<?php echo (int) $t->term_id; ?>">
            <span><?php echo esc_html($t->name); ?></span><b><?php echo (int) $t->count; ?></b>
          </li>
        <?php endforeach; ?>
      </ul>
    </aside>

    <!-- ============ list ============ -->
    <section class="mm-main">
      <div class="mm-main-head">
        <div>
          <h2 id="mm-title">כל הפריטים</h2>
          <p class="mm-sub">כל הפריטים, בין אם הם תחת קטגוריה מסוימת או לא</p>
        </div>
        <input type="search" id="mm-search" placeholder="חיפוש כל הפריטים">
      </div>
      <div id="mm-rows" class="mm-rows"><p class="mm-empty">טוען…</p></div>
    </section>
  </div>
</div>

<!-- ============ dish editor ============ -->
<div class="mm-modal-backdrop" id="mm-modal" hidden>
  <div class="mm-modal" role="dialog" aria-modal="true">
    <header class="mm-modal-head">
      <button class="mm-x" id="mm-close" aria-label="סגור">✕</button>
      <h2 id="mm-dish-title">פריט</h2>
    </header>

    <nav class="mm-tabs">
      <button class="mm-tab is-active" data-tab="basic">בסיס</button>
      <button class="mm-tab" data-tab="advanced">מתקדם</button>
      <button class="mm-tab" data-tab="options">אפשרויות</button>
    </nav>

    <div class="mm-modal-body">

      <!-- ---------- basic ---------- -->
      <div class="mm-pane" data-pane="basic">
        <details class="mm-card" open>
          <summary>אודות</summary>
          <label class="mm-f"><span>שם הפריט <i>*</i></span>
            <input type="text" id="f-name" maxlength="300"></label>
          <label class="mm-f"><span>סטטוס</span>
            <select id="f-status">
              <option value="publish">הופעל</option>
              <option value="draft">כבוי</option>
              <option value="private">מוסתר</option>
            </select></label>
          <label class="mm-f"><span>קטגוריה ראשית</span>
            <select id="f-cat">
              <option value="">— ללא —</option>
              <?php foreach ($terms as $t): ?>
                <option value="<?php echo (int) $t->term_id; ?>"><?php echo esc_html($t->name); ?></option>
              <?php endforeach; ?>
            </select></label>
          <label class="mm-f"><span>קטגוריות נוספות</span>
            <select id="f-cats" multiple size="4">
              <?php foreach ($terms as $t): ?>
                <option value="<?php echo (int) $t->term_id; ?>"><?php echo esc_html($t->name); ?></option>
              <?php endforeach; ?>
            </select></label>
          <label class="mm-f"><span>תיאור</span>
            <textarea id="f-desc" rows="4" maxlength="4850"></textarea>
            <em class="mm-count" id="f-desc-count">0/4850</em></label>
        </details>

        <details class="mm-card" open>
          <summary>מחיר</summary>
          <div class="mm-row2">
            <label class="mm-f"><span>מחיר <i>*</i></span>
              <input type="number" step="0.5" id="f-price"></label>
            <label class="mm-f"><span>מחיר מבצע (לא חובה)</span>
              <input type="number" step="0.5" id="f-sale" placeholder="ללא הנחה"></label>
          </div>
          <label class="mm-check"><input type="checkbox" id="f-stock"> <span>זמין במלאי</span></label>
        </details>

        <details class="mm-card" open>
          <summary>תמונות</summary>
          <div class="mm-img">
            <img id="f-img" alt="" hidden>
            <div id="f-img-none" class="mm-img-none">אין תמונה</div>
          </div>
          <p><button class="button" id="f-pick-img">בחירת תמונה</button>
             <button class="button" id="f-clear-img">הסר</button></p>
          <p class="mm-hint">מומלץ JPG/PNG ברוחב 1000px ומעלה.</p>
        </details>

        <details class="mm-card" open>
          <summary>הגדרות זמינות</summary>
          <label class="mm-f"><span>זמינות לרכישה</span>
            <select id="f-avail">
              <option value="always">זמין בכל שעות הפעילות</option>
              <option value="window">זמין בטווח תאריכים</option>
            </select></label>
          <div class="mm-row2">
            <label class="mm-f"><span>התחלה</span><input type="date" id="f-from"></label>
            <label class="mm-f"><span>סיום</span><input type="date" id="f-to"></label>
          </div>
        </details>
      </div>

      <!-- ---------- advanced ---------- -->
      <div class="mm-pane" data-pane="advanced" hidden>
        <details class="mm-card"><summary>מזהי מוצר</summary>
          <p class="mm-hint">מזהה פנימי: <code id="f-id">–</code></p></details>
        <details class="mm-card"><summary>הגבלות</summary>
          <p class="mm-hint">הגבלות כמות לכל הזמנה — יתווסף בהמשך לפי הצורך.</p></details>
        <details class="mm-card"><summary>אחסון והפצה</summary>
          <p class="mm-hint">לא רלוונטי למשלוחי מזון מוכן.</p></details>
      </div>

      <!-- ---------- options ---------- -->
      <div class="mm-pane" data-pane="options" hidden>
        <p class="mm-actions">
          <select id="f-add-group"></select>
          <button class="button button-primary" id="f-attach">+ הוסיפו אפשרות</button>
          <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=alena-option-groups')); ?>" target="_blank">צרו אפשרות חדשה ↗</a>
        </p>
        <ul class="mm-opts" id="f-opts"></ul>
        <p class="mm-hint">
          עריכת הערכים והמחירים של אפשרות נעשית פעם אחת במסך <strong>אופציות ותוספות</strong>
          ומתעדכנת בכל המנות שמשויכות אליה. כאן קובעים רק את הכללים למנה הזו.
        </p>
      </div>
    </div>

    <footer class="mm-modal-foot">
      <button class="button" id="mm-cancel">סגור</button>
      <button class="button button-primary" id="mm-save">שמירה</button>
    </footer>
  </div>
</div>

<style>
.alena-mm .mm-status { margin:12px 0; padding:10px 14px; border-radius:6px; background:#edfaef; border:1px solid #b7e0be; }
.alena-mm .mm-status.is-error { background:#fdeded; border-color:#e5aaaa; }
.mm-layout { display:grid; grid-template-columns:250px minmax(0,1fr); gap:20px; margin-top:16px; align-items:start; }
@media (max-width:900px){ .mm-layout{ grid-template-columns:1fr; } }
.mm-side { padding:14px; background:#fff; border:1px solid #dcdcde; border-radius:10px; }
.mm-side-title { margin:6px 0; font-size:12px; color:#646970; text-transform:uppercase; letter-spacing:.03em; }
.mm-filters, .mm-cats { margin:0 0 14px; padding:0; list-style:none; }
.mm-filter, .mm-cat { display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:7px 10px; border-radius:6px; cursor:pointer; font-size:13px; }
.mm-filter:hover, .mm-cat:hover { background:#f6f7f7; }
.mm-filter.is-active, .mm-cat.is-active { background:#2271b1; color:#fff; }
.mm-filter b, .mm-cat b { font-weight:600; opacity:.85; }
.mm-main { padding:0; background:#fff; border:1px solid #dcdcde; border-radius:10px; overflow:hidden; }
.mm-main-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:16px; border-bottom:1px solid #f0f0f1; }
.mm-main-head h2 { margin:0; font-size:18px; }
.mm-sub { margin:2px 0 0; color:#646970; font-size:12px; }
#mm-search { width:280px; padding:7px 12px; border:1px solid #dcdcde; border-radius:20px; }
.mm-rows { max-height:640px; overflow:auto; }
.mm-cat-head { padding:12px 16px; font-size:15px; font-weight:700; background:#fafafa; border-bottom:1px solid #f0f0f1; }
.mm-row { display:flex; align-items:center; gap:12px; padding:11px 16px; border-bottom:1px solid #f4f4f5; }
.mm-row:hover { background:#fafbfc; }
.mm-row-img { width:46px; height:46px; flex:0 0 46px; border-radius:8px; object-fit:cover; background:#f0f0f1; }
.mm-row-body { flex:1 1 auto; min-width:0; cursor:pointer; }
.mm-row-name { font-weight:700; }
.mm-row-desc { color:#646970; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mm-row-price { font-weight:700; white-space:nowrap; }
.mm-badge { padding:2px 7px; font-size:11px; border-radius:99px; background:#f0f0f1; color:#50575e; white-space:nowrap; }
.mm-badge.off { background:#fdeaea; color:#a03227; }
.mm-empty { padding:24px; text-align:center; color:#646970; }
/* modal */
.mm-modal-backdrop { position:fixed; inset:0; z-index:100050; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.45); }
.mm-modal { display:flex; flex-direction:column; width:min(620px,94vw); max-height:92vh; background:#fff; border-radius:14px; overflow:hidden; }
.mm-modal-head { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid #f0f0f1; }
.mm-modal-head h2 { margin:0; font-size:17px; flex:1 1 auto; }
.mm-x { width:30px; height:30px; border:0; border-radius:50%; background:#f0f0f1; cursor:pointer; font-size:14px; }
.mm-tabs { display:flex; gap:6px; padding:10px 16px; border-bottom:1px solid #f0f0f1; }
.mm-tab { padding:7px 14px; border:0; border-radius:8px; background:#f6f7f7; cursor:pointer; font-size:13px; font-weight:600; }
.mm-tab.is-active { background:#2271b1; color:#fff; }
.mm-modal-body { flex:1 1 auto; overflow:auto; padding:16px; background:#fbfbfc; }
.mm-card { margin:0 0 12px; padding:12px 14px; background:#fff; border:1px solid #e6e6e8; border-radius:10px; }
.mm-card > summary { font-weight:700; cursor:pointer; }
.mm-f { display:block; margin:12px 0 0; }
.mm-f > span { display:block; margin-bottom:4px; font-size:13px; font-weight:600; }
.mm-f > span i { color:#d63638; font-style:normal; }
.mm-f input[type=text], .mm-f input[type=number], .mm-f input[type=date], .mm-f select, .mm-f textarea { width:100%; }
.mm-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.mm-check { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; }
.mm-count { display:block; margin-top:2px; color:#8c8f94; font-size:11px; font-style:normal; }
.mm-hint { color:#646970; font-size:12px; }
.mm-img { display:flex; align-items:center; justify-content:center; height:170px; margin-bottom:10px;
  background:#f6f7f7; border-radius:10px; overflow:hidden; }
.mm-img img { width:100%; height:100%; object-fit:cover; }
.mm-img-none { color:#8c8f94; font-size:13px; }
.mm-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.mm-opts { margin:12px 0 0; padding:0; list-style:none; }
.mm-opt { padding:11px 12px; margin-bottom:8px; background:#fff; border:1px solid #e6e6e8; border-radius:10px; }
.mm-opt-top { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.mm-opt-drag { flex:0 0 auto; padding:0 2px; color:#a7aaad; font-size:15px; letter-spacing:-2px;
  cursor:grab; user-select:none; }
.mm-opt-drag:active { cursor:grabbing; }
.mm-opt.ui-sortable-helper { box-shadow:0 8px 22px rgba(0,0,0,.16); }
.mm-opt-ghost { height:56px; margin-bottom:8px; border:2px dashed #2271b1; border-radius:10px; background:#f0f6fc; }
.mm-opt-name { font-weight:700; flex:1 1 auto; }
.mm-opt-vals { color:#646970; font-size:12px; margin-bottom:8px; }
.mm-opt-grid { display:flex; flex-wrap:wrap; gap:10px; }
.mm-opt-grid label { font-size:11px; color:#50575e; }
.mm-opt-grid input { width:70px; display:block; }
.mm-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f0f0f1; }
</style>

<script>
(function ($) {
  const NONCE = '<?php echo esc_js($nonce); ?>';
  let LIB = <?php echo wp_json_encode($library, JSON_UNESCAPED_UNICODE); ?> || [];
  let state = { filter: 'all', term: 0, search: '' };
  let dish = null, refs = [], frame = null;

  const post = (a, d) => $.post(ajaxurl, Object.assign({ action: a, nonce: NONCE }, d || {}));
  const say  = (m, e) => $('#mm-status').text(m).toggleClass('is-error', !!e).removeAttr('hidden');
  const gById = id => LIB.find(g => g.id === id) || null;
  const esc = s => $('<div>').text(s == null ? '' : s).html();

  /* ---------------- list ---------------- */

  function load() {
    $('#mm-rows').html('<p class="mm-empty">טוען…</p>');
    post('alena_mm_list', state).done(function (r) {
      if (!r || !r.success) { $('#mm-rows').html('<p class="mm-empty">שגיאה בטעינה</p>'); return; }
      $('#c-all').text(r.data.counts.all);
      $('#c-opt').text(r.data.counts.options);
      $('#c-inactive').text(r.data.counts.inactive);
      $('#c-uncat').text(r.data.counts.uncat);
      renderRows(r.data.rows);
    });
  }

  function renderRows(rows) {
    if (!rows.length) { $('#mm-rows').html('<p class="mm-empty">אין פריטים</p>'); return; }
    const groups = {};
    rows.forEach(r => { (groups[r.cat || 'ללא קטגוריה'] ||= []).push(r); });
    let html = '';
    Object.keys(groups).forEach(cat => {
      html += '<div class="mm-cat-head">' + esc(cat) + '</div>';
      groups[cat].forEach(r => {
        html += '<div class="mm-row" data-id="' + r.id + '">' +
          (r.img ? '<img class="mm-row-img" src="' + esc(r.img) + '" alt="">' : '<div class="mm-row-img"></div>') +
          '<div class="mm-row-body">' +
            '<div class="mm-row-name">' + esc(r.name) +
              (r.status !== 'publish' ? ' <span class="mm-badge off">כבוי</span>' : '') +
              (r.opts ? ' <span class="mm-badge">' + r.opts + ' אפשרויות</span>' : '') +
            '</div>' +
            '<div class="mm-row-desc">' + esc(r.desc) + '</div>' +
          '</div>' +
          '<div class="mm-row-price">₪' + Number(r.price).toFixed(2) + '</div>' +
          '<button class="button mm-dup" data-id="' + r.id + '">שכפל</button>' +
          '<button class="button mm-tog" data-id="' + r.id + '">' + (r.status === 'publish' ? 'כבה' : 'הפעל') + '</button>' +
        '</div>';
      });
    });
    $('#mm-rows').html(html);
  }

  $(document).on('click', '.mm-filter', function () {
    $('.mm-filter').removeClass('is-active'); $('.mm-cat').removeClass('is-active');
    $(this).addClass('is-active');
    const f = $(this).data('filter');
    if (f === 'options') { window.location = '<?php echo esc_js(admin_url('admin.php?page=alena-option-groups')); ?>'; return; }
    state.filter = f; state.term = 0;
    $('#mm-title').text($(this).find('span').text());
    load();
  });

  $(document).on('click', '.mm-cat', function () {
    $('.mm-filter').removeClass('is-active'); $('.mm-cat').removeClass('is-active');
    $(this).addClass('is-active');
    state.term = $(this).data('term'); state.filter = 'all';
    $('#mm-title').text($(this).find('span').text());
    load();
  });

  let t = null;
  $('#mm-search').on('input', function () {
    clearTimeout(t); const v = this.value;
    t = setTimeout(function () { state.search = v; load(); }, 300);
  });

  $(document).on('click', '.mm-dup', function (e) {
    e.stopPropagation();
    const id = $(this).data('id');
    post('alena_mm_duplicate', { id: id }).done(function (r) {
      if (!r || !r.success) { say('השכפול נכשל', true); return; }
      say('נוצר עותק: ' + r.data.name + ' (כבוי — ערוך והפעל)');
      load();
    }).fail(() => say('השכפול נכשל', true));
  });

  $(document).on('click', '.mm-tog', function (e) {
    e.stopPropagation();
    post('alena_mm_status', { id: $(this).data('id') }).done(function (r) {
      if (r && r.success) { say(r.data.status === 'publish' ? 'הופעל ✓' : 'כובה ✓'); load(); }
    });
  });

  /* ---------------- editor ---------------- */

  $(document).on('click', '.mm-row-body', function () { open($(this).closest('.mm-row').data('id')); });

  function open(id) {
    post('alena_mm_get', { id: id }).done(function (r) {
      if (!r || !r.success) { say('טעינת הפריט נכשלה', true); return; }
      dish = r.data; LIB = dish.library || LIB; refs = dish.refs || [];
      $('#mm-dish-title').text(dish.name);
      $('#f-name').val(dish.name);
      $('#f-status').val(dish.status);
      $('#f-cat').val(dish.primary_cat || '');
      $('#f-cats').val((dish.extra_cats || []).map(String));
      $('#f-desc').val(dish.description).trigger('input');
      $('#f-price').val(dish.price);
      $('#f-sale').val(dish.sale_price);
      $('#f-stock').prop('checked', !!dish.stock);
      $('#f-avail').val(dish.availability);
      $('#f-from').val(dish.visible_from);
      $('#f-to').val(dish.visible_to);
      $('#f-id').text(dish.id);
      setImg(dish.image_id, dish.image_url);
      fillPicker(); renderOpts();
      $('.mm-tab').removeClass('is-active').first().addClass('is-active');
      $('.mm-pane').attr('hidden', true).filter('[data-pane=basic]').removeAttr('hidden');
      $('#mm-modal').removeAttr('hidden');
    });
  }

  function setImg(id, url) {
    dish.image_id = id || 0;
    if (url) { $('#f-img').attr('src', url).removeAttr('hidden'); $('#f-img-none').attr('hidden', true); }
    else     { $('#f-img').attr('hidden', true); $('#f-img-none').removeAttr('hidden'); }
  }

  $('#f-desc').on('input', function () { $('#f-desc-count').text(this.value.length + '/4850'); });
  $('#mm-close, #mm-cancel').on('click', () => $('#mm-modal').attr('hidden', true));
  $('.mm-tab').on('click', function () {
    $('.mm-tab').removeClass('is-active'); $(this).addClass('is-active');
    $('.mm-pane').attr('hidden', true).filter('[data-pane=' + $(this).data('tab') + ']').removeAttr('hidden');
  });

  $('#f-pick-img').on('click', function (e) {
    e.preventDefault();
    if (!window.wp || !wp.media) { say('ספריית המדיה לא נטענה', true); return; }
    frame = frame || wp.media({ title: 'בחירת תמונה למנה', multiple: false, library: { type: 'image' } });
    frame.off('select').on('select', function () {
      const a = frame.state().get('selection').first().toJSON();
      setImg(a.id, (a.sizes && a.sizes.medium ? a.sizes.medium.url : a.url));
    });
    frame.open();
  });
  $('#f-clear-img').on('click', function (e) { e.preventDefault(); setImg(0, ''); });

  function fillPicker() {
    const $s = $('#f-add-group').empty();
    LIB.forEach(g => $s.append($('<option>').val(g.id).text(g.name)));
  }

  function renderOpts() {
    const $l = $('#f-opts').empty();
    refs.forEach(function (ref) {
      const g = gById(ref.group_id);
      if (!g) return;
      const vals = (g.values || []).map(v => v.name + (v.price ? ' (₪' + v.price + ')' : '')).join(', ');
      const $li = $('<li class="mm-opt">').attr('data-id', ref.group_id);
      $li.append($('<div class="mm-opt-top">')
        .append($('<span class="mm-opt-drag" title="גרור לשינוי סדר">⋮⋮</span>'))
        .append($('<span class="mm-opt-name">').text(ref.label || g.name))
        .append($('<span class="mm-badge">').text(g.type === 'multi' ? 'בחירה מרובה' : 'בחירה אחת'))
        .append($('<button class="button mm-opt-del" type="button">הסר</button>')));
      $li.append($('<div class="mm-opt-vals">').text(vals));
      const $grid = $('<div class="mm-opt-grid">');
      [['min','מינימום'],['max','מקסימום'],['free','חינם'],['max_single','מקס׳ מכל ערך']].forEach(function (f) {
        $grid.append($('<label>').text(f[1]).append(
          $('<input type="number" min="0">').addClass('o-' + f[0])
            .val(ref[f[0]] != null ? ref[f[0]] : (f[0] === 'max_single' ? 1 : 0))));
      });
      $grid.append($('<label>').text('שם מותאם').append(
        $('<input type="text" style="width:170px">').addClass('o-label').val(ref.label || '')));
      $l.append($li.append($grid));
    });
    if (!refs.length) $l.append('<p class="mm-hint">אין אפשרויות משויכות למנה זו.</p>');
    makeSortable();
  }

  // Order is read straight off the DOM in collectRefs(), so dragging a row is
  // all that a reorder needs — nothing else has to track position.
  function makeSortable() {
    const $l = $('#f-opts');
    if (!$.fn.sortable) return;
    if ($l.data('ui-sortable')) $l.sortable('destroy');
    $l.sortable({
      items: '> .mm-opt',
      handle: '.mm-opt-drag',
      axis: 'y',
      cursor: 'grabbing',
      placeholder: 'mm-opt-ghost',
      forcePlaceholderSize: true,
      tolerance: 'pointer'
    });
  }

  $('#f-attach').on('click', function () {
    const gid = $('#f-add-group').val();
    if (!gid || refs.some(r => r.group_id === gid)) return;
    refs.push({ group_id: gid, label: '', min: 0, max: 0, free: 0, max_single: 1 });
    renderOpts();
  });

  $(document).on('click', '.mm-opt-del', function () {
    const id = $(this).closest('.mm-opt').data('id');
    refs = refs.filter(r => r.group_id !== id);
    renderOpts();
  });

  function collectRefs() {
    const out = [];
    $('#f-opts .mm-opt').each(function () {
      const $o = $(this);
      out.push({
        group_id:   $o.data('id'),
        label:      $o.find('.o-label').val(),
        min:        parseInt($o.find('.o-min').val(), 10) || 0,
        max:        parseInt($o.find('.o-max').val(), 10) || 0,
        free:       parseInt($o.find('.o-free').val(), 10) || 0,
        max_single: parseInt($o.find('.o-max_single').val(), 10) || 1
      });
    });
    return out;
  }

  $('#mm-save').on('click', function () {
    if (!dish) return;
    const payload = {
      id: dish.id,
      name: $('#f-name').val().trim(),
      description: $('#f-desc').val(),
      status: $('#f-status').val(),
      price: $('#f-price').val(),
      sale_price: $('#f-sale').val(),
      primary_cat: $('#f-cat').val(),
      extra_cats: $('#f-cats').val() || [],
      image_id: dish.image_id,
      stock: $('#f-stock').is(':checked') ? 1 : 0,
      availability: $('#f-avail').val(),
      visible_from: $('#f-from').val(),
      visible_to: $('#f-to').val(),
      refs: collectRefs()
    };
    if (!payload.name) { say('חסר שם לפריט', true); return; }
    const $b = $(this).prop('disabled', true).text('שומר…');
    post('alena_mm_save', { dish: JSON.stringify(payload) })
      .done(function (r) {
        if (!r || !r.success) { say('השמירה נכשלה', true); return; }
        say('נשמר ✓');
        $('#mm-modal').attr('hidden', true);
        load();
      })
      .fail(x => say('השמירה נכשלה (HTTP ' + x.status + ')', true))
      .always(() => $b.prop('disabled', false).text('שמירה'));
  });

  load();
})(jQuery);
</script>
