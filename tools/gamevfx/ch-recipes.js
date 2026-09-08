'use strict';
/* =========================================================
   Part 4  レシピ：炎（24）/ 煙（25）/ 雷（26）/ 斬撃（27）/ 回復（28）/ 衝撃波（29）
   すべて前の章の部品の組み合わせ。新しい仕組みは出てこない。
   ========================================================= */

/* ---------- CH 24  炎 ---------- */
{
  const FRAG = `
uniform float u_height, u_wobble, u_sparks, u_speed;
uniform float u_show;   // 0: 完成  1: 本体だけ  2: コアだけ  3: 火花だけ
float flame(vec2 uv, float width, float height, float t) {        // 2 章：流す + 抜く
  float x = abs(uv.x - 0.5) * 2.0 / width;
  float mask = (1.0 - smoothstep(0.0, height, uv.y)) * max(0.0, 1.0 - x * x);
  float n = fbm(uv * vec2(4.0, 2.5) + vec2(0.0, -t));
  return n * mask * 1.7;
}
void main() {
  vec2 uv = v_uv;
  // 歪み（3 章）：上へ行くほど大きく揺れる
  vec2 d = (vec2(fbm(uv * 3.0 + vec2(0.0, -u_time * 0.5)), fbm(uv * 3.0 + vec2(5.0, -u_time * 0.5))) - 0.5) * u_wobble * uv.y;
  vec2 w = uv + d;
  float t = u_time * u_speed;
  float body = smoothstep(0.35, 0.75, flame(w, 0.7, u_height, t));            // 本体：広く、橙
  float core = smoothstep(0.55, 0.9, flame(w, 0.45, u_height * 0.7, t * 1.2)); // コア：狭く短く、白（22 章の色の階層）
  vec3 col = vec3(0.0);
  bool all = u_show < 0.5;
  if (all || abs(u_show - 1.0) < 0.5) col += fireRamp(body * 0.8);
  if (all || abs(u_show - 2.0) < 0.5) col += vec3(1.0, 0.95, 0.8) * core;       // 加算で重ねる（7 章）
  // 火花：15 章の「上向き重力の粒」を計算で。寿命 0〜1 で上がって消える
  if (all || abs(u_show - 3.0) < 0.5) for (int i = 0; i < 24; i++) {
    if (float(i) >= u_sparks) break;
    float fi = float(i), sd = hash(vec2(fi, 3.0));
    float life = fract(u_time * (0.25 + sd * 0.3) + sd);
    vec2 sp = vec2(0.5 + (hash(vec2(fi, 7.0)) - 0.5) * 0.25 + sin(u_time * 2.0 + fi) * 0.04 * life, 0.1 + life * (0.6 + sd * 0.3));
    float s = (1.0 - smoothstep(0.0, 0.012, length((uv - sp) * vec2(u_res.x / u_res.y, 1.0))));
    col += vec3(1.0, 0.7, 0.3) * s * (1.0 - life);
  }
  // 根元の光：まわりを照らす（23 章「周囲の光」）
  col += vec3(1.0, 0.4, 0.1) * 0.25 * (1.0 - smoothstep(0.0, 0.35, length((uv - vec2(0.5, 0.08)) * vec2(1.0, 2.0))));
  outColor = vec4(col, 1.0);
}`;
  const S = { height: 0.8, wobble: 0.12, sparks: 12, speed: 1.2, show: 0 };
  makeGL('g-fire', { frag: FRAG, uniforms: () => ({ u_height: S.height, u_wobble: S.wobble, u_sparks: S.sparks, u_speed: S.speed, u_show: S.show }) });
  showCode('code-fire', FRAG);
  slider('s-fire-height', v => S.height = v, v => fmt(v, 2));
  slider('s-fire-wobble', v => S.wobble = v, v => fmt(v, 2));
  slider('s-fire-sparks', v => S.sparks = v, v => fmt(v, 0));
  slider('s-fire-speed', v => S.speed = v, v => fmt(v, 1));
  modeButtons('m-fire', d => S.show = +d.v);
}

