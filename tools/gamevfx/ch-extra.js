'use strict';
/* =========================================================
   追加章：サンドボックス（11）/ 光を受ける板（12）/ リボンの UV（17）
   ========================================================= */

/* ---------- CH 11  サンドボックス：部品を全部つなぐ ---------- */
{
  const FRAG = `
uniform float u_scale, u_spx, u_spy;   // ノイズの細かさ、流す速さ（横・縦）
uniform float u_dist;                  // 歪みの量（3 章）
uniform float u_cut, u_soft;           // しきい値と柔らかさ（2 章）
uniform float u_mask;                  // 0: 炎  1: 丸  2: リング  3: なし
uniform float u_polar, u_rep;          // 極座標にするか（5 章）、角度方向の繰り返し
uniform float u_blend, u_bg;           // 0: 通常  1: 加算（7 章）、背景の明暗
uniform vec3 u_c0, u_c1, u_c2, u_c3;   // ランプ（6 章）
vec3 ramp(float t) {
  vec3 c = mix(u_c0, u_c1, smoothstep(0.0, 0.33, t));
  c = mix(c, u_c2, smoothstep(0.33, 0.66, t));
  return mix(c, u_c3, smoothstep(0.66, 1.0, t));
}
void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float r = length(p) * 2.0;
  // 1) 座標を選ぶ：そのまま or 極座標
  vec2 cuv = uv;
  if (u_polar > 0.5) cuv = vec2((atan(p.y, p.x) / 6.2832 + 0.5) * u_rep, r);
  // 2) 歪み：座標をノイズでずらす
  vec2 d = vec2(fbm(uv * 3.0 + vec2(0.0, -u_time * 0.3)), fbm(uv * 3.0 + vec2(7.3, -u_time * 0.3))) - 0.5;
  cuv += d * u_dist;
  // 3) 流す：時間を足してノイズを読む
  vec2 q = cuv * vec2(u_polar > 0.5 ? 1.0 : u_scale, u_scale) + vec2(-u_time * u_spx, -u_time * u_spy);
  float n = u_polar > 0.5 ? fbmP(q, vec2(u_rep, 1e4)) : fbm(q);
  // 4) 抜く：マスクを掛ける
  float mask = 1.0;
  if (u_mask < 0.5) { float x = abs(uv.x - 0.5) * 2.0; mask = (1.0 - uv.y) * max(0.0, 1.0 - x * x); }
  else if (u_mask < 1.5) mask = 1.0 - smoothstep(0.1, 0.5, length(uv - 0.5));
  else if (u_mask < 2.5) mask = 1.0 - smoothstep(0.05, 0.25, abs(r - 0.6));
  // 5) 切る → 6) 色を着ける
  float v = smoothstep(u_cut, u_cut + u_soft, n * mask * 1.6);
  vec3 col = ramp(v);
  // 7) 背景に重ねる
  vec3 bg = u_bg > 0.5 ? mix(vec3(0.75, 0.85, 0.95), vec3(0.95), uv.y) : vec3(0.06, 0.1, 0.13);
  outColor = vec4(u_blend > 0.5 ? bg + col * v : mix(bg, col, v), 1.0);
}`;
  const S = { scale: 4, spx: 0, spy: 0.6, dist: 0.05, cut: 0.35, soft: 0.35, mask: 0, polar: 0, rep: 6, blend: 1, bg: 0, c: ['#000000', '#c81400', '#ff8c0d', '#ffffff'] };
  makeGL('g-sb', { frag: FRAG, uniforms: () => ({ u_scale: S.scale, u_spx: S.spx, u_spy: S.spy, u_dist: S.dist, u_cut: S.cut, u_soft: S.soft, u_mask: S.mask, u_polar: S.polar, u_rep: S.rep, u_blend: S.blend, u_bg: S.bg, u_c0: hex2vec(S.c[0]), u_c1: hex2vec(S.c[1]), u_c2: hex2vec(S.c[2]), u_c3: hex2vec(S.c[3]) }) });
  showCode('code-sb', FRAG);
  slider('s-sb-scale', v => S.scale = v, v => fmt(v, 1));
  slider('s-sb-spx', v => S.spx = v, v => fmt(v, 2));
  slider('s-sb-spy', v => S.spy = v, v => fmt(v, 2));
  slider('s-sb-dist', v => S.dist = v, v => fmt(v, 2));
  slider('s-sb-cut', v => S.cut = v, v => fmt(v, 2));
  slider('s-sb-soft', v => S.soft = v, v => fmt(v, 2));
  slider('s-sb-rep', v => S.rep = v, v => fmt(v, 0));
  modeButtons('m-sb-mask', d => S.mask = +d.v);
  modeButtons('m-sb-blend', d => S.blend = +d.v);
  checkbox('k-sb-polar', v => S.polar = v ? 1 : 0);
  checkbox('k-sb-bg', v => S.bg = v ? 1 : 0);
  [0, 1, 2, 3].forEach(i => colorInput('c-sb-' + i, v => S.c[i] = v));
  const PRESETS = {
    fire: { 's-sb-scale': 4, 's-sb-spx': 0, 's-sb-spy': 0.6, 's-sb-dist': 0.05, 's-sb-cut': 0.35, 's-sb-soft': 0.35, 'm-sb-mask': 0, 'k-sb-polar': false, 'm-sb-blend': 1, 'c-sb-0': '#000000', 'c-sb-1': '#c81400', 'c-sb-2': '#ff8c0d', 'c-sb-3': '#ffffff' },
    smoke: { 's-sb-scale': 3, 's-sb-spx': 0.05, 's-sb-spy': 0.25, 's-sb-dist': 0.1, 's-sb-cut': 0.3, 's-sb-soft': 0.6, 'm-sb-mask': 1, 'k-sb-polar': false, 'm-sb-blend': 0, 'c-sb-0': '#1a1a1e', 'c-sb-1': '#4a4a50', 'c-sb-2': '#8a8a90', 'c-sb-3': '#d0d0d4' },
    aura: { 's-sb-scale': 3, 's-sb-spx': 0.4, 's-sb-spy': 0.5, 's-sb-dist': 0.05, 's-sb-cut': 0.3, 's-sb-soft': 0.4, 'm-sb-mask': 2, 'k-sb-polar': true, 's-sb-rep': 6, 'm-sb-blend': 1, 'c-sb-0': '#000000', 'c-sb-1': '#0a2a6a', 'c-sb-2': '#3fa0ff', 'c-sb-3': '#e8f6ff' },
    circle: { 's-sb-scale': 1.5, 's-sb-spx': 0.15, 's-sb-spy': 0, 's-sb-dist': 0, 's-sb-cut': 0.5, 's-sb-soft': 0.03, 'm-sb-mask': 2, 'k-sb-polar': true, 's-sb-rep': 12, 'm-sb-blend': 1, 'c-sb-0': '#000000', 'c-sb-1': '#3a0a4a', 'c-sb-2': '#c040ff', 'c-sb-3': '#ffe0ff' },
    poison: { 's-sb-scale': 5, 's-sb-spx': 0.2, 's-sb-spy': 0.1, 's-sb-dist': 0.15, 's-sb-cut': 0.3, 's-sb-soft': 0.5, 'm-sb-mask': 1, 'k-sb-polar': false, 'm-sb-blend': 0, 'c-sb-0': '#061a08', 'c-sb-1': '#1a4a10', 'c-sb-2': '#5fdc30', 'c-sb-3': '#e0ffc0' },
  };
  modeButtons('m-sb-preset', d => setControls(PRESETS[d.v]));
}

