'use strict';
/* =========================================================
   Part 3  演出：タイミング・可読性・構成（canvas 2D）
   ヒットエフェクトを「時刻 t の関数」として描く小さなエンジン。
   状態を持たないので、スライダーで時間を前後に動かせる。
   ========================================================= */

const easeOut = t => 1 - (1 - t) * (1 - t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const seeded = (i, k = 0) => hashf(i * 13.7 + k * 101.3);

// P: { A 溜め, I 衝撃, D 余韻, emberDelay, sparkKeep, el: {flash, ring, sparks, smoke, embers, light, debris, decal, antic}, scaleP, nSec, nTer, contrast }
function fxDefaults() {
  return { A: 0.25, I: 0.12, D: 1.2, emberDelay: 0.25, sparkKeep: false,
    el: { antic: true, flash: true, ring: true, sparks: true, smoke: true, embers: true, light: true, debris: false, decal: false },
    primary: 1, nSec: 14, nTer: 24, contrast: 1 };
}
function fxTotal(P) { return P.A + P.I + P.D + 0.3; }

// 画面の明るさ（演出の強さ）を時刻 t で返す。描画と同じ式を使う
function fxIntensity(t, P) {
  let s = 0;
  const A = P.A, I = P.I, D = P.D;
  if (P.el.antic && t >= 0 && t < A) s += 0.25 * (t / A);
  const ti = t - A;
  if (ti >= 0) {
    if (P.el.flash) s += 1.0 * Math.max(0, 1 - ti / I);
    if (P.el.light) s += 0.5 * Math.max(0, 1 - ti / (I * 2.5));
    if (P.el.ring) s += 0.3 * Math.max(0, 1 - ti / (I * 3));
    if (P.el.sparks) s += 0.35 * Math.max(0, 1 - ti / (D * 0.7));
    if (P.el.smoke) s += 0.25 * Math.max(0, 1 - ti / D) * Math.min(1, ti / (I * 2));
    if (P.el.embers) { const te = ti - P.emberDelay; if (te > 0) s += 0.2 * Math.max(0, 1 - te / D); }
    if (P.sparkKeep && ti < D) s += 0.25;
  }
  return s;
}

function fxDraw(ctx, cx, cy, t, P, opt = {}) {
  const A = P.A, I = P.I, D = P.D, sc = (opt.scale || 1) * P.primary;
  const sil = opt.silhouette;
  const col = (rgb, a) => sil ? `rgba(0,0,0,${a > 0.05 ? 1 : 0})` : rgbs(rgb, a);
  const ti = t - A;
  // 溜め：外から中心へ集まる粒 + 小さく暗い光
  if (P.el.antic && t >= 0 && t < A) {
    const k = t / A;
    for (let i = 0; i < 12; i++) {
      const a = seeded(i) * TAU, r0 = 90 * sc;
      const r = lerp(r0, 8, easeOut(k));
      ctx.fillStyle = col([120, 200, 255], 0.7 * k);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = col([60, 120, 200], 0.4 * k);
    ctx.beginPath(); ctx.arc(cx, cy, 16 * sc * (1 - k * 0.6), 0, TAU); ctx.fill();
  }
  if (ti < 0) return;
  // 周囲の光（ライト）：背景を一瞬明るくする
  if (P.el.light && ti < I * 2.5 && !sil) {
    const k = 1 - ti / (I * 2.5);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260 * sc);
    g.addColorStop(0, rgbs([255, 200, 120], 0.35 * k)); g.addColorStop(1, rgbs([255, 200, 120], 0));
    ctx.fillStyle = g; ctx.fillRect(cx - 300 * sc, cy - 300 * sc, 600 * sc, 600 * sc);
  }
  // 焦げ跡（デカール）：残る
  if (P.el.decal && !sil) {
    const k = Math.min(1, ti / (I * 2));
    ctx.fillStyle = rgbs([10, 8, 6], 0.55 * k);
    ctx.beginPath(); ctx.ellipse(cx, cy + 20 * sc, 60 * sc, 18 * sc, 0, 0, TAU); ctx.fill();
  }
  // 煙：ゆっくり広がって上がる（余韻）
  if (P.el.smoke && ti < D + 0.3) {
    const k = clamp(ti / D, 0, 1);
    for (let i = 0; i < 9; i++) {
      const a = seeded(i, 2) * TAU, spd = 30 + seeded(i, 3) * 40;
      const x = cx + Math.cos(a) * spd * easeOutCubic(k) * sc, y = cy + Math.sin(a) * spd * easeOutCubic(k) * sc - 50 * k * sc;
      const r = (14 + 36 * easeOutCubic(k)) * sc, al = (1 - k) * 0.55 * Math.min(1, ti / (I * 2));
      const shade = 70 + seeded(i, 4) * 40;
      ctx.fillStyle = col([shade, shade, shade + 8], al);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }
  // 衝撃波リング：速く広がり、薄くなる
  if (P.el.ring && ti < I * 3) {
    const k = ti / (I * 3);
    ctx.strokeStyle = col([200, 240, 255], 1 - k); ctx.lineWidth = Math.max(1, 10 * (1 - k)) * sc;
    ctx.beginPath(); ctx.arc(cx, cy, (10 + 150 * easeOutCubic(k)) * sc, 0, TAU); ctx.stroke();
  }
  // 火花：直線に飛び、重力で落ちる。速度の向きに伸びる（16 章）
  const drawSparks = (count, t0, k2, seedK) => {
    for (let i = 0; i < count; i++) {
      const born = t0;
      const tt = ti - born; if (tt < 0) continue;
      const life = D * 0.7; const k = tt / life; if (k > 1) continue;
      const a = seeded(i, seedK) * TAU - Math.PI * 0.75, sp = (180 + seeded(i, seedK + 1) * 260) * sc;
      const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp * 0.6;
      const x = cx + vx * tt * (1 - k * 0.5), y = cy + vy * tt + 300 * tt * tt * sc;
      const dx = vx * (1 - k), dy = vy + 600 * tt * sc;
      const L = Math.hypot(dx, dy) * 0.03, ang = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = col(fireRampJS(1 - k * 0.6), (1 - k) * k2);
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(2, L), 1.6 * sc, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  };
  if (P.el.sparks) drawSparks(P.nSec, 0, 1, 10);
  if (P.sparkKeep) for (let b = 1; b <= 6; b++) drawSparks(6, b * D / 7, 0.9, 20 + b);   // 出し続ける（勢いを殺す例）
  // 残り火：遅れて出て、ふわっと上がる
  if (P.el.embers) {
    const te = ti - P.emberDelay;
    if (te > 0 && te < D) {
      const k = te / D;
      for (let i = 0; i < P.nTer; i++) {
        const a = seeded(i, 30) * TAU, r = (20 + seeded(i, 31) * 90) * sc;
        const x = cx + Math.cos(a) * r + Math.sin(te * 3 + i) * 6, y = cy + Math.sin(a) * r * 0.5 - te * (30 + seeded(i, 32) * 40) * sc;
        ctx.fillStyle = col([255, 170, 60], (1 - k) * (0.5 + 0.5 * Math.sin(te * 12 + i)));
        ctx.beginPath(); ctx.arc(x, y, 1.8 * sc, 0, TAU); ctx.fill();
      }
    }
  }
  // 破片（デブリ）：重い、放物線、少数
  if (P.el.debris && ti < D) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (seeded(i, 40) - 0.5) * 2.2, sp = (120 + seeded(i, 41) * 100) * sc;
      const x = cx + Math.cos(a) * sp * ti, y = cy + Math.sin(a) * sp * ti + 400 * ti * ti * sc;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ti * (4 + i)); ctx.fillStyle = col([90, 70, 60], 1 - ti / D); ctx.fillRect(-4 * sc, -3 * sc, 8 * sc, 6 * sc); ctx.restore();
    }
  }
  // フラッシュ：2〜3 フレームだけ、白く大きく
  if (P.el.flash && ti < I) {
    const k = 1 - ti / I;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90 * sc);
    g.addColorStop(0, col([255, 255, 240], 0.95 * k)); g.addColorStop(0.5, col([255, 210, 120], 0.6 * k)); g.addColorStop(1, col([255, 120, 40], 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 90 * sc, 0, TAU); ctx.fill();
  }
}