/* ---------- CH 25  煙 ---------- */
{
  const S = { rate: 8, wind: 0.3, turb: 1.5, life: 3.5, grow: 2.2, mode: 'erode', light: 1, particles: [], acc: 0, rng: makeRng(9), time: 0 };
  const v = makeViz('c-smoke', { w: 640, h: 360, unit: 40, ox: 320, oy: 340, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#16262f'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#0d1a22'; ctx.fillRect(0, 300, 640, 60);
    // 奥から手前へ（通常ブレンドは順番が要る。7 章）
    const sorted = [...S.particles].sort((a, b) => b.depth - a.depth);
    for (const p of sorted) {
      const t = p.age / p.life;
      const R = (0.35 + S.grow * (1 - (1 - t) * (1 - t))) * 40;            // 大きくなる：はじめ速く（14 章）
      const [x, y] = v.px(p);
      const base = 140 + p.depth * 50;
      // 5 つの小さな丸で「もくもく」を作る。ちぎれモードでは小さな丸が別々の時刻に消える
      for (let k = 0; k < 5; k++) {
        const th = 0.45 + hashf(p.seed + k * 3.1) * 0.55;
        let a;
        if (S.mode === 'erode') { if (t > th) continue; a = 0.8 * (1 - smoothstep(th - 0.15, th, t)); }
        else a = 0.8 * (1 - t) * (1 - t);
        a *= smoothstep(0, 0.12, t);                                          // 生まれた直後は薄く
        const ang = hashf(p.seed + k) * TAU + p.rot, rr = R * 0.45;
        const cx = x + Math.cos(ang) * rr, cy = y + Math.sin(ang) * rr, r = R * (0.5 + hashf(p.seed + k + 9) * 0.35);
        // 光の向きで明暗を付ける（12 章のなんちゃって版：光側へずらした明るい丸を重ねる）
        const g = ctx.createRadialGradient(cx + S.light * r * 0.35, cy - r * 0.3, 0, cx, cy, r);
        g.addColorStop(0, rgbs([base + 60, base + 60, base + 66], a)); g.addColorStop(0.6, rgbs([base, base, base + 8], a * 0.8)); g.addColorStop(1, rgbs([base - 40, base - 40, base - 30], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      }
    }
    v.point({ x: 0, y: 0 }, C.yellow, 4, true);
    setHTML('r-smoke', `生きている数 = ${S.particles.length}（レート ${S.rate} × 寿命 ${S.life} ≈ ${Math.round(S.rate * S.life)}）   消え方 = ${S.mode === 'erode' ? 'ちぎれて消える（4 章のディゾルブを粒で）' : '薄くなって消える'}\n通常ブレンド・大きくなる・ゆっくり・光の向きで明暗。${hl('煙は「物」なので光を受ける')}（12 章）`);
  } });
  animate(v.c, dt => {
    S.time += dt; S.acc += S.rate * dt;
    while (S.acc >= 1) { S.acc -= 1; S.particles.push({ x: (S.rng() - 0.5) * 0.4, y: 0, vx: (S.rng() - 0.5) * 0.4, vy: 0.9 + S.rng() * 0.5, age: 0, life: S.life * (0.75 + S.rng() * 0.5), seed: S.rng() * 100, rot: S.rng() * TAU, spin: (S.rng() - 0.5) * 0.6, depth: S.rng() });
    }
    for (const p of S.particles) {
      p.age += dt;
      p.vx += S.wind * dt * 0.8;                                             // 風：横向きの一定の力（15 章）
      const c = curl(p.x * 0.5 + 3, p.y * 0.5, S.time * 0.2); p.vx += c.x * S.turb * dt; p.vy += c.y * S.turb * dt * 0.5;
      p.vx *= 1 - 0.6 * dt; p.vy *= 1 - 0.3 * dt;                            // 抵抗：ゆっくりになる
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    }
    S.particles = S.particles.filter(p => p.age < p.life);
    v.redraw();
  });
  slider('s-smoke-rate', x => S.rate = x, x => x + ' 個/秒');
  slider('s-smoke-wind', x => S.wind = x, x => fmt(x, 2));
  slider('s-smoke-turb', x => S.turb = x, x => fmt(x, 1));
  slider('s-smoke-life', x => S.life = x, x => fmt(x, 1) + ' 秒');
  slider('s-smoke-grow', x => S.grow = x, x => fmt(x, 1));
  modeButtons('m-smoke', d => S.mode = d.v);
  modeButtons('m-smoke-light', d => S.light = +d.v);
}

/* ---------- CH 26  雷 ---------- */
{
  const S = { jag: 0.5, branches: 4, glow: 1, gap: 0.5, after: 0.2, seed: 1, bolt: null, nextAt: 0.3, struck: -9, time: 0, flashBg: true };
  // 中点変位：線分の真ん中をランダムにずらして、それを繰り返す（cgmath 20 章のフラクタル）
  function makeBolt(a, b, depth, jag, rng) {
    let pts = [a, b];
    for (let d = 0; d < depth; d++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const L = Math.hypot(q.x - p.x, q.y - p.y), nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
        const off = (rng() - 0.5) * L * jag;
        next.push({ x: m.x + nx * off, y: m.y + ny * off }, q);
      }
      pts = next;
    }
    return pts;
  }
  function strike() {
    const rng = makeRng(S.seed++ * 7 + 1);
    const a = { x: 200 + rng() * 240, y: 10 }, b = { x: 260 + rng() * 120, y: 320 };
    const main = makeBolt(a, b, 6, S.jag, rng);
    const branches = [];
    for (let k = 0; k < S.branches; k++) {
      const i = 4 + Math.floor(rng() * (main.length - 12)), p = main[i];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + (rng() - 0.5) * 1.6, len = 40 + rng() * 90;
      branches.push({ pts: makeBolt(p, { x: p.x + Math.cos(ang) * len, y: p.y + Math.sin(ang) * len }, 4, S.jag, rng), w: 0.5 });
    }
    S.bolt = { main, branches };
    S.struck = S.time;
    S.nextAt = S.time + 0.05 + S.gap * (0.5 + hashf(S.seed) * 1.0);
  }
  const drawPath = (ctx, pts, width, color, alpha) => {
    ctx.strokeStyle = rgbs(color, alpha); ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  };
  const v = makeViz('c-bolt', { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    const since = S.time - S.struck;
    const flash = since < 0.06 ? 1 : 0;                                     // 光っているのは 2〜3 フレーム（20 章）
    const after = since < 0.06 ? 1 : Math.max(0, 1 - (since - 0.06) / Math.max(0.01, S.after));  // 残像
    ctx.fillStyle = S.flashBg && flash ? '#2a3d4c' : '#10202a'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#0d1a22'; ctx.fillRect(0, 320, 640, 40);
    if (S.bolt && after > 0) {
      ctx.globalCompositeOperation = 'lighter';                               // 加算（7 章）
      const draw = (pts, w) => {
        // 色の階層（22 章）：外側は広く薄い青、内側は細く白
        drawPath(ctx, pts, 16 * S.glow * w, [60, 120, 255], 0.18 * after);
        drawPath(ctx, pts, 6 * S.glow * w, [140, 190, 255], 0.5 * after);
        drawPath(ctx, pts, 1.6 * w, [255, 255, 255], (flash ? 1 : 0.7) * after);
      };
      draw(S.bolt.main, 1);
      for (const b of S.bolt.branches) draw(b.pts, 0.5);
      // 着地点の光
      const g = S.bolt.main[S.bolt.main.length - 1];
      const rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 60 * S.glow);
      rg.addColorStop(0, rgbs([180, 210, 255], 0.5 * after)); rg.addColorStop(1, rgbs([180, 210, 255], 0));
      ctx.fillStyle = rg; ctx.fillRect(g.x - 80, g.y - 80, 160, 160);
      ctx.globalCompositeOperation = 'source-over';
    }
    v.textPx(flash ? '⚡ 光っている（2〜3 フレーム）' : after > 0 ? '残像' : `次のストライクまで ${fmt(Math.max(0, S.nextAt - S.time), 2)} 秒`, 12, 18, C.muted, 'left', 12);
  } });
  animate(v.c, dt => { S.time += dt; if (S.time >= S.nextAt) strike(); v.redraw(); });
  slider('s-bolt-jag', x => S.jag = x, x => fmt(x, 2));
  slider('s-bolt-branches', x => S.branches = x, x => x + ' 本');
  slider('s-bolt-glow', x => S.glow = x, x => fmt(x, 2));
  slider('s-bolt-gap', x => S.gap = x, x => fmt(x, 2) + ' 秒');
  slider('s-bolt-after', x => S.after = x, x => fmt(x, 2) + ' 秒');
  checkbox('k-bolt-bg', x => S.flashBg = x);
  button('b-bolt-strike', () => strike());
}

