'use strict';
/* =========================================================
   app-patterns.js — Part 3「模様をつくる数学」/ Part 4「動きをつくる数学」
   app.js の後に読み込む（makeViz / register / animators / lessons を使う）
   ========================================================= */

/* ---------- 共通ヘルパー ---------- */
const secIdx = id => { const c = document.getElementById(id); if (!c) return -1; return lessons.indexOf(c.closest('section.lesson')); };
const fract = x => x - Math.floor(x);
const smooth01 = (x, lo, hi) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const hashf = seed => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hash2 = (ix, iy, seed = 0) => hashf(ix * 1.7 + iy * 113.3 + seed * 7.9);
function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}
function fbm(x, y, oct = 3, seed = 0) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += vnoise(x * f, y * f, seed + i * 3) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
function hsl2rgb(h, s, l) {
  h = fract(h);
  const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
  return [f(0), f(8), f(4)];
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const PAL = { bg: [24, 43, 54], dark: [16, 30, 40], blue: [44, 169, 225], yellow: [255, 209, 102], pink: [255, 107, 157], green: [110, 231, 183], white: [238, 243, 246], purple: [196, 181, 253] };
const rgbs = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

function slider(id, onChange, fmtFn = v => String(v)) {
  const el = document.getElementById(id); if (!el) return null;
  const out = document.getElementById(id + '-v');
  const upd = () => { if (out) out.textContent = fmtFn(+el.value); };
  el.addEventListener('input', () => { upd(); onChange(+el.value); });
  upd(); return el;
}
function modeButtons(containerId, onChange) {
  const c = document.getElementById(containerId); if (!c) return;
  $$('.btn', c).forEach(b => b.addEventListener('click', () => { $$('.btn', c).forEach(x => x.classList.remove('active')); b.classList.add('active'); onChange(b.dataset); }));
}
function checkbox(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('change', () => onChange(el.checked)); return el; }

// 低解像度で 1 ピクセルずつ計算して、拡大表示する viz
function makePixelViz(id, pw, ph, shade, overlay, extra = {}) {
  const W = extra.w || 640, H = extra.h || 400;
  const off = document.createElement('canvas'); off.width = pw; off.height = ph;
  const octx = off.getContext('2d'); const img = octx.createImageData(pw, ph);
  const unit = extra.unit || H / 2, ox = extra.ox ?? W / 2, oy = extra.oy ?? H / 2;
  return makeViz(id, {
    w: W, h: H, unit, ox, oy, onClick: extra.onClick,
    draw(v) {
      const d = img.data;
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const px = (x + 0.5) * W / pw, py = (y + 0.5) * H / ph;
        const c = shade((px - ox) / unit, (oy - py) / unit, x, y);
        const o = (y * pw + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      v.ctx.imageSmoothingEnabled = extra.smooth !== false;
      v.ctx.drawImage(off, 0, 0, W, H);
      if (overlay) overlay(v);
    },
  });
}

/* =========================================================
   P1 乱数
   ========================================================= */
(function () {
  const S = { seed: 3 };
  const v = makeViz('c-rand', {
    w: 640, h: 300, unit: 1, ox: 0, oy: 300,
    draw(v) {
      let i = 0;
      for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++, i++) {
        const r = 4 + hashf(i + S.seed) * 16;
        const col3 = hsl2rgb(hashf(i + S.seed + 100), 0.7, 0.62);
        const p = { x: 40 + col * 51, y: 260 - row * 52 };
        v.point(p, rgbs(col3), r);
        v.text(String(i), p, 'rgba(238,243,246,0.45)', 0, 26, 'center', 10);
      }
      setHTML('r-rand', `seed = ${S.seed}\nrand(0 + seed) = ${fmt(hashf(0 + S.seed), 3)}   rand(1 + seed) = ${fmt(hashf(1 + S.seed), 3)}   rand(2 + seed) = ${fmt(hashf(2 + S.seed), 3)}\n点 i の大きさ = 4 + rand(i + seed) * 16     色 = rand(i + seed + 100) を色相に\n${hl('同じ seed → 同じ結果。')}「バラバラ」なのに再現できる`);
    },
  });
  if (!v) return;
  slider('s-seed', val => { S.seed = val; v.redraw(); });
  register(secIdx('c-rand'), v);
})();

/* =========================================================
   P2 ノイズ
   ========================================================= */
(function () {
  const S = { freq: 3, oct: 1, t: 0, play: false };
  const c1 = [26, 46, 60], c2 = [235, 240, 244];
  const v = makePixelViz('c-noise', 160, 100, (wx, wy) => {
    const n = fbm((wx + 1.6) * S.freq + S.t, (wy + 1) * S.freq, S.oct, 11);
    return mixc(c1, c2, n);
  }, v => {
    // 格子を薄く表示（freq が小さいとき）
    if (S.freq <= 4 && S.oct === 1) {
      const step = v.unit * 1 / S.freq * 2; // 1 格子 = 2 world units / freq
      v.ctx.save(); v.ctx.strokeStyle = 'rgba(44,169,225,0.35)'; v.ctx.lineWidth = 1;
      for (let x = -S.t * (v.unit * 2 / S.freq) % step; x < v.W; x += step) { v.ctx.beginPath(); v.ctx.moveTo(x, 0); v.ctx.lineTo(x, v.H); v.ctx.stroke(); }
      for (let y = 0; y < v.H; y += step) { v.ctx.beginPath(); v.ctx.moveTo(0, y); v.ctx.lineTo(v.W, y); v.ctx.stroke(); }
      v.ctx.restore();
      v.textPx('青い線 = 格子。格子点だけ rand、間は lerp', 12, 18, C.blue, 'left', 12);
    }
    const cx = fbm(1.6 * S.freq + S.t, 1 * S.freq, S.oct, 11);
    setHTML('r-noise', `freq = ${S.freq}   octaves = ${S.oct}   time = ${fmt(S.t)}\n中心の値: fbm(p.x * ${S.freq}, p.y * ${S.freq}, ${S.oct}) = ${hl(fmt(cx, 3))}   （0 = 暗、1 = 明）\n${S.oct === 1 ? '重ねる回数 1 = ただの「なめらかな乱数」。octaves を増やすと細部が足される' : `${S.oct} 回重ね: 強さ 0.5, 0.25, 0.125... で細かいノイズを足している`}`);
  }, { w: 640, h: 400 });
  if (!v) return;
  slider('s-nfreq', val => { S.freq = val; v.redraw(); });
  slider('s-noct', val => { S.oct = val; v.redraw(); });
  checkbox('k-nplay', on => { S.play = on; });
  animators.push({ section: secIdx('c-noise'), fn(dt) { if (S.play) { S.t += dt * 0.4; v.redraw(); } } });
  register(secIdx('c-noise'), v);
})();

/* =========================================================
   P3 タイリング
   ========================================================= */
(function () {
  const S = { mode: 'stripe', n: 6, w: 0.3 };
  const on = [255, 209, 102], offc = [26, 46, 60];
  const v = makePixelViz('c-tile', 160, 80, (wx, wy) => {
    const u = (wx + 2) / 4, vv = (wy + 1) / 2; // 0..1
    const n = S.n, w = S.w;
    const lx = fract(u * n), ly = fract(vv * n);
    const ix = Math.floor(u * n), iy = Math.floor(vv * n);
    let hit = false;
    if (S.mode === 'stripe') hit = lx < w * 2;
    else if (S.mode === 'checker') hit = (ix + iy) % 2 === 0;
    else if (S.mode === 'dots') hit = Math.hypot(lx - 0.5, ly - 0.5) < w;
    else if (S.mode === 'brick') { const shift = (iy % 2) * 0.5; const bx = fract(u * n + shift); hit = bx > w * 0.25 && bx < 1 - w * 0.25 && ly > w * 0.25 && ly < 1 - w * 0.25; }
    else if (S.mode === 'grid') hit = lx < w * 0.3 || ly < w * 0.3;
    return hit ? on : offc;
  }, null, { w: 640, h: 320, unit: 160, ox: 320, oy: 160 });
  if (!v) return;
  const CODE = {
    stripe: `const isOn = fract(uv.x * n) < ${'w'} * 2;            // 横方向だけ繰り返す`,
    checker: `const isOn = (floor(uv.x * n) + floor(uv.y * n)) % 2 === 0;   // タイル番号の和が偶数`,
    dots: `const local = { x: fract(uv.x * n), y: fract(uv.y * n) };\nconst isOn = length( sub(local, {x: 0.5, y: 0.5}) ) < r;   // タイル中心からの距離`,
    brick: `const shift = floor(uv.y * n) % 2 * 0.5;                 // 奇数段は半分ずらす\nconst local = { x: fract(uv.x * n + shift), y: fract(uv.y * n) };\nconst isOn = local.x > gap && local.x < 1 - gap && local.y > gap && local.y < 1 - gap;`,
    grid: `const isOn = fract(uv.x * n) < t || fract(uv.y * n) < t;   // タイルの端だけ`,
  };
  const upd = () => { v.redraw(); setHTML('r-tile', `n = ${S.n}   w / r = ${fmt(S.w)}\n${CODE[S.mode].replace(/w \* 2|< r|gap|< t/g, m => hl(m))}`); };
  modeButtons('tile-modes', d => { S.mode = d.m; upd(); });
  slider('s-tn', val => { S.n = val; upd(); });
  slider('s-tw', val => { S.w = val; upd(); }, val => fmt(val));
  register(secIdx('c-tile'), v); upd();
})();

/* =========================================================
   P4 距離関数
   ========================================================= */
(function () {
  const S = { mode: 'union', k: 0.3, c: { x: -0.4, y: 0.1 }, b: { x: 0.45, y: -0.1 } };
  const sdCircle = (p, c, r) => length(sub(p, c)) - r;
  const sdBox = (p, c, h) => { const dx = Math.abs(p.x - c.x) - h.x, dy = Math.abs(p.y - c.y) - h.y; return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0); };
  const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
  const combine = (a, b) => S.mode === 'union' ? Math.min(a, b) : S.mode === 'smin' ? smin(a, b, S.k) : S.mode === 'sub' ? Math.max(a, -b) : Math.max(a, b);
  const field = p => combine(sdCircle(p, S.c, 0.45), sdBox(p, S.b, { x: 0.42, y: 0.3 }));
  const v = makePixelViz('c-sdf', 160, 100, (wx, wy) => {
    const d = field({ x: wx, y: wy });
    const band = fract(Math.abs(d) * 5);
    const line = band < 0.08 ? 0.55 : 0;
    if (d < 0) return mixc(mixc([44, 169, 225], [20, 80, 120], clamp(-d * 2, 0, 1)), PAL.white, line);
    return mixc(mixc([26, 46, 60], [70, 100, 120], clamp(d * 0.8, 0, 1)), PAL.white, line * 0.6);
  }, v => {
    v.drawHandles();
    v.text('円', S.c, C.white, 0, -14, 'center', 12); v.text('四角', S.b, C.white, 0, -14, 'center', 12);
    const q = { x: 0, y: -0.75 };
    const dq = field(q); v.point(q, C.yellow, 4); v.text(`この点の距離 = ${fmt(dq)}`, q, C.yellow, 8, 12);
    const LABEL = { union: 'Math.min(circle, box)', smin: `smin(circle, box, ${fmt(S.k)})`, sub: 'Math.max(circle, -box)', inter: 'Math.max(circle, box)' };
    setHTML('r-sdf', `circle = sdCircle(p, ${vs(S.c, 1)}, 0.45)     box = sdBox(p, ${vs(S.b, 1)}, {x: 0.42, y: 0.3})\n${hl('d = ' + LABEL[S.mode])}\n黄色い点 p = ${vs(q)} での d = ${fmt(dq)} → ${dq < 0 ? '中（マイナス）' : '外（プラス）'}。白い線は「距離が 0.2 刻みの等高線」`);
  }, { w: 640, h: 400 });
  if (!v) return;
  v.handles.push({ get: () => S.c, set: p => { S.c = p; }, color: C.blue });
  v.handles.push({ get: () => S.b, set: p => { S.b = p; }, color: C.pink });
  modeButtons('sdf-modes', d => { S.mode = d.m; v.redraw(); });
  slider('s-sk', val => { S.k = val; v.redraw(); }, val => fmt(val));
  register(secIdx('c-sdf'), v);
})();

