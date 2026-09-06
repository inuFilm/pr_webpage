'use strict';
/* =========================================================
   ゲームVFXの原則を、動く図で。  app.js
   - 小さな数学関数群（cgmath と同じ書き方）
   - canvas 2D ヘルパー（cgmath の makeViz と同じ）
   - WebGL ヘルパー（フラグメントシェーダーを 1 枚の板に描く）
   - コード表示（図で動いているシェーダーをそのまま <pre> に出す）
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

/* ---------- 数学（cgmath と同じ形） ---------- */
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (v, k) => ({ x: v.x * k, y: v.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const length = v => Math.sqrt(dot(v, v));
const normalize = v => { const l = length(v); return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l }; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const rotate = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };

// 乱数とノイズ（cgmath Part 3 と同じ実装）
const hashf = seed => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hash2 = (ix, iy, seed = 0) => hashf(ix * 1.7 + iy * 113.3 + seed * 7.9);
function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y, oct = 3, seed = 0) {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, seed + i * 17); sum += amp; amp *= 0.5; f *= 2; }
  return v / sum;
}
// ノイズの傾き（勾配）を 90° 回した「カール」。発散しない渦の流れ
function curl(x, y, t = 0) {
  const e = 0.01;
  const dx = (fbm(x + e, y, 3, t) - fbm(x - e, y, 3, t)) / (2 * e);
  const dy = (fbm(x, y + e, 3, t) - fbm(x, y - e, 3, t)) / (2 * e);
  return { x: dy, y: -dx };
}
function hsl2rgb(h, s, l) {
  const k = n => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const rgbs = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex2vec = h => hex2rgb(h).map(v => v / 255);

/* ---------- 数字の表示 ---------- */
function fmt(n, d = 2) {
  if (!isFinite(n)) return String(n);
  let r = Math.round(n * 10 ** d) / 10 ** d;
  if (Object.is(r, -0)) r = 0;
  return String(r);
}
const hl = s => `<b>${s}</b>`;
const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

/* ---------- UI ヘルパー ---------- */
function slider(id, onChange, fmtFn = v => String(v)) {
  const el = document.getElementById(id); if (!el) return null;
  const out = document.getElementById(id + '-v');
  const upd = () => { if (out) out.textContent = fmtFn(+el.value); };
  el.addEventListener('input', () => { upd(); onChange(+el.value); });
  upd(); return el;
}
function modeButtons(containerId, onChange) {
  const c = document.getElementById(containerId); if (!c) return;
  $$('.btn', c).forEach(b => b.addEventListener('click', () => { $$('.btn', c).forEach(x => x.classList.remove('active')); b.classList.add('active'); onChange(b.dataset, b); }));
}
function checkbox(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('change', () => onChange(el.checked)); return el; }
function colorInput(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('input', () => onChange(el.value)); return el; }
function button(id, onClick) { const el = document.getElementById(id); if (el) el.addEventListener('click', onClick); return el; }

/* ---------- 章の管理 ---------- */
const lessons = $$('section.lesson');
const animators = []; // { section, fn } → 章が表示中のときだけ毎フレーム呼ぶ
const vizBySection = new Map(); // 章 → 描き直す viz の配列
const sectionOf = el => lessons.indexOf(el.closest('section.lesson'));

function register(sectionIdx, v) {
  if (!v) return;
  if (!vizBySection.has(sectionIdx)) vizBySection.set(sectionIdx, []);
  vizBySection.get(sectionIdx).push(v);
}
function animate(el, fn) { animators.push({ section: sectionOf(el), fn }); }

/* ---------- canvas 2D ヘルパー（cgmath と同じ） ---------- */
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
    clear(color = null) { ctx.clearRect(0, 0, W, H); if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); } },
    line(a, b, color, width = 2, dash = null) {
      const [x1, y1] = v.px(a), [x2, y2] = v.px(b);
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    },
    arrow(from, to, color, label = '', width = 3) {
      const [x1, y1] = v.px(from), [x2, y2] = v.px(to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      if (L < 1) return;
      const ux = dx / L, uy = dy / L, head = Math.min(12, L * 0.5);
      ctx.save();
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * head * 0.8, y2 - uy * head * 0.8); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ux * head - uy * head * 0.5, y2 - uy * head + ux * head * 0.5);
      ctx.lineTo(x2 - ux * head + uy * head * 0.5, y2 - uy * head - ux * head * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (label) v.textPx(label, (x1 + x2) / 2 - uy * 14, (y1 + y2) / 2 - ux * 14, color, 'center');
    },
    point(p, color, r = 6, ring = false) {
      const [x, y] = v.px(p);
      ctx.save();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (ring) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke(); }
      ctx.restore();
    },
    circle(center, r, stroke, width = 1.5, fill = null) {
      const [x, y] = v.px(center);
      ctx.save();
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
    drawHandles() { for (const h of v.handles) v.point(h.get(), h.color || C.white, 6, true); },
    redraw() { v.clear(); opts.draw(v); },
  };

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
    else if (opts.onClick) { opts.onClick(v.world(mx, my), v, mx, my); v.redraw(); }
  });
  c.addEventListener('pointermove', e => {
    const { mx, my } = pos(e);
    if (active) { active.set(v.world(clamp(mx, 8, W - 8), clamp(my, 8, H - 8))); v.redraw(); }
    else c.style.cursor = hit(mx, my) ? 'grab' : (opts.onClick ? 'pointer' : 'default');
  });
  const up = () => { active = null; c.style.cursor = 'default'; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  register(sectionOf(c), v);
  return v;
}

