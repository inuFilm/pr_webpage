/* screens.js — 画面切り替え・タイトル・地図・図鑑・オーバーレイ */
(function (root) {
  'use strict';
  var history = [];
  var current = 'title';
  var collectionFilter = 'all';

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function show(id, noHistory) {
    if (!noHistory && current !== id) history.push(current);
    current = id;
    $all('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + id); });
    if (id === 'stages') renderStages();
    if (id === 'collection') renderCollection();
    if (id === 'title') { $('#btn-continue').disabled = !root.SaveData.hasProgress(); }
    if (id === 'dev' && root.DevMode) root.DevMode.open();
  }
  function back() { var prev = history.pop() || 'title'; if (prev === 'battle') prev = 'stages'; show(prev, true); }

  /* ---------- オーバーレイ ---------- */
  function overlay(id, v) { $('#' + id).classList.toggle('hidden', !v); }
  function once(el, fn) { var h = function (e) { el.removeEventListener('click', h); root.Events.emit('ui:click'); fn(e); }; el.addEventListener('click', h); return h; }

  function message(head, body) {
    return new Promise(function (res) {
      $('#message-head').textContent = head; $('#message-body').innerHTML = body;
      overlay('overlay-message', true);
      once($('#message-ok'), function () { overlay('overlay-message', false); res(); });
    });
  }
  function newKanjiCard(entry) {
    return new Promise(function (res) {
      $('#card-kanji').textContent = entry.kanji;
      $('#card-reading').textContent = entry.reading;
      $('#card-desc').textContent = entry.kanji + 'の まほう「' + entry.spell + '」を おぼえた！';
      overlay('overlay-card', true);
      root.Events.emit('kanji:new', { kanji: entry.kanji });
      once($('#card-ok'), function () { overlay('overlay-card', false); res(); });
    });
  }
  function stageClear(detailHtml, hasNext) {
    return new Promise(function (res) {
      $('#clear-detail').innerHTML = detailHtml;
      $('#clear-next').classList.toggle('hidden', !hasNext);
      overlay('overlay-clear', true);
      var a, b;
      a = once($('#clear-next'), function () { $('#clear-map').removeEventListener('click', b); overlay('overlay-clear', false); res('next'); });
      b = once($('#clear-map'), function () { $('#clear-next').removeEventListener('click', a); overlay('overlay-clear', false); res('map'); });
    });
  }
  function gameOver() {
    return new Promise(function (res) {
      overlay('overlay-gameover', true);
      var a, b;
      a = once($('#gameover-retry'), function () { $('#gameover-map').removeEventListener('click', b); overlay('overlay-gameover', false); res('retry'); });
      b = once($('#gameover-map'), function () { $('#gameover-retry').removeEventListener('click', a); overlay('overlay-gameover', false); res('map'); });
    });
  }
  function pause() {
    return new Promise(function (res) {
      $('#set-sfx').checked = root.SaveData.getSetting('sfx');
      $('#set-voice').checked = root.SaveData.getSetting('voice');
      var vol = Math.round(root.SaveData.getSetting('volume') * 100);
      $('#set-volume').value = vol; $('#set-volume-val').textContent = vol + '%';
      refreshModeChips();
      overlay('overlay-pause', true);
      var a, b;
      a = once($('#pause-resume'), function () { $('#pause-map').removeEventListener('click', b); overlay('overlay-pause', false); res('resume'); });
      b = once($('#pause-map'), function () { $('#pause-resume').removeEventListener('click', a); overlay('overlay-pause', false); res('map'); });
    });
  }

  /* ---------- ステージ一覧 ---------- */
  function isUnlocked(i) { return i === 0 || root.SaveData.isCleared(root.STAGES[i - 1].id); }
  function renderStages() {
    var list = $('#stage-list'); list.innerHTML = '';
    root.STAGES.forEach(function (st, i) {
      var unlocked = isUnlocked(i), cleared = root.SaveData.isCleared(st.id);
      var card = document.createElement('div');
      card.className = 'stage-card' + (unlocked ? '' : ' locked') + (cleared ? ' cleared' : '');
      var th = root.STAGE_THEMES[st.theme] || {};
      var kanjiHtml = st.kind === 'boss' ? '<span class="unknown">？？？</span>' : st.kanjiList.map(function (k) {
        var e = root.KanjiDB.get(k);
        var known = root.SaveData.isAcquired(k);
        return known || !e || e.grade === 1 ? k : '<span class="unknown">？</span>';
      }).join('');
      card.innerHTML = '<div class="theme-strip" style="background:' + (th.accent || '#888') + '"></div>' +
        '<div class="stage-kind">' + kindLabel(st.kind) + '</div>' +
        '<div class="stage-name">' + st.name + '</div>' +
        '<div class="stage-sub">' + st.subtitle + '</div>' +
        '<div class="stage-kanji">' + kanjiHtml + '</div>' +
        '<div class="stage-badge">' + (cleared ? 'CLEAR' : unlocked ? 'GO!' : 'LOCK') + '</div>';
      if (unlocked) card.addEventListener('click', function () { root.Events.emit('ui:click'); root.Battle.start(st.id); });
      list.appendChild(card);
    });
  }
  function kindLabel(k) { return { tutorial: 'TUTORIAL', basic: '初級', main: '本編', boss: 'BOSS', extra: '追加エリア' }[k] || k; }

  /* ---------- 漢字図鑑 ---------- */
  function renderCollection() {
    var grid = $('#collection-grid'); grid.innerHTML = '';
    var all = root.KanjiDB.all().filter(function (e) { return e.hasMeta || root.KanjiDB.isCustom(e.kanji); });
    all.sort(function (a, b) { return a.grade - b.grade || a.strokeCount - b.strokeCount; });
    var shown = all.filter(function (e) { return collectionFilter === 'all' || String(e.grade) === collectionFilter; });
    var got = 0;
    shown.forEach(function (e) {
      var acquired = root.SaveData.isAcquired(e.kanji);
      if (acquired) got++;
      var r = root.SaveData.getKanjiRecord(e.kanji, false);
      var card = document.createElement('div');
      card.className = 'kcard g' + e.grade + (acquired ? '' : ' unknown');
      var level = r ? r.level : (e.grade === 1 && e.starter ? 2 : 1);
      var stars = acquired ? '★'.repeat(level) + '☆'.repeat(4 - level) : '';
      card.innerHTML = '<div class="grade-tag">' + e.grade + '年生</div>' +
        '<div class="k">' + (acquired ? e.kanji : '？') + '</div>' +
        '<div class="r">' + (acquired ? e.reading : '？？？') + '</div>' +
        '<div class="meta">' + (acquired ? catLabel(e.category) + (e.strokeCount ? ' ・ ' + e.strokeCount + '画' : '') : 'まだ みつけていない') + '</div>' +
        (acquired ? '<div class="stars" title="習熟度">' + stars + '</div><div class="uses">つかった回数: ' + (r ? r.uses : 0) + '</div>' : '');
      grid.appendChild(card);
    });
    $('#collection-summary').textContent = 'おぼえた漢字: ' + got + ' / ' + shown.length;
  }
  function catLabel(c) { return { fire: 'ほのお', water: '水', nature: 'しぜん', weather: 'てんき', animal: 'どうぶつ', movement: 'うごき', weapon: 'ぶき', support: 'サポート', object: 'もの', location: 'ばしょ' }[c] || c; }

  /* ---------- むずかしさ ---------- */
  var MODE_LABEL = { normal: 'ふつう', hard: '上級', expert: '超上級' };
  var MODE_DESC = {
    normal: '習熟度に合わせて 書き順の ガイドが 出ます。',
    hard: '書き順の ガイドが 出ません。漢字の形だけ 見て 書きます。',
    expert: '漢字も 隠れます。「よみ」だけを 見て 書きます。（はじめての漢字は 形が 見えます）'
  };
  function modeLabel(m) { return MODE_LABEL[m] || MODE_LABEL.normal; }
  function currentMode() { var m = root.SaveData.getSetting('difficulty'); return MODE_LABEL[m] ? m : 'normal'; }
  function refreshModeChips() {
    var m = currentMode();
    $all('[data-mode]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === m); });
    $all('.mode-desc').forEach(function (d) { d.textContent = MODE_DESC[m]; });
  }
  function bindModeChips() {
    $all('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        root.Events.emit('ui:click');
        root.SaveData.setSetting('difficulty', b.getAttribute('data-mode'));
        refreshModeChips();
        if (root.Battle && root.Battle.onModeChanged) root.Battle.onModeChanged();
      });
    });
    refreshModeChips();
  }

  /* ---------- 初期化 ---------- */
  function init() {
    bindModeChips();
    $all('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        root.Events.emit('ui:click');
        var t = b.getAttribute('data-nav');
        if (t === 'back') back(); else show(t);
      });
    });
    $('#btn-start').addEventListener('click', function () {
      root.Events.emit('ui:click');
      if (root.SaveData.hasProgress()) show('stages'); else root.Battle.start('tutorial');
    });
    $('#btn-continue').addEventListener('click', function () { root.Events.emit('ui:click'); show('stages'); });
    $('#btn-collection').addEventListener('click', function () { root.Events.emit('ui:click'); show('collection'); });
    $('#btn-dev').addEventListener('click', function () { root.Events.emit('ui:click'); show('dev'); });
    $all('.filter-group .btn-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        root.Events.emit('ui:click');
        $all('.filter-group .btn-chip').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active'); collectionFilter = b.getAttribute('data-filter'); renderCollection();
      });
    });
    $('#set-sfx').addEventListener('change', function (e) { root.SaveData.setSetting('sfx', e.target.checked); });
    $('#set-voice').addEventListener('change', function (e) { root.SaveData.setSetting('voice', e.target.checked); });
    var volTimer = null;
    $('#set-volume').addEventListener('input', function (e) {
      var v = parseInt(e.target.value, 10) / 100;
      $('#set-volume-val').textContent = Math.round(v * 100) + '%';
      root.SFX.setVolume(v);
      clearTimeout(volTimer); volTimer = setTimeout(function () { root.SFX.preview(); }, 120);
    });
    show('title', true);
  }

  root.Screens = { init: init, show: show, back: back, message: message, newKanjiCard: newKanjiCard, stageClear: stageClear, gameOver: gameOver, pause: pause, renderStages: renderStages, renderCollection: renderCollection, current: function () { return current; }, modeLabel: modeLabel, currentMode: currentMode, refreshModeChips: refreshModeChips };
})(window);