/* =========================================================
   P5 フォールオフ
   ========================================================= */
(function () {
  const S = { mode: 'smooth', r: 1.6, soft: 0.8, c: { x: 0, y: 0 } };
  const weight = d => {
    const lo = Math.max(0, S.r - S.soft), hi = S.r;
    if (S.mode === 'hard') return d < S.r ? 1 : 0;
    if (S.mode === 'linear') return 1 - clamp((d - lo) / Math.max(hi - lo, 1e-6), 0, 1);
    return 1 - smooth01(d, lo, hi);
  };
  const v = makeViz('c-falloff', {
    w: 640, h: 400, unit: 100, ox: 320, oy: 200,
    draw(v) {
      v.grid();
      for (let y = -1.8; y <= 1.8; y += 0.25) for (let x = -3; x <= 3; x += 0.25) {
        const p = { x, y }, d = length(sub(p, S.c)), w = weight(d);
        v.point(p, rgbs(mixc([60, 85, 100], PAL.yellow, w)), 3 + w * 5);
      }
      v.circle(S.c, S.r, 'rgba(255,255,255,0.5)', 1.5, [5, 5]);
      if (S.mode !== 'hard') v.circle(S.c, Math.max(0, S.r - S.soft), 'rgba(255,209,102,0.5)', 1.5, [3, 5]);
      v.drawHandles();
      const CODE = { linear: 'w = 1 - clamp((d - (r - soft)) / soft, 0, 1)      // fit(d, r-soft, r, 1, 0)', smooth: 'w = 1 - smoothstep01(d, r - soft, r)', hard: 'w = (d < r) ? 1 : 0' };
      const dp = 1.0, wp = weight(dp);
      setHTML('r-falloff', `center = ${vs(S.c)}   r = ${fmt(S.r)}   soft = ${fmt(S.soft)}\nd = length( sub(p, center) )\n${hl(CODE[S.mode])}\n例: 中心から距離 ${fmt(dp)} の点 → w = ${hl(fmt(wp, 3))}   （1 = 全部効く、0 = 効かない）`);
    },
  });
  if (!v) return;
  v.handles.push({ get: () => S.c, set: p => { S.c = p; }, color: C.yellow });
  modeButtons('fo-modes', d => { S.mode = d.m; v.redraw(); });
  slider('s-fr', val => { S.r = val; v.redraw(); }, val => fmt(val));
  slider('s-fs', val => { S.soft = val; v.redraw(); }, val => fmt(val));
  register(secIdx('c-falloff'), v);
})();

