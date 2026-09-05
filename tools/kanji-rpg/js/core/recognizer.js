/* recognizer.js — 書き順判定
 *
 * 字形の完璧さは求めない。重視するのは
 *   ・何画目か（呼び出し側が期待する画のテンプレートを渡す）
 *   ・書き始めの位置
 *   ・おおよその進行方向
 *   ・書き終わりのおおよその位置
 *   ・折れ（曲がり）を通っているか
 * 小学1〜2年生向けにかなり寛容な閾値にしている（TOL で調整可）。
 */
(function (root) {
  'use strict';
  var G = root.Geometry;
  var N = 24;

  var TOL = {
    start: 0.20,        // 始点のずれ許容（正規化座標）
    end: 0.24,          // 終点のずれ許容
    mean: 0.17,         // 対応点の平均距離
    corner: 0.20,       // 折れ点を通過しているか
    dirCos: 0.35,       // 全体方向のコサイン類似度下限
    lenMin: 0.35,       // 長さ比の下限
    lenMax: 3.0,        // 長さ比の上限
    dotLen: 0.13,       // これより短いテンプレートは「点」扱い
    tapLen: 0.06        // これより短いユーザー入力は「タップ」扱い
  };

  function cosSim(a, b) {
    var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
    if (la < 1e-6 || lb < 1e-6) return 1;
    return (a[0] * b[0] + a[1] * b[1]) / (la * lb);
  }

  /**
   * @param {Array<[x,y]>} user   ユーザーの生ストローク（0〜1正規化）
   * @param {Object} tpl          テンプレート画 {start,end,direction,length,corners,path}
   * @param {Object} [opts]       {tolScale: 1.0}  寛容さ倍率
   * @returns {{ok:boolean, score:number, reasons:string[], metrics:Object}}
   */
  function judge(user, tpl, opts) {
    opts = opts || {};
    var k = opts.tolScale || 1;
    var reasons = [];
    if (!user || user.length === 0) return { ok: false, score: 0, reasons: ['empty'], metrics: {} };

    var tplPath = tpl.path && tpl.path.length ? tpl.path : [tpl.start, tpl.end];
    var T = tplPath.length === N ? tplPath : G.resample(tplPath, N);
    var U = G.resample(user, N);
    var tlen = tpl.length || G.pathLength(T);
    var ulen = G.pathLength(user);
    var isDot = tlen < TOL.dotLen;
    var isTap = ulen < TOL.tapLen;

    var dStart = G.dist(U[0], T[0]);
    var dEnd = G.dist(U[N - 1], T[N - 1]);
    var mean = 0;
    for (var i = 0; i < N; i++) mean += G.dist(U[i], T[i]);
    mean /= N;
    var dirT = tpl.direction || G.direction(T);
    var dirU = G.direction(U);
    var cos = cosSim(dirU, dirT);
    var ratio = tlen > 1e-6 ? ulen / tlen : 1;

    var metrics = { dStart: r3(dStart), dEnd: r3(dEnd), mean: r3(mean), cos: r3(cos), ratio: r3(ratio), tlen: r3(tlen), ulen: r3(ulen), isDot: isDot, isTap: isTap };

    // ---- 点（短い画）の特別扱い ----
    if (isDot) {
      if (dStart > TOL.start * 0.9 * k) reasons.push('start');
      if (!isTap) {
        if (ulen > 0.45) reasons.push('too-long');
        if (dEnd > TOL.end * k) reasons.push('end');
        if (ulen > 0.08 && cos < 0.0) reasons.push('direction');
      }
      return finish();
    }

    // ---- 通常の画 ----
    if (isTap) { reasons.push('tap'); return finish(); }
    if (dStart > TOL.start * k) reasons.push('start');
    if (dEnd > TOL.end * k) reasons.push('end');
    if (mean > TOL.mean * k) reasons.push('shape');
    if (tlen >= 0.15 && ulen >= 0.08 && cos < TOL.dirCos) reasons.push('direction');
    if (ratio < TOL.lenMin || ratio > TOL.lenMax) reasons.push('length');
    if (tpl.corners && tpl.corners.length) {
      for (var c = 0; c < tpl.corners.length; c++) {
        var cp = tpl.corners[c], best = 1e9;
        for (var j = 0; j < N; j++) { var d = G.dist(U[j], cp); if (d < best) best = d; }
        if (best > TOL.corner * k) { reasons.push('corner'); break; }
      }
    }
    return finish();

    function finish() {
      var score = Math.max(0, 1 - (dStart / (TOL.start * k)) * 0.35 - (dEnd / (TOL.end * k)) * 0.25 - (mean / (TOL.mean * k)) * 0.4);
      return { ok: reasons.length === 0, score: r3(score), reasons: reasons, metrics: metrics };
    }
  }

  function r3(v) { return Math.round(v * 1000) / 1000; }

  /** 期待する画ではなく、別の画を書いてしまったかを調べる（フィードバック用） */
  function findBestMatch(user, strokes) {
    var best = null;
    for (var i = 0; i < strokes.length; i++) {
      var r = judge(user, strokes[i]);
      if (r.ok && (!best || r.score > best.score)) best = { index: i, score: r.score };
    }
    return best;
  }

  root.Recognizer = { judge: judge, findBestMatch: findBestMatch, TOL: TOL };
})(window);
