/* storage.js — セーブデータ（localStorage）
 *
 * 構造:
 * {
 *   version: 1,
 *   clearedStages: ["tutorial", ...],
 *   acquired: { "風": 1725500000000, ... },          // 取得日時
 *   kanji: {
 *     "風": {
 *       level: 1..4,          // ヒントレベル（習熟度）
 *       uses: 0,              // 総使用回数（完成回数）
 *       perfectStreak: 0,     // ノーミス連続回数
 *       lastPracticed: ts,    // 最終練習日時
 *       lastSeen: ts,         // 最後に出題された日時
 *       strokes: { "1": {correct, mistake}, "2": {...} }
 *     }
 *   },
 *   settings: { sfx: true, voice: true },
 *   tutorialDone: false
 * }
 */
(function (root) {
  'use strict';
  var KEY = 'kanjiRPG.save.v1';
  var state = null;

  function defaults() {
    return { version: 1, clearedStages: [], acquired: {}, kanji: {}, settings: { sfx: true, voice: true, volume: 0.6 }, tutorialDone: false, lastStage: null };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) { console.warn('save load failed', e); state = defaults(); }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  }
  function get() { return state || load(); }

  function initialLevel(kanji) {
    var meta = root.KanjiDB ? root.KanjiDB.get(kanji) : null;
    // 1年生の既習漢字はレベル2から（最初の1回で自動調整される）
    return (meta && meta.grade === 1 && meta.starter) ? 2 : 1;
  }

  function getKanjiRecord(kanji, create) {
    var s = get();
    var r = s.kanji[kanji];
    if (!r && create !== false) {
      r = s.kanji[kanji] = { level: initialLevel(kanji), uses: 0, perfectStreak: 0, lastPracticed: 0, lastSeen: 0, strokes: {}, checked: false };
    }
    return r || null;
  }

  function recordStroke(kanji, index, ok) {
    var r = getKanjiRecord(kanji);
    var key = String(index + 1);
    var st = r.strokes[key] || (r.strokes[key] = { correct: 0, mistake: 0 });
    if (ok) st.correct++; else st.mistake++;
    r.lastPracticed = Date.now();
    save();
  }

  /** 漢字完成。mistakes = その漢字で出した間違い数（画のやり直し回数） */
  function recordComplete(kanji, mistakes) {
    var r = getKanjiRecord(kanji);
    r.uses++;
    r.lastPracticed = r.lastSeen = Date.now();
    var first = !r.checked;
    r.checked = true;
    if (mistakes === 0) {
      r.perfectStreak++;
      // 初回チェック: 既習(1年生)漢字をノーミスで書けたら Level3 へ
      if (first && r.level >= 2) r.level = Math.max(r.level, 3);
      else if (r.perfectStreak >= 2 || r.level < 2) r.level = Math.min(4, r.level + 1);
      if (r.perfectStreak >= 2) r.perfectStreak = 0; // 2連続ノーミスで1段階上がる
    } else {
      r.perfectStreak = 0;
      if (mistakes >= 2) r.level = Math.max(1, r.level - 1);
      if (first && mistakes >= 2) r.level = 1;
    }
    save();
    return r;
  }

  function markSeen(kanji) { var r = getKanjiRecord(kanji); r.lastSeen = Date.now(); save(); }

  function acquire(kanji) {
    var s = get();
    if (!s.acquired[kanji]) { s.acquired[kanji] = Date.now(); save(); return true; }
    return false;
  }
  function isAcquired(kanji) {
    var s = get();
    if (s.acquired[kanji]) return true;
    var meta = root.KanjiDB ? root.KanjiDB.get(kanji) : null;
    return !!(meta && meta.starter);
  }
  function acquiredList() {
    var s = get();
    var list = Object.keys(s.acquired);
    if (root.KanjiDB) root.KanjiDB.all().forEach(function (e) { if (e.starter && list.indexOf(e.kanji) < 0) list.push(e.kanji); });
    return list;
  }

  function clearStage(id) { var s = get(); if (s.clearedStages.indexOf(id) < 0) { s.clearedStages.push(id); } s.tutorialDone = s.tutorialDone || id === 'tutorial'; save(); }
  function isCleared(id) { return get().clearedStages.indexOf(id) >= 0; }
  function hasProgress() { var s = get(); return s.clearedStages.length > 0 || Object.keys(s.kanji).length > 0; }

  function setSetting(k, v) { get().settings[k] = v; save(); }
  var SETTING_DEFAULTS = { sfx: true, voice: true, volume: 0.6 };
  function getSetting(k) { var s = get().settings; return s[k] !== undefined ? s[k] : (SETTING_DEFAULTS[k] !== undefined ? SETTING_DEFAULTS[k] : true); }

  function reset() { state = defaults(); save(); }
  function exportJSON() { return JSON.stringify(get(), null, 2); }
  function importJSON(text) { var o = JSON.parse(text); state = Object.assign(defaults(), o); save(); }

  root.SaveData = {
    load: load, save: save, get: get,
    getKanjiRecord: getKanjiRecord, recordStroke: recordStroke, recordComplete: recordComplete, markSeen: markSeen,
    acquire: acquire, isAcquired: isAcquired, acquiredList: acquiredList,
    clearStage: clearStage, isCleared: isCleared, hasProgress: hasProgress,
    setSetting: setSetting, getSetting: getSetting,
    reset: reset, exportJSON: exportJSON, importJSON: importJSON
  };
})(window);
