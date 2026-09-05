/* svgpath.js — SVG path "d" 属性を折れ線に変換（ブラウザ / Node 両対応）
 * KanjiVG の取り込みに使用。M/m L/l H/h V/v C/c S/s Q/q T/t Z/z に対応。
 */
(function (root) {
  'use strict';

  function tokenize(d) {
    var re = /([MmLlHhVvCcSsQqTtZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
    var out = [], m;
    while ((m = re.exec(d)) !== null) out.push(m[1] ? m[1] : parseFloat(m[2]));
    return out;
  }

  function cubic(p0, p1, p2, p3, n, out) {
    for (var i = 1; i <= n; i++) {
      var t = i / n, mt = 1 - t;
      out.push([
        mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
        mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
  }
  function quad(p0, p1, p2, n, out) {
    for (var i = 1; i <= n; i++) {
      var t = i / n, mt = 1 - t;
      out.push([
        mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
      ]);
    }
  }

  /** 1本のパス（=1画）を点列に変換。複数サブパスがあれば連結する。 */
  function pathToPoints(d, curveSteps) {
    curveSteps = curveSteps || 16;
    var tk = tokenize(d);
    var pts = [];
    var cur = [0, 0], start = [0, 0], lastCtrl = null, lastCmd = '';
    var i = 0;
    var cmd = null;
    function next() { return tk[i++]; }
    while (i < tk.length) {
      var t = tk[i];
      if (typeof t === 'string') { cmd = t; i++; }
      else if (cmd === 'M') cmd = 'L';
      else if (cmd === 'm') cmd = 'l';
      var x, y, c1, c2, p;
      switch (cmd) {
        case 'M': x = next(); y = next(); cur = [x, y]; start = cur; pts.push(cur); lastCtrl = null; break;
        case 'm': x = next(); y = next(); cur = [cur[0] + x, cur[1] + y]; start = cur; pts.push(cur); lastCtrl = null; break;
        case 'L': x = next(); y = next(); cur = [x, y]; pts.push(cur); lastCtrl = null; break;
        case 'l': x = next(); y = next(); cur = [cur[0] + x, cur[1] + y]; pts.push(cur); lastCtrl = null; break;
        case 'H': x = next(); cur = [x, cur[1]]; pts.push(cur); lastCtrl = null; break;
        case 'h': x = next(); cur = [cur[0] + x, cur[1]]; pts.push(cur); lastCtrl = null; break;
        case 'V': y = next(); cur = [cur[0], y]; pts.push(cur); lastCtrl = null; break;
        case 'v': y = next(); cur = [cur[0], cur[1] + y]; pts.push(cur); lastCtrl = null; break;
        case 'C':
          c1 = [next(), next()]; c2 = [next(), next()]; p = [next(), next()];
          cubic(cur, c1, c2, p, curveSteps, pts); cur = p; lastCtrl = c2; break;
        case 'c':
          c1 = [cur[0] + next(), cur[1] + next()]; c2 = [cur[0] + next(), cur[1] + next()]; p = [cur[0] + next(), cur[1] + next()];
          cubic(cur, c1, c2, p, curveSteps, pts); cur = p; lastCtrl = c2; break;
        case 'S': case 's':
          c1 = (lastCtrl && /[CcSs]/.test(lastCmd)) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
          if (cmd === 'S') { c2 = [next(), next()]; p = [next(), next()]; }
          else { c2 = [cur[0] + next(), cur[1] + next()]; p = [cur[0] + next(), cur[1] + next()]; }
          cubic(cur, c1, c2, p, curveSteps, pts); cur = p; lastCtrl = c2; break;
        case 'Q': c1 = [next(), next()]; p = [next(), next()]; quad(cur, c1, p, curveSteps, pts); cur = p; lastCtrl = c1; break;
        case 'q': c1 = [cur[0] + next(), cur[1] + next()]; p = [cur[0] + next(), cur[1] + next()]; quad(cur, c1, p, curveSteps, pts); cur = p; lastCtrl = c1; break;
        case 'T': case 't':
          c1 = (lastCtrl && /[QqTt]/.test(lastCmd)) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
          p = cmd === 'T' ? [next(), next()] : [cur[0] + next(), cur[1] + next()];
          quad(cur, c1, p, curveSteps, pts); cur = p; lastCtrl = c1; break;
        case 'Z': case 'z': cur = start; pts.push(cur); lastCtrl = null; break;
        default: i++; break; // 未対応コマンドはスキップ
      }
      lastCmd = cmd;
    }
    return pts;
  }

  /** KanjiVG の SVG テキストから、画順に並んだ path の d 属性配列を取り出す */
  function extractKanjiVGStrokes(svgText) {
    var re = /<path\b([^>]*)\/?>/g;
    var m, list = [];
    while ((m = re.exec(svgText)) !== null) {
      var attrs = m[1];
      var idm = /id="kvg:[0-9a-f]+-s(\d+)"/.exec(attrs);
      var dm = /\bd="([^"]+)"/.exec(attrs);
      if (idm && dm) list.push({ n: parseInt(idm[1], 10), d: dm[1] });
    }
    list.sort(function (a, b) { return a.n - b.n; });
    return list.map(function (x) { return x.d; });
  }

  var SvgPath = { tokenize: tokenize, pathToPoints: pathToPoints, extractKanjiVGStrokes: extractKanjiVGStrokes };
  if (typeof module !== 'undefined' && module.exports) module.exports = SvgPath;
  else root.SvgPath = SvgPath;
})(typeof window !== 'undefined' ? window : this);