/* =========================================================
   P6 極座標
   ========================================================= */
(function () {
  const S = { mode: 'radial', k: 6, f: 4, rot: 0, play: false };
  const on = [255, 209, 102], offc = [26, 46, 60], mid = [44, 169, 225];
  const v = makePixelViz('c-polar', 160, 100, (wx, wy) => {
    const angle = Math.atan2(wy, wx) + S.rot, r = Math.hypot(wx, wy);
    let val;
    if (S.mode === 'radial') val = fract(angle / TAU * S.k) < 0.5 ? 1 : 0;
    else if (S.mode === 'rings') val = fract(r * S.f) < 0.5 ? 1 : 0;
    else if (S.mode === 'spiral') val = fract(angle / TAU * 1 + r * S.f * 0.5) < 0.5 ? 1 : 0;
    else if (S.mode === 'rose') { const rose = Math.abs(Math.cos(S.k * 0.5 * angle)); val = r < rose * 0.95 ? (r < rose * 0.9 ? 1 : 0.5) : 0; }
    else { const a = TAU / S.k; const dpoly = Math.cos(Math.floor(0.5 + angle / a) * a - angle) * r; val = dpoly < 0.7 ? (fract(dpoly * S.f) < 0.5 ? 1 : 0.5) : 0; }
    return val === 1 ? on : val === 0.5 ? mid : offc;
  }, v => {
    const CODE = {
      radial: 'isOn = fract(angle / (2 * PI) * k) < 0.5       // 角度を k 等分',
      rings: 'isOn = fract(r * f) < 0.5                        // 距離を繰り返す',
      spiral: 'isOn = fract(angle / (2 * PI) + r * f * 0.5) < 0.5   // 角度 + 距離 → ずれて渦になる',
      rose: 'isOn = r < abs( cos(k / 2 * angle) )             // 角度で半径が波打つ → 花びら',
      polygon: 'd = cos( round(angle / a) * a - angle ) * r     // a = 2PI / k。角度を k 個に丸めた向きへの投影\nisOn = d < 0.7                                     // 多角形の距離関数（前々章の仲間）',
    };
    setHTML('r-polar', `angle = atan2(p.y, p.x) ${S.rot ? `+ ${fmt(S.rot)}` : ''}     r = length(p)     k = ${S.k}   f = ${S.f}\n${hl(CODE[S.mode])}`);
  }, { w: 640, h: 400 });
  if (!v) return;
  modeButtons('polar-modes', d => { S.mode = d.m; v.redraw(); });
  slider('s-pk', val => { S.k = val; v.redraw(); });
  slider('s-pf', val => { S.f = val; v.redraw(); });
  checkbox('k-pplay', on => { S.play = on; });
  animators.push({ section: secIdx('c-polar'), fn(dt) { if (S.play) { S.rot += dt * 0.6; v.redraw(); } } });
  register(secIdx('c-polar'), v);
})();

/* =========================================================
   P7 波の重ね合わせ
   ========================================================= */
(function () {
  const S = { f: 8, t: 0, play: true, single: false, s1: { x: -0.6, y: 0 }, s2: { x: 0.6, y: 0 } };
  const lo = [20, 40, 60], hi = [220, 235, 245];
  const height = p => { let h = Math.sin(length(sub(p, S.s1)) * S.f - S.t); if (!S.single) h += Math.sin(length(sub(p, S.s2)) * S.f - S.t); return h; };
  const v = makePixelViz('c-wave', 160, 100, (wx, wy) => {
    const h = height({ x: wx, y: wy }), n = S.single ? 1 : 2;
    return mixc(lo, hi, (h + n) / (2 * n));
  }, v => {
    v.handles.forEach((h, i) => { if (i === 0 || !S.single) v.point(h.get(), C.yellow, 6, true); });
    const p = { x: 0, y: 0.5 }, h = height(p);
    v.point(p, C.pink, 4); v.text(`h = ${fmt(h)}`, p, C.pink, 8, -10);
    setHTML('r-wave', `time = ${fmt(S.t)}   f = ${S.f}\n${S.single ? 'h = sin(d1 * f - time)' : 'h = sin(d1 * f - time) + sin(d2 * f - time)'}    d1 = length(p - src1)${S.single ? '' : ', d2 = length(p - src2)'}\nピンクの点 p = ${vs(p)}: d1 = ${fmt(length(sub(p, S.s1)))}${S.single ? '' : `, d2 = ${fmt(length(sub(p, S.s2)))}`} → h = ${hl(fmt(h))}   ${S.single ? '' : '（-2〜2。0 付近が「打ち消し合い」）'}`);
  }, { w: 640, h: 400 });
  if (!v) return;
  v.handles.push({ get: () => S.s1, set: p => { S.s1 = p; }, color: C.yellow });
  v.handles.push({ get: () => S.s2, set: p => { S.s2 = p; }, color: C.yellow });
  slider('s-wf', val => { S.f = val; v.redraw(); });
  checkbox('k-wplay', on => { S.play = on; });
  checkbox('k-wsingle', on => { S.single = on; v.redraw(); });
  animators.push({ section: secIdx('c-wave'), fn(dt) { if (S.play) { S.t += dt * 3; v.redraw(); } } });
  register(secIdx('c-wave'), v);
})();

/* =========================================================
   P8 L-system
   ========================================================= */
