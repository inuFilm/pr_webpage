'use strict';
/* =========================================================
   app-extra.js — 四元数 / 重心座標 / フーリエ変換
   app.js, app-patterns.js の後に読み込む
   ========================================================= */

/* ---------- 3D 表示ヘルパー ---------- */
const rotZ3 = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a), z: p.z });
const view3 = p => rotX3(rotY3(p, -0.6), 0.42);
function proj3(p, dist = 5.5, focal = 470) { const q = view3(p); const z = q.z + dist; return { x: q.x / z * focal, y: q.y / z * focal, depth: z }; }

/* ---------- 四元数 ---------- */
const qAxis = (axis, a) => { const s = Math.sin(a / 2); return { w: Math.cos(a / 2), x: axis.x * s, y: axis.y * s, z: axis.z * s }; };
const qmul = (a, b) => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
const qrot = (q, v) => { const u = { x: q.x, y: q.y, z: q.z }; const t = scale3(cross3(u, v), 2); return add3(v, add3(scale3(t, q.w), cross3(u, t))); };
const qEuler = (ex, ey, ez) => qmul(qAxis({ x: 0, y: 0, z: 1 }, ez), qmul(qAxis({ x: 0, y: 1, z: 0 }, ey), qAxis({ x: 1, y: 0, z: 0 }, ex)));
const qnorm = q => { const l = Math.hypot(q.w, q.x, q.y, q.z) || 1; return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l }; };
function qslerp(a, b, t) {
  let d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  if (d < 0) { b = { w: -b.w, x: -b.x, y: -b.y, z: -b.z }; d = -d; }
  if (d > 0.9995) return qnorm({ w: lerp(a.w, b.w, t), x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
  const th = Math.acos(d), wa = Math.sin((1 - t) * th) / Math.sin(th), wb = Math.sin(t * th) / Math.sin(th);
  return { w: a.w * wa + b.w * wb, x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}
const eulerXYZ = (p, ex, ey, ez) => rotZ3(rotY3(rotX3(p, ex), ey), ez);
const rad = d => d * Math.PI / 180;

/* =========================================================
   Q1 ジンバルロック
   ========================================================= */
(function () {
  const S = { ex: 20, ey: 30, ez: 10 };
  const v = makeViz('c-gimbal', {
    w: 640, h: 400, unit: 1, ox: 320, oy: 200,
    draw(v) {
      const ex = rad(S.ex), ey = rad(S.ey), ez = rad(S.ez);
      const ring = (radius, plane, xf, color, label) => {
        const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU; let p; if (plane === 'yz') p = { x: 0, y: Math.cos(a) * radius, z: Math.sin(a) * radius }; else if (plane === 'xz') p = { x: Math.cos(a) * radius, y: 0, z: Math.sin(a) * radius }; else p = { x: Math.cos(a) * radius, y: Math.sin(a) * radius, z: 0 }; pts.push(proj3(xf(p))); }
        v.ctx.save(); v.ctx.strokeStyle = color; v.ctx.lineWidth = 2.5; v.ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = v.px(q); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }); v.ctx.stroke(); v.ctx.restore();
        const axisEnd = xf(plane === 'yz' ? { x: radius * 1.15, y: 0, z: 0 } : plane === 'xz' ? { x: 0, y: radius * 1.15, z: 0 } : { x: 0, y: 0, z: radius * 1.15 });
        v.arrow(proj3(xf({ x: 0, y: 0, z: 0 })), proj3(axisEnd), color, label, 2);
      };
      // 外側 Z（固定）, 中 Y（Z で回る）, 内 X（Z, Y で回る）
      ring(1.55, 'xy', p => p, 'rgba(44,169,225,0.9)', 'Z 軸');
      ring(1.3, 'xz', p => rotZ3(p, ez), 'rgba(110,231,183,0.9)', 'Y 軸');
      ring(1.05, 'yz', p => rotZ3(rotY3(p, ey), ez), 'rgba(255,107,157,0.95)', 'X 軸');
      // 物体（飛行機っぽい箱）
      const xf = p => eulerXYZ(p, ex, ey, ez);
      const box = [[-0.7, -0.15, -0.3], [0.7, -0.15, -0.3], [0.7, 0.15, -0.3], [-0.7, 0.15, -0.3], [-0.7, -0.15, 0.3], [0.7, -0.15, 0.3], [0.7, 0.15, 0.3], [-0.7, 0.15, 0.3]].map(([x, y, z]) => proj3(xf({ x, y, z })));
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => v.line(box[a], box[b], 'rgba(255,209,102,0.9)', 2));
      v.arrow(proj3(xf({ x: 0, y: 0, z: 0 })), proj3(xf({ x: 1.0, y: 0, z: 0 })), C.yellow, '前', 3);
      const q = qEuler(ex, ey, ez); const ang = 2 * Math.acos(clamp(Math.abs(q.w), -1, 1)); const s = Math.sqrt(Math.max(0, 1 - q.w * q.w)) || 1; const axis = { x: q.x / s, y: q.y / s, z: q.z / s };
      const locked = Math.abs(Math.abs(S.ey) - 90) < 3;
      setHTML('r-gimbal', `euler = { x: ${S.ex}°, y: ${S.ey}°, z: ${S.ez}° }（X → Y → Z の順）\n同じ回転を「軸と角度」で: axis = ${vs3(axis)}  angle = ${fmt(deg(ang), 0)}°\n四元数: { w: ${fmt(q.w, 3)}, x: ${fmt(q.x, 3)}, y: ${fmt(q.y, 3)}, z: ${fmt(q.z, 3)} }\n${locked ? hl('ジンバルロック：X のリングと Z のリングが同じ平面に重なった。X と Z は同じ回転しか作れない') : Math.abs(S.ey) > 70 ? 'Y が 90° に近づくと、X と Z のリングが重なっていく' : 'X と Z のリングが別の平面にある間は、3 方向に自由に回せる'}`);
    },
  });
  if (!v) return;
  const sx = slider('s-ex', val => { S.ex = val; v.redraw(); }, val => `${val}°`), sy = slider('s-ey', val => { S.ey = val; v.redraw(); }, val => `${val}°`), sz = slider('s-ez', val => { S.ez = val; v.redraw(); }, val => `${val}°`);
  $('#b-gimbal-lock').addEventListener('click', () => { S.ey = 90; sy.value = 90; $('#s-ey-v').textContent = '90°'; v.redraw(); });
  $('#b-gimbal-reset').addEventListener('click', () => { S.ex = 20; S.ey = 30; S.ez = 10; sx.value = 20; sy.value = 30; sz.value = 10; $('#s-ex-v').textContent = '20°'; $('#s-ey-v').textContent = '30°'; $('#s-ez-v').textContent = '10°'; v.redraw(); });
  register(secIdx('c-gimbal'), v);
})();