/* ---------- CH 27  斬撃 ---------- */
{
  const S = { dur: 0.3, width: 55, len: 0.45, color: '#7fd0ff', t: 0, playing: true, speed: 0.25, R: 150, a0: -2.6, a1: 0.4 };
  const N = 60, M = 5;
  const v = makeViz('c-slash', { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 640, 360);
    // キャラの代わりの棒
    ctx.fillStyle = '#2f4a59'; ctx.beginPath(); ctx.roundRect(300, 170, 40, 120, 10); ctx.fill();
    const k = clamp(S.t / S.dur, 0, 1.6);
    const head = Math.min(1, 1 - (1 - Math.min(1, k)) * (1 - Math.min(1, k)) * (1 - Math.min(1, k)));  // 先端：easeOut で走る（14 章）
    const tail = Math.max(0, head - S.len * (1 - Math.max(0, k - 1) * 0.5));
    const erode = Math.max(0, k - 0.9) * 1.2;                                 // 走り終わったら 4 章のディゾルブで消す
    const cx = 320, cy = 200;
    const col = hex2rgb(S.color);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      if (u1 < tail || u0 > head) continue;
      const uu = (u0 + u1) / 2;
      const along = (uu - tail) / Math.max(0.001, head - tail);               // 帯の中の位置 0（尾）〜 1（先端）
      const wid = S.width * Math.sin(along * Math.PI) * (0.4 + 0.6 * along);   // 先端は太く、尾は細く
      for (let j = 0; j < M; j++) {
        const vv = (j + 0.5) / M;
        const n = fbm(uu * 8, vv * 3 + 2, 3, 5);
        if (n < erode) continue;                                             // しきい値で消す
        const edge = 1 - Math.abs(vv - 0.5) * 2;                             // 中心（v = 0.5）が白、縁が色（22 章）
        const bright = smoothstep(0.2, 1, edge) * (1 - smoothstep(0.7, 1, Math.abs(erode - n) < 0.06 ? 0 : 0.5));
        const a = (0.15 + 0.85 * edge) * (n < erode + 0.06 ? 1 : 0.9);
        const c = [lerp(col[0], 255, bright * 0.9), lerp(col[1], 255, bright * 0.9), lerp(col[2], 255, bright * 0.9)];
        const ang0 = S.a0 + (S.a1 - S.a0) * u0, ang1 = S.a0 + (S.a1 - S.a0) * u1;
        const r0 = S.R + (vv - 0.5) * wid, r1 = S.R + (vv + 1 / M - 0.5) * wid;
        ctx.fillStyle = rgbs(c, a * 0.9);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang0) * r0, cy + Math.sin(ang0) * r0); ctx.lineTo(cx + Math.cos(ang1) * r0, cy + Math.sin(ang1) * r0);
        ctx.lineTo(cx + Math.cos(ang1) * r1, cy + Math.sin(ang1) * r1); ctx.lineTo(cx + Math.cos(ang0) * r1, cy + Math.sin(ang0) * r1);
        ctx.closePath(); ctx.fill();
      }
    }
    // 先端の火花（少数、短命）
    if (k < 1) {
      const ang = S.a0 + (S.a1 - S.a0) * head;
      for (let i = 0; i < 5; i++) {
        const sd = hashf(i * 3.3 + Math.floor(S.t * 40));
        const px = cx + Math.cos(ang) * (S.R + (sd - 0.5) * S.width), py = cy + Math.sin(ang) * (S.R + (sd - 0.5) * S.width);
        ctx.fillStyle = rgbs([255, 255, 255], 0.8); ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    v.textPx(`t = ${fmt(S.t, 2)} s   先端 ${fmt(head, 2)}  尾 ${fmt(tail, 2)}  ディゾルブ ${fmt(erode, 2)}`, 12, 18, C.muted, 'left', 12);
  } });
  animate(v.c, dt => { if (S.playing) { S.t += dt * S.speed; if (S.t > S.dur * 1.6 + 0.4) S.t = 0; } v.redraw(); });
  slider('s-slash-dur', x => S.dur = x, x => fmt(x, 2) + ' 秒');
  slider('s-slash-width', x => S.width = x, x => x + ' px');
  slider('s-slash-len', x => S.len = x, x => fmt(x, 2));
  slider('s-slash-speed', x => S.speed = x, x => '×' + fmt(x, 2));
  colorInput('c-slash-col', x => S.color = x);
  button('b-slash-replay', () => { S.t = 0; S.playing = true; });
}