/* =========================================================
   WebGL ヘルパー
   - 画面いっぱいの板 1 枚にフラグメントシェーダーを描く
   - シェーダーの共通部分（ノイズなど）は GLSL_PRELUDE
   ========================================================= */
const GLSL_PRELUDE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_res;

// ---- 共通の道具（すべての図で使い回す） ----
float hash(vec2 p) {                         // 0〜1 のバラバラな数（cgmath 11 章）
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {                        // なめらかな乱数（cgmath 12 章）
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {                          // ノイズを 5 段重ねて雲っぽく
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(31.7, 17.3); a *= 0.5; }
  return v;
}
float noiseP(vec2 p, vec2 period) {          // period ごとに繰り返す（つなぎ目のない）ノイズ
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 i1 = mod(i + vec2(1, 0), period), i2 = mod(i + vec2(0, 1), period), i3 = mod(i + vec2(1, 1), period);
  i = mod(i, period);
  return mix(mix(hash(i), hash(i1), f.x), mix(hash(i2), hash(i3), f.x), f.y);
}
float fbmP(vec2 p, vec2 period) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noiseP(p, period); p *= 2.0; period *= 2.0; a *= 0.5; }
  return v;
}
vec3 fireRamp(float t) {                     // 黒 → 赤 → 橙 → 黄 → 白
  vec3 c = mix(vec3(0.0), vec3(0.9, 0.1, 0.0), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.0, 0.55, 0.05), smoothstep(0.3, 0.6, t));
  c = mix(c, vec3(1.0, 0.95, 0.6), smoothstep(0.6, 0.85, t));
  return mix(c, vec3(1.0), smoothstep(0.85, 1.0, t));
}
`;

const VERT_QUAD = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

function glCompile(gl, type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(`[${label}] shader error:\n` + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    return null;
  }
  return s;
}
function glProgram(gl, vs, fs, label) {
  const p = gl.createProgram();
  const a = glCompile(gl, gl.VERTEX_SHADER, vs, label), b = glCompile(gl, gl.FRAGMENT_SHADER, fs, label);
  if (!a || !b) return null;
  gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(`[${label}] link error: ` + gl.getProgramInfoLog(p)); return null; }
  return p;
}
function glSetUniform(gl, loc, val) {
  if (loc == null) return;
  if (typeof val === 'number') gl.uniform1f(loc, val);
  else if (typeof val === 'boolean') gl.uniform1f(loc, val ? 1 : 0);
  else if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
  else if (val.length === 3) gl.uniform3f(loc, val[0], val[1], val[2]);
  else if (val.length === 4) gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
}
function glFallback(c) {
  const d = document.createElement('div'); d.className = 'gl-fallback';
  d.textContent = 'この図は WebGL2 が必要です（お使いのブラウザでは無効になっています）。';
  c.replaceWith(d);
}

// opts: { frag, uniforms: () => ({name: value}), w, h, speed }
function makeGL(id, opts) {
  const c = document.getElementById(id);
  if (!c) return null;
  const W = opts.w || 640, H = opts.h || 360;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W * dpr; c.height = H * dpr;
  c.style.aspectRatio = `${W} / ${H}`;
  c.classList.add('gl');
  const gl = c.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) { glFallback(c); return null; }
  const prog = glProgram(gl, VERT_QUAD, GLSL_PRELUDE + opts.frag, id);
  if (!prog) { glFallback(c); return null; }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const locs = {};
  const loc = n => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(prog, n)));

  const g = {
    gl, c, W, H, time: 0, playing: true, speed: opts.speed ?? 1,
    draw() {
      gl.viewport(0, 0, c.width, c.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      glSetUniform(gl, loc('u_time'), g.time);
      glSetUniform(gl, loc('u_res'), [W, H]);
      const u = opts.uniforms ? opts.uniforms(g) : {};
      for (const k in u) glSetUniform(gl, loc(k), u[k]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    redraw() { g.draw(); },
  };
  animate(c, dt => { if (g.playing) g.time += dt * g.speed; g.draw(); });
  register(sectionOf(c), g);
  // クリックで一時停止 / 再開
  c.addEventListener('click', () => { if (opts.clickPause !== false) g.playing = !g.playing; });
  c.title = 'クリックで一時停止 / 再開';
  return g;
}

/* ---------- コード表示 ----------
   図で動いているシェーダー文字列を、そのまま <pre> に流し込む。
   これで「表示しているコード＝動いているコード」を保証する。 */
function escapeHTML(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function highlightGLSL(src) {
  const KW = /\b(uniform|in|out|void|float|vec2|vec3|vec4|int|bool|return|if|else|for|const|mat2|mat3|mat4)\b/g;
  return escapeHTML(src).split('\n').map(line => {
    const ci = line.indexOf('//');
    let code = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? line.slice(ci) : '';
    code = code
      .replace(KW, '<span class="k">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="n">$1</span>')
      .replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (m, f) => /^(if|for|return)$/.test(f) ? m : `<span class="f">${f}</span>`);
    return code + (com ? `<span class="c">${com}</span>` : '');
  }).join('\n');
}
function showCode(id, src, lang = 'glsl') {
  const el = document.getElementById(id); if (!el) return;
  el.classList.add('live');
  el.innerHTML = lang === 'glsl' ? highlightGLSL(src.trim()) : escapeHTML(src.trim());
}

/* =========================================================
   ナビゲーション / クイズ / 進捗
   ========================================================= */
const DONE_KEY = 'gamevfx-done-v1';
let done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'));
let current = 0;

function initNav() {
  const navList = $('#nav-list');
  lessons.forEach((s, i) => {
    if (s.dataset.part) { const ph = document.createElement('li'); ph.className = 'part'; ph.textContent = s.dataset.part; navList.appendChild(ph); }
    const chap = s.querySelector('.chap'); if (chap) chap.textContent = 'CHAPTER ' + i;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<span class="num">${i}</span><span>${s.dataset.title}</span>`;
    b.addEventListener('click', () => show(i));
    li.appendChild(b); navList.appendChild(li);

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

  $$('.quiz').forEach(qz => {
    const ans = +qz.dataset.answer, fb = $('.fb', qz);
    $$('.opt', qz).forEach((o, i) => o.addEventListener('click', () => {
      $$('.opt', qz).forEach(x => x.classList.remove('ok', 'ng'));
      if (i === ans) { o.classList.add('ok'); fb.innerHTML = `<span style="color:var(--green)">正解！</span> ${qz.dataset.why}`; }
      else { o.classList.add('ng'); $$('.opt', qz)[ans].classList.add('ok'); fb.innerHTML = `<span style="color:var(--pink)">おしい。</span> ${qz.dataset.why}`; }
    }));
  });

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) for (const a of animators) if (a.section === current) a.fn(dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#ch(\d+)$/);
    if (m && +m[1] !== current) show(clamp(+m[1], 0, lessons.length - 1));
  });

  saveDone();
  const h = location.hash.match(/^#ch(\d+)$/);
  show(h ? clamp(+h[1], 0, lessons.length - 1) : 0);
}

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
  window.scrollTo({ top: 0, behavior: 'auto' });
  (vizBySection.get(i) || []).forEach(v => v.redraw());
}

/* ---------- プリセット適用：{ id: value } をまとめて UI に流し込む ----------
   range / color → value + input イベント、checkbox → checked + change イベント、
   "m-xxx" のボタン群 → data-v が一致するボタンをクリック */
function setControls(map) {
  for (const id in map) {
    const el = document.getElementById(id); if (!el) continue;
    const val = map[id];
    if (el.type === 'checkbox') { el.checked = !!val; el.dispatchEvent(new Event('change')); }
    else if (el.tagName === 'INPUT' || el.tagName === 'SELECT') { el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
    else { const b = el.querySelector(`.btn[data-v="${val}"]`); if (b) b.click(); }
  }
}