/* =========================================================
   Q2 slerp vs オイラー角の lerp
   ========================================================= */
(function () {
  const S = { t: 0.4, play: true, dir: 1, eb: { x: 40, y: 150, z: 110 }, salt: 0 };
  const V0 = { x: 0, y: 0, z: 1 }, R = 150;
  const v = makeViz('c-slerp', {
    w: 640, h: 400, unit: 1, ox: 320, oy: 200,
    draw(v) {
      const P = p => { const q = proj3(scale3(p, 1)); return { x: q.x * R / 65, y: q.y * R / 65, depth: q.depth }; }; // 球の半径を R px に
      // 球
      v.ctx.save(); v.ctx.strokeStyle = 'rgba(255,255,255,0.15)'; v.ctx.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) { v.ctx.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU, r = Math.cos(rad(lat)); const q = P({ x: Math.cos(a) * r, y: Math.sin(rad(lat)), z: Math.sin(a) * r }); const [x, y] = v.px(q); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); } v.ctx.stroke(); }
      for (let lon = 0; lon < 180; lon += 45) { v.ctx.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU; const q = P(rotY3({ x: Math.cos(a), y: Math.sin(a), z: 0 }, rad(lon))); const [x, y] = v.px(q); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); } v.ctx.stroke(); }
      v.ctx.restore();
      v.circle({ x: 0, y: 0 }, R * 1.02, 'rgba(255,255,255,0.35)', 1.5);
      const qA = { w: 1, x: 0, y: 0, z: 0 }, qB = qEuler(rad(S.eb.x), rad(S.eb.y), rad(S.eb.z));
      const eulerPath = t => qrot(qEuler(rad(S.eb.x) * t, rad(S.eb.y) * t, rad(S.eb.z) * t), V0);
      const slerpPath = t => qrot(qslerp(qA, qB, t), V0);
      const drawPath = (fn, color, dotColor) => {
        let len = 0, prev = null;
        v.ctx.save(); v.ctx.strokeStyle = color; v.ctx.lineWidth = 2.5; v.ctx.beginPath();
        for (let i = 0; i <= 100; i++) { const p = fn(i / 100); if (prev) len += len3(sub3(p, prev)); prev = p; const q = P(p); const [x, y] = v.px(q); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }
        v.ctx.stroke(); v.ctx.restore();
        for (let i = 0; i <= 10; i++) v.point(P(fn(i / 10)), dotColor, 3.5);
        return len;
      };
      const lenE = drawPath(eulerPath, 'rgba(255,107,157,0.9)', C.pink), lenS = drawPath(slerpPath, 'rgba(110,231,183,0.9)', C.green);
      const pe = eulerPath(S.t), ps = slerpPath(S.t);
      v.arrow({ x: 0, y: 0 }, P(pe), C.pink, 'オイラー角 lerp', 3); v.arrow({ x: 0, y: 0 }, P(ps), C.green, 'slerp', 3);
      v.point(P(V0), C.white, 5, true); v.text('A', P(V0), C.white, 10, -10); v.point(P(qrot(qB, V0)), C.yellow, 5, true); v.text('B', P(qrot(qB, V0)), C.yellow, 10, -10);
      const d = Math.abs(qA.w * qB.w + qA.x * qB.x + qA.y * qB.y + qA.z * qB.z);
      setHTML('r-slerp', `B のオイラー角 = { x: ${S.eb.x}°, y: ${S.eb.y}°, z: ${S.eb.z}° }   四元数 qB = { w: ${fmt(qB.w, 2)}, x: ${fmt(qB.x, 2)}, y: ${fmt(qB.y, 2)}, z: ${fmt(qB.z, 2)} }\nA と B の間の角度（1 本の軸で回す量）= 2 * acos(dot(qA, qB)) = ${fmt(deg(2 * Math.acos(clamp(d, 0, 1))), 0)}°\nt = ${fmt(S.t)}   矢印の先端が通った道のり: ${hl('slerp ' + fmt(lenS))}  vs  オイラー角 lerp ${fmt(lenE)}   ${lenE > lenS * 1.15 ? '← 遠回り。点の間隔もムラがある' : ''}`);
    },
  });
  if (!v) return;
  const st = slider('s-qt', val => { S.t = val; v.redraw(); }, val => fmt(val));
  checkbox('k-qplay', on => { S.play = on; });
  $('#b-qrand').addEventListener('click', () => { S.salt++; S.eb = { x: Math.round((hashf(S.salt * 3 + 1) - 0.5) * 300), y: Math.round((hashf(S.salt * 3 + 2) - 0.5) * 320), z: Math.round((hashf(S.salt * 3 + 3) - 0.5) * 300) }; v.redraw(); });
  animators.push({ section: secIdx('c-slerp'), fn(dt) { if (!S.play) return; S.t += dt * 0.35 * S.dir; if (S.t >= 1) { S.t = 1; S.dir = -1; } if (S.t <= 0) { S.t = 0; S.dir = 1; } st.value = S.t; $('#s-qt-v').textContent = fmt(S.t); v.redraw(); } });
  register(secIdx('c-slerp'), v);
})();

