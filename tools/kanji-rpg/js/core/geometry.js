/* geometry.js — 共有ジオメトリ関数（ブラウザ / Node 両対応）
 * ストロークは [[x,y],...] の配列（0〜1の正規化座標）で扱う。
 */
(function (root) {
  'use strict';

  function dist(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pathLength(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }

  /** 弧長で等間隔に n 点へリサンプリング */
  function resample(pts, n) {
    if (!pts || pts.length === 0) return [];
    if (pts.length === 1) {
      var out1 = [];
      for (var k = 0; k < n; k++) out1.push([pts[0][0], pts[0][1]]);
      return out1;
    }
    var total = pathLength(pts);
    if (total === 0) {
      var out0 = [];
      for (var j = 0; j < n; j++) out0.push([pts[0][0], pts[0][1]]);
      return out0;
    }
    var step = total / (n - 1);
    var out = [[pts[0][0], pts[0][1]]];
    var acc = 0;
    var i = 1;
    var prev = pts[0];
    while (i < pts.length && out.length < n - 1) {
      var cur = pts[i];
      var d = dist(prev, cur);
      if (acc + d >= step) {
        var t = (step - acc) / d;
        var np = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
        out.push(np);
        prev = np;
        acc = 0;
      } else {
        acc += d;
        prev = cur;
        i++;
      }
    }
    while (out.length < n) out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    return out;
  }

  /** Ramer–Douglas–Peucker 簡略化 */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var first = pts[0], last = pts[pts.length - 1];
    var maxD = 0, idx = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      var d = perpDist(pts[i], first, last);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
      var l = simplify(pts.slice(0, idx + 1), eps);
      var r = simplify(pts.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [first, last];
  }

  function perpDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L2 = dx * dx + dy * dy;
    if (L2 === 0) return dist(p, a);
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return dist(p, [a[0] + dx * t, a[1] + dy * t]);
  }

  /** 折れ点（曲がり）検出：簡略化後の内部頂点で角度が閾値以上のもの */
  function detectCorners(pts, eps, minAngleDeg) {
    eps = eps || 0.035;
    minAngleDeg = minAngleDeg || 40;
    var s = simplify(pts, eps);
    var corners = [];
    for (var i = 1; i < s.length - 1; i++) {
      var a = s[i - 1], b = s[i], c = s[i + 1];
      var v1 = [b[0] - a[0], b[1] - a[1]];
      var v2 = [c[0] - b[0], c[1] - b[1]];
      var l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
      if (l1 < 0.02 || l2 < 0.02) continue;
      var cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
      cos = Math.max(-1, Math.min(1, cos));
      var ang = Math.acos(cos) * 180 / Math.PI;
      if (ang >= minAngleDeg) corners.push([round(b[0]), round(b[1])]);
    }
    return corners;
  }

  function round(v) { return Math.round(v * 1000) / 1000; }

  function direction(pts) {
    var a = pts[0], b = pts[pts.length - 1];
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L = Math.hypot(dx, dy);
    if (L < 1e-6) return [0, 0];
    return [round(dx / L), round(dy / L)];
  }

  /** ユーザーの生ストロークから登録用ストロークデータを作る */
  function buildStrokeData(rawPts, sampleCount) {
    sampleCount = sampleCount || 24;
    var pts = resample(rawPts, sampleCount).map(function (p) { return [round(p[0]), round(p[1])]; });
    return {
      start: pts[0],
      end: pts[pts.length - 1],
      direction: direction(pts),
      length: round(pathLength(pts)),
      corners: detectCorners(pts),
      path: pts
    };
  }

  var Geometry = {
    dist: dist, pathLength: pathLength, resample: resample, simplify: simplify,
    detectCorners: detectCorners, direction: direction, buildStrokeData: buildStrokeData, round: round
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Geometry;
  else root.Geometry = Geometry;
})(typeof window !== 'undefined' ? window : this);