(function () {
  const PRESETS = {
    plant: { axiom: 'X', rules: 'X=F+[[X]-X]-F[-FX]+X\nF=FF', angle: 25, gen: 5, max: 7 },
    tree: { axiom: 'F', rules: 'F=F[+F]F[-F]F', angle: 25.7, gen: 4, max: 5 },
    koch: { axiom: 'F', rules: 'F=F+F-F-F+F', angle: 90, gen: 3, max: 5 },
    snow: { axiom: 'F--F--F', rules: 'F=F+F--F+F', angle: 60, gen: 3, max: 5 },
    dragon: { axiom: 'FX', rules: 'X=X+YF+\nY=-FX-Y', angle: 90, gen: 10, max: 14 },
    sierp: { axiom: 'F-G-G', rules: 'F=F-G+F+G-F\nG=GG', angle: 120, gen: 5, max: 7 },
  };
  const S = { axiom: 'X', rules: PRESETS.plant.rules, angle: 25, gen: 5 };
  const axiomEl = $('#ls-axiom'), rulesEl = $('#ls-rules'), genEl = $('#s-lgen');
  if (!axiomEl) return;
  function parseRules(text) { const r = {}; text.split('\n').forEach(line => { const m = line.match(/^\s*(\S)\s*=\s*(.*)$/); if (m) r[m[1]] = m[2].trim(); }); return r; }
  function expand(axiom, rules, gen) {
    let s = axiom, capped = false;
    for (let g = 0; g < gen; g++) { let out = ''; for (const ch of s) out += rules[ch] ?? ch; if (out.length > 400000) { capped = true; break; } s = out; }
    return { text: s, capped };
  }
  function turtle(text, angleDeg) {
    const segs = []; const st = []; let x = 0, y = 0, a = Math.PI / 2, depth = 0;
    const d = angleDeg * Math.PI / 180;
    let minx = 0, maxx = 0, miny = 0, maxy = 0;
    for (const ch of text) {
      if (ch === 'F' || ch === 'G' || ch === 'A' || ch === 'B') { const nx = x + Math.cos(a), ny = y + Math.sin(a); segs.push(x, y, nx, ny, depth); x = nx; y = ny; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
      else if (ch === 'f') { x += Math.cos(a); y += Math.sin(a); }
      else if (ch === '+') a += d; else if (ch === '-') a -= d; else if (ch === '|') a += Math.PI;
      else if (ch === '[') { st.push(x, y, a); depth++; }
      else if (ch === ']') { if (st.length) { a = st.pop(); y = st.pop(); x = st.pop(); depth--; } }
    }
    return { segs, bbox: { minx, maxx, miny, maxy }, maxDepth: Math.max(1, depth) };
  }
  let cache = null;
  const v = makeViz('c-lsys', {
    w: 640, h: 440, unit: 1, ox: 0, oy: 440,
    draw(v) {
      const rules = parseRules(S.rules);
      const { text, capped } = expand(S.axiom, rules, S.gen);
      const t = turtle(text, S.angle);
      const bw = Math.max(t.bbox.maxx - t.bbox.minx, 1e-6), bh = Math.max(t.bbox.maxy - t.bbox.miny, 1e-6);
      const sc = Math.min((v.W - 40) / bw, (v.H - 40) / bh);
      const offx = (v.W - bw * sc) / 2 - t.bbox.minx * sc, offy = (v.H - bh * sc) / 2 - t.bbox.miny * sc;
      const ctx = v.ctx; const n = t.segs.length / 5;
      let maxD = 0; for (let i = 4; i < t.segs.length; i += 5) maxD = Math.max(maxD, t.segs[i]);
      ctx.save(); ctx.lineWidth = n > 20000 ? 0.7 : n > 3000 ? 1.2 : 2; ctx.lineCap = 'round';
      const byDepth = new Map();
      for (let i = 0; i < t.segs.length; i += 5) { const d = t.segs[i + 4]; if (!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d).push(i); }
      for (const [d, list] of byDepth) {
        const col = maxD === 0 ? PAL.green : hsl2rgb(0.33 - (d / (maxD + 1)) * 0.25, 0.7, 0.55 + (d / (maxD + 1)) * 0.15);
        ctx.strokeStyle = rgbs(col); ctx.beginPath();
        for (const i of list) { ctx.moveTo(offx + t.segs[i] * sc, v.H - (offy + t.segs[i + 1] * sc)); ctx.lineTo(offx + t.segs[i + 2] * sc, v.H - (offy + t.segs[i + 3] * sc)); }
        ctx.stroke();
      }
      ctx.restore();
      setHTML('r-lsys', `premise = "${S.axiom}"   rules = { ${Object.entries(rules).map(([k, r]) => `${k}: "${r}"`).join(', ')} }   angle = ${S.angle}°   generations = ${S.gen}\n文字列の長さ: ${hl(text.length.toLocaleString())} 文字${capped ? '（長すぎるので途中で打ち切り）' : ''}   線の本数: ${hl(n.toLocaleString())}\n先頭: "${text.slice(0, 70)}${text.length > 70 ? '…' : ''}"`);
    },
  });
  const apply = () => { S.axiom = axiomEl.value; S.rules = rulesEl.value; v.redraw(); };
  axiomEl.addEventListener('input', apply); rulesEl.addEventListener('input', apply);
  slider('s-lgen', val => { S.gen = val; v.redraw(); });
  const angEl = slider('s-lang', val => { S.angle = val; v.redraw(); }, val => `${val}°`);
  modeButtons('ls-presets', d => {
    const p = PRESETS[d.p]; axiomEl.value = p.axiom; rulesEl.value = p.rules; S.axiom = p.axiom; S.rules = p.rules;
    genEl.max = p.max; genEl.value = p.gen; S.gen = p.gen; $('#s-lgen-v').textContent = p.gen;
    angEl.value = p.angle; S.angle = p.angle; $('#s-lang-v').textContent = `${p.angle}°`;
    v.redraw();
  });
  register(secIdx('c-lsys'), v);
})();

/* =========================================================
   P9 再帰とフラクタル
   ========================================================= */
(function () {
  const S = { mode: 'tree', depth: 6, a: 0.45, jit: false };
  const v = makeViz('c-fractal', {
    w: 640, h: 420, unit: 1, ox: 0, oy: 0,
    draw(v) {
      const ctx = v.ctx; let count = 0; const j = (i, k) => S.jit ? (hashf(i * 7.3 + k) - 0.5) : 0;
      const L = (a, b, col, w = 1.5) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); count++; };
      if (S.mode === 'tree') {
        const tree = (p, ang, len, d, i) => {
          const e = { x: p.x + Math.cos(ang) * len, y: p.y - Math.sin(ang) * len };
          L(p, e, rgbs(hsl2rgb(0.08 + (S.depth - d) / (S.depth + 1) * 0.3, 0.6, 0.45 + (S.depth - d) / (S.depth + 1) * 0.25)), 1 + d * 0.8);
          if (d === 0) return;
          const spread = S.a + j(i, 1) * 0.4;
          tree(e, ang + spread, len * (0.7 + j(i, 2) * 0.15), d - 1, i * 2 + 1);
          tree(e, ang - spread, len * (0.7 + j(i, 3) * 0.15), d - 1, i * 2 + 2);
        };
        tree({ x: 320, y: 410 }, Math.PI / 2, 110, S.depth, 1);
        setHTML('r-fractal', `tree(pos, angle, len, depth = ${S.depth})   広がり = ${fmt(S.a)} ラジアン\n線の本数 = 2^0 + 2^1 + ... + 2^${S.depth} = ${hl(count)}   末端の枝 = 2^${S.depth} = ${2 ** S.depth}`);
      } else if (S.mode === 'koch') {
        const koch = (a, b, d, i) => {
          if (d === 0) { L(a, b, C.blue, 1.2); return; }
          const p1 = lerpVec(a, b, 1 / 3), p2 = lerpVec(a, b, 2 / 3), dir = sub(p2, p1);
          const h = (0.866 + j(i, 4) * 0.6) * (S.a / 0.45);
          const peak = add(lerpVec(a, b, 0.5), { x: dir.y * h, y: -dir.x * h });
          koch(a, p1, d - 1, i * 4 + 1); koch(p1, peak, d - 1, i * 4 + 2); koch(peak, p2, d - 1, i * 4 + 3); koch(p2, b, d - 1, i * 4 + 4);
        };
        const dd = Math.min(S.depth, 6), r = 170, cx = 320, cy = 230;
        const P = [0, 1, 2].map(k => ({ x: cx + Math.cos(-Math.PI / 2 + k * TAU / 3) * r, y: cy + Math.sin(-Math.PI / 2 + k * TAU / 3) * r }));
        koch(P[0], P[1], dd, 1); koch(P[1], P[2], dd, 2); koch(P[2], P[0], dd, 3);
        setHTML('r-fractal', `koch(a, b, depth = ${dd})   ${S.depth > 6 ? '（この図は 6 までで打ち切り）' : ''}   高さの倍率 = ${fmt(S.a / 0.45)}\n線の本数 = 3 * 4^${dd} = ${hl(count)}   周の長さは深さごとに 4/3 倍 → 無限に長くなるのに、面積は有限`);
      } else if (S.mode === 'sierp') {
        const sierp = (a, b, c, d, i) => {
          if (d === 0) { ctx.fillStyle = rgbs(hsl2rgb(0.55 + hashf(i) * 0.15, 0.6, 0.55)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill(); count++; return; }
          const ab = lerpVec(a, b, 0.5 + j(i, 5) * 0.2), bc = lerpVec(b, c, 0.5 + j(i, 6) * 0.2), ca = lerpVec(c, a, 0.5 + j(i, 7) * 0.2);
          sierp(a, ab, ca, d - 1, i * 3 + 1); sierp(ab, b, bc, d - 1, i * 3 + 2); sierp(ca, bc, c, d - 1, i * 3 + 3);
        };
        const dd = Math.min(S.depth, 7);
        sierp({ x: 320, y: 30 }, { x: 40, y: 400 }, { x: 600, y: 400 }, dd, 1);
        setHTML('r-fractal', `sierpinski(a, b, c, depth = ${dd})\n三角形の数 = 3^${dd} = ${hl(count)}   面積は深さごとに 3/4 倍 → 0 に近づく`);
      } else {
        const circ = (c, r, d, i) => {
          ctx.strokeStyle = rgbs(hsl2rgb(0.5 + d * 0.06, 0.6, 0.6)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.stroke(); count++;
          if (d === 0 || r < 2) return;
          const k = S.a + j(i, 8) * 0.1;
          circ({ x: c.x - r, y: c.y }, r * k, d - 1, i * 3 + 1); circ({ x: c.x + r, y: c.y }, r * k, d - 1, i * 3 + 2); circ({ x: c.x, y: c.y - r }, r * k, d - 1, i * 3 + 3);
        };
        circ({ x: 320, y: 250 }, 110, Math.min(S.depth, 7), 1);
        setHTML('r-fractal', `circles(center, r, depth = ${Math.min(S.depth, 7)})   縮小率 = ${fmt(S.a)}\n円の数 = ${hl(count)}   「円を描いて、左右上に ${fmt(S.a)} 倍の自分を呼ぶ」だけ`);
      }
    },
  });
  if (!v) return;
  modeButtons('fr-modes', d => { S.mode = d.m; v.redraw(); });
  slider('s-fd', val => { S.depth = val; v.redraw(); });
  slider('s-fa', val => { S.a = val; v.redraw(); }, val => fmt(val));
  checkbox('k-fjit', on => { S.jit = on; v.redraw(); });
  register(secIdx('c-fractal'), v);
})();

/* =========================================================
   P10 黄金角
   ========================================================= */
(function () {
  const S = { angle: 137.5, n: 500 };
  const v = makeViz('c-phyllo', {
    w: 640, h: 420, unit: 1, ox: 320, oy: 210,
    draw(v) {
      const a = S.angle * Math.PI / 180, spacing = 6.5;
      for (let i = 0; i < S.n; i++) {
        const ang = i * a, r = Math.sqrt(i) * spacing;
        const p = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
        v.point(p, rgbs(hsl2rgb(0.1 + i / S.n * 0.12, 0.8, 0.5 + i / S.n * 0.2)), 2.2 + Math.sqrt(i / S.n) * 3.2);
      }
      const isG = Math.abs(S.angle - 137.508) < 0.02;
      setHTML('r-phyllo', `angle = ${fmt(S.angle, 3)}°${isG ? hl('（黄金角）') : ''}   n = ${S.n}\nfor (i = 0; i < ${S.n}; i++) {\n  a = i * ${fmt(a, 4)};      // ラジアン\n  r = Math.sqrt(i) * ${spacing};\n  p = { x: cos(a) * r, y: sin(a) * r };\n}\n${isG ? '腕が見えず、均等に埋まる' : '角度が黄金角からずれると、腕（放射状の列）が現れて隙間ができる'}`);
    },
  });
  if (!v) return;
  const s = slider('s-ga', val => { S.angle = val; v.redraw(); }, val => `${fmt(val, 2)}°`);
  slider('s-gn', val => { S.n = val; v.redraw(); });
  $('#b-golden').addEventListener('click', () => { S.angle = 137.508; s.value = 137.5; $('#s-ga-v').textContent = '137.508°'; v.redraw(); });
  register(secIdx('c-phyllo'), v);
})();

/* =========================================================
   P11 ボロノイ
   ========================================================= */
(function () {
  const S = { mode: 'cells', n: 12, seeds: [], salt: 1 };
  const gen = () => { S.seeds = []; for (let i = 0; i < S.n; i++) S.seeds.push({ x: (hashf(i * 3 + S.salt) - 0.5) * 3.0, y: (hashf(i * 3 + 1 + S.salt) - 0.5) * 1.9 }); };
  gen();
  const cols = [];
  const v = makePixelViz('c-voro', 160, 100, (wx, wy) => {
    let f1 = 1e9, f2 = 1e9, bi = 0;
    for (let i = 0; i < S.seeds.length; i++) { const s = S.seeds[i]; const d = Math.hypot(wx - s.x, wy - s.y); if (d < f1) { f2 = f1; f1 = d; bi = i; } else if (d < f2) f2 = d; }
    if (S.mode === 'cells') { const e = f2 - f1 < 0.02 ? 0.5 : 0; return mixc(cols[bi], PAL.white, e); }
    if (S.mode === 'dist') return mixc(PAL.white, [20, 40, 60], clamp(f1 * 1.6, 0, 1));
    return mixc(PAL.white, [20, 40, 60], clamp((f2 - f1) * 4, 0, 1));
  }, v => {
    v.drawHandles();
    const CODE = { cells: 'color = palette[ nearest(p, seeds) ]              // 一番近い種の番号で塗る', dist: 'value = length( sub(p, seeds[nearest]) )         // F1: 一番近い種までの距離', edge: 'value = F2 - F1                                     // 2番目に近い距離との差。0 に近い所が境界' };
    setHTML('r-voro', `seeds = ${S.seeds.length} 個（白い点。ドラッグできます）\n${hl(CODE[S.mode])}\nnearpoint() / Voronoi Fracture がやっているのはこの距離の比べっこ`);
  }, { w: 640, h: 400 });
  if (!v) return;
  const rebuild = () => { cols.length = 0; for (let i = 0; i < S.seeds.length; i++) cols.push(hsl2rgb(hashf(i + 50), 0.45, 0.42)); v.handles.length = 0; S.seeds.forEach((s, i) => v.handles.push({ get: () => S.seeds[i], set: p => { S.seeds[i] = p; }, color: C.white })); v.redraw(); };
  rebuild();
  modeButtons('voro-modes', d => { S.mode = d.m; v.redraw(); });
  slider('s-vn', val => { S.n = val; gen(); rebuild(); });
  $('#b-voro-rand').addEventListener('click', () => { S.salt += 7; gen(); rebuild(); });
  register(secIdx('c-voro'), v);
})();

/* =========================================================
   P12 セルオートマトン（ライフゲーム）
   ========================================================= */
(function () {
  const W = 64, H = 40, CELL = 10;
  const S = { cells: new Uint8Array(W * H), play: false, gen: 0, surv: [2, 3], born: [3], tick: 0 };
  const seedPattern = () => { S.cells.fill(0); S.gen = 0; const g = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]; g.forEach(([x, y]) => S.cells[(y + 3) * W + x + 3] = 1); for (let i = 0; i < 600; i++) { const x = 20 + Math.floor(hashf(i * 2 + 1) * 40), y = 5 + Math.floor(hashf(i * 2 + 2) * 30); S.cells[y * W + x] = 1; } };
  seedPattern();
  const v = makeViz('c-life', {
    w: 640, h: 400, unit: 1, ox: 0, oy: 400,
    onClick(p) { const x = Math.floor(p.x / CELL), y = Math.floor((400 - p.y) / CELL); if (x >= 0 && x < W && y >= 0 && y < H) S.cells[y * W + x] ^= 1; },
    draw(v) {
      const ctx = v.ctx; ctx.fillStyle = '#182b36'; ctx.fillRect(0, 0, v.W, v.H);
      ctx.fillStyle = C.green; let alive = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S.cells[y * W + x]) { ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2); alive++; }
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, v.H); ctx.stroke(); }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(v.W, y * CELL); ctx.stroke(); }
      setHTML('r-life', `世代 = ${S.gen}   生きているマス = ${alive}\n生き残り: 隣が [${S.surv.join(', ')}]   誕生: 隣が [${S.born.join(', ')}]\n各マス: n = 周り 8 マスの生きている数 → ${hl('alive ? surv.includes(n) : born.includes(n)')}`);
    },
  });
  if (!v) return;
  const step = () => {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = (x + dx + W) % W, yy = (y + dy + H) % H; n += S.cells[yy * W + xx]; }
      const a = S.cells[y * W + x];
      next[y * W + x] = a ? (S.surv.includes(n) ? 1 : 0) : (S.born.includes(n) ? 1 : 0);
    }
    S.cells = next; S.gen++;
  };
  const playBtn = $('#b-life-play');
  playBtn.addEventListener('click', () => { S.play = !S.play; playBtn.textContent = S.play ? '❚❚ 停止' : '▶ 再生'; });
  $('#b-life-step').addEventListener('click', () => { step(); v.redraw(); });
  $('#b-life-rand').addEventListener('click', () => { S.gen = 0; for (let i = 0; i < W * H; i++) S.cells[i] = hashf(i + S.tick * 0.37 + 9) < 0.35 ? 1 : 0; S.tick++; v.redraw(); });
  $('#b-life-clear').addEventListener('click', () => { S.cells.fill(0); S.gen = 0; v.redraw(); });
  $('#life-rule').addEventListener('change', e => { const [s, b] = e.target.value.split('/'); S.surv = [...s].map(Number); S.born = [...b].map(Number); v.redraw(); });
  animators.push({ section: secIdx('c-life'), fn() { if (!S.play) return; S.tick++; if (S.tick % 5 === 0) { step(); v.redraw(); } } });
  register(secIdx('c-life'), v);
})();