/* =========================================================
   B 重心座標
   ========================================================= */
(function () {
  const S = { mode: 'uv', A: { x: 60, y: 300 }, B: { x: 360, y: 250 }, C: { x: 200, y: 60 }, P: { x: 210, y: 210 } };
  const UV = { A: { x: 0.1, y: 0.15 }, B: { x: 0.9, y: 0.2 }, C: { x: 0.5, y: 0.9 } };
  const VC = { A: [255, 107, 107], B: [110, 231, 183], C: [44, 169, 225] };
  const tex = (u, vv) => { const k = (Math.floor(u * 8) + Math.floor(vv * 8)) % 2; const base = hsl2rgb(0.55 + u * 0.35, 0.65, 0.5 + vv * 0.15); return k ? base : mixc(base, [20, 30, 40], 0.55); };
  const TX = 420, TY = 380, TS = 200; // UV パネル（左下原点）
  const uvToPx = q => ({ x: TX + q.x * TS, y: TY - (1 - q.y) * TS + 0 });
  const bary = (P, A, B, C) => { const area = cross2d(sub(B, A), sub(C, A)) || 1e-9; const wa = cross2d(sub(B, P), sub(C, P)) / area, wb = cross2d(sub(C, P), sub(A, P)) / area; return { wa, wb, wc: 1 - wa - wb }; };
  const v = makeViz('c-bary', {
    w: 640, h: 400, unit: 1, ox: 0, oy: 400,
    draw(v) {
      const { A, B, C, P } = S; const w = bary(P, A, B, C);
      // 左：三角形と小三角形
      v.poly([P, B, C], `rgba(${VC.A.join(',')},${clamp(Math.abs(w.wa) * 0.5, 0, 0.5)})`, null); v.poly([P, C, A], `rgba(${VC.B.join(',')},${clamp(Math.abs(w.wb) * 0.5, 0, 0.5)})`, null); v.poly([P, A, B], `rgba(${VC.C.join(',')},${clamp(Math.abs(w.wc) * 0.5, 0, 0.5)})`, null);
      v.poly([A, B, C], null, 'rgba(255,255,255,0.7)', 2);
      v.line(P, A, 'rgba(255,255,255,0.25)', 1, [4, 4]); v.line(P, B, 'rgba(255,255,255,0.25)', 1, [4, 4]); v.line(P, C, 'rgba(255,255,255,0.25)', 1, [4, 4]);
      v.text(`A  wa = ${fmt(w.wa)}`, A, rgbs(VC.A), -10, 16, 'right'); v.text(`B  wb = ${fmt(w.wb)}`, B, rgbs(VC.B), 10, 16); v.text(`C  wc = ${fmt(w.wc)}`, C, rgbs(VC.C), 0, -16, 'center');
      // UV パネル
      const cell = TS / 8;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const c = tex((i + 0.5) / 8, (j + 0.5) / 8); v.ctx.fillStyle = rgbs(c); v.ctx.fillRect(TX + i * cell, 400 - ((TY - TS) + (j + 1) * cell), cell, cell); }
      const uA = uvToPx(UV.A), uB = uvToPx(UV.B), uC = uvToPx(UV.C);
      v.poly([uA, uB, uC], 'rgba(0,0,0,0)', 'rgba(255,255,255,0.9)', 2);
      v.text('A', uA, rgbs(VC.A), -12, 8); v.text('B', uB, rgbs(VC.B), 10, 8); v.text('C', uC, rgbs(VC.C), 0, -14, 'center');
      v.textPx('テクスチャ（UV 空間）', TX + TS / 2, 400 - (TY - TS) + 14, C.muted, 'center', 12);
      const uv = { x: UV.A.x * w.wa + UV.B.x * w.wb + UV.C.x * w.wc, y: UV.A.y * w.wa + UV.B.y * w.wb + UV.C.y * w.wc };
      const inside = w.wa >= 0 && w.wb >= 0 && w.wc >= 0;
      let col;
      if (S.mode === 'uv') col = tex(clamp(uv.x, 0, 0.999), clamp(uv.y, 0, 0.999)); else col = [0, 1, 2].map(i => VC.A[i] * w.wa + VC.B[i] * w.wb + VC.C[i] * w.wc).map(x => clamp(x, 0, 255));
      const up = uvToPx(uv); v.point(up, C.yellow, 6, true); v.line(P, up, 'rgba(255,209,102,0.35)', 1, [3, 6]);
      v.point(P, rgbs(col), 14, true); v.text('P', P, C.text, 0, -22, 'center');
      v.drawHandles();
      setHTML('r-bary', `P = ${fmt(w.wa)} * A + ${fmt(w.wb)} * B + ${fmt(w.wc)} * C     合計 = ${fmt(w.wa + w.wb + w.wc)}   ${inside ? '全部 0 以上 → 三角形の中' : hl('マイナスがある → 三角形の外')}\n${S.mode === 'uv' ? `uv = ${fmt(w.wa)} * A.uv + ${fmt(w.wb)} * B.uv + ${fmt(w.wc)} * C.uv = {u: ${fmt(uv.x)}, v: ${fmt(uv.y)}}  → テクスチャのその場所の色を P に塗る` : `color = ${fmt(w.wa)} * 赤 + ${fmt(w.wb)} * 緑 + ${fmt(w.wc)} * 青 = rgb(${col.map(x => fmt(x, 0)).join(', ')})`}\n同じ重みで、法線・重さ・ボーンのウェイト、頂点にある値なら何でも混ぜられる`);
    },
  });
  if (!v) return;
  ['A', 'B', 'C'].forEach(k => v.handles.push({ get: () => S[k], set: p => { S[k] = { x: clamp(p.x, 20, 390), y: clamp(p.y, 20, 380) }; }, color: rgbs(VC[k]) }));
  v.handles.push({ get: () => S.P, set: p => { S.P = { x: clamp(p.x, 10, 400), y: clamp(p.y, 10, 390) }; }, color: C.yellow });
  modeButtons('bary-modes', d => { S.mode = d.m; v.redraw(); });
  register(secIdx('c-bary'), v);
})();

