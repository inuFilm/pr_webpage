/* scheduler.js — 出題・復習スケジューラ / ヒントレベル決定
 *
 * 復習の優先度:
 *   ・間違いが多い漢字（画単位の失敗率）
 *   ・最近覚えた漢字（取得から日が浅い）
 *   ・しばらく出ていない漢字（lastSeen が古い）
 * 「復習です」と表示せず、バトルの中に自然に混ぜるための選択関数を提供する。
 */
(function (root) {
  'use strict';

  function record(k) { return root.SaveData.getKanjiRecord(k, false); }

  /** 漢字の弱さ 0..1 */
  function weakness(k) {
    var r = record(k);
    if (!r) return 0.4; // 未出題は中程度
    var c = 0, m = 0;
    Object.keys(r.strokes).forEach(function (i) { c += r.strokes[i].correct; m += r.strokes[i].mistake; });
    if (c + m === 0) return 0.4;
    var rate = m / (c + m);
    return Math.min(1, rate * 1.6 + (r.level <= 1 ? 0.2 : 0));
  }

  /** 画ごとの弱点: 失敗が多い画のインデックス配列（0始まり） */
  function weakStrokes(k) {
    var r = record(k);
    if (!r) return [];
    var out = [];
    Object.keys(r.strokes).forEach(function (i) {
      var s = r.strokes[i];
      if (s.mistake >= 2 && s.mistake >= s.correct * 0.6) out.push(parseInt(i, 10) - 1);
    });
    return out;
  }

  /** 基本ヒントレベル（1=フル, 4=ノーヒント） */
  function hintLevelFor(k) {
    var r = record(k);
    if (r) return Math.max(1, Math.min(4, r.level));
    var e = root.KanjiDB.get(k);
    return (e && e.grade === 1 && e.starter) ? 2 : 1;
  }

  /** 画ごとのヒントレベル配列。苦手な画だけ強めのヒントにする。 */
  function strokeHintLevels(k, base) {
    var e = root.KanjiDB.get(k);
    var n = e ? e.strokeCount : 0;
    var arr = [];
    var weak = weakStrokes(k);
    for (var i = 0; i < n; i++) arr.push(weak.indexOf(i) >= 0 ? Math.min(base, 2) : base);
    // 苦手な画の直前の画も少しだけ補助（流れを作る）
    weak.forEach(function (i) { if (i > 0 && arr[i - 1] > 3) arr[i - 1] = 3; });
    return arr;
  }

  /**
   * 復習候補から n 個を選ぶ。
   * @param {string[]} candidates
   * @param {number} n
   * @param {Object} [opts] {exclude: string[], recentWeight, weakWeight, staleWeight}
   */
  function pickReview(candidates, n, opts) {
    opts = opts || {};
    var exclude = opts.exclude || [];
    var now = Date.now();
    var DAY = 86400000;
    var acquired = root.SaveData.get().acquired;
    var scored = candidates.filter(function (k) { return exclude.indexOf(k) < 0 && root.KanjiDB.playable(k); }).map(function (k) {
      var r = record(k);
      var w = weakness(k);
      var acqAt = acquired[k] || 0;
      var recent = acqAt ? Math.max(0, 1 - (now - acqAt) / (3 * DAY)) : 0; // 3日以内に取得 → 高い
      var lastSeen = r ? r.lastSeen : 0;
      var stale = lastSeen ? Math.min(1, (now - lastSeen) / (2 * DAY)) : 0.8; // 2日以上で最大
      var score = w * (opts.weakWeight || 1.4) + recent * (opts.recentWeight || 1.0) + stale * (opts.staleWeight || 0.8) + Math.random() * 0.5;
      return { k: k, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, n).map(function (x) { return x.k; });
  }

  /** ステージ中の復習スロット用: 学年で絞って1つ選ぶ */
  function pickOne(pool, exclude) {
    var acquired = root.SaveData.acquiredList();
    var cands = acquired.filter(function (k) {
      var e = root.KanjiDB.get(k);
      if (!e) return false;
      if (pool === 'grade1') return e.grade === 1;
      if (pool === 'grade2') return e.grade === 2;
      return true;
    });
    var r = pickReview(cands, 1, { exclude: exclude });
    if (r.length) return r[0];
    // 候補が無ければ除外を無視
    r = pickReview(cands, 1);
    return r[0] || null;
  }

  /** 練習が必要な漢字（ボス・復習イベント用の上位リスト） */
  function needsPractice(limit) {
    return pickReview(root.SaveData.acquiredList(), limit || 5);
  }

  root.Scheduler = { weakness: weakness, weakStrokes: weakStrokes, hintLevelFor: hintLevelFor, strokeHintLevels: strokeHintLevels, pickReview: pickReview, pickOne: pickOne, needsPractice: needsPractice };
})(window);