/* =========================================================
   P13 反応拡散（Gray-Scott）
   ========================================================= */
(function () {
  const W = 128, H = 80;
  const PRE = { coral: [0.0545, 0.062], spots: [0.03, 0.062], worms: [0.078, 0.061], mitosis: [0.0367, 0.0649], stripes: [0.025, 0.056] };
  const S = { u: new Float32Array(W * H), v: new Float32Array(W * H), feed: 0.0545, kill: 0.062, play: true, steps: 0 };
  const reset = () => {
    S.u.fill(1); S.v.fill(0); S.steps = 0;
    for (let k = 0; k < 6; k++) { const cx = 10 + Math.floor(hashf(k * 2 + 3) * (W - 20)), cy = 8 + Math.floor(hashf(k * 2 + 4) * (H - 16)); for (let y = cy - 3; y < cy + 3; y++) for (let x = cx - 3; x < cx + 3; x++) { S.v[y * W + x] = 1; S.u[y * W + x] = 0.5; } }
  };
  reset();
  const step = () => {
    const u = S.u, vv = S.v, nu = new Float32Array(W * H), nv = new Float32Array(W * H), f = S.feed, k = S.kill;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const xm = x === 0 ? W - 1 : x - 1, xp = x === W - 1 ? 0 : x + 1, ym = y === 0 ? H - 1 : y - 1, yp = y === H - 1 ? 0 : y + 1;
      const lu = (u[ym * W + x] + u[yp * W + x] + u[y * W + xm] + u[y * W + xp]) * 0.2 + (u[ym * W + xm] + u[ym * W + xp] + u[yp * W + xm] + u[yp * W + xp]) * 0.05 - u[i];
      const lv = (vv[ym * W + x] + vv[yp * W + x] + vv[y * W + xm] + vv[y * W + xp]) * 0.2 + (vv[ym * W + xm] + vv[ym * W + xp] + vv[yp * W + xm] + vv[yp * W + xp]) * 0.05 - vv[i];
      const uvv = u[i] * vv[i] * vv[i];
      nu[i] = clamp(u[i] + (1.0 * lu - uvv + f * (1 - u[i])), 0, 1);
      nv[i] = clamp(vv[i] + (0.5 * lv + uvv - (f + k) * vv[i]), 0, 1);
    }
    S.u = nu; S.v = nv; S.steps++;
  };
  const lo = [20, 40, 60], hi = [235, 240, 244];
  const v = makePixelViz('c-rd', W, H, (wx, wy, x, y) => mixc(lo, hi, clamp(S.v[y * W + x] * 2.2, 0, 1)), v => {
    setHTML('r-rd', `feed = ${fmt(S.feed, 4)}   kill = ${fmt(S.kill, 4)}   ステップ = ${S.steps}\nDu = 1.0（u はよくにじむ）  Dv = 0.5（v はにじみにくい → 塊になる）\n明るい所 = v が多い。${hl('ぼかし（拡散） + u*v*v（反応）')} だけでこの模様`);
  }, { w: 640, h: 400, onClick(p) { const x = Math.floor((p.x + 1.6) / 3.2 * W), y = Math.floor((1 - p.y) / 2 * H); for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) { const i = ((yy + H) % H) * W + ((xx + W) % W); S.v[i] = 1; S.u[i] = 0.5; } } });
  if (!v) return;
  const fEl = slider('s-rdf', val => { S.feed = val; }, val => fmt(val, 4));
  const kEl = slider('s-rdk', val => { S.kill = val; }, val => fmt(val, 4));
  modeButtons('rd-presets', d => { const [f, k] = PRE[d.p]; S.feed = f; S.kill = k; fEl.value = f; kEl.value = k; $('#s-rdf-v').textContent = fmt(f, 4); $('#s-rdk-v').textContent = fmt(k, 4); reset(); v.redraw(); });
  $('#b-rd-reset').addEventListener('click', () => { reset(); v.redraw(); });
  checkbox('k-rdplay', on => { S.play = on; });
  animators.push({ section: secIdx('c-rd'), fn() { if (!S.play) return; for (let i = 0; i < 10; i++) step(); v.redraw(); } });
  register(secIdx('c-rd'), v);
})();