/* =========================================================
   F1 フーリエ級数（足す側）
   ========================================================= */
(function () {
  const S = { preset: 'square', n: 4, t: 0, play: false };
  const AMP = {
    square: k => (k % 2 === 1 ? 1 / k : 0),
    saw: k => (k % 2 === 1 ? 1 : -1) / k * 0.8,
    tri: k => (k % 2 === 1 ? ((k - 1) / 2 % 2 === 0 ? 1 : -1) / (k * k) * 1.2 : 0),
    pulse: k => Math.sin(k * 0.35) / (k * 0.35) * 0.5,
  };
  const PH = { square: 0, saw: 0, tri: 0, pulse: Math.PI / 2 };
  const v = makeViz('c-fseries', {
    w: 640, h: 360, unit: 1, ox: 0, oy: 360,
    draw(v) {
      const gx = 20, gw = 400, cy = 180, amp = 95;
      v.line({ x: gx, y: cy }, { x: gx + gw, y: cy }, C.axis, 1.5);
      const f = AMP[S.preset], ph = PH[S.preset];
      const wave = (x, k) => f(k) * Math.sin(k * x + ph + S.t * k * 0.0);
      // 成分
      for (let k = 1; k <= S.n; k++) { if (!f(k)) continue; v.ctx.save(); v.ctx.strokeStyle = `rgba(44,169,225,${0.35})`; v.ctx.lineWidth = 1; v.ctx.beginPath(); for (let i = 0; i <= 200; i++) { const x = gx + gw * i / 200, y = 360 - (cy + wave(i / 200 * TAU * 2 - S.t, k) * amp); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); } v.ctx.stroke(); v.ctx.restore(); }
      // 合計
      v.ctx.save(); v.ctx.strokeStyle = C.yellow; v.ctx.lineWidth = 3; v.ctx.beginPath();
      for (let i = 0; i <= 400; i++) { let y = 0; for (let k = 1; k <= S.n; k++) y += wave(i / 400 * TAU * 2 - S.t, k); const px = gx + gw * i / 400, py = 360 - (cy + y * amp); i ? v.ctx.lineTo(px, py) : v.ctx.moveTo(px, py); }
      v.ctx.stroke(); v.ctx.restore();
      // スペクトル
      const bx = 450, bw = 170, bh = 200, by = 90;
      v.textPx('スペクトル（周波数 k → 強さ）', bx + bw / 2, 360 - (by + bh + 14), C.muted, 'center', 12);
      v.line({ x: bx, y: by }, { x: bx + bw, y: by }, C.axis, 1.5);
      for (let k = 1; k <= 30; k++) { const a = Math.abs(f(k)); const x = bx + (k - 0.5) * bw / 30; const h = a * bh * 0.9; v.ctx.fillStyle = k <= S.n ? C.yellow : 'rgba(255,255,255,0.15)'; v.ctx.fillRect(x - 2, 360 - (by + h), 4, h); }
      v.textPx('k = 1', bx + bw / 60, 360 - by + 12, C.muted, 'center', 10); v.textPx('30', bx + bw - 3, 360 - by + 12, C.muted, 'center', 10);
      const terms = []; for (let k = 1; k <= S.n; k++) if (f(k)) terms.push(`${fmt(f(k))} * sin(${k}x)`);
      setHTML('r-fseries', `y = ${terms.slice(0, 5).join(' + ')}${terms.length > 5 ? ' + …' : ''}\n項の数 = ${S.n}（黄色のバー）   ${S.preset === 'square' ? '矩形波: 奇数の k だけ、強さ 1/k' : S.preset === 'saw' ? 'のこぎり波: 全部の k、強さ 1/k で符号が交互' : S.preset === 'tri' ? '三角波: 奇数の k だけ、強さ 1/k²（すぐ収束する = なめらか）' : 'パルス: 全部の k がほぼ同じ強さ（尖った形ほど高周波が要る）'}`);
    },
  });
  if (!v) return;
  modeButtons('fs-presets', d => { S.preset = d.p; v.redraw(); });
  slider('s-fsn', val => { S.n = val; v.redraw(); });
  checkbox('k-fsplay', on => { S.play = on; });
  animators.push({ section: secIdx('c-fseries'), fn(dt) { if (S.play) { S.t += dt * 1.5; v.redraw(); } } });
  register(secIdx('c-fseries'), v);
})();

