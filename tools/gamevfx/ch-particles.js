'use strict';
/* =========================================================
   Part 2  パーティクル：数で動きをつくる（canvas 2D）
   ========================================================= */

// 決定的な乱数（同じ seed なら同じ列）
function makeRng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 炎ランプ（GLSL の fireRamp と同じ形）
function fireRampJS(t) {
  const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
  let c = mix([0, 0, 0], [230, 25, 0], smoothstep(0, 0.3, t));
  c = mix(c, [255, 140, 13], smoothstep(0.3, 0.6, t));
  c = mix(c, [255, 242, 153], smoothstep(0.6, 0.85, t));
  return mix(c, [255, 255, 255], smoothstep(0.85, 1, t));
}

/* ---------- CH 11  発生と寿命 ---------- */
{
  const S = { rate: 20, burst: 40, life: 2, mode: 'rate', acc: 0, particles: [], time: 0, hist: [], rng: makeRng(7) };
  const spawn = () => S.particles.push({ x: 0, y: 0, vx: (S.rng() - 0.5) * 2.2, vy: 1.5 + S.rng() * 2.2, age: 0, life: S.life * (0.7 + S.rng() * 0.6) });
  const v = makeViz('c-emit', { w: 640, h: 360, unit: 40, ox: 200, oy: 330, draw(v) {
    const { ctx } = v;
    // 左：発生の様子
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 400, 360);
    v.line({ x: -4.9, y: 0 }, { x: 4.9, y: 0 }, C.axis, 1.5);
    v.point({ x: 0, y: 0 }, C.yellow, 5, true);
    v.text('発生源', { x: 0, y: 0 }, C.yellow, 12, 14, 'left', 12);
    for (const p of S.particles) {
      const t = p.age / p.life;                                   // 0 → 1
      const col = fireRampJS(1 - t * 0.8);
      ctx.fillStyle = rgbs(col, 1 - t);
      const [x, y] = v.px(p); ctx.beginPath(); ctx.arc(x, y, 4 + t * 6, 0, TAU); ctx.fill();
    }
    // 右：生きている数のグラフ（直近 6 秒）
    ctx.fillStyle = '#0d1a22'; ctx.fillRect(400, 0, 240, 360);
    v.textPx('生きている数', 520, 18, C.muted, 'center', 12);
    const maxN = Math.max(60, ...S.hist.map(h => h.n));
    ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath();
    S.hist.forEach((h, i) => { const x = 410 + (h.t - (S.time - 6)) / 6 * 220, y = 330 - h.n / maxN * 290; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    v.textPx(String(maxN), 405, 40, C.muted, 'left', 11); v.textPx('0', 405, 330, C.muted, 'left', 11);
    v.textPx('← 6 秒前', 420, 348, C.muted, 'left', 11); v.textPx('今 →', 630, 348, C.muted, 'right', 11);
    const alive = S.particles.length;
    setHTML('r-emit', `モード = ${S.mode === 'rate' ? `一定レート（${S.rate} 個/秒）` : `バースト（${S.burst} 個を一度に）`}   寿命 = ${S.life} 秒（±30% のばらつき）\n生きている数 = ${hl(alive)}   ${S.mode === 'rate' ? `落ち着く数 ≈ rate × 寿命 = ${S.rate} × ${S.life} = ${hl(S.rate * S.life)}` : 'バーストは「寿命が尽きると全員いなくなる」'}`);
  } });
  animate(v.c, dt => {
    S.time += dt;
    if (S.mode === 'rate') { S.acc += S.rate * dt; while (S.acc >= 1) { spawn(); S.acc -= 1; } }
    for (const p of S.particles) { p.age += dt; p.vy -= 2.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    S.particles = S.particles.filter(p => p.age < p.life);
    S.hist.push({ t: S.time, n: S.particles.length });
    S.hist = S.hist.filter(h => h.t > S.time - 6);
    v.redraw();
  });
  slider('s-emit-rate', x => S.rate = x, x => x + ' 個/秒');
  slider('s-emit-burst', x => S.burst = x, x => x + ' 個');
  slider('s-emit-life', x => S.life = x, x => fmt(x, 1) + ' 秒');
  modeButtons('m-emit', d => { S.mode = d.v; if (d.v === 'burst') for (let i = 0; i < S.burst; i++) spawn(); });
  button('b-emit-burst', () => { for (let i = 0; i < S.burst; i++) spawn(); });
}

/* ---------- CH 12  寿命カーブ ---------- */
const CURVES = {
  const: t => 1,
  down: t => 1 - t,
  up: t => t,
  bell: t => Math.sin(t * Math.PI),
  spike: t => t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeIn: t => t * t,
};
const CURVE_LABEL = { const: '一定', down: '減る', up: '増える', bell: '山', spike: '一瞬で上がって減る', easeOut: 'はじめ速く', easeIn: 'あとで速く' };
{
  const S = { size: 'up', alpha: 'down', color: 'down', particles: [], acc: 0, rng: makeRng(3), time: 0 };
  const v = makeViz('c-life', { w: 640, h: 360, unit: 40, ox: 150, oy: 330, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 300, 360);
    for (const p of S.particles) {
      const t = p.age / p.life;
      const size = lerp(6, 26, CURVES[S.size](t));
      const alpha = CURVES[S.alpha](t);
      const col = fireRampJS(CURVES[S.color](t));
      ctx.fillStyle = rgbs(col, alpha * 0.9);
      const [x, y] = v.px(p); ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
    }
    // 右：3 つのグラフ
    const names = [['size', '大きさ', C.blue], ['alpha', '透明度', C.green], ['color', '色（ランプの位置）', C.yellow]];
    names.forEach(([k, label, col], i) => {
      const gx = 330, gy = 20 + i * 112, gw = 290, gh = 84;
      ctx.fillStyle = '#0d1a22'; ctx.fillRect(gx, gy, gw, gh);
      v.textPx(`${label}：${CURVE_LABEL[S[k]]}`, gx + 6, gy + 12, col, 'left', 12);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      for (let j = 0; j <= 60; j++) { const t = j / 60, y = CURVES[S[k]](t); const px = gx + 10 + t * (gw - 20), py = gy + gh - 8 - y * (gh - 30); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      v.textPx('生まれた', gx + 10, gy + gh - 2, C.muted, 'left', 10); v.textPx('消える', gx + gw - 10, gy + gh - 2, C.muted, 'right', 10);
      // 今生きている粒の位置を点で
      for (const p of S.particles) { const t = p.age / p.life; const px = gx + 10 + t * (gw - 20), py = gy + gh - 8 - CURVES[S[k]](t) * (gh - 30); ctx.fillStyle = rgbs([255, 255, 255], 0.5); ctx.fillRect(px - 1, py - 1, 3, 3); }
    });
  } });
  animate(v.c, dt => {
    S.time += dt; S.acc += 6 * dt;
    while (S.acc >= 1) { S.acc -= 1; S.particles.push({ x: (S.rng() - 0.5) * 3, y: 0, vx: (S.rng() - 0.5) * 0.4, vy: 1.2 + S.rng() * 0.8, age: 0, life: 2.2 }); }
    for (const p of S.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    S.particles = S.particles.filter(p => p.age < p.life);
    v.redraw();
  });
  ['size', 'alpha', 'color'].forEach(k => { const el = document.getElementById('sel-life-' + k); if (el) el.addEventListener('change', () => S[k] = el.value); });
  modeButtons('m-life', d => { S.size = d.size; S.alpha = d.alpha; S.color = d.color; ['size', 'alpha', 'color'].forEach(k => { const el = document.getElementById('sel-life-' + k); if (el) el.value = S[k]; }); });
}

/* ---------- CH 13  速度と力 ---------- */
{
  const S = { spread: 40, speed: 5, gravity: -4, drag: 0.3, turb: 0, vortex: 0, particles: [], acc: 0, rng: makeRng(11), time: 0, trail: true };
  const v = makeViz('c-force', { w: 640, h: 360, unit: 36, ox: 320, oy: 340, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 640, 360);
    if (S.vortex !== 0) { v.circle({ x: 0, y: 4 }, 0.15, C.purple, 1.5); v.text('渦の中心', { x: 0, y: 4 }, C.purple, 12, -12, 'left', 11); }
    v.point({ x: 0, y: 0 }, C.yellow, 5, true);
    // 扇（発生の向きの範囲）
    const a0 = Math.PI / 2 - S.spread * Math.PI / 360, a1 = Math.PI / 2 + S.spread * Math.PI / 360;
    v.line({ x: 0, y: 0 }, { x: Math.cos(a0) * 1.5, y: Math.sin(a0) * 1.5 }, C.yellow, 1, [4, 4]);
    v.line({ x: 0, y: 0 }, { x: Math.cos(a1) * 1.5, y: Math.sin(a1) * 1.5 }, C.yellow, 1, [4, 4]);
    for (const p of S.particles) {
      const t = p.age / p.life;
      if (S.trail && p.hist.length > 1) {
        ctx.strokeStyle = rgbs([255, 180, 80], (1 - t) * 0.5); ctx.lineWidth = 2; ctx.beginPath();
        p.hist.forEach((q, i) => { const [x, y] = v.px(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      }
      ctx.fillStyle = rgbs(fireRampJS(1 - t * 0.7), 1 - t);
      const [x, y] = v.px(p); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
    }
    setHTML('r-force', `生まれるとき：向き = 真上 ± ${S.spread / 2}°、速さ = ${S.speed}\n毎フレーム：  重力 ${S.gravity}   抵抗 ${S.drag}   乱流 ${S.turb}   渦 ${S.vortex}\n${S.turb > 0 ? hl('乱流 = ノイズの「カール」') + '（cgmath 28 章のベクトル場）を速度に足している' : S.vortex !== 0 ? hl('渦 = 中心に向かう矢印を 90° 回した向き') + 'を速度に足している' : '力を足す → 速度が変わる → 位置が変わる（cgmath 25 章）'}`);
  } });
  animate(v.c, dt => {
    S.time += dt; S.acc += 40 * dt;
    while (S.acc >= 1) {
      S.acc -= 1;
      const a = Math.PI / 2 + (S.rng() - 0.5) * S.spread * Math.PI / 180;   // 扇の中のランダムな向き
      const sp = S.speed * (0.7 + S.rng() * 0.6);
      S.particles.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 2.5, hist: [] });
    }
    for (const p of S.particles) {
      p.age += dt;
      p.vy += S.gravity * dt;                                   // 重力：下向きの力
      p.vx *= 1 - S.drag * dt; p.vy *= 1 - S.drag * dt;         // 抵抗：速度を少し削る
      if (S.turb > 0) { const c = curl(p.x * 0.4, p.y * 0.4, S.time * 0.3); p.vx += c.x * S.turb * dt; p.vy += c.y * S.turb * dt; }
      if (S.vortex !== 0) { const dx = 0 - p.x, dy = 4 - p.y, d = Math.hypot(dx, dy) + 0.5; p.vx += (-dy / d) * S.vortex * dt / d * 4; p.vy += (dx / d) * S.vortex * dt / d * 4; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (S.trail) { p.hist.push({ x: p.x, y: p.y }); if (p.hist.length > 14) p.hist.shift(); }
    }
    S.particles = S.particles.filter(p => p.age < p.life && p.y > -1);
    v.redraw();
  });
  slider('s-force-spread', x => S.spread = x, x => x + '°');
  slider('s-force-speed', x => S.speed = x, x => fmt(x, 1));
  slider('s-force-grav', x => S.gravity = x, x => fmt(x, 1));
  slider('s-force-drag', x => S.drag = x, x => fmt(x, 2));
  slider('s-force-turb', x => S.turb = x, x => fmt(x, 1));
  slider('s-force-vortex', x => S.vortex = x, x => fmt(x, 1));
  checkbox('k-force-trail', x => S.trail = x);
  modeButtons('m-force', d => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input')); } };
    set('s-force-spread', d.spread); set('s-force-speed', d.speed); set('s-force-grav', d.grav); set('s-force-drag', d.drag); set('s-force-turb', d.turb); set('s-force-vortex', d.vortex);
  });
}

/* ---------- CH 14  ビルボード・ストレッチ・リボン ---------- */
{
  const S = { mode: 'billboard', yaw: 0.6, stretch: 0.15, particles: [], acc: 0, rng: makeRng(5), time: 0, spin: true };
  const cam = { pitch: 0.35, dist: 7, focal: 380 };
  const rotY = (p, a) => ({ x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) });
  const rotX = (p, a) => ({ x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) });
  const project = p => { let q = rotY(p, S.yaw); q = rotX(q, cam.pitch); const z = q.z + cam.dist; const f = cam.focal / Math.max(0.5, z); return { x: 320 + q.x * f, y: 300 - q.y * f, s: f / cam.focal }; };
  const v = makeViz('c-bill', { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 640, 360);
    // 地面の格子
    ctx.strokeStyle = C.grid2; ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const a = project({ x: i, y: 0, z: -3 }), b = project({ x: i, y: 0, z: 3 }), c = project({ x: -3, y: 0, z: i }), d = project({ x: 3, y: 0, z: i });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    const sorted = [...S.particles].map(p => ({ p, q: project(p) })).sort((a, b) => a.q.s - b.q.s);  // 奥から描く
    for (const { p, q } of sorted) {
      const t = p.age / p.life, r = 12 * q.s * (1 - t * 0.5), col = fireRampJS(1 - t * 0.6);
      ctx.fillStyle = rgbs(col, 1 - t); ctx.strokeStyle = rgbs(col, 1 - t); ctx.lineWidth = 2;
      if (S.mode === 'billboard') {                       // 常にカメラを向く丸
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
      } else if (S.mode === 'stretch') {                  // 速度の向きに引き伸ばす（画面上の速度で）
        const q2 = project({ x: p.x + p.vx * S.stretch, y: p.y + p.vy * S.stretch, z: p.z + p.vz * S.stretch });
        const dx = q2.x - q.x, dy = q2.y - q.y, L = Math.hypot(dx, dy);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.atan2(dy, dx));
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(r, L / 2 + r), r * 0.7, 0, 0, TAU); ctx.fill(); ctx.restore();
      } else if (S.mode === 'ribbon') {                   // 通った道を帯にする
        if (p.hist.length > 1) {
          ctx.lineCap = 'round';
          for (let i = 1; i < p.hist.length; i++) {
            const a = project(p.hist[i - 1]), b = project(p.hist[i]);
            ctx.lineWidth = r * 1.4 * (i / p.hist.length); ctx.strokeStyle = rgbs(col, (1 - t) * i / p.hist.length);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      } else {                                            // メッシュ：3D の向きを持つ菱形
        const d = normalize3({ x: p.vx, y: p.vy, z: p.vz }), len = 0.5, w = 0.14;
        const side = normalize3(cross3({ x: 0, y: 1, z: 0 }, d));
        const pts = [add3(p, scale3(d, len)), add3(p, scale3(side, w)), add3(p, scale3(d, -len * 0.4)), add3(p, scale3(side, -w))].map(project);
        ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill();
      }
    }
    v.textPx({ billboard: 'ビルボード：どこから見ても正面の丸', stretch: 'ストレッチ：速度の向きに伸ばす', ribbon: 'リボン：通った道を帯にする', mesh: 'メッシュ：3D の向きを持つ' }[S.mode], 12, 16, C.muted, 'left', 12);
  } });
  const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const scale3 = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
  const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const normalize3 = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
  animate(v.c, dt => {
    S.time += dt; if (S.spin) S.yaw += dt * 0.3;
    S.acc += 25 * dt;
    while (S.acc >= 1) {
      S.acc -= 1;
      const a = S.rng() * TAU, sp = 1.2 + S.rng() * 1.2;
      S.particles.push({ x: 0, y: 0, z: 0, vx: Math.cos(a) * sp, vy: 4 + S.rng() * 2, vz: Math.sin(a) * sp, age: 0, life: 1.8, hist: [] });
    }
    for (const p of S.particles) {
      p.age += dt; p.vy -= 5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.hist.push({ x: p.x, y: p.y, z: p.z }); if (p.hist.length > 10) p.hist.shift();
    }
    S.particles = S.particles.filter(p => p.age < p.life);
    v.redraw();
  });
  modeButtons('m-bill', d => S.mode = d.v);
  slider('s-bill-stretch', x => S.stretch = x, x => fmt(x, 2));
  checkbox('k-bill-spin', x => S.spin = x);
}