/* ---------- CH 28  回復 ---------- */
{
  const S = { hue: 0.38, speed: 1, count: 24, bad: false, time: 0 };
  const T = 2.4;   // 1 ループの長さ
  const v = makeViz('c-heal', { w: 640, h: 360, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#0d1a22'; ctx.fillRect(0, 300, 640, 60);
    ctx.fillStyle = '#2f4a59'; ctx.beginPath(); ctx.roundRect(300, 170, 40, 130, 10); ctx.fill();
    const cx = 320, cy = 300, ph = (S.time % T) / T;
    const mid = hsl2rgb(S.hue, 0.8, 0.6), edge = hsl2rgb(S.hue + 0.08, 0.7, 0.35), core = hsl2rgb(S.hue, 0.5, 0.92);
    ctx.globalCompositeOperation = 'lighter';
    // 足元の光：ゆっくり明滅（sin。cgmath 5 章）
    const pulse = 0.5 + 0.5 * Math.sin(S.time * 2.5);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
    g.addColorStop(0, rgbs(mid, 0.35 + 0.2 * pulse)); g.addColorStop(1, rgbs(mid, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, 90, 26, 0, 0, TAU); ctx.fill();
    // 上がる輪：3 本、時間差で。山のカーブで出て消える（14 章）
    for (let i = 0; i < 3; i++) {
      const t = (ph + i / 3) % 1;
      const a = Math.sin(t * Math.PI) * 0.6;
      ctx.strokeStyle = rgbs(core, a); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy - t * 150, 60 - t * 20, 16 - t * 5, 0, 0, TAU); ctx.stroke();
    }
    // 上がる粒：山のカーブ、上向き重力（15 章）、緩いゆらぎ
    for (let i = 0; i < S.count; i++) {
      const sd = hashf(i * 7.7), t = (ph + sd) % 1;
      const x = cx + (hashf(i * 3.1) - 0.5) * 120 + Math.sin(S.time * 1.5 + i) * 8, y = cy - 10 - t * t * 170;
      const a = Math.sin(t * Math.PI), r = 2 + 3 * Math.sin(t * Math.PI);
      const c = t < 0.5 ? mid : core;
      ctx.fillStyle = rgbs(c, a * 0.9); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (hashf(i * 5.5) > 0.7) {  // いくつかは十字のきらめき
        ctx.strokeStyle = rgbs(core, a * 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - r * 2.5, y); ctx.lineTo(x + r * 2.5, y); ctx.moveTo(x, y - r * 2.5); ctx.lineTo(x, y + r * 2.5); ctx.stroke();
      }
    }
    // 悪い例：回復なのに「衝撃」を付ける
    if (S.bad && ph < 0.15) {
      const k = 1 - ph / 0.15;
      ctx.strokeStyle = rgbs([255, 255, 255], k); ctx.lineWidth = 8 * k; ctx.beginPath(); ctx.arc(cx, cy - 60, 20 + (1 - k) * 140, 0, TAU); ctx.stroke();
      const fg = ctx.createRadialGradient(cx, cy - 60, 0, cx, cy - 60, 120);
      fg.addColorStop(0, rgbs([255, 255, 255], 0.9 * k)); fg.addColorStop(1, rgbs(edge, 0));
      ctx.fillStyle = fg; ctx.fillRect(cx - 130, cy - 190, 260, 260);
    }
    ctx.globalCompositeOperation = 'source-over';
    v.textPx(`ループ ${fmt(ph, 2)}   色 = 縁 / 中 / コア の 3 段（22 章）${S.bad ? '   ← 衝撃を付けた悪い例：攻撃を受けたように見える' : ''}`, 12, 18, C.muted, 'left', 12);
  } });
  animate(v.c, dt => { S.time += dt * S.speed; v.redraw(); });
  slider('s-heal-hue', x => S.hue = x, x => fmt(x * 360, 0) + '°');
  slider('s-heal-speed', x => S.speed = x, x => '×' + fmt(x, 2));
  slider('s-heal-count', x => S.count = x, x => x + ' 個');
  checkbox('k-heal-bad', x => S.bad = x);
}