/* =========================================================
   M1 速度と加速度
   ========================================================= */
(function () {
  const S = { g: 9.8, bounce: 0.8, wind: 0, balls: [] };
  const mk = (i) => ({ p: { x: 2 + hashf(i * 5 + 1) * 12, y: 5 + hashf(i * 5 + 2) * 4 }, v: { x: (hashf(i * 5 + 3) - 0.5) * 8, y: hashf(i * 5 + 4) * 4 }, r: 0.3 + hashf(i * 5 + 5) * 0.25, col: rgbs(hsl2rgb(hashf(i * 5 + 6), 0.7, 0.6)) });
  const reset = () => { S.balls = [0, 1, 2].map(mk); };
  reset(); let idc = 10;
  const v = makeViz('c-phys', {
    w: 640, h: 400, unit: 40, ox: 0, oy: 400,
    onClick(p) { const b = mk(idc++); b.p = p; S.balls.push(b); if (S.balls.length > 25) S.balls.shift(); },
    draw(v) {
      v.grid(); v.line({ x: 0, y: 0 }, { x: 16, y: 0 }, C.axis, 3);
      for (const b of S.balls) { v.point(b.p, b.col, b.r * v.unit); v.arrow(b.p, add(b.p, scale(b.v, 0.25)), 'rgba(255,255,255,0.7)', '', 2); }
      const b = S.balls[0];
      setHTML('r-phys', `gravity = {x: ${fmt(S.wind)}, y: ${fmt(-S.g)}}   bounce = ${fmt(S.bounce)}   dt = 1/60\nボール 0:  v = ${vs(b.v)}   p = ${vs(b.p)}\n毎フレーム: ${hl('v = add(v, scale(gravity, dt));  p = add(p, scale(v, dt));')}\n床に当たったら: v.y = -v.y * bounce`);
    },
  });
  if (!v) return;
  slider('s-pg', val => { S.g = val; }, val => fmt(val));
  slider('s-pb', val => { S.bounce = val; }, val => fmt(val));
  slider('s-pw', val => { S.wind = val; }, val => fmt(val));
  $('#b-phys-reset').addEventListener('click', () => { reset(); v.redraw(); });
  animators.push({ section: secIdx('c-phys'), fn(dt) {
    const h = Math.min(dt, 1 / 30);
    for (const b of S.balls) {
      b.v = add(b.v, scale({ x: S.wind, y: -S.g }, h)); b.p = add(b.p, scale(b.v, h));
      if (b.p.y < b.r) { b.p.y = b.r; b.v.y = -b.v.y * S.bounce; b.v.x *= 0.995; if (Math.abs(b.v.y) < 0.05) b.v.y = 0; }
      if (b.p.x < b.r) { b.p.x = b.r; b.v.x = -b.v.x * S.bounce; } if (b.p.x > 16 - b.r) { b.p.x = 16 - b.r; b.v.x = -b.v.x * S.bounce; }
      if (b.p.y > 10) { b.p.y = 10; b.v.y = -Math.abs(b.v.y) * S.bounce; }
    }
    v.redraw();
  } });
  register(secIdx('c-phys'), v);
})();