// 時間バー（溜め / 衝撃 / 余韻）を描く
function drawTimeline(el, P, t) {
  if (!el) return;
  const total = fxTotal(P);
  const seg = (cls, len, label) => `<div class="ph ${cls}" style="width:${len / total * 100}%">${label}</div>`;
  el.innerHTML = seg('a', P.A, `溜め ${fmt(P.A, 2)}s`) + seg('b', P.I, `衝撃 ${fmt(P.I, 2)}s`) + seg('c', P.D, `余韻 ${fmt(P.D, 2)}s`) + `<div class="ph" style="flex:1;color:var(--muted)">静止</div><div class="cursor" style="left:${clamp(t / total, 0, 1) * 100}%"></div>`;
}

function fxPlayer(canvasId, P, opts) {
  const S = { t: 0, playing: true, loop: true, speed: 1 };
  const v = makeViz(canvasId, { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    const sil = opts.silhouette && opts.silhouette();
    ctx.fillStyle = sil ? '#e8eef2' : '#10202a'; ctx.fillRect(0, 0, 640, 360);
    if (opts.background) opts.background(ctx, sil);
    if (opts.filter) ctx.filter = opts.filter();
    fxDraw(ctx, opts.cx || 320, opts.cy || 200, S.t, P, { silhouette: sil, scale: opts.scale ? opts.scale() : 1 });
    ctx.filter = 'none';
    if (opts.after) opts.after(ctx, S.t);
  } });
  animate(v.c, dt => {
    if (S.playing) { S.t += dt * S.speed; if (S.t > fxTotal(P)) { if (S.loop) S.t = 0; else { S.t = fxTotal(P); S.playing = false; } } }
    v.redraw();
    if (opts.onTick) opts.onTick(S.t);
  });
  return { S, v };
}