/* ---------- CH 29  衝撃波 ---------- */
{
  const FRAG = `
uniform float u_strength, u_width, u_speed;
uniform float u_show;   // 0: 完成  1: 歪みだけ  2: リングと土埃だけ（歪みなし）
void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float r = length(p);
  float t = fract(u_time * u_speed * 0.5);                  // 0〜1 で 1 回（ループ）
  float R = 0.7 * (1.0 - (1.0 - t) * (1.0 - t));            // easeOut で広がる：はじめ速く（14 章）
  float band = (1.0 - smoothstep(0.0, u_width, abs(r - R)));        // リングの断面（5 章の極座標）
  float fade = 1.0 - t;
  // 歪み（3 章）：リングの所で、中心から外へ UV を押し出す = 空気が圧縮されて見える
  vec2 dir = r > 0.001 ? p / r : vec2(0.0);
  bool distort = u_show < 1.5;
  vec2 uv2 = distort ? uv - dir * band * u_strength * fade : uv;
  vec2 g = floor(uv2 * vec2(12.0, 7.0));
  vec3 col = mix(vec3(0.16, 0.24, 0.3), vec3(0.24, 0.34, 0.42), mod(g.x + g.y, 2.0));
  // 焦げ跡：中心が暗く残る（乗算、7 章）
  col *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.25, r)) * smoothstep(0.0, 0.1, t);
  if (u_show < 0.5 || u_show > 1.5) {
    // 土埃の輪：リングの少し内側を、ノイズで抜く（2 章）。角度方向は周期ノイズでつなぎ目なし
    float a = (atan(p.y, p.x) / 6.2832 + 0.5) * 8.0;
    float dust = smoothstep(0.35, 0.7, fbmP(vec2(a, r * 6.0 - t * 3.0), vec2(8.0, 1e4)));
    dust *= (1.0 - smoothstep(0.0, u_width * 2.5, abs(r - R + u_width))) * fade;
    col = mix(col, vec3(0.6, 0.55, 0.45), dust * 0.7);
    // 光る縁（加算）：一瞬だけ強く（20 章）
    col += vec3(0.7, 0.9, 1.0) * band * fade * fade;
  }
  outColor = vec4(col, 1.0);
}`;
  const S = { strength: 0.05, width: 0.05, speed: 1, show: 0 };
  makeGL('g-shock', { frag: FRAG, uniforms: () => ({ u_strength: S.strength, u_width: S.width, u_speed: S.speed, u_show: S.show }) });
  showCode('code-shock', FRAG);
  slider('s-shock-str', v => S.strength = v, v => fmt(v, 3));
  slider('s-shock-width', v => S.width = v, v => fmt(v, 3));
  slider('s-shock-speed', v => S.speed = v, v => fmt(v, 2));
  modeButtons('m-shock', d => S.show = +d.v);
}
