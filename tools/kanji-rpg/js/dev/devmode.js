/* devmode.js — 開発者モード: 書き順テンプレートの手動登録
 *  漢字を選ぶ → 1画目を正しく描く → 「この画を登録」 → 2画目 … → 保存
 *  登録ストロークから 始点/終点/方向/軌跡/折れ を自動取得（Geometry.buildStrokeData）
 *  JSON 書き出し/読み込み、KanjiVG からの取り込みにも対応。
 */
(function (root) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var pad = null;
  var strokes = [];      // 登録済み（buildStrokeData 形式）
  var pending = null;    // 描いたが未登録の生ストローク
  var testing = false;
  var refEntry = null;
  var inited = false;

  function status(msg, isErr) { var el = $('#dev-status'); el.textContent = msg; el.style.color = isErr ? '#ff8e9e' : '#7cf29a'; }

  function currentKanji() {
    var k = ($('#dev-kanji').value || '').trim();
    if (!k) k = $('#dev-select').value;
    return k ? k.slice(0, 1) : '';
  }

  function fillSelect() {
    var sel = $('#dev-select');
    var cur = sel.value;
    sel.innerHTML = '<option value="">（漢字を選ぶ）</option>';
    root.KanjiDB.all().sort(function (a, b) { return a.grade - b.grade || a.kanji.localeCompare(b.kanji, 'ja'); }).forEach(function (e) {
      var o = document.createElement('option'); o.value = e.kanji;
      o.textContent = e.kanji + '  ' + (e.reading || '') + '  [' + e.grade + '年 / ' + (e.source === 'custom' ? 'カスタム' : e.source === 'kanjivg' ? 'KanjiVG' : 'データなし') + ']';
      sel.appendChild(o);
    });
    sel.value = cur;
  }

  function loadKanji(k) {
    var e = root.KanjiDB.get(k);
    refEntry = e;
    $('#dev-reading').value = e ? e.reading : '';
    $('#dev-grade').value = e ? e.grade : 2;
    $('#dev-category').value = e ? e.category : 'object';
    $('#dev-ability').value = e ? e.ability : '';
    $('#dev-spell').value = e ? e.spell : '';
    $('#dev-prompt').value = e ? e.prompt : '';
    $('#dev-tutorial').checked = !!(e && e.tutorial);
    $('#dev-starter').checked = !!(e && e.starter);
    strokes = (e && e.source === 'custom' && e.strokes) ? JSON.parse(JSON.stringify(e.strokes)) : [];
    pending = null; testing = false;
    pad.setKanji(null); pad.recordOnly = true;
    refresh();
  }

  function entryFromForm() {
    return {
      kanji: currentKanji(), reading: $('#dev-reading').value.trim(), grade: parseInt($('#dev-grade').value, 10), category: $('#dev-category').value,
      ability: $('#dev-ability').value.trim() || 'generic', spell: $('#dev-spell').value.trim(), prompt: $('#dev-prompt').value.trim(),
      tutorial: $('#dev-tutorial').checked, starter: $('#dev-starter').checked, strokes: strokes
    };
  }

  function refresh() {
    var n = strokes.length;
    $('#dev-stroke-label').textContent = testing ? '判定テスト中：書いてみてください（もう一度ボタンで終了）' : (pending ? (n + 1) + '画目を描きました → 「この画を登録」' : (n + 1) + '画目を描いてください（登録済み ' + n + '画）');
    $('#dev-json').textContent = JSON.stringify(entryFromForm(), null, 1);
    renderCustomList();
  }

  function renderCustomList() {
    var wrap = $('#dev-custom-list'); wrap.innerHTML = '';
    var c = root.KanjiDB.customEntries();
    var keys = Object.keys(c);
    if (!keys.length) { wrap.innerHTML = '<span style="color:var(--muted);font-size:13px">なし</span>'; return; }
    keys.forEach(function (k) {
      var chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = k + ' ' + (c[k].strokes ? c[k].strokes.length : 0) + '画';
      chip.addEventListener('click', function () { $('#dev-kanji').value = ''; $('#dev-select').value = k; loadKanji(k); });
      wrap.appendChild(chip);
    });
  }

  /* 参考データ・登録済み・未登録ストロークをパッド上に描く */
  function overlayDraw(ctx, S, w) {
    var showRef = $('#dev-show-ref').checked;
    if (showRef && refEntry && refEntry.strokes && refEntry.source !== 'custom') {
      refEntry.strokes.forEach(function (s, i) { drawPath(ctx, s.path, S, 'rgba(120,140,220,0.25)', w * 0.8); label(ctx, s.start, i + 1, S, 'rgba(120,140,220,0.6)'); });
    }
    if (testing) return;
    strokes.forEach(function (s, i) {
      drawPath(ctx, s.path, S, 'rgba(255,215,94,0.85)', w);
      label(ctx, s.start, i + 1, S, '#ffd75e');
      (s.corners || []).forEach(function (c) { ctx.fillStyle = '#ff5b6e'; ctx.beginPath(); ctx.arc(c[0] * S, c[1] * S, w * 0.35, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#7cf29a'; ctx.beginPath(); ctx.arc(s.start[0] * S, s.start[1] * S, w * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#62e6ff'; ctx.beginPath(); ctx.arc(s.end[0] * S, s.end[1] * S, w * 0.3, 0, Math.PI * 2); ctx.fill();
    });
    if (pending) drawPath(ctx, pending, S, 'rgba(255,255,255,0.9)', w);
  }
  function drawPath(ctx, path, S, style, width) {
    if (!path || path.length < 2) return;
    ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(path[0][0] * S, path[0][1] * S);
    for (var i = 1; i < path.length; i++) ctx.lineTo(path[i][0] * S, path[i][1] * S);
    ctx.stroke(); ctx.restore();
  }
  function label(ctx, p, n, S, color) {
    ctx.save(); ctx.fillStyle = color; ctx.font = 'bold ' + S * 0.045 + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), p[0] * S - S * 0.04, p[1] * S - S * 0.04); ctx.restore();
  }

  /* ---------- 操作 ---------- */
  function register() {
    if (!pending) { status('先に画を描いてください', true); return; }
    strokes.push(root.Geometry.buildStrokeData(pending, 24));
    pending = null; status(strokes.length + '画目を登録しました'); refresh();
  }
  function undo() { if (pending) pending = null; else strokes.pop(); refresh(); }
  function clearAll() { strokes = []; pending = null; refresh(); }
  function save() {
    var e = entryFromForm();
    if (!e.kanji) { status('漢字を入力または選択してください', true); return; }
    if (!e.strokes.length) { status('ストロークが1画も登録されていません', true); return; }
    root.KanjiDB.saveCustom(e);
    fillSelect(); $('#dev-select').value = e.kanji; $('#dev-kanji').value = '';
    refEntry = root.KanjiDB.get(e.kanji);
    status('「' + e.kanji + '」を ' + e.strokes.length + '画で保存しました（ゲームに反映されます）');
    refresh();
  }
  function del() {
    var k = currentKanji();
    if (!k || !root.KanjiDB.isCustom(k)) { status('この漢字にカスタム登録はありません', true); return; }
    root.KanjiDB.deleteCustom(k); fillSelect(); loadKanji(k); status('「' + k + '」のカスタム登録を削除しました');
  }
  function exportJSON() {
    var text = root.KanjiDB.exportCustom();
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kanji-custom.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    status('JSON を書き出しました');
  }
  function importJSON(file) {
    var r = new FileReader();
    r.onload = function () {
      try { var n = root.KanjiDB.importCustom(r.result, false); fillSelect(); renderCustomList(); status(n + '件を読み込みました'); }
      catch (e) { status('読み込み失敗: ' + e.message, true); }
    };
    r.readAsText(file);
  }
  async function importKanjiVG() {
    var k = currentKanji();
    if (!k) { status('漢字を入力してください', true); return; }
    var code = k.codePointAt(0).toString(16).padStart(5, '0');
    var url = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/' + code + '.svg';
    status('KanjiVG から取得中… ' + url);
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var svg = await res.text();
      var ds = root.SvgPath.extractKanjiVGStrokes(svg);
      if (!ds.length) throw new Error('path が見つかりません');
      strokes = ds.map(function (d) {
        var raw = root.SvgPath.pathToPoints(d, 16).map(function (p) { return [p[0] / 109, p[1] / 109]; });
        return root.Geometry.buildStrokeData(raw, 24);
      });
      pending = null;
      status('KanjiVG から ' + strokes.length + '画を取り込みました（CC BY-SA 3.0）。「保存」で反映されます');
      refresh();
    } catch (e) { status('取り込み失敗: ' + e.message, true); }
  }
  function toggleTest() {
    if (!strokes.length) { status('登録ストロークがありません', true); return; }
    testing = !testing;
    if (testing) {
      var e = Object.assign({}, entryFromForm(), { strokeCount: strokes.length });
      pad.recordOnly = false;
      pad.onStroke = function (r) { status((r.ok ? '○ ' : '× ') + (r.index + 1) + '画目  ' + (r.ok ? 'score ' + r.result.score : r.result.reasons.join(',')) + '  ' + JSON.stringify(r.result.metrics), !r.ok); };
      pad.onComplete = function (r) { status('完成！ ミス ' + r.mistakes + ' 回。もう一度書くにはパッドを再テスト'); setTimeout(function () { if (testing) pad.setKanji(e, { hintLevel: 1, color: '#ffd75e' }); }, 800); };
      pad.setKanji(e, { hintLevel: 1, color: '#ffd75e' }); pad.setEnabled(true);
      $('#dev-test').textContent = 'テスト終了';
    } else {
      pad.recordOnly = true; pad.setKanji(null);
      $('#dev-test').textContent = '判定テスト';
    }
    refresh();
  }

  function init() {
    if (inited) return; inited = true;
    pad = new root.InputPad($('#dev-pad'), { recordOnly: true, onRawStroke: function (pts) { if (testing) return; pending = pts; refresh(); } });
    pad.overlayDraw = overlayDraw;
    fillSelect();
    $('#dev-select').addEventListener('change', function () { $('#dev-kanji').value = ''; loadKanji($('#dev-select').value); });
    $('#dev-kanji').addEventListener('input', function () { var k = currentKanji(); if (k) { $('#dev-select').value = root.KanjiDB.get(k) ? k : ''; loadKanji(k); } });
    ['dev-reading', 'dev-grade', 'dev-category', 'dev-ability', 'dev-spell', 'dev-prompt', 'dev-tutorial', 'dev-starter'].forEach(function (id) { $('#' + id).addEventListener('input', refresh); $('#' + id).addEventListener('change', refresh); });
    $('#dev-register').addEventListener('click', register);
    $('#dev-undo').addEventListener('click', undo);
    $('#dev-clear').addEventListener('click', clearAll);
    $('#dev-save').addEventListener('click', save);
    $('#dev-delete').addEventListener('click', del);
    $('#dev-export').addEventListener('click', exportJSON);
    $('#dev-import').addEventListener('change', function (e) { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
    $('#dev-kanjivg').addEventListener('click', importKanjiVG);
    $('#dev-test').addEventListener('click', toggleTest);
    // セーブデータ初期化（開発用）
    var reset = document.createElement('button'); reset.className = 'btn btn-danger'; reset.textContent = 'セーブデータ初期化';
    reset.addEventListener('click', function () { if (confirm('セーブデータ（進行・習熟度）を消します。よいですか？')) { root.SaveData.reset(); status('セーブデータを初期化しました'); } });
    $('#dev-delete').parentNode.appendChild(reset);
    refresh();
  }
  function open() { init(); fillSelect(); pad.resize(); refresh(); }

  root.DevMode = { init: init, open: open };
})(window);