/* =========================================================
   M2 バネと減衰
   ========================================================= */
(function () {
  const S = { x: 1.0, v: 0, k: 80, c: 2, hist: [], t: 0 };
  const v = makeViz('c-spring', {
    w: 640, h: 300, unit: 100, ox: 220, oy: 150,
    draw(v) {
      const ctx = v.ctx;
      // 壁とバネ
      v.line({ x: -1.8, y: -0.8 }, { x: -1.8, y: 0.8 }, C.axis, 6);
      v.line({ x: -1.8, y: 0 }, { x: 1.6, y: 0 }, C.grid2, 2);
      const mx = S.x; const [x0] = v.px({ x: -1.8, y: 0 }), [x1] = v.px({ x: mx, y: 0 }); const cy = v.oy;
      ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, cy);
      const n = 14; for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(lerp(x0, x1, t), cy + (i % 2 ? -12 : 12)); } ctx.lineTo(x1, cy); ctx.stroke(); ctx.restore();
      v.line({ x: 0, y: -0.3 }, { x: 0, y: 0.3 }, 'rgba(255,255,255,0.3)', 1, [4, 4]); v.text('rest (x = 0)', { x: 0, y: -0.3 }, C.muted, 0, 14, 'center', 11);
      v.point({ x: mx, y: 0 }, C.blue, 16, true);
      // グラフ
      const gx = 420, gw = 200, gy = 150, amp = 55;
      v.textPx('x の時間変化 →', gx, 20, C.muted, 'left', 11);
      ctx.save(); ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.stroke();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath();
      S.hist.forEach((h, i) => { const x = gx + gw * i / 300, y = gy - clamp(h, -1.6, 1.6) * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      setHTML('r-spring', `stiffness k = ${S.k}   damping c = ${fmt(S.c)}\nx = ${fmt(S.x, 3)}   v = ${fmt(S.v)}\nspringForce = -k * x = ${fmt(-S.k * S.x)}     dampForce = -c * v = ${fmt(-S.c * S.v)}\n${hl('v += (springForce + dampForce) * dt;  x += v * dt;')}`);
    },
  });
  if (!v) return;
  v.handles.push({ get: () => ({ x: S.x, y: 0 }), set: p => { S.x = clamp(p.x, -1.5, 1.5); S.v = 0; }, color: C.blue });
  slider('s-sk2', val => { S.k = val; });
  slider('s-sd', val => { S.c = val; }, val => fmt(val));
  $('#b-spring-kick').addEventListener('click', () => { S.v += 6; });
  animators.push({ section: secIdx('c-spring'), fn(dt) {
    const h = Math.min(dt, 1 / 30); const sub = 4;
    for (let i = 0; i < sub; i++) { const f = -S.k * S.x - S.c * S.v; S.v += f * (h / sub); S.x += S.v * (h / sub); }
    S.x = clamp(S.x, -1.6, 1.6);
    S.hist.push(S.x); if (S.hist.length > 300) S.hist.shift();
    v.redraw();
  } });
  register(secIdx('c-spring'), v);
})();

/* =========================================================
   M3 ベジェ曲線
   ========================================================= */