/* ---------- CH 17  タイミング ---------- */
{
  const P = fxDefaults();
  const tl = document.getElementById('tl-timing');
  const { S, v } = fxPlayer('c-timing', P, {
    cy: 210,
    after(ctx, t) {
      // 右上：明るさのグラフ（時間 → 演出の強さ）
      const gx = 420, gy = 12, gw = 208, gh = 80, total = fxTotal(P);
      ctx.fillStyle = 'rgba(13,26,34,0.85)'; ctx.fillRect(gx, gy, gw, gh);
      ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const tt = i / 100 * total, y = gy + gh - 6 - Math.min(1.6, fxIntensity(tt, P)) / 1.6 * (gh - 16); const x = gx + i / 100 * gw; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      const cxl = gx + clamp(t / total, 0, 1) * gw; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cxl, gy); ctx.lineTo(cxl, gy + gh); ctx.stroke();
      v.textPx('画面の明るさ', gx + 6, gy + 10, C.muted, 'left', 11);
      // 擬音
      const label = t < P.A ? 'スッ…（溜め）' : t < P.A + P.I ? 'ドン！（衝撃）' : t < P.A + P.I + P.D ? 'ジュワァ…（余韻）' : '';
      v.textPx(label, 16, 20, C.yellow, 'left', 16);
    },
    onTick(t) { drawTimeline(tl, P, t); const sl = $('#s-timing-t'); if (sl && S.playing) { sl.value = t; } },
  });
  const rebuild = () => drawTimeline(tl, P, S.t);
  slider('s-timing-A', x => { P.A = x; rebuild(); }, x => fmt(x, 2) + ' 秒');
  slider('s-timing-I', x => { P.I = x; rebuild(); }, x => fmt(x, 2) + ' 秒');
  slider('s-timing-D', x => { P.D = x; rebuild(); }, x => fmt(x, 2) + ' 秒');
  slider('s-timing-ember', x => P.emberDelay = x, x => fmt(x, 2) + ' 秒');
  checkbox('k-timing-keep', x => P.sparkKeep = x);
  const tSlider = document.getElementById('s-timing-t');
  if (tSlider) { tSlider.max = 3; tSlider.addEventListener('input', () => { S.playing = false; S.t = +tSlider.value; $('#b-timing-play').textContent = '▶ 再生'; }); }
  button('b-timing-play', () => { S.playing = !S.playing; if (S.playing && S.t >= fxTotal(P)) S.t = 0; $('#b-timing-play').textContent = S.playing ? '❚❚ 停止' : '▶ 再生'; });
  button('b-timing-step', () => { S.playing = false; S.t = Math.min(fxTotal(P), S.t + 1 / 60); $('#b-timing-play').textContent = '▶ 再生'; });
  slider('s-timing-speed', x => S.speed = x, x => '×' + fmt(x, 2));
  modeButtons('m-timing', d => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input')); } };
    set('s-timing-A', d.a); set('s-timing-I', d.i); set('s-timing-D', d.d);
  });
  rebuild();
}