/* =========================================================
   F2 描いた形を分解する（DFT）
   ========================================================= */
(function () {
  const N = 128, K = 64;
  const S = { x: new Float32Array(N), amp: new Float32Array(K), phase: new Float32Array(K), useK: 8, drawing: false, last: -1 };
  const gx = 20, gw = 380, cy = 180, amp = 110;
  const PRE = {
    step: n => (n < N / 2 ? 0.7 : -0.7),
    bump: n => Math.exp(-(((n - N / 2) / 18) ** 2)) * 1.4 - 0.6,
    noise: n => (hashf(n * 7 + 3) - 0.5) * 1.6,
    clear: n => 0,
  };
  const setPreset = p => { for (let n = 0; n < N; n++) S.x[n] = PRE[p](n); dft(); };
  function dft() {
    for (let k = 0; k < K; k++) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const a = TAU * k * n / N; re += S.x[n] * Math.cos(a); im -= S.x[n] * Math.sin(a); } S.amp[k] = Math.hypot(re, im) * (k === 0 ? 1 : 2) / N; S.phase[k] = Math.atan2(im, re); }
  }
  const rebuild = n => { let y = 0; for (let k = 0; k < S.useK; k++) y += S.amp[k] * Math.cos(TAU * k * n / N + S.phase[k]); return y; };
  setPreset('bump');
  const v = makeViz('c-fdraw', {
    w: 640, h: 360, unit: 1, ox: 0, oy: 360,
    draw(v) {
      v.ctx.fillStyle = 'rgba(255,255,255,0.03)'; v.ctx.fillRect(gx, 360 - (cy + amp + 10), gw, amp * 2 + 20);
      v.line({ x: gx, y: cy }, { x: gx + gw, y: cy }, C.axis, 1.5);
      v.textPx('ここにマウスで描く', gx + 8, 360 - (cy + amp) , C.muted, 'left', 11);
      const plot = (fn, color, width) => { v.ctx.save(); v.ctx.strokeStyle = color; v.ctx.lineWidth = width; v.ctx.beginPath(); for (let n = 0; n < N; n++) { const px = gx + gw * n / (N - 1), py = 360 - (cy + clamp(fn(n), -1.2, 1.2) * amp); n ? v.ctx.lineTo(px, py) : v.ctx.moveTo(px, py); } v.ctx.stroke(); v.ctx.restore(); };
      plot(n => S.x[n], 'rgba(255,255,255,0.8)', 2); plot(rebuild, C.yellow, 2.5);
      // スペクトル
      const bx = 430, bw = 190, bh = 200, by = 90;
      v.textPx('スペクトル amp[k]', bx + bw / 2, 360 - (by + bh + 14), C.muted, 'center', 12);
      v.line({ x: bx, y: by }, { x: bx + bw, y: by }, C.axis, 1.5);
      const mx = Math.max(0.05, ...S.amp);
      for (let k = 0; k < K; k++) { const x = bx + (k + 0.5) * bw / K; const h = S.amp[k] / mx * bh * 0.9; v.ctx.fillStyle = k < S.useK ? C.yellow : 'rgba(255,255,255,0.18)'; v.ctx.fillRect(x - 1, 360 - (by + h), 2.2, h); }
      v.textPx('k = 0', bx + 4, 360 - by + 12, C.muted, 'center', 10); v.textPx(String(K), bx + bw - 6, 360 - by + 12, C.muted, 'center', 10);
      let err = 0; for (let n = 0; n < N; n++) err += Math.abs(S.x[n] - rebuild(n)); err /= N;
      const top = [...S.amp.keys()].filter(k => k > 0).sort((a, b) => S.amp[b] - S.amp[a]).slice(0, 3).map(k => `k=${k}: ${fmt(S.amp[k])}`).join(',  ');
      setHTML('r-fdraw', `信号 ${N} 点 → 周波数 ${K} 本に分解（内積を ${N} × ${K} 回）\n強い周波数 上位3つ: ${top}\n使う周波数 = ${S.useK} 本で足し直した黄色との平均のズレ = ${hl(fmt(err, 3))}   ${S.useK <= 8 ? '← 低い周波数だけ = ぼかした形' : S.useK >= 48 ? '← ほぼ全部使うと元どおり' : ''}`);
    },
  });
  if (!v) return;
  const c = v.c;
  const pos = e => { const r = c.getBoundingClientRect(); return { mx: (e.clientX - r.left) * 640 / r.width, my: (e.clientY - r.top) * 360 / r.height }; };
  const paint = (mx, my) => { const idx = clamp(Math.round((mx - gx) / gw * (N - 1)), 0, N - 1); const val = clamp((360 - my - cy) / amp, -1.1, 1.1); if (S.last < 0) S.x[idx] = val; else { const a = Math.min(S.last, idx), b = Math.max(S.last, idx); for (let n = a; n <= b; n++) S.x[n] = lerp(S.x[S.last], val, b === a ? 1 : (n - S.last) / (idx - S.last || 1)); } S.last = idx; };
  c.addEventListener('pointerdown', e => { const { mx, my } = pos(e); if (mx < gx || mx > gx + gw) return; S.drawing = true; S.last = -1; paint(mx, my); dft(); v.redraw(); });
  c.addEventListener('pointermove', e => { if (!S.drawing) return; const { mx, my } = pos(e); paint(mx, my); dft(); v.redraw(); });
  const stop = () => { S.drawing = false; S.last = -1; };
  c.addEventListener('pointerup', stop); c.addEventListener('pointercancel', stop); c.addEventListener('pointerleave', stop);
  modeButtons('fd-presets', d => { setPreset(d.p); v.redraw(); });
  slider('s-fdk', val => { S.useK = val; v.redraw(); });
  register(secIdx('c-fdraw'), v);
})();