(function () {
  const S = { P: [{ x: -2.4, y: -1.2 }, { x: -1.4, y: 1.4 }, { x: 1.2, y: 1.5 }, { x: 2.4, y: -1.0 }], t: 0.35, play: false, dir: 1, cons: true };
  const bez = t => { const [p0, p1, p2, p3] = S.P; const a = lerpVec(p0, p1, t), b = lerpVec(p1, p2, t), c = lerpVec(p2, p3, t); const d = lerpVec(a, b, t), e = lerpVec(b, c, t); return { a, b, c, d, e, p: lerpVec(d, e, t) }; };
  const v = makeViz('c-bezier', {
    w: 640, h: 400, unit: 100, ox: 320, oy: 200,
    draw(v) {
      v.grid();
      const [p0, p1, p2, p3] = S.P;
      v.line(p0, p1, 'rgba(255,255,255,0.25)', 1.5, [4, 4]); v.line(p1, p2, 'rgba(255,255,255,0.25)', 1.5, [4, 4]); v.line(p2, p3, 'rgba(255,255,255,0.25)', 1.5, [4, 4]);
      v.ctx.save(); v.ctx.strokeStyle = C.yellow; v.ctx.lineWidth = 3; v.ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const q = bez(i / 60).p; const [x, y] = v.px(q); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }
      v.ctx.stroke(); v.ctx.restore();
      const r = bez(S.t);
      if (S.cons) {
        v.line(r.a, r.b, C.purple, 1.5); v.line(r.b, r.c, C.purple, 1.5); v.point(r.a, C.purple, 4); v.point(r.b, C.purple, 4); v.point(r.c, C.purple, 4);
        v.line(r.d, r.e, C.green, 2); v.point(r.d, C.green, 5); v.point(r.e, C.green, 5);
      }
      v.point(r.p, C.yellow, 8, true); v.text(`bezier(t = ${fmt(S.t)})`, r.p, C.yellow, 12, -12);
      ['p0', 'p1', 'p2', 'p3'].forEach((n, i) => v.text(n, S.P[i], C.text, 0, i === 0 || i === 3 ? 18 : -16, 'center', 12));
      v.drawHandles();
      setHTML('r-bezier', `t = ${fmt(S.t)}\n1段目: a = lerp(p0, p1, t) = ${vs(r.a)}   b = lerp(p1, p2, t) = ${vs(r.b)}   c = lerp(p2, p3, t) = ${vs(r.c)}\n2段目: d = lerp(a, b, t) = ${vs(r.d)}   e = lerp(b, c, t) = ${vs(r.e)}\n3段目: ${hl(`p = lerp(d, e, t) = ${vs(r.p)}`)}`);
    },
  });
  if (!v) return;
  S.P.forEach((p, i) => v.handles.push({ get: () => S.P[i], set: q => { S.P[i] = q; }, color: i === 0 || i === 3 ? C.blue : C.pink }));
  const tEl = slider('s-bt', val => { S.t = val; v.redraw(); }, val => fmt(val));
  checkbox('k-bplay', on => { S.play = on; }); checkbox('k-bcons', on => { S.cons = on; v.redraw(); });
  animators.push({ section: secIdx('c-bezier'), fn(dt) { if (!S.play) return; S.t += dt * 0.4 * S.dir; if (S.t >= 1) { S.t = 1; S.dir = -1; } if (S.t <= 0) { S.t = 0; S.dir = 1; } tEl.value = S.t; $('#s-bt-v').textContent = fmt(S.t); v.redraw(); } });
  register(secIdx('c-bezier'), v);
})();

/* =========================================================
   M4 ベクトル場
   ========================================================= */
(function () {
  const S = { mode: 'noise', scale: 1, speed: 1.2, play: true, arrows: true, t: 0, pts: [] };
  const N = 500;
  const spawn = i => ({ x: (hashf(i * 2 + 0.5 + S.t) - 0.5) * 6.4, y: (hashf(i * 2 + 1.5 + S.t) - 0.5) * 4, life: 3 + hashf(i + 0.25 + S.t) * 4 });
  for (let i = 0; i < N; i++) S.pts.push(spawn(i));
  const nz = (x, y) => fbm(x * S.scale * 0.5 + 10, y * S.scale * 0.5 + 10 + S.t * 0.05, 3, 5);
  const field = p => {
    if (S.mode === 'noise') { const a = nz(p.x, p.y) * Math.PI * 4; return { x: Math.cos(a), y: Math.sin(a) }; }
    if (S.mode === 'curl') { const e = 0.02; const dx = (nz(p.x + e, p.y) - nz(p.x - e, p.y)) / (2 * e), dy = (nz(p.x, p.y + e) - nz(p.x, p.y - e)) / (2 * e); const c = { x: dy, y: -dx }; const l = length(c) || 1; return scale(c, Math.min(1, l) / l); }
    const toC = scale(p, -1); const tan = { x: -toC.y, y: toC.x }; return normalize(add(normalize(tan), scale(normalize(toC), 0.25)));
  };
  const trail = document.createElement('canvas'); trail.width = 640; trail.height = 400; const tctx = trail.getContext('2d');
  tctx.fillStyle = '#182b36'; tctx.fillRect(0, 0, 640, 400);
  const v = makeViz('c-flow', {
    w: 640, h: 400, unit: 100, ox: 320, oy: 200,
    draw(v) {
      v.ctx.drawImage(trail, 0, 0);
      if (S.arrows) for (let gy = -1.8; gy <= 1.8; gy += 0.4) for (let gx = -3; gx <= 3; gx += 0.4) { const p = { x: gx, y: gy }, d = field(p); v.arrow(p, add(p, scale(d, 0.18)), 'rgba(44,169,225,0.45)', '', 1.5); }
      const c = field({ x: 0.5, y: 0.3 });
      const CODE = { noise: 'angle = fbm(p * scale) * PI * 4;  dir = {x: cos(angle), y: sin(angle)}', curl: 'dir = { x: dNoise/dy, y: -dNoise/dx }        // ノイズの傾きを 90° 回す（curl）', swirl: 'dir = normalize( rotate90(toCenter) + toCenter * 0.25 )   // 回る + 少し中心へ' };
      setHTML('r-flow', `${hl(CODE[S.mode])}\n場所 {x: 0.5, y: 0.3} の矢印 = ${vs(c)}\n粒子: p = add(p, scale(field(p), speed * dt))   speed = ${fmt(S.speed)}`);
    },
  });
  if (!v) return;
  modeButtons('flow-modes', d => { S.mode = d.m; tctx.fillStyle = '#182b36'; tctx.fillRect(0, 0, 640, 400); v.redraw(); });
  slider('s-fsc', val => { S.scale = val; v.redraw(); }, val => fmt(val));
  slider('s-fsp', val => { S.speed = val; }, val => fmt(val));
  checkbox('k-fplay', on => { S.play = on; }); checkbox('k-farrows', on => { S.arrows = on; v.redraw(); });
  animators.push({ section: secIdx('c-flow'), fn(dt) {
    if (!S.play) return; const h = Math.min(dt, 1 / 30); S.t += h;
    tctx.fillStyle = 'rgba(24,43,54,0.12)'; tctx.fillRect(0, 0, 640, 400);
    tctx.fillStyle = C.yellow;
    for (let i = 0; i < N; i++) {
      const p = S.pts[i]; const d = field(p); p.x += d.x * S.speed * h; p.y += d.y * S.speed * h; p.life -= h;
      if (p.life <= 0 || Math.abs(p.x) > 3.3 || Math.abs(p.y) > 2.1) { S.pts[i] = spawn(i + S.t * 13); continue; }
      const [x, y] = v.px(p); tctx.fillRect(x - 1, y - 1, 2, 2);
    }
    v.redraw();
  } });
  register(secIdx('c-flow'), v);
})();
