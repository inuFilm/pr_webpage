'use strict';
/* =========================================================
   CGの数学を、数式なしで。  app.js
   - 小さなベクトル関数群
   - canvas 描画ヘルパー（ドラッグ対応）
   - 各章のインタラクティブ図
   - ナビ / クイズ / 進捗保存
   ========================================================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TAU = Math.PI * 2;
const C = {
  blue: '#2CA9E1', yellow: '#ffd166', pink: '#ff6b9d', green: '#6ee7b7', purple: '#c4b5fd',
  orange: '#ffa94d', muted: '#7d97a6', grid: '#2b4352', grid2: '#36525f', axis: '#4f6d7e',
  text: '#eef3f6', white: '#ffffff', red: '#ff6b6b',
};

/* ---------- ベクトル関数（教材のコードと同じ形） ---------- */
const O = { x: 0, y: 0 };
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (v, k) => ({ x: v.x * k, y: v.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross2d = (a, b) => a.x * b.y - a.y * b.x;
const length = v => Math.sqrt(dot(v, v));
const normalize = v => { const l = length(v); return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l }; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpVec = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const rotate = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
const transform = (m, p) => add(scale(m.i, p.x), scale(m.j, p.y));
const compose = (b, a) => ({ i: transform(b, a.i), j: transform(b, a.j) });
const snap = (p, s = 0.5) => ({ x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const deg = r => r * 180 / Math.PI;

// 3D
const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale3 = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len3 = v => Math.sqrt(dot3(v, v));
const norm3 = v => { const l = len3(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const rotY3 = (p, a) => ({ x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) });
const rotX3 = (p, a) => ({ x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) });

/* ---------- 数字の表示 ---------- */
function fmt(n, d = 2) {
  if (!isFinite(n)) return String(n);
  let r = Math.round(n * 10 ** d) / 10 ** d;
  if (Object.is(r, -0)) r = 0;
  return Number.isInteger(r) ? String(r) : String(r);
}
const vs = (v, d = 2) => `{x: ${fmt(v.x, d)}, y: ${fmt(v.y, d)}}`;
const vs3 = (v, d = 2) => `{x: ${fmt(v.x, d)}, y: ${fmt(v.y, d)}, z: ${fmt(v.z, d)}}`;
const hl = s => `<b>${s}</b>`;

/* ---------- canvas ヘルパー ---------- */
function makeViz(id, opts) {
  const c = document.getElementById(id);
  if (!c) return null;
  const W = opts.w || 640, H = opts.h || 400;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W * dpr; c.height = H * dpr;
  c.style.aspectRatio = `${W} / ${H}`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const unit = opts.unit || 40;
  const ox = opts.ox ?? W / 2, oy = opts.oy ?? H / 2;

  const v = {
    c, ctx, W, H, unit, ox, oy, handles: [],
    px(p) { return [ox + p.x * unit, oy - p.y * unit]; },
    world(mx, my) { return { x: (mx - ox) / unit, y: (oy - my) / unit }; },
    clear() { ctx.clearRect(0, 0, W, H); },
    grid(color = C.grid, m = null, width = 1) {
      const n = Math.ceil(Math.max(W, H) / unit) + 1;
      const tf = p => (m ? transform(m, p) : p);
      for (let k = -n; k <= n; k++) {
        v.line(tf({ x: k, y: -n }), tf({ x: k, y: n }), color, width);
        v.line(tf({ x: -n, y: k }), tf({ x: n, y: k }), color, width);
      }
    },
    axes(color = C.axis) {
      v.line({ x: -99, y: 0 }, { x: 99, y: 0 }, color, 1.5);
      v.line({ x: 0, y: -99 }, { x: 0, y: 99 }, color, 1.5);
    },
    line(a, b, color, width = 2, dash = null) {
      const [x1, y1] = v.px(a), [x2, y2] = v.px(b);
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    },
    arrow(from, to, color, label = '', width = 3, dash = null) {
      const [x1, y1] = v.px(from), [x2, y2] = v.px(to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      if (L < 1) { if (label) v.text(label, to, color); return; }
      const ux = dx / L, uy = dy / L, head = Math.min(12, L * 0.5);
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * head * 0.8, y2 - uy * head * 0.8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ux * head - uy * head * 0.5, y2 - uy * head + ux * head * 0.5);
      ctx.lineTo(x2 - ux * head + uy * head * 0.5, y2 - uy * head - ux * head * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (label) {
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const [mx, my] = v.px(mid);
        v.textPx(label, mx - uy * 14, my - ux * 14, color, 'center');
      }
    },
    point(p, color, r = 6, ring = false) {
      const [x, y] = v.px(p);
      ctx.save();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (ring) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke(); }
      ctx.restore();
    },
    poly(pts, fill, stroke, width = 2) {
      ctx.save();
      ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = v.px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.restore();
    },
    circle(center, r, stroke, width = 1.5, dash = null, fill = null) {
      const [x, y] = v.px(center);
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.arc(x, y, r * unit, 0, TAU);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
      ctx.restore();
    },
    text(str, p, color = C.text, dx = 10, dy = -10, align = 'left', size = 14) {
      const [x, y] = v.px(p);
      v.textPx(str, x + dx, y + dy, color, align, size);
    },
    textPx(str, x, y, color = C.text, align = 'left', size = 14, bold = true) {
      ctx.save();
      ctx.font = `${bold ? '600 ' : ''}${size}px Consolas, "Segoe UI", sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(24,43,54,0.9)'; ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      ctx.fillStyle = color; ctx.fillText(str, x, y);
      ctx.restore();
    },
    drawHandles() {
      for (const h of v.handles) v.point(h.get(), h.color || C.white, 6, true);
    },
    redraw() { v.clear(); opts.draw(v); },
  };

  // ドラッグ
  const pos = e => { const r = c.getBoundingClientRect(); return { mx: (e.clientX - r.left) * W / r.width, my: (e.clientY - r.top) * H / r.height }; };
  const hit = (mx, my) => {
    let best = null, bd = 18;
    for (const h of v.handles) { const [hx, hy] = v.px(h.get()); const d = Math.hypot(hx - mx, hy - my); if (d < bd) { bd = d; best = h; } }
    return best;
  };
  let active = null;
  c.addEventListener('pointerdown', e => {
    const { mx, my } = pos(e);
    active = hit(mx, my);
    if (active) { c.setPointerCapture(e.pointerId); e.preventDefault(); c.style.cursor = 'grabbing'; }
    else if (opts.onClick) { opts.onClick(v.world(mx, my), v); v.redraw(); }
  });
  c.addEventListener('pointermove', e => {
    const { mx, my } = pos(e);
    if (active) { active.set(v.world(clamp(mx, 8, W - 8), clamp(my, 8, H - 8))); v.redraw(); }
    else c.style.cursor = hit(mx, my) ? 'grab' : (opts.onClick ? 'pointer' : 'default');
  });
  const up = () => { active = null; c.style.cursor = 'default'; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  return v;
}

const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
const animators = []; // { section, fn } → 章が表示中のときだけ毎フレーム呼ぶ
const vizBySection = new Map(); // 章 → 描き直す viz の配列

function register(sectionIdx, v) {
  if (!v) return;
  if (!vizBySection.has(sectionIdx)) vizBySection.set(sectionIdx, []);
  vizBySection.get(sectionIdx).push(v);
}

/* =========================================================
   CHAPTER 1  ベクトル
   ========================================================= */
const L1 = { a: { x: 2, y: 1 }, b: { x: 1, y: 2 } };
const v1 = makeViz('c-vec', {
  unit: 40, oy: 260,
  draw(v) {
    v.grid(); v.axes();
    const s = add(L1.a, L1.b);
    v.arrow(O, L1.b, C.yellow, '', 2, [6, 6]);
    v.arrow(O, L1.a, C.blue, 'a');
    v.arrow(L1.a, s, C.yellow, 'b');
    v.arrow(O, s, C.green, 'a + b', 4);
    v.text(vs(s), s, C.green);
    v.drawHandles();
    setHTML('r-vec',
      `a = ${vs(L1.a)}\nb = ${vs(L1.b)}\n${hl('add(a, b)')} = {x: ${fmt(L1.a.x)} + ${fmt(L1.b.x)}, y: ${fmt(L1.a.y)} + ${fmt(L1.b.y)}} = ${hl(vs(s))}`);
  },
});
if (v1) {
  v1.handles.push({ get: () => L1.a, set: p => { L1.a = snap(p); }, color: C.blue });
  v1.handles.push({ get: () => add(L1.a, L1.b), set: p => { L1.b = snap(sub(p, L1.a)); }, color: C.yellow });
  register(1, v1);
}

const L1s = { v: { x: 2, y: 1 }, k: 1.5 };
const v1s = makeViz('c-scale', {
  unit: 40, h: 300,
  draw(v) {
    v.grid(); v.axes();
    const r = scale(L1s.v, L1s.k);
    v.arrow(O, r, C.yellow, `scale(v, ${fmt(L1s.k)})`, 5);
    v.arrow(O, L1s.v, C.blue, 'v', 3);
    v.drawHandles();
    setHTML('r-scale', `v = ${vs(L1s.v)}\n${hl(`scale(v, ${fmt(L1s.k)})`)} = {x: ${fmt(L1s.v.x)} * ${fmt(L1s.k)}, y: ${fmt(L1s.v.y)} * ${fmt(L1s.k)}} = ${hl(vs(r))}    長さ: ${fmt(length(L1s.v))} → ${fmt(length(r))}`);
  },
});
if (v1s) {
  v1s.handles.push({ get: () => L1s.v, set: p => { L1s.v = snap(p); }, color: C.blue });
  $('#s-k').addEventListener('input', e => { L1s.k = +e.target.value; $('#s-k-v').textContent = fmt(L1s.k); v1s.redraw(); });
  register(1, v1s);
}

/* =========================================================
   CHAPTER 2  長さと正規化
   ========================================================= */
const L2 = { v: { x: 3, y: 2 } };
const v2 = makeViz('c-len', {
  unit: 45, ox: 200, oy: 270,
  draw(v) {
    v.grid(); v.axes();
    v.circle(O, 1, C.muted, 1.5, [5, 5]);
    const p = L2.v, n = normalize(p), len = length(p);
    // 直角三角形
    v.poly([O, { x: p.x, y: 0 }, p], 'rgba(44,169,225,0.10)', null);
    v.line(O, { x: p.x, y: 0 }, C.orange, 3);
    v.line({ x: p.x, y: 0 }, p, C.pink, 3);
    v.text(`v.x = ${fmt(p.x)}`, { x: p.x / 2, y: 0 }, C.orange, 0, p.y >= 0 ? 16 : -16, 'center');
    v.text(`v.y = ${fmt(p.y)}`, { x: p.x, y: p.y / 2 }, C.pink, p.x >= 0 ? 12 : -12, 0, p.x >= 0 ? 'left' : 'right');
    v.arrow(O, p, C.blue, '', 3);
    v.text(`length = ${fmt(len)}`, { x: p.x / 2, y: p.y / 2 }, C.blue, -12 * Math.sign(p.y || 1) * Math.sign(p.x || 1), -14, 'center');
    v.arrow(O, n, C.yellow, '', 4);
    v.text(`normalize(v)`, n, C.yellow, 12, 12);
    v.drawHandles();
    setHTML('r-len',
      `v = ${vs(p)}\n${hl('length(v)')} = sqrt(${fmt(p.x)}*${fmt(p.x)} + ${fmt(p.y)}*${fmt(p.y)}) = sqrt(${fmt(p.x * p.x + p.y * p.y)}) = ${hl(fmt(len))}\n${hl('normalize(v)')} = {x: ${fmt(p.x)} / ${fmt(len)}, y: ${fmt(p.y)} / ${fmt(len)}} = ${hl(vs(n))}   ← 長さ ${fmt(length(n))}`);
  },
});
if (v2) { v2.handles.push({ get: () => L2.v, set: p => { L2.v = snap(p); }, color: C.blue }); register(2, v2); }

/* =========================================================
   CHAPTER 3  内積
   ========================================================= */
const L3 = { a: { x: 3, y: 1 }, b: { x: 1, y: 2.5 } };
const v3 = makeViz('c-dot', {
  unit: 45, oy: 260,
  draw(v) {
    v.grid(); v.axes();
    const a = L3.a, b = L3.b;
    const na = normalize(a), nb = normalize(b);
    const d = dot(a, b), nd = dot(na, nb);
    const ang = Math.acos(clamp(nd, -1, 1));
    // 射影
    const proj = scale(na, dot(b, na));
    v.line(b, proj, C.muted, 1.5, [5, 5]);
    v.line(O, proj, C.green, 6);
    // 角度の弧
    const [cx, cy] = v.px(O);
    const a0 = Math.atan2(-a.y, a.x), b0 = Math.atan2(-b.y, b.x);
    v.ctx.save(); v.ctx.strokeStyle = C.purple; v.ctx.lineWidth = 2;
    v.ctx.beginPath(); v.ctx.arc(cx, cy, 30, a0, b0, cross2d(a, b) > 0); v.ctx.stroke(); v.ctx.restore();
    v.arrow(O, a, C.blue, 'a');
    v.arrow(O, b, C.yellow, 'b');
    v.drawHandles();
    const verdict = nd > 0.9 ? 'ほぼ同じ向き' : nd > 0.3 ? 'だいたい同じ向き' : nd > -0.3 ? 'ほぼ直角（関係なし）' : nd > -0.9 ? 'だいたい逆向き' : 'ほぼ真逆';
    setHTML('r-dot',
      `a = ${vs(a)}   b = ${vs(b)}   角度: ${fmt(deg(ang), 0)}°\n${hl('dot(a, b)')} = ${fmt(a.x)}*${fmt(b.x)} + ${fmt(a.y)}*${fmt(b.y)} = ${hl(fmt(d))}\n${hl('dot(normalize(a), normalize(b))')} = ${hl(fmt(nd))}   ← -1〜1 の「同じ向き度」: ${verdict}\n緑の太線 = b を a に落とした影の長さ = dot(b, normalize(a)) = ${fmt(dot(b, na))}`);
  },
});
if (v3) {
  v3.handles.push({ get: () => L3.a, set: p => { L3.a = snap(p); }, color: C.blue });
  v3.handles.push({ get: () => L3.b, set: p => { L3.b = snap(p); }, color: C.yellow });
  register(3, v3);
}

// ランバート球
(function () {
  const c = document.getElementById('c-lambert');
  if (!c) return;
  const ctx = c.getContext('2d');
  const S = 240, img = ctx.createImageData(S, S);
  function draw() {
    const az = +$('#s-light').value * Math.PI / 180, el = +$('#s-elev').value * Math.PI / 180;
    const L = norm3({ x: Math.cos(az) * Math.cos(el), y: Math.sin(el), z: Math.sin(az) * Math.cos(el) });
    const d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const nx = (px - S / 2) / (S / 2 - 4), ny = (S / 2 - py) / (S / 2 - 4);
      const r2 = nx * nx + ny * ny, o = (py * S + px) * 4;
      if (r2 > 1) { d[o + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2);
      const b = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
      const k = 0.08 + 0.92 * b;
      d[o] = 44 * k; d[o + 1] = 169 * k; d[o + 2] = 225 * k; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // ライト方向の矢印
    ctx.save(); ctx.strokeStyle = C.yellow; ctx.fillStyle = C.yellow; ctx.lineWidth = 3;
    const cx = S / 2 + L.x * 100, cy = S / 2 - L.y * 100;
    ctx.beginPath(); ctx.arc(cx, cy, 6 + 4 * Math.max(0, L.z), 0, TAU); ctx.fill(); ctx.restore();
    const center = Math.max(0, L.z);
    setHTML('r-lambert', `lightDir = ${vs3(L)}   (黄色い点、z はこちら向き)\n球の中心: normal = {x: 0, y: 0, z: 1}\n  brightness = max(0, dot(normal, lightDir)) = max(0, ${fmt(L.z)}) = ${hl(fmt(center))}`);
  }
  $('#s-light').addEventListener('input', draw);
  $('#s-elev').addEventListener('input', draw);
  draw();
})();

/* =========================================================
   CHAPTER 4  外積
   ========================================================= */
const L4 = { a: { x: 3, y: 0.5 }, b: { x: 1, y: 2.5 } };
const v4 = makeViz('c-cross', {
  unit: 45, oy: 260,
  draw(v) {
    v.grid(); v.axes();
    const a = L4.a, b = L4.b, cr = cross2d(a, b);
    v.poly([O, a, add(a, b), b], cr >= 0 ? 'rgba(110,231,183,0.18)' : 'rgba(255,107,157,0.18)', cr >= 0 ? C.green : C.pink, 1.5);
    v.arrow(a, add(a, b), C.yellow, '', 2, [5, 5]);
    v.arrow(b, add(a, b), C.blue, '', 2, [5, 5]);
    v.arrow(O, a, C.blue, 'a');
    v.arrow(O, b, C.yellow, 'b');
    const [mx, my] = v.px(scale(add(a, b), 0.5));
    v.textPx(`面積 = ${fmt(Math.abs(cr))}`, mx, my, cr >= 0 ? C.green : C.pink, 'center');
    v.drawHandles();
    const side = Math.abs(cr) < 0.01 ? '平行（0）' : cr > 0 ? 'プラス → b は a の左側（反時計回り）' : 'マイナス → b は a の右側（時計回り）';
    setHTML('r-cross', `a = ${vs(a)}   b = ${vs(b)}\n${hl('cross2d(a, b)')} = ${fmt(a.x)}*${fmt(b.y)} - ${fmt(a.y)}*${fmt(b.x)} = ${hl(fmt(cr))}\n符号: ${side}\n大きさ: 平行四辺形の面積 = ${fmt(Math.abs(cr))}（三角形なら ${fmt(Math.abs(cr) / 2)}）`);
  },
});
if (v4) {
  v4.handles.push({ get: () => L4.a, set: p => { L4.a = snap(p); }, color: C.blue });
  v4.handles.push({ get: () => L4.b, set: p => { L4.b = snap(p); }, color: C.yellow });
  register(4, v4);
}

// 3D 三角形と法線
const L4d = { t: 0.6, spin: true };
const v4d = makeViz('c-cross3d', {
  unit: 1, h: 360,
  draw(v) {
    const A = { x: -1.2, y: -0.7, z: 0.3 }, B = { x: 1.2, y: -0.7, z: -0.2 }, Cc = { x: 0.1, y: 1.0, z: -0.3 };
    const rot = p => rotX3(rotY3(p, L4d.t), 0.35);
    const dist = 4.2, focal = 330;
    const proj = p => { const q = rot(p); const z = q.z + dist; return { x: q.x / z * focal, y: q.y / z * focal }; };
    const n = norm3(cross3(sub3(B, A), sub3(Cc, A)));
    const nr = norm3(rot(n));
    const centroid = scale3(add3(add3(A, B), Cc), 1 / 3);
    const toCam = norm3(sub3({ x: 0, y: 0, z: -dist }, rot(centroid)));
    const facing = dot3(nr, toCam);
    const bright = Math.abs(facing);
    const fill = facing >= 0 ? `rgba(44,169,225,${0.15 + 0.7 * bright})` : `rgba(255,107,107,${0.15 + 0.7 * bright})`;
    // 薄い床のグリッド
    for (let k = -2; k <= 2; k++) {
      v.line(proj({ x: k, y: -1.2, z: -2 }), proj({ x: k, y: -1.2, z: 2 }), C.grid2, 1);
      v.line(proj({ x: -2, y: -1.2, z: k }), proj({ x: 2, y: -1.2, z: k }), C.grid2, 1);
    }
    v.poly([proj(A), proj(B), proj(Cc)], fill, facing >= 0 ? C.blue : C.red, 2);
    v.text('A', proj(A), C.text, -14, 10); v.text('B', proj(B), C.text, 8, 10); v.text('C', proj(Cc), C.text, 6, -12);
    v.arrow(proj(A), proj(B), C.blue, '', 2, [4, 6]);
    v.arrow(proj(A), proj(Cc), C.yellow, '', 2, [4, 6]);
    v.arrow(proj(centroid), proj(add3(centroid, scale3(n, 1.1))), C.green, 'normal', 4);
    setHTML('r-cross3d',
      `AB = sub(B, A) = ${vs3(sub3(B, A), 1)}   AC = sub(C, A) = ${vs3(sub3(Cc, A), 1)}\n${hl('normal')} = normalize(cross(AB, AC)) = ${vs3(n)}\n${hl('dot(normal, カメラへの向き)')} = ${fmt(facing)}  → ${facing >= 0 ? '表（描く）' : '裏（バックフェース。カリングなら描かない）'}   明るさ ${fmt(bright)}`);
  },
});
if (v4d) {
  $('#k-spin').addEventListener('change', e => { L4d.spin = e.target.checked; });
  animators.push({ section: 4, fn(dt) { if (L4d.spin) { L4d.t += dt * 0.6; v4d.redraw(); } } });
  register(4, v4d);
}

/* =========================================================
   CHAPTER 5  sin / cos
   ========================================================= */
const L5 = { ang: 45, play: false };
const v5 = makeViz('c-circle', {
  unit: 1, h: 360, ox: 0, oy: 360,
  draw(v) {
    const a = L5.ang * Math.PI / 180;
    const cx = 160, cy = 180, R = 115;
    const P = p => ({ x: cx + p.x * R, y: cy + p.y * R }); // 単位円座標 → px（y 上向き）
    v.line(P({ x: -1.3, y: 0 }), P({ x: 1.3, y: 0 }), C.axis, 1.5);
    v.line(P({ x: 0, y: -1.3 }), P({ x: 0, y: 1.3 }), C.axis, 1.5);
    v.ctx.save(); v.ctx.strokeStyle = C.muted; v.ctx.lineWidth = 1.5; v.ctx.setLineDash([5, 5]);
    v.ctx.beginPath(); v.ctx.arc(cx, 360 - cy, R, 0, TAU); v.ctx.stroke(); v.ctx.restore();
    const p = { x: Math.cos(a), y: Math.sin(a) };
    // 角度の弧
    v.ctx.save(); v.ctx.strokeStyle = C.purple; v.ctx.lineWidth = 2.5;
    v.ctx.beginPath(); v.ctx.arc(cx, 360 - cy, 32, 0, -a, true); v.ctx.stroke(); v.ctx.restore();
    v.textPx('angle', cx + 44 * Math.cos(a / 2), 360 - cy - 44 * Math.sin(a / 2), C.purple, 'center', 12);
    v.line(P(p), P({ x: p.x, y: 0 }), C.yellow, 2, [4, 4]);
    v.line(P(p), P({ x: 0, y: p.y }), C.blue, 2, [4, 4]);
    v.line(P(O), P({ x: p.x, y: 0 }), C.blue, 5);
    v.line(P({ x: p.x, y: 0 }), P(p), C.yellow, 5);
    v.arrow(P(O), P(p), C.green, '', 3);
    v.point(P(p), C.green, 6, true);
    v.text(`cos = ${fmt(p.x)}`, P({ x: p.x / 2, y: 0 }), C.blue, 0, p.y >= 0 ? 16 : -16, 'center');
    v.text(`sin = ${fmt(p.y)}`, P({ x: p.x, y: p.y / 2 }), C.yellow, p.x >= 0 ? 10 : -10, 0, p.x >= 0 ? 'left' : 'right');
    v.textPx('{x: cos(angle), y: sin(angle)}', cx, 360 - 22, C.green, 'center', 13);
    // 波グラフ
    const gx = 330, gw = 290, gy = 180, amp = 80;
    v.line({ x: gx, y: gy }, { x: gx + gw, y: gy }, C.axis, 1.5);
    v.line({ x: gx, y: gy - amp - 10 }, { x: gx, y: gy + amp + 10 }, C.axis, 1.5);
    for (let k = 1; k <= 4; k++) { const x = gx + gw * k / 4; v.line({ x, y: gy - 4 }, { x, y: gy + 4 }, C.axis, 1.5); v.textPx(`${k * 90}°`, x, 360 - (gy + amp + 22), C.muted, 'center', 11); }
    const plot = (f, color) => {
      v.ctx.save(); v.ctx.strokeStyle = color; v.ctx.lineWidth = 2.5; v.ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const t = i / 120, x = gx + gw * t, y = 360 - (gy + f(t * TAU) * amp); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }
      v.ctx.stroke(); v.ctx.restore();
    };
    plot(Math.cos, C.blue); plot(Math.sin, C.yellow);
    const tx = gx + gw * (a / TAU);
    v.line({ x: tx, y: gy - amp - 6 }, { x: tx, y: gy + amp + 6 }, C.purple, 1.5, [4, 4]);
    v.point({ x: tx, y: gy + p.x * amp }, C.blue, 5); v.point({ x: tx, y: gy + p.y * amp }, C.yellow, 5);
    v.textPx('青 = x = cos', gx + 6, 360 - (gy - amp - 6), C.blue, 'left', 12);
    v.textPx('黄 = y = sin', gx + 110, 360 - (gy - amp - 6), C.yellow, 'left', 12);
    setHTML('r-circle', `角度 = ${fmt(L5.ang, 0)}°  = ${fmt(L5.ang, 0)} * PI / 180 = ${hl(fmt(a) + ' ラジアン')}\nx = Math.cos(angle) = ${hl(fmt(p.x))}\ny = Math.sin(angle) = ${hl(fmt(p.y))}\n確認: length({x, y}) = sqrt(${fmt(p.x * p.x)} + ${fmt(p.y * p.y)}) = 1  ← いつも長さ 1`);
  },
});
if (v5) {
  const s = $('#s-ang');
  s.addEventListener('input', e => { L5.ang = +e.target.value; $('#s-ang-v').textContent = `${L5.ang}°`; v5.redraw(); });
  $('#k-ang-play').addEventListener('change', e => { L5.play = e.target.checked; });
  animators.push({ section: 5, fn(dt) { if (L5.play) { L5.ang = (L5.ang + dt * 60) % 360; s.value = L5.ang; $('#s-ang-v').textContent = `${fmt(L5.ang, 0)}°`; v5.redraw(); } } });
  register(5, v5);
}

/* =========================================================
   CHAPTER 6  行列
   ========================================================= */
const L6 = { m: { i: { x: 1, y: 0 }, j: { x: 0, y: 1 } }, p: { x: 1.5, y: 1 }, anim: null };
const HOUSE = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1.5 }, { x: 1, y: 2.4 }, { x: 0, y: 1.5 }];
const DOOR = [{ x: 0.8, y: 0 }, { x: 1.2, y: 0 }, { x: 1.2, y: 0.8 }, { x: 0.8, y: 0.8 }];
const PRESETS = {
  id: { i: { x: 1, y: 0 }, j: { x: 0, y: 1 } },
  rot: { i: { x: Math.cos(Math.PI / 4), y: Math.sin(Math.PI / 4) }, j: { x: -Math.sin(Math.PI / 4), y: Math.cos(Math.PI / 4) } },
  scl: { i: { x: 2, y: 0 }, j: { x: 0, y: 0.5 } },
  shr: { i: { x: 1, y: 0 }, j: { x: 1, y: 1 } },
  flip: { i: { x: -1, y: 0 }, j: { x: 0, y: 1 } },
};
PRESETS.rs = compose(PRESETS.scl, PRESETS.rot); // 先に回転、次に拡大
PRESETS.sr = compose(PRESETS.rot, PRESETS.scl); // 先に拡大、次に回転
const v6 = makeViz('c-mat', {
  unit: 44, h: 420, oy: 260,
  draw(v) {
    const m = L6.m;
    v.grid(C.grid);
    v.axes(C.grid2);
    v.grid('rgba(44,169,225,0.35)', m);
    v.poly(HOUSE, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.18)', 1.5);
    v.poly(HOUSE.map(p => transform(m, p)), 'rgba(44,169,225,0.22)', C.blue, 2.5);
    v.poly(DOOR.map(p => transform(m, p)), 'rgba(255,209,102,0.5)', null);
    v.arrow(O, m.i, C.green, 'i', 4);
    v.arrow(O, m.j, C.pink, 'j', 4);
    const q = transform(m, L6.p);
    v.point(L6.p, 'rgba(196,181,253,0.5)', 5);
    v.line(L6.p, q, C.purple, 1.5, [4, 5]);
    v.point(q, C.purple, 7);
    v.text(`transform(m, p) = ${vs(q)}`, q, C.purple, 12, -12);
    v.text('p', L6.p, 'rgba(196,181,253,0.7)', -14, 12);
    v.drawHandles();
    const det = cross2d(m.i, m.j);
    const detNote = Math.abs(det) < 0.01 ? '潰れている（面積 0）' : det < 0 ? `面積 ${fmt(Math.abs(det))} 倍で、裏返っている` : `面積 ${fmt(det)} 倍`;
    setHTML('r-mat',
      `m = { i: ${vs(m.i)},  j: ${vs(m.j)} }\np = ${vs(L6.p)}\n${hl('transform(m, p)')} = add( scale(i, ${fmt(L6.p.x)}), scale(j, ${fmt(L6.p.y)}) ) = ${hl(vs(q))}\n${hl('det')} = cross2d(m.i, m.j) = ${fmt(det)}  → ${detNote}`);
  },
});
if (v6) {
  v6.handles.push({ get: () => L6.m.i, set: p => { L6.m.i = snap(p, 0.25); L6.anim = null; }, color: C.green });
  v6.handles.push({ get: () => L6.m.j, set: p => { L6.m.j = snap(p, 0.25); L6.anim = null; }, color: C.pink });
  v6.handles.push({ get: () => L6.p, set: p => { L6.p = snap(p); }, color: C.purple });
  $$('#mat-presets .btn').forEach(b => b.addEventListener('click', () => {
    $$('#mat-presets .btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
    const target = PRESETS[b.dataset.m];
    L6.anim = { from: { i: { ...L6.m.i }, j: { ...L6.m.j } }, to: target, t: 0 };
  }));
  animators.push({ section: 6, fn(dt) {
    if (!L6.anim) return;
    const a = L6.anim; a.t = Math.min(1, a.t + dt * 1.8);
    const e = a.t * a.t * (3 - 2 * a.t);
    L6.m = { i: lerpVec(a.from.i, a.to.i, e), j: lerpVec(a.from.j, a.to.j, e) };
    if (a.t >= 1) L6.anim = null;
    v6.redraw();
  } });
  register(6, v6);
}

/* =========================================================
   CHAPTER 7  3D と投影
   ========================================================= */
const v7 = makeViz('c-3d', {
  unit: 1, h: 400,
  draw(v) {
    const ry = +$('#s-ry').value * Math.PI / 180, rx = +$('#s-rx').value * Math.PI / 180;
    const dist = +$('#s-dist').value, focal = +$('#s-focal').value, ortho = $('#k-ortho').checked;
    const model = p => rotX3(rotY3(p, ry), rx);
    const view = p => ({ x: p.x, y: p.y, z: p.z + dist });
    const project = p => ortho ? { x: p.x * focal / 5, y: p.y * focal / 5 } : { x: p.x / p.z * focal, y: p.y / p.z * focal };
    const pipe = p => project(view(model(p)));
    // 床グリッド
    for (let k = -3; k <= 3; k++) {
      v.line(pipe({ x: k, y: -1.5, z: -3 }), pipe({ x: k, y: -1.5, z: 3 }), C.grid2, 1);
      v.line(pipe({ x: -3, y: -1.5, z: k }), pipe({ x: 3, y: -1.5, z: k }), C.grid2, 1);
    }
    const V = [];
    for (let i = 0; i < 8; i++) V.push({ x: (i & 1) ? 1 : -1, y: (i & 2) ? 1 : -1, z: (i & 4) ? 1 : -1 });
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const viewed = V.map(p => view(model(p)));
    const scr = viewed.map(project);
    E.forEach(([a, b]) => {
      const zz = (viewed[a].z + viewed[b].z) / 2;
      const alpha = ortho ? 0.9 : clamp(1.4 - (zz - dist) * 0.35, 0.3, 1);
      v.line(scr[a], scr[b], `rgba(44,169,225,${alpha})`, 2.5);
    });
    // 軸
    v.arrow(pipe({ x: 0, y: 0, z: 0 }), pipe({ x: 1.6, y: 0, z: 0 }), C.pink, 'x', 2);
    v.arrow(pipe({ x: 0, y: 0, z: 0 }), pipe({ x: 0, y: 1.6, z: 0 }), C.green, 'y', 2);
    v.arrow(pipe({ x: 0, y: 0, z: 0 }), pipe({ x: 0, y: 0, z: 1.6 }), C.yellow, 'z', 2);
    // 追跡する頂点
    const k = 7; v.point(scr[k], C.orange, 7, true); v.text('この頂点を追跡', scr[k], C.orange, 12, -12);
    const w = model(V[k]), vw = viewed[k], s = scr[k];
    setHTML('r-3d',
      `local  = ${vs3(V[k])}                          （立方体の自分の座標）\nworld  = rotate(local)        = ${vs3(w)}   （モデル → ワールド）\nview   = add(world, {z: ${fmt(dist)}}) = ${vs3(vw)}   （カメラを原点に。カメラは z = -${fmt(dist)} にいる）\n${hl('screen')} = ${ortho ? `{x: view.x * k, y: view.y * k}` : `{x: view.x / view.z * ${focal}, y: view.y / view.z * ${focal}}`} = ${hl(vs(s, 0))} px`);
  },
});
if (v7) {
  ['#s-ry', '#s-rx', '#s-dist', '#s-focal'].forEach(s => $(s).addEventListener('input', () => v7.redraw()));
  $('#k-ortho').addEventListener('change', () => v7.redraw());
  register(7, v7);
}

/* =========================================================
   CHAPTER 8  補間
   ========================================================= */
const EASES = {
  linear: t => t,
  smooth: t => t * t * (3 - 2 * t),
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  back: t => { const s = 1.70158; const u = t - 1; return 1 + u * u * ((s + 1) * u + s); },
};
const EASE_CODE = {
  linear: 't', smooth: 't * t * (3 - 2 * t)', in: 't * t', out: '1 - (1 - t) * (1 - t)', back: '1 + (t-1)*(t-1)*(2.7*(t-1) + 1.7)',
};
const L8 = { t: 0.3, ease: 'linear', play: false, dir: 1 };
const v8 = makeViz('c-lerp', {
  unit: 1, h: 330, ox: 0, oy: 330,
  draw(v) {
    const t = L8.t, e = EASES[L8.ease](t);
    // 1. 位置
    const A = { x: 60, y: 262 }, B = { x: 380, y: 262 };
    v.line(A, B, C.grid2, 4);
    v.point(A, C.blue, 7); v.point(B, C.yellow, 7);
    v.text('a', A, C.blue, 0, 22, 'center'); v.text('b', B, C.yellow, 0, 22, 'center');
    const P = lerpVec(A, B, e);
    v.point(P, C.green, 11); v.text(`lerp(a, b, ${fmt(e)})`, P, C.green, 0, -22, 'center');
    // 2. 色
    const c1 = { x: 44, y: 169, z: 225 }, c2 = { x: 255, y: 107, z: 157 };
    const g = v.ctx.createLinearGradient(60, 0, 380, 0);
    g.addColorStop(0, `rgb(${c1.x},${c1.y},${c1.z})`); g.addColorStop(1, `rgb(${c2.x},${c2.y},${c2.z})`);
    v.ctx.fillStyle = g; v.ctx.fillRect(60, 330 - 220, 320, 26);
    const col = { x: lerp(c1.x, c2.x, e), y: lerp(c1.y, c2.y, e), z: lerp(c1.z, c2.z, e) };
    const cx = lerp(60, 380, e);
    v.ctx.save(); v.ctx.fillStyle = `rgb(${col.x},${col.y},${col.z})`; v.ctx.strokeStyle = '#fff'; v.ctx.lineWidth = 2;
    v.ctx.beginPath(); v.ctx.arc(cx, 330 - 207, 14, 0, TAU); v.ctx.fill(); v.ctx.stroke(); v.ctx.restore();
    v.textPx('色も lerp（r, g, b をそれぞれ）', 60, 330 - 250, C.muted, 'left', 12);
    v.textPx('位置を lerp', 60, 16, C.muted, 'left', 12);
    // 3. グラフ
    const gx = 440, gy = 60, gs = 170;
    v.ctx.save(); v.ctx.fillStyle = 'rgba(255,255,255,0.03)'; v.ctx.fillRect(gx, 330 - gy - gs, gs, gs); v.ctx.restore();
    v.line({ x: gx, y: gy }, { x: gx + gs, y: gy }, C.axis, 1.5); v.line({ x: gx, y: gy }, { x: gx, y: gy + gs }, C.axis, 1.5);
    v.line({ x: gx, y: gy }, { x: gx + gs, y: gy + gs }, C.muted, 1, [3, 4]);
    v.ctx.save(); v.ctx.strokeStyle = C.purple; v.ctx.lineWidth = 2.5; v.ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const u = i / 60, x = gx + gs * u, y = 330 - (gy + gs * EASES[L8.ease](u)); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }
    v.ctx.stroke(); v.ctx.restore();
    v.line({ x: gx + gs * t, y: gy }, { x: gx + gs * t, y: gy + gs * e }, C.muted, 1, [3, 3]);
    v.line({ x: gx, y: gy + gs * e }, { x: gx + gs * t, y: gy + gs * e }, C.muted, 1, [3, 3]);
    v.point({ x: gx + gs * t, y: gy + gs * e }, C.purple, 6, true);
    v.textPx('t →', gx + gs / 2, 330 - gy + 16, C.muted, 'center', 12);
    v.textPx('曲げた t', gx - 8, 330 - gy - gs / 2, C.muted, 'right', 12);
    v.textPx(L8.ease, gx + gs / 2, 330 - gy - gs - 14, C.purple, 'center', 13);
    setHTML('r-lerp', `t = ${fmt(t)}  →  ${L8.ease}(t) = ${EASE_CODE[L8.ease]} = ${hl(fmt(e))}\n位置: lerp(${fmt(A.x)}, ${fmt(B.x)}, ${fmt(e)}) = ${fmt(A.x)} + (${fmt(B.x)} - ${fmt(A.x)}) * ${fmt(e)} = ${hl(fmt(P.x, 0))}\n色:   r = lerp(44, 255, ${fmt(e)}) = ${fmt(col.x, 0)}\n      g = lerp(169, 107, ${fmt(e)}) = ${fmt(col.y, 0)}\n      b = lerp(225, 157, ${fmt(e)}) = ${fmt(col.z, 0)}`);
  },
});
if (v8) {
  const s = $('#s-t');
  s.addEventListener('input', e => { L8.t = +e.target.value; $('#s-t-v').textContent = fmt(L8.t); v8.redraw(); });
  $('#k-t-play').addEventListener('change', e => { L8.play = e.target.checked; });
  $$('#ease-btns .btn').forEach(b => b.addEventListener('click', () => {
    $$('#ease-btns .btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
    L8.ease = b.dataset.e; v8.redraw();
  }));
  animators.push({ section: 8, fn(dt) {
    if (!L8.play) return;
    L8.t += dt * 0.5 * L8.dir;
    if (L8.t >= 1) { L8.t = 1; L8.dir = -1; } else if (L8.t <= 0) { L8.t = 0; L8.dir = 1; }
    s.value = L8.t; $('#s-t-v').textContent = fmt(L8.t); v8.redraw();
  } });
  register(8, v8);
}

/* =========================================================
   CHAPTER 9  LLM
   ========================================================= */
// 9-1 埋め込み
const WORDS = [
  { w: '男', v: { x: 1, y: 0.5 } }, { w: '女', v: { x: 1, y: 2.5 } },
  { w: '王', v: { x: 3.5, y: 0.5 } }, { w: '女王', v: { x: 3.5, y: 2.5 } },
  { w: '犬', v: { x: -3, y: -0.5 } }, { w: '猫', v: { x: -3.2, y: -1 } }, { w: '魚', v: { x: -2, y: -2 } },
  { w: 'りんご', v: { x: -0.5, y: 3 } }, { w: 'バナナ', v: { x: 0.5, y: 3.2 } },
  { w: '車', v: { x: 2, y: -2.5 } }, { w: '自転車', v: { x: 1.2, y: -3 } },
];
const L9 = { sel: [], analogy: false };
const v9 = makeViz('c-embed', {
  unit: 50, h: 400,
  onClick(p) {
    let best = null, bd = 0.5;
    for (const w of WORDS) { const d = length(sub(w.v, p)); if (d < bd) { bd = d; best = w; } }
    if (!best) return;
    L9.analogy = false;
    if (L9.sel.includes(best)) L9.sel = L9.sel.filter(x => x !== best);
    else { L9.sel.push(best); if (L9.sel.length > 2) L9.sel.shift(); }
  },
  draw(v) {
    v.grid(); v.axes();
    const byW = Object.fromEntries(WORDS.map(w => [w.w, w.v]));
    if (L9.analogy) {
      const king = byW['王'], man = byW['男'], woman = byW['女'];
      const step1 = sub(king, man), q = add(step1, woman);
      v.arrow(O, king, C.blue, '王', 3);
      v.arrow(king, step1, C.pink, '− 男', 3, [6, 5]);
      v.arrow(step1, q, C.green, '+ 女', 3, [6, 5]);
      v.circle(q, 0.35, C.yellow, 2.5);
      let best = null, bd = 1e9;
      for (const w of WORDS) { if (['王', '男', '女'].includes(w.w)) continue; const d = length(sub(w.v, q)); if (d < bd) { bd = d; best = w; } }
      setHTML('r-embed', `q = add( sub(vec("王"), vec("男")), vec("女") )\n  = add( ${vs(step1, 1)}, ${vs(woman, 1)} ) = ${hl(vs(q, 1))}\n一番近い単語（王・男・女 以外）: ${hl(best.w)}   距離 ${fmt(bd)}\n「王 − 男 + 女 ≈ 女王」: 意味の差（男→女）を、別の単語に足せる`);
    }
    for (const w of WORDS) {
      const sel = L9.sel.includes(w);
      v.point(w.v, sel ? C.yellow : C.blue, sel ? 8 : 6, sel);
      v.text(w.w, w.v, sel ? C.yellow : C.text, 10, -12);
    }
    if (!L9.analogy) {
      if (L9.sel.length >= 1) v.arrow(O, L9.sel[0].v, C.yellow, '', 2.5);
      if (L9.sel.length === 2) {
        v.arrow(O, L9.sel[1].v, C.yellow, '', 2.5);
        const [a, b] = L9.sel;
        const s = dot(normalize(a.v), normalize(b.v));
        const verdict = s > 0.9 ? 'かなり似ている' : s > 0.5 ? 'ある程度似ている' : s > -0.2 ? '関係が薄い' : '反対っぽい';
        setHTML('r-embed', `vec("${a.w}") = ${vs(a.v, 1)}   vec("${b.w}") = ${vs(b.v, 1)}\n${hl(`similarity("${a.w}", "${b.w}")`)} = dot( normalize(a), normalize(b) ) = ${hl(fmt(s))}  → ${verdict}\n（本物の LLM では、この x, y が 数千個 並んでいる。計算は同じ）`);
      } else if (L9.sel.length === 1) {
        setHTML('r-embed', `vec("${L9.sel[0].w}") = ${vs(L9.sel[0].v, 1)}\nもう1つ単語をクリックすると、似ている度を計算します`);
      } else {
        setHTML('r-embed', `単語を2つクリックしてください\n意味が近い単語（犬と猫、王と女王）は、近い場所・近い向きに置かれている`);
      }
    }
  },
});
if (v9) {
  $('#b-analogy').addEventListener('click', () => { L9.analogy = true; L9.sel = []; v9.redraw(); });
  $('#b-embed-clear').addEventListener('click', () => { L9.analogy = false; L9.sel = []; v9.redraw(); });
  register(9, v9);
}

// 9-2 attention
(function () {
  const wrap = $('#attn-tokens'); if (!wrap) return;
  const TOK = [
    { w: '猫', v: [1.0, 0.0, 0.3] }, { w: 'が', v: [0.0, 0.0, 1.0] }, { w: '魚', v: [0.9, 0.4, 0.2] },
    { w: 'を', v: [0.0, 0.0, 1.0] }, { w: '食べ', v: [0.7, 0.7, 0.0] }, { w: 'た', v: [0.0, 0.3, 0.9] },
  ];
  let q = 4;
  const dotN = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const softmax = xs => { const es = xs.map(x => Math.exp(x)); const sum = es.reduce((a, b) => a + b, 0); return es.map(e => e / sum); };
  TOK.forEach((t, i) => { const b = document.createElement('button'); b.className = 'tok'; b.textContent = t.w; b.addEventListener('click', () => { q = i; render(); }); wrap.appendChild(b); });
  const bars = $('#attn-bars');
  function render() {
    const sharp = +$('#s-sharp').value; $('#s-sharp-v').textContent = fmt(sharp, 1);
    $$('.tok', wrap).forEach((b, i) => b.classList.toggle('sel', i === q));
    const scores = TOK.map(t => dotN(TOK[q].v, t.v));
    const w = softmax(scores.map(s => s * sharp));
    bars.innerHTML = TOK.map((t, i) => `<div>${t.w}</div><div class="bar"><i style="width:${(w[i] * 100).toFixed(1)}%"></i></div><div class="w">${(w[i] * 100).toFixed(1)}%</div>`).join('');
    const out = [0, 1, 2].map(k => TOK.reduce((s, t, i) => s + t.v[k] * w[i], 0));
    const top = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 3).map(i => `${TOK[i].w} ${(w[i] * 100).toFixed(0)}%`).join(', ');
    setHTML('r-attn',
      `query = vec("${TOK[q].w}") = [${TOK[q].v.join(', ')}]\nscores  = [${scores.map(s => fmt(s)).join(', ')}]   ← 各単語との dot\nweights = softmax(scores * ${fmt(sharp, 1)}) = [${w.map(x => fmt(x)).join(', ')}]   合計 = 1\n${hl('output')} = 重み付きで混ぜた結果 = [${out.map(x => fmt(x)).join(', ')}]\n「${TOK[q].w}」は主に ${hl(top)} を見て、意味を組み立てている`);
  }
  $('#s-sharp').addEventListener('input', render);
  render();
})();

// 9-3 行列 + ReLU
const v9r = makeViz('c-relu', {
  unit: 40, h: 300,
  draw(v) {
    v.grid(); v.axes();
    const useM = $('#k-relu-m').checked, useR = $('#k-relu-r').checked;
    const m = { i: { x: 1.3, y: 0.5 }, j: { x: -0.6, y: 0.9 } };
    const relu = p => ({ x: Math.max(0, p.x), y: Math.max(0, p.y) });
    const pts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; pts.push({ x: Math.cos(a) * 2.2 + 0.6, y: Math.sin(a) * 2.2 + 0.4 }); }
    pts.forEach(p => v.point(p, 'rgba(255,255,255,0.35)', 3.5));
    const t1 = pts.map(p => (useM ? transform(m, p) : p));
    if (useM) { v.poly(t1, null, 'rgba(44,169,225,0.35)', 1); t1.forEach(p => v.point(p, C.blue, 4)); }
    if (useR) {
      const t2 = t1.map(relu);
      v.poly(t2, 'rgba(255,209,102,0.12)', 'rgba(255,209,102,0.6)', 1.5);
      t2.forEach(p => v.point(p, C.yellow, 4.5));
      v.line({ x: 0, y: -9 }, { x: 0, y: 9 }, C.yellow, 1, [3, 5]); v.line({ x: -9, y: 0 }, { x: 9, y: 0 }, C.yellow, 1, [3, 5]);
      v.textPx('relu: マイナス側が軸に折り畳まれる', 14, 20, C.yellow, 'left', 12);
    }
    if (useM) v.textPx(`transform(m, p)   m = { i: ${vs(m.i, 1)}, j: ${vs(m.j, 1)} }`, 14, useR ? 40 : 20, C.blue, 'left', 12);
  },
});
if (v9r) {
  $('#k-relu-m').addEventListener('change', () => v9r.redraw());
  $('#k-relu-r').addEventListener('change', () => v9r.redraw());
  register(9, v9r);
}

/* =========================================================
   ナビゲーション / クイズ / 進捗
   ========================================================= */
const lessons = $$('section.lesson');
const navList = $('#nav-list');
const DONE_KEY = 'cgmath-done-v1';
let done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'));
let current = 0;

lessons.forEach((s, i) => {
  if (s.dataset.part) { const ph = document.createElement('li'); ph.className = 'part'; ph.textContent = s.dataset.part; navList.appendChild(ph); }
  const chap = s.querySelector('.chap'); if (chap) chap.textContent = 'CHAPTER ' + i;
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.innerHTML = `<span class="num">${i}</span><span>${s.dataset.title}</span>`;
  b.addEventListener('click', () => show(i));
  li.appendChild(b); navList.appendChild(li);

  // フッター（前へ / 理解した / 次へ）
  const f = document.createElement('div'); f.className = 'lesson-footer';
  const prev = document.createElement('button'); prev.className = 'navbtn'; prev.textContent = '← 前の章';
  prev.disabled = i === 0; prev.style.visibility = i === 0 ? 'hidden' : 'visible';
  prev.addEventListener('click', () => show(i - 1));
  const lab = document.createElement('label'); lab.className = 'done';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = done.has(i);
  cb.addEventListener('change', () => { cb.checked ? done.add(i) : done.delete(i); saveDone(); });
  lab.appendChild(cb); lab.appendChild(document.createTextNode('この章を理解した'));
  const next = document.createElement('button'); next.className = 'navbtn primary';
  next.textContent = i === lessons.length - 1 ? '最初に戻る' : '次の章 →';
  next.addEventListener('click', () => { if (!done.has(i)) { done.add(i); cb.checked = true; saveDone(); } show((i + 1) % lessons.length); });
  f.append(prev, lab, next); s.appendChild(f);
});

function saveDone() {
  localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  $$('#nav-list button').forEach((b, i) => b.classList.toggle('done', done.has(i)));
  $('#prog-text').textContent = `${done.size} / ${lessons.length} 完了`;
  $('#prog-bar').style.width = `${done.size / lessons.length * 100}%`;
}

function show(i) {
  current = i;
  lessons.forEach((s, k) => s.classList.toggle('active', k === i));
  $$('#nav-list button').forEach((b, k) => b.classList.toggle('active', k === i));
  location.hash = `#ch${i}`;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  (vizBySection.get(i) || []).forEach(v => v.redraw());
}

// クイズ
$$('.quiz').forEach(qz => {
  const ans = +qz.dataset.answer, fb = $('.fb', qz);
  $$('.opt', qz).forEach((o, i) => o.addEventListener('click', () => {
    $$('.opt', qz).forEach(x => x.classList.remove('ok', 'ng'));
    if (i === ans) { o.classList.add('ok'); fb.innerHTML = `<span style="color:var(--green)">正解！</span> ${qz.dataset.why}`; }
    else { o.classList.add('ng'); $$('.opt', qz)[ans].classList.add('ok'); fb.innerHTML = `<span style="color:var(--pink)">おしい。</span> ${qz.dataset.why}`; }
  }));
});

// アニメーションループ
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden) for (const a of animators) if (a.section === current) a.fn(dt);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// URL の #chN で章を切り替え（ブラウザの戻る/進むにも対応）
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#ch(\d+)$/);
  if (m && +m[1] !== current) show(clamp(+m[1], 0, lessons.length - 1));
});

// 起動
saveDone();
const h = location.hash.match(/^#ch(\d+)$/);
show(h ? clamp(+h[1], 0, lessons.length - 1) : 0);