/* =========================================================
   F3 エピサイクル（2D の形を回る円で描く）
   ========================================================= */
(function () {
  const S = { n: 12, speed: 1, t: 0, coef: [], path: [], drawing: false, raw: [], curve: [] };
  const PRE = {
    heart: t => ({ x: 16 * Math.sin(t) ** 3 / 17, y: (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 }),
    star: t => { const r = 0.55 + 0.45 * Math.cos(5 * t); return { x: Math.cos(t) * r, y: Math.sin(t) * r }; },
    square: t => { const u = (t / TAU) * 4; const s = Math.floor(u), f = u - s; const P = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]; return lerpVec(P[s % 4], P[(s + 1) % 4], f); },
  };
  const M = 200;
  function setPath(pts) {
    S.path = pts; const N = pts.length; S.coef = [];
    for (let k = -Math.floor(N / 2); k < Math.ceil(N / 2); k++) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const a = -TAU * k * n / N; re += pts[n].x * Math.cos(a) - pts[n].y * Math.sin(a); im += pts[n].x * Math.sin(a) + pts[n].y * Math.cos(a); } S.coef.push({ k, re: re / N, im: im / N, r: Math.hypot(re, im) / N }); }
    S.coef.sort((a, b) => b.r - a.r); rebuildCurve();
  }
  function evalAt(t, n) { let x = 0, y = 0; const chain = []; for (let i = 0; i < Math.min(n, S.coef.length); i++) { const c = S.coef[i], a = TAU * c.k * t; const dx = c.re * Math.cos(a) - c.im * Math.sin(a), dy = c.re * Math.sin(a) + c.im * Math.cos(a); chain.push({ x, y, r: c.r }); x += dx; y += dy; } return { x, y, chain }; }
  function rebuildCurve() { S.curve = []; for (let i = 0; i <= M; i++) { const e = evalAt(i / M, S.n); S.curve.push({ x: e.x, y: e.y }); } }
  const usePreset = p => { const pts = []; for (let i = 0; i < 160; i++) pts.push(PRE[p](i / 160 * TAU)); setPath(pts); };
  usePreset('heart');
  const SC = 150;
  const v = makeViz('c-epi', {
    w: 640, h: 400, unit: SC, ox: 320, oy: 200,
    draw(v) {
      v.grid('rgba(255,255,255,0.04)');
      // 元の形
      v.ctx.save(); v.ctx.strokeStyle = 'rgba(255,255,255,0.25)'; v.ctx.lineWidth = 1.5; v.ctx.beginPath(); S.path.forEach((p, i) => { const [x, y] = v.px(p); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }); v.ctx.closePath(); v.ctx.stroke(); v.ctx.restore();
      // 円で作った曲線（t までを明るく）
      const upto = Math.floor(S.t * M);
      v.ctx.save(); v.ctx.strokeStyle = 'rgba(255,209,102,0.3)'; v.ctx.lineWidth = 2; v.ctx.beginPath(); S.curve.forEach((p, i) => { const [x, y] = v.px(p); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }); v.ctx.stroke();
      v.ctx.strokeStyle = C.yellow; v.ctx.lineWidth = 2.5; v.ctx.beginPath(); for (let i = 0; i <= upto; i++) { const [x, y] = v.px(S.curve[i]); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); } v.ctx.stroke(); v.ctx.restore();
      // 円の連鎖
      const e = evalAt(S.t, S.n);
      e.chain.forEach((c, i) => { v.circle({ x: c.x, y: c.y }, c.r, `rgba(44,169,225,${0.7 - i / S.n * 0.5})`, 1); const nx = i + 1 < e.chain.length ? e.chain[i + 1] : e; v.line({ x: c.x, y: c.y }, { x: nx.x, y: nx.y }, 'rgba(255,255,255,0.7)', 1.2); });
      v.point({ x: e.x, y: e.y }, C.yellow, 5, true);
      if (S.drawing) { v.ctx.save(); v.ctx.strokeStyle = C.pink; v.ctx.lineWidth = 2; v.ctx.beginPath(); S.raw.forEach((p, i) => { const [x, y] = v.px(p); i ? v.ctx.lineTo(x, y) : v.ctx.moveTo(x, y); }); v.ctx.stroke(); v.ctx.restore(); }
      const top = S.coef.slice(0, 3).map(c => `k=${c.k}（${c.k > 0 ? '反時計' : c.k < 0 ? '時計' : '静止'}回り${Math.abs(c.k)}周）半径 ${fmt(c.r)}`).join('、 ');
      setHTML('r-epi', `円の数 = ${S.n}   点 ${S.path.length} 個の形を、周波数 ${S.coef.length} 本に分解 → 半径の大きい順に ${S.n} 本だけ使う\n大きい円 3 つ: ${top}\n各円: 周波数 k = 回る速さ、半径 = 強さ、回り始めの角度 = 位相。先端をつなぐと元の形をなぞる`);
    },
  });
  if (!v) return;
  const c = v.c;
  const pos = e => { const r = c.getBoundingClientRect(); return v.world((e.clientX - r.left) * 640 / r.width, (e.clientY - r.top) * 400 / r.height); };
  c.addEventListener('pointerdown', e => { S.drawing = true; S.raw = [pos(e)]; });
  c.addEventListener('pointermove', e => { if (!S.drawing) return; const p = pos(e); if (length(sub(p, S.raw[S.raw.length - 1])) > 0.02) S.raw.push(p); });
  const finish = () => { if (!S.drawing) return; S.drawing = false; if (S.raw.length >= 20) { const pts = []; for (let i = 0; i < 160; i++) { const f = i / 160 * S.raw.length; const a = Math.floor(f), b = (a + 1) % S.raw.length; pts.push(lerpVec(S.raw[a], S.raw[b], f - a)); } setPath(pts); $$('#epi-presets .btn').forEach(b => b.classList.remove('active')); } v.redraw(); };
  c.addEventListener('pointerup', finish); c.addEventListener('pointercancel', finish); c.addEventListener('pointerleave', finish);
  modeButtons('epi-presets', d => { usePreset(d.p); v.redraw(); });
  slider('s-epin', val => { S.n = val; rebuildCurve(); v.redraw(); });
  slider('s-epis', val => { S.speed = val; }, val => fmt(val));
  animators.push({ section: secIdx('c-epi'), fn(dt) { S.t = (S.t + dt * 0.08 * S.speed) % 1; v.redraw(); } });
  register(secIdx('c-epi'), v);
})();