/* ---------- CH 12  光を受ける板 ---------- */
{
  const FRAG = `
uniform float u_az, u_el;     // 光の向き（方位角・仰角）
uniform vec3 u_lightCol;      // 光の色
uniform float u_bump;         // 凹凸の強さ
uniform float u_mode;         // 0: 光を受ける  1: 自己発光（法線なし）  2: 法線を色で見る
float height(vec2 uv) {       // 煙の板の「厚み」：中心が厚く、ノイズで凸凹
  float m = 1.0 - smoothstep(0.1, 0.5, length(uv - 0.5));
  return m * (0.6 + 0.8 * fbm(uv * 4.0 + vec2(0.0, -u_time * 0.15)));
}
void main() {
  vec2 uv = v_uv;
  float h = height(uv);
  // 厚みの傾きから法線を作る（4 章「法線」、cgmath 4 章）
  float e = 0.004;
  float hL = height(uv - vec2(e, 0.0)), hR = height(uv + vec2(e, 0.0));
  float hD = height(uv - vec2(0.0, e)), hU = height(uv + vec2(0.0, e));
  vec3 N = normalize(vec3((hL - hR) * u_bump * 60.0, (hD - hU) * u_bump * 60.0, 1.0));
  // 光の向き
  vec3 L = normalize(vec3(cos(u_az) * cos(u_el), sin(u_az) * cos(u_el), sin(u_el)));
  float lambert = max(dot(N, L), 0.0);            // ← 面が光を向いているほど明るい（3 章「内積」）
  vec3 albedo = vec3(0.85);
  vec3 ambient = vec3(0.35, 0.42, 0.52) * 0.5;    // 環境光（空の色）
  vec3 lit = albedo * (ambient + lambert * u_lightCol);
  vec3 col = lit;
  if (abs(u_mode - 1.0) < 0.5) col = albedo * 0.75;     // 自己発光：向きに関係なく同じ明るさ
  if (abs(u_mode - 2.0) < 0.5) col = N * 0.5 + 0.5;     // 法線を色で
  float alpha = smoothstep(0.15, 0.6, h);
  vec3 bg = vec3(0.06, 0.1, 0.13);
  col = mix(bg, col, alpha);
  // 光源の位置を点で示す
  vec2 lp = vec2(0.5) + vec2(cos(u_az) / (u_res.x / u_res.y), sin(u_az)) * cos(u_el) * 0.45;
  col += vec3(1.0, 0.9, 0.6) * smoothstep(0.02, 0.0, length((uv - lp) * vec2(u_res.x / u_res.y, 1.0)));
  outColor = vec4(col, 1.0);
}`;
  const S = { az: 0.8, el: 0.7, col: '#ffd9a6', bump: 0.5, mode: 0, orbit: true };
  makeGL('g-lit', { frag: FRAG, uniforms: g => {
    if (S.orbit) { S.az = g.time * 0.6; const el = $('#s-lit-az'); if (el) { el.value = ((S.az % TAU) + TAU) % TAU; $('#s-lit-az-v').textContent = fmt(+el.value * 180 / Math.PI, 0) + '°'; } }
    return { u_az: S.az, u_el: S.el, u_lightCol: hex2vec(S.col), u_bump: S.bump, u_mode: S.mode };
  } });
  showCode('code-lit', FRAG);
  slider('s-lit-az', v => { S.az = v; S.orbit = false; $('#k-lit-orbit').checked = false; }, v => fmt(v * 180 / Math.PI, 0) + '°');
  slider('s-lit-el', v => S.el = v, v => fmt(v * 180 / Math.PI, 0) + '°');
  slider('s-lit-bump', v => S.bump = v, v => fmt(v, 2));
  colorInput('c-lit-col', v => S.col = v);
  modeButtons('m-lit', d => S.mode = +d.v);
  checkbox('k-lit-orbit', v => S.orbit = v);
  modeButtons('m-lit-preset', d => { S.col = d.c; const el = $('#c-lit-col'); if (el) el.value = d.c; });
}