/* ---------- CH 18  形と可読性 ---------- */
{
  const P = fxDefaults(); P.el.light = false;
  const S = { sil: false, blur: false, gray: false, bright: false, same: false };
  const bg = (ctx, sil) => {
    // ゲーム画面っぽい背景：床の格子、プレイヤー、敵
    if (!sil) {
      ctx.fillStyle = S.bright ? '#c9d6dd' : '#16262f'; ctx.fillRect(0, 0, 640, 360);
      ctx.strokeStyle = S.bright ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke(); }
      for (let y = 0; y < 360; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
    }
    const unit = (x, y, c, label) => { ctx.fillStyle = sil ? '#000' : c; ctx.beginPath(); ctx.roundRect(x - 12, y - 22, 24, 44, 8); ctx.fill(); if (!sil) { ctx.fillStyle = '#fff'; ctx.font = '600 11px Consolas, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 38); } };
    unit(200, 250, '#2CA9E1', 'プレイヤー'); unit(470, 190, '#ff6b9d', '敵'); unit(530, 290, '#ff6b9d', '敵');
  };
  const { S: PS } = fxPlayer('c-read', P, {
    cx: 470, cy: 190, background: bg, silhouette: () => S.sil,
    filter: () => (S.blur ? 'blur(6px) ' : '') + (S.gray ? 'grayscale(1)' : ''),
    scale: () => 1,
  });
  const applySame = () => { if (S.same) { P.primary = 0.5; P.nSec = 40; P.nTer = 40; } else { P.primary = 1; P.nSec = 14; P.nTer = 24; } };
  checkbox('k-read-sil', x => S.sil = x);
  checkbox('k-read-blur', x => S.blur = x);
  checkbox('k-read-gray', x => S.gray = x);
  checkbox('k-read-bright', x => S.bright = x);
  checkbox('k-read-same', x => { S.same = x; applySame(); });
  slider('s-read-primary', x => P.primary = x, x => '×' + fmt(x, 2));
  slider('s-read-sec', x => P.nSec = x, x => x + ' 本');
  slider('s-read-ter', x => P.nTer = x, x => x + ' 個');
  slider('s-read-speed', x => PS.speed = x, x => '×' + fmt(x, 2));
}

/* ---------- CH 20  要素の役割（組み立て） ---------- */
{
  const P = fxDefaults(); P.el.debris = true; P.el.decal = true; P.D = 1.4;
  const { S } = fxPlayer('c-compose', P, {
    cy: 210,
    background(ctx) { ctx.fillStyle = '#12232c'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = '#0d1a22'; ctx.fillRect(0, 232, 640, 128); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(0, 232); ctx.lineTo(640, 232); ctx.stroke(); },
    after(ctx, t) { const on = Object.entries(P.el).filter(([k, v]) => v).length; ctx.font = '600 12px Consolas, sans-serif'; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText(`要素 ${on} / ${Object.keys(P.el).length}   t = ${fmt(t, 2)} s`, 12, 20); },
  });
  $$('#k-compose input[type=checkbox]').forEach(cb => { cb.checked = !!P.el[cb.dataset.el]; cb.addEventListener('change', () => P.el[cb.dataset.el] = cb.checked); });
  button('b-compose-none', () => { for (const k in P.el) P.el[k] = false; $$('#k-compose input').forEach(cb => cb.checked = false); });
  button('b-compose-all', () => { for (const k in P.el) P.el[k] = true; $$('#k-compose input').forEach(cb => cb.checked = true); });
  button('b-compose-replay', () => { S.t = 0; S.playing = true; });
  slider('s-compose-speed', x => S.speed = x, x => '×' + fmt(x, 2));
}