/* ---------- CH 15  フリップブック ---------- */
{
  const FR = 48;                       // 1 コマの大きさ（px）
  const S = { cols: 8, rows: 8, fps: 24, blend: false, packed: false, time: 0, frames: null, ready: false };
  // 3 種類の連番を「計算で」作る（本来はシミュレーションのレンダー）
  function renderFrame(kind, t) {
    const cv = document.createElement('canvas'); cv.width = FR; cv.height = FR;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(FR, FR); const d = img.data;
    for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
      const u = (x + 0.5) / FR - 0.5, w = (y + 0.5) / FR - 0.5, r = Math.hypot(u, w);
      let val = 0;
      if (kind === 0) {              // 爆発の火球：広がりながら薄くなる
        const R = lerp(0.08, 0.5, 1 - (1 - t) * (1 - t));
        const n = fbm(u * 6 + t * 2, w * 6 - t * 3, 3, 1);
        val = smoothstep(R, R * 0.5, r + (n - 0.5) * 0.25) * (1 - t);
      } else if (kind === 1) {       // 煙：上に流れて消える
        const n = fbm(u * 4 + 5, (w + t * 0.6) * 4, 3, 2);
        val = smoothstep(0.5, 0.25, r + (n - 0.5) * 0.3) * (1 - t * t) * n * 1.6;
      } else {                       // 衝撃波リング：広がる薄い輪
        const R = lerp(0.05, 0.48, Math.sqrt(t));
        val = smoothstep(0.06, 0.0, Math.abs(r - R)) * (1 - t);
      }
      const i = (y * FR + x) * 4, g = clamp(val, 0, 1) * 255;
      d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return cv;
  }
  function build() {
    const N = S.cols * S.rows;
    S.frames = [0, 1, 2].map(kind => Array.from({ length: N }, (_, k) => renderFrame(kind, k / (N - 1))));
    S.ready = true;
  }
  const v = makeViz('c-flip', { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 640, 360);
    if (!S.ready) build();
    const N = S.cols * S.rows, cell = 300 / S.cols;
    // 左：アトラス
    ctx.imageSmoothingEnabled = false;
    if (!S.packed) {
      for (let k = 0; k < N; k++) ctx.drawImage(S.frames[0][k], 20 + (k % S.cols) * cell, 30 + Math.floor(k / S.cols) * cell, cell, cell);
    } else {
      // チャンネルパッキング：R = 火球、G = 煙、B = 衝撃波 を 1 枚に詰める
      for (let k = 0; k < N; k++) {
        const x = 20 + (k % S.cols) * cell, y = 30 + Math.floor(k / S.cols) * cell;
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(x, y, cell, cell);
        ctx.globalCompositeOperation = 'lighter';
        [[255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach((c, ch) => {
          const tmp = document.createElement('canvas'); tmp.width = FR; tmp.height = FR; const tc = tmp.getContext('2d');
          tc.drawImage(S.frames[ch][k], 0, 0); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = rgbs(c); tc.fillRect(0, 0, FR, FR);
          ctx.drawImage(tmp, x, y, cell, cell);
        });
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.strokeStyle = C.grid2; ctx.lineWidth = 1; ctx.strokeRect(20, 30, 300, 300);
    // 今のコマを枠で示す
    const f = S.time * S.fps, frame = Math.floor(f) % N, mixT = f - Math.floor(f);
    ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.strokeRect(20 + (frame % S.cols) * cell, 30 + Math.floor(frame / S.cols) * cell, cell, cell);
    v.textPx(S.packed ? `アトラス（R/G/B に別の連番を詰めた ${S.cols}×${S.rows}）` : `アトラス ${S.cols}×${S.rows} = ${N} コマ`, 20, 16, C.muted, 'left', 12);
    // 右：再生
    const px = 400, py = 60, sz = 200;
    ctx.fillStyle = '#000'; ctx.fillRect(px, py, sz, sz);
    const kinds = S.packed ? [0, 1, 2] : [0];
    ctx.globalCompositeOperation = 'lighter';
    kinds.forEach(kind => {
      const tint = S.packed ? [[255, 120, 40], [160, 160, 170], [120, 200, 255]][kind] : [255, 160, 60];
      const drawTinted = (img, alpha) => {
        const tmp = document.createElement('canvas'); tmp.width = FR; tmp.height = FR; const tc = tmp.getContext('2d');
        tc.drawImage(img, 0, 0); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = rgbs(tint); tc.fillRect(0, 0, FR, FR);
        ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, px, py, sz, sz); ctx.globalAlpha = 1;
      };
      if (S.blend) { drawTinted(S.frames[kind][frame], 1 - mixT); drawTinted(S.frames[kind][(frame + 1) % N], mixT); }
      else drawTinted(S.frames[kind][frame], 1);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = C.grid2; ctx.strokeRect(px, py, sz, sz);
    v.textPx(`再生 ${S.fps} fps${S.blend ? '（次のコマと混ぜる）' : ''}`, px, 46, C.muted, 'left', 12);
    setHTML('r-flip', `frame = floor(time × fps) % ${N} = ${hl(frame)}     col = ${frame % S.cols}, row = ${Math.floor(frame / S.cols)}\n${S.blend ? `次のコマ ${(frame + 1) % N} と ${fmt(mixT, 2)} の割合で混ぜている（frame blending）` : '1 コマずつ切り替えている（コマ数が少ないとカクつく）'}`);
  } });
  animate(v.c, dt => { S.time += dt; v.redraw(); });
  slider('s-flip-fps', x => S.fps = x, x => x + ' fps');
  checkbox('k-flip-blend', x => S.blend = x);
  checkbox('k-flip-packed', x => S.packed = x);
  modeButtons('m-flip', d => { S.cols = S.rows = +d.n; S.ready = false; v.redraw(); });
}

/* ---------- CH 16  オーバードロー ---------- */
{
  const S = { n: 30, size: 120, heat: true, cut: false, rng: makeRng(21) };
  const v = makeViz('c-over', { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 640, 360);
    const rng = makeRng(21);
    const sprites = Array.from({ length: S.n }, () => ({ x: 320 + (rng() - 0.5) * 300, y: 180 + (rng() - 0.5) * 180, s: S.size * (0.6 + rng() * 0.8) }));
    // 重なり回数を数える（8px の升目で）
    const cw = 8, gw = 80, gh = 45, grid = new Uint16Array(gw * gh);
    let painted = 0;
    const inside = (sp, cx, cy) => {
      const dx = Math.abs(cx - sp.x) / (sp.s / 2), dy = Math.abs(cy - sp.y) / (sp.s / 2);
      if (dx > 1 || dy > 1) return false;
      return S.cut ? dx + dy <= 1.5 : true;          // 八角形に切る：角を落とす
    };
    for (const sp of sprites) for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (inside(sp, gx * cw + 4, gy * cw + 4)) { grid[gy * gw + gx]++; painted++; }
    let maxO = 0; for (const g of grid) maxO = Math.max(maxO, g);
    if (S.heat) {
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const k = grid[gy * gw + gx]; if (!k) continue;
        const t = Math.min(1, k / 8);
        ctx.fillStyle = rgbs(hsl2rgb(0.6 - t * 0.6, 0.9, 0.5), 0.9); ctx.fillRect(gx * cw, gy * cw, cw, cw);
      }
    } else {
      for (const sp of sprites) {
        ctx.fillStyle = 'rgba(255,200,120,0.12)';
        if (S.cut) { const h = sp.s / 2, c = h * 0.5; ctx.beginPath(); ctx.moveTo(sp.x - h + c, sp.y - h); ctx.lineTo(sp.x + h - c, sp.y - h); ctx.lineTo(sp.x + h, sp.y - h + c); ctx.lineTo(sp.x + h, sp.y + h - c); ctx.lineTo(sp.x + h - c, sp.y + h); ctx.lineTo(sp.x - h + c, sp.y + h); ctx.lineTo(sp.x - h, sp.y + h - c); ctx.lineTo(sp.x - h, sp.y - h + c); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,200,120,0.4)'; ctx.stroke(); }
        else { ctx.fillRect(sp.x - sp.s / 2, sp.y - sp.s / 2, sp.s, sp.s); ctx.strokeStyle = 'rgba(255,200,120,0.4)'; ctx.strokeRect(sp.x - sp.s / 2, sp.y - sp.s / 2, sp.s, sp.s); }
      }
    }
    const ratio = painted / (gw * gh);
    setHTML('r-over', `板の数 = ${S.n}   1 枚の大きさ ≈ ${S.size}px${S.cut ? '（八角形に切って角を捨てる）' : ''}\n塗ったピクセル数 ÷ 画面のピクセル数 = ${hl(fmt(ratio, 2) + ' 倍')}   いちばん重なった所 = ${hl(maxO + ' 回')}\n${ratio > 3 ? '画面を 3 回以上塗り直している。半透明の板はここが一番重い' : ratio > 1 ? '画面 1 枚ぶん以上を塗っている' : '画面 1 枚ぶん未満。軽い'}`);
  } });
  slider('s-over-n', x => { S.n = x; v.redraw(); }, x => x + ' 枚');
  slider('s-over-size', x => { S.size = x; v.redraw(); }, x => x + ' px');
  checkbox('k-over-heat', x => { S.heat = x; v.redraw(); });
  checkbox('k-over-cut', x => { S.cut = x; v.redraw(); });
  modeButtons('m-over', d => { const set = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input')); } }; set('s-over-n', d.n); set('s-over-size', d.size); });
}