/* ---------- CH 17  リボンの UV：帯に沿ってテクスチャを流す ---------- */
const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
           y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};
{
  const S = { P: [{ x: -4.2, y: -2.5 }, { x: -3.5, y: 2.5 }, { x: 1.5, y: 3.2 }, { x: 4.2, y: -1.5 }], width: 0.9, taper: 1, speed: 0.5, tile: 3, tex: 'stripe', showUV: false, time: 0 };
  const N = 48, M = 6;
  const tex = (u, v, t) => {                           // 帯の上の座標 (u, v) → 色。u に時間を引いて流す
    const uu = u * S.tile - t;
    if (S.showUV) return [u * 255, v * 255, 0];
    if (S.tex === 'stripe') return fract(uu) < 0.5 ? [255, 209, 102] : [44, 80, 110];
    const n = fbm(uu * 1.5, v * 2 + 3, 3, 1);
    const edge = 1 - Math.abs(v - 0.5) * 2;             // 帯の縁で薄く（マスク）
    if (S.tex === 'noise') { const g = smoothstep(0.3, 0.7, n * edge * 1.6) * 255; return [g, g, g]; }
    return fireRampJS(smoothstep(0.25, 0.8, n * edge * 1.7 * (1 - u * 0.5)));  // 炎：先端（u=1）ほど薄く
  };
  const v = makeViz('c-rib', { w: 640, h: 360, unit: 34, ox: 200, oy: 190, draw(v) {
    const { ctx } = v;
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, 400, 360);
    // 制御点のガイド
    v.line(S.P[0], S.P[1], C.grid2, 1, [4, 4]); v.line(S.P[2], S.P[3], C.grid2, 1, [4, 4]);
    // 帯：曲線に沿って N 分割、幅方向に M 分割した小さな四角を塗る
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = bezier(...S.P, t), q = bezier(...S.P, Math.min(1, t + 0.01)), q0 = bezier(...S.P, Math.max(0, t - 0.01));
      const tan = normalize(sub(q, q0)), nrm = { x: -tan.y, y: tan.x };
      const w = S.width * (1 - S.taper * t * 0.85);       // 先端ほど細く
      pts.push({ p, nrm, w });
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = pts[i], b = pts[i + 1], s0 = j / M - 0.5, s1 = (j + 1) / M - 0.5;
      const c0 = add(a.p, scale(a.nrm, a.w * s0)), c1 = add(b.p, scale(b.nrm, b.w * s0)), c2 = add(b.p, scale(b.nrm, b.w * s1)), c3 = add(a.p, scale(a.nrm, a.w * s1));
      const col = tex((i + 0.5) / N, (j + 0.5) / M, S.time * S.speed);
      ctx.fillStyle = rgbs(col); ctx.strokeStyle = rgbs(col); ctx.lineWidth = 0.6;
      ctx.beginPath(); [c0, c1, c2, c3].forEach((c, k) => { const [x, y] = v.px(c); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    v.drawHandles();
    v.textPx('u = 0（根元）', ...v.px(S.P[0]).map((c, k) => c + (k ? 18 : 0)), C.muted, 'center', 11);
    v.textPx('u = 1（先端）', ...v.px(S.P[3]).map((c, k) => c + (k ? 18 : 0)), C.muted, 'center', 11);
    // 右：広げた UV（平らな長方形に同じテクスチャ）
    ctx.fillStyle = '#0d1a22'; ctx.fillRect(400, 0, 240, 360);
    v.textPx('広げた UV（平らな長方形）', 520, 18, C.muted, 'center', 12);
    const gx = 420, gy = 40, gw = 200, gh = 60;
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      ctx.fillStyle = rgbs(tex((i + 0.5) / N, (j + 0.5) / M, S.time * S.speed));
      ctx.fillRect(gx + i / N * gw, gy + gh - (j + 1) / M * gh, gw / N + 0.5, gh / M + 0.5);
    }
    ctx.strokeStyle = C.grid2; ctx.strokeRect(gx, gy, gw, gh);
    v.textPx('u →（時間で流れる向き）', gx + gw / 2, gy + gh + 14, C.muted, 'center', 11);
    v.textPx('v', gx - 10, gy + gh / 2, C.muted, 'center', 11);
    v.textPx('同じ (u, v) → 同じ色。', 520, 150, C.text, 'center', 12);
    v.textPx('帯が曲がっていても', 520, 170, C.text, 'center', 12);
    v.textPx('テクスチャは帯に沿って流れる', 520, 190, C.text, 'center', 12);
  } });
  S.P.forEach((p, i) => v.handles.push({ get: () => p, set: q => { p.x = q.x; p.y = q.y; }, color: i === 0 || i === 3 ? C.yellow : C.blue }));
  animate(v.c, dt => { S.time += dt; v.redraw(); });
  slider('s-rib-width', x => S.width = x, x => fmt(x, 2));
  slider('s-rib-taper', x => S.taper = x, x => fmt(x, 2));
  slider('s-rib-speed', x => S.speed = x, x => fmt(x, 2));
  slider('s-rib-tile', x => S.tile = x, x => fmt(x, 0));
  modeButtons('m-rib', d => S.tex = d.v);
  checkbox('k-rib-uv', x => S.showUV = x);
}
