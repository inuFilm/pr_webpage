'use strict';
/* =========================================================
   app-sims.js — Part 6「シミュレーションの中身」
   2D の Pyro（Stable Fluids）/ FLIP / 剛体 / PBD 布 / MLS-MPM を実際に動かす
   app.js, app-patterns.js の後に読み込む
   ========================================================= */

/* =========================================================
   S1 粒子 vs 格子
   ========================================================= */
(function () {
  const S = { mode: 'particles', t: 0, pts: [] };
  const N = 320;
  for (let i = 0; i < N; i++) { const a = hashf(i * 3 + 1) * TAU, r = Math.sqrt(hashf(i * 3 + 2)) * 0.55; S.pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, ph: hashf(i * 3 + 3) }); }
  const GX = 32, GY = 20, CW = 6.4 / GX, CH = 4 / GY;
  const v = makeViz('c-lagr', {
    w: 640, h: 400, unit: 100, ox: 320, oy: 200,
    draw(v) {
      const t = S.t;
      const world = q => { const c = { x: Math.cos(t * 0.6) * 1.6, y: Math.sin(t * 0.6) * 0.9 }; const sw = 0.25 * Math.sin(t * 1.3 + q.ph * 6); const p = rotate(q, t * 0.4 + sw); return add(c, p); };
      const vel = q => { const e = 0.01; const a = world(q); S.t += e; const b = world(q); S.t -= e; return scale(sub(b, a), 1 / e); };
      const dens = new Float32Array(GX * GY), vx = new Float32Array(GX * GY), vy = new Float32Array(GX * GY);
      const P = S.pts.map(q => ({ p: world(q), v: vel(q) }));
      for (const it of P) { const i = Math.floor((it.p.x + 3.2) / CW), j = Math.floor((it.p.y + 2) / CH); if (i < 0 || i >= GX || j < 0 || j >= GY) continue; const k = j * GX + i; dens[k]++; vx[k] += it.v.x; vy[k] += it.v.y; }
      if (S.mode !== 'particles') {
        for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
          const k = j * GX + i, d = dens[k]; const [px, py] = v.px({ x: -3.2 + i * CW, y: -2 + (j + 1) * CH });
          v.ctx.fillStyle = d ? `rgba(44,169,225,${Math.min(0.85, d / 6)})` : 'rgba(255,255,255,0.02)'; v.ctx.fillRect(px + 0.5, py + 0.5, CW * v.unit - 1, CH * v.unit - 1);
        }
        for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { const k = j * GX + i; if (!dens[k]) continue; const c = { x: -3.2 + (i + 0.5) * CW, y: -2 + (j + 0.5) * CH }; v.arrow(c, add(c, scale({ x: vx[k] / dens[k], y: vy[k] / dens[k] }, 0.12)), 'rgba(255,209,102,0.9)', '', 1.5); }
      }
      if (S.mode !== 'grid') for (const it of P) v.point(it.p, S.mode === 'both' ? 'rgba(255,255,255,0.8)' : C.blue, 2.5);
      const cnt = dens.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
      const READ = { particles: `粒子 ${N} 個。それぞれが { p, v } を持つ。粒子 0: p = ${vs(P[0].p)}, v = ${vs(P[0].v)}\n「煙がどこへ行ったか」は粒子を追えば分かる。「隣との押し合い」は隣を探さないと分からない`, grid: `格子 ${GX} × ${GY} セル。いま煙があるセル: ${cnt}。セルは動かず、density と vel（黄色）を持つ\n「隣との差」は k-1, k+1 を見るだけ。セルより細かいものは消える`, both: `同じ煙。粒子（白）が持つ速度を、セルごとに平均したものが格子の vel（黄色）\nFLIP / MPM はこの「粒子 → 格子 → 粒子」を毎ステップやる` };
      setHTML('r-lagr', READ[S.mode]);
    },
  });
  if (!v) return;
  modeButtons('lagr-modes', d => { S.mode = d.m; v.redraw(); });
  animators.push({ section: secIdx('c-lagr'), fn(dt) { S.t += dt; v.redraw(); } });
  register(secIdx('c-lagr'), v);
})();

/* =========================================================
   S2 Pyro — Stable Fluids (Jos Stam) 2D
   ========================================================= */
(function () {
  const N = 64, M = 40, W = N + 2, H = M + 2, SZ = W * H;
  const IX = (i, j) => i + j * W;
  const S = { view: 'smoke', buoy: 2.5, turb: 0.8, diss: 0.006, iters: 20, project: true, src: true, t: 0, frame: 0 };
  let dens = new Float32Array(SZ), temp = new Float32Array(SZ), u = new Float32Array(SZ), vv = new Float32Array(SZ);
  let dens0 = new Float32Array(SZ), temp0 = new Float32Array(SZ), u0 = new Float32Array(SZ), v0 = new Float32Array(SZ);
  const div = new Float32Array(SZ), pr = new Float32Array(SZ), divShow = new Float32Array(SZ);
  const dt = 0.12;
  const reset = () => { dens.fill(0); temp.fill(0); u.fill(0); vv.fill(0); S.frame = 0; };
  function setBnd(b, x) {
    for (let i = 1; i <= N; i++) { x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)]; x[IX(i, M + 1)] = b === 2 ? -x[IX(i, M)] : x[IX(i, M)]; }
    for (let j = 1; j <= M; j++) { x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)]; x[IX(N + 1, j)] = b === 1 ? -x[IX(N, j)] : x[IX(N, j)]; }
    x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]); x[IX(0, M + 1)] = 0.5 * (x[IX(1, M + 1)] + x[IX(0, M)]);
    x[IX(N + 1, 0)] = 0.5 * (x[IX(N, 0)] + x[IX(N + 1, 1)]); x[IX(N + 1, M + 1)] = 0.5 * (x[IX(N, M + 1)] + x[IX(N + 1, M)]);
  }
  function advect(b, d, d0, uu, vvv) {
    for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) {
      let x = i - dt * N * uu[IX(i, j)] / 1.6, y = j - dt * N * vvv[IX(i, j)] / 1.6; // 速度をさかのぼる
      x = clamp(x, 0.5, N + 0.5); y = clamp(y, 0.5, M + 0.5);
      const i0 = Math.floor(x), i1 = i0 + 1, j0 = Math.floor(y), j1 = j0 + 1, s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
      d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) + s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
    }
    setBnd(b, d);
  }
  function project() {
    for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) { div[IX(i, j)] = -0.5 * (u[IX(i + 1, j)] - u[IX(i - 1, j)] + vv[IX(i, j + 1)] - vv[IX(i, j - 1)]) / N; pr[IX(i, j)] = 0; }
    setBnd(0, div); setBnd(0, pr);
    for (let k = 0; k < S.iters; k++) { for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) pr[IX(i, j)] = (div[IX(i, j)] + pr[IX(i - 1, j)] + pr[IX(i + 1, j)] + pr[IX(i, j - 1)] + pr[IX(i, j + 1)]) / 4; setBnd(0, pr); }
    for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) { u[IX(i, j)] -= 0.5 * N * (pr[IX(i + 1, j)] - pr[IX(i - 1, j)]); vv[IX(i, j)] -= 0.5 * N * (pr[IX(i, j + 1)] - pr[IX(i, j - 1)]); }
    setBnd(1, u); setBnd(2, vv);
  }
  function step() {
    S.frame++; S.t += dt;
    // 1. ソース
    if (S.src) for (let j = 2; j <= 4; j++) for (let i = N / 2 - 3; i <= N / 2 + 3; i++) { dens[IX(i, j)] = Math.min(1, dens[IX(i, j)] + 0.35); temp[IX(i, j)] = Math.min(1, temp[IX(i, j)] + 0.3); }
    // 2. 力：浮力 + 乱流
    for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) {
      const k = IX(i, j);
      vv[k] += (temp[k] * S.buoy - dens[k] * 0.3) * dt;
      if (S.turb > 0 && dens[k] > 0.02) { const e = 0.03, x = i / N * 3 + S.t * 0.15, y = j / N * 3; const nz = (a, b) => fbm(a, b, 2, 21); const cx = (nz(x, y + e) - nz(x, y - e)) / (2 * e), cy = -(nz(x + e, y) - nz(x - e, y)) / (2 * e); u[k] += cx * S.turb * dt * 0.6; vv[k] += cy * S.turb * dt * 0.6; }
    }
    // 投影を切ると速度に歯止めが無くなり吹き飛ぶので、代わりに強い抵抗を入れて「渦が出ない」ことだけ見せる
    // 投影を切ると「押しのけ」が伝わらず速度が発生源に閉じ込められる。代わりに速度を拡散（粘性）させて上へ伝え、渦が出ないことだけ見せる
    if (!S.project) {
      for (let it = 0; it < 3; it++) {
        u0.set(u); v0.set(vv);
        for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) { const k = IX(i, j); u[k] = clamp(0.4 * u0[k] + 0.15 * (u0[IX(i - 1, j)] + u0[IX(i + 1, j)] + u0[IX(i, j - 1)] + u0[IX(i, j + 1)]), -0.8, 0.8); vv[k] = clamp(0.4 * v0[k] + 0.15 * (v0[IX(i - 1, j)] + v0[IX(i + 1, j)] + v0[IX(i, j - 1)] + v0[IX(i, j + 1)]), -0.8, 0.8); }
        setBnd(1, u); setBnd(2, vv);
      }
    }
    // 3. 移流（速度が速度を運ぶ）
    u0.set(u); v0.set(vv); advect(1, u, u0, u0, v0); advect(2, vv, v0, u0, v0);
    // 発散（表示用）
    for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) divShow[IX(i, j)] = (u[IX(i + 1, j)] - u[IX(i - 1, j)] + vv[IX(i, j + 1)] - vv[IX(i, j - 1)]) * 0.5;
    // 4. 投影
    if (S.project) project();
    // 密度・温度を運ぶ
    dens0.set(dens); temp0.set(temp); advect(0, dens, dens0, u, vv); advect(0, temp, temp0, u, vv);
    // 5. 掃除
    for (let k = 0; k < SZ; k++) { dens[k] *= (1 - S.diss); temp[k] *= (1 - 0.02); }
  }
  const v = makePixelViz('c-pyro', N, M, (wx, wy, x, y) => {
    const k = IX(x + 1, M - y);
    if (S.view === 'temp') return mixc([26, 40, 52], [255, 160, 60], clamp(temp[k] * 1.6, 0, 1));
    if (S.view === 'div') { const d = divShow[k] * 12; return d > 0 ? mixc([30, 45, 58], [255, 107, 107], clamp(d, 0, 1)) : mixc([30, 45, 58], [44, 169, 225], clamp(-d, 0, 1)); }
    const d = clamp(dens[k], 0, 1), t = clamp(temp[k], 0, 1);
    return mixc([24, 43, 54], mixc([225, 232, 238], [255, 170, 80], t * 0.7), d);
  }, v => {
    if (S.view === 'vel') for (let j = 2; j <= M; j += 3) for (let i = 2; i <= N; i += 3) { const k = IX(i, j); const p = { x: (i - 0.5) / N * 3.2 - 1.6, y: (j - 0.5) / N * 3.2 - 1 }; const vel = { x: u[k], y: vv[k] }; if (length(vel) < 0.01) continue; v.arrow(p, add(p, scale(vel, 0.25)), 'rgba(255,209,102,0.85)', '', 1.5); }
    let maxDiv = 0, total = 0; for (let j = 1; j <= M; j++) for (let i = 1; i <= N; i++) { maxDiv = Math.max(maxDiv, Math.abs(divShow[IX(i, j)])); total += dens[IX(i, j)]; }
    setHTML('r-pyro', `ステップ ${S.frame}   格子 ${N}×${M}   煙の総量 = ${fmt(total, 0)}\nbuoyancy = ${fmt(S.buoy)}  turbulence = ${fmt(S.turb)}  dissipation = ${fmt(S.diss, 3)} /step  圧力の反復 = ${S.iters}\n投影前の発散の最大 = ${fmt(maxDiv, 3)} → ${S.project ? hl('投影で 0 に直してから密度を運ぶ') : hl('投影なし：押しのけが伝わらず、ぼんやり上に広がるだけで渦が出ない')}`);
  }, { w: 640, h: 400, onClick(p) { const i = Math.round((p.x + 1.6) / 3.2 * N), j = Math.round((p.y + 1) / 3.2 * N); for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = clamp(i + di, 1, N), jj = clamp(j + dj, 1, M); dens[IX(ii, jj)] = 1; temp[IX(ii, jj)] = 0.8; } } });
  if (!v) return;
  modeButtons('pyro-view', d => { S.view = d.m; v.redraw(); });
  slider('s-pyb', val => { S.buoy = val; }, val => fmt(val)); slider('s-pyt', val => { S.turb = val; }, val => fmt(val));
  slider('s-pyd', val => { S.diss = val; }, val => fmt(val, 3)); slider('s-pyi', val => { S.iters = val; });
  checkbox('k-pyproj', on => { S.project = on; }); checkbox('k-pysrc', on => { S.src = on; });
  $('#b-pyro-reset').addEventListener('click', () => { reset(); v.redraw(); });
  animators.push({ section: secIdx('c-pyro'), fn() { step(); v.redraw(); } });
  register(secIdx('c-pyro'), v);
})();

/* ---------- S2 ミニ：半ラグランジュ移流 ---------- */
(function () {
  const S = { vel: { x: 1.3, y: 0.8 } };
  const dt = 1;
  const v = makeViz('c-advect', {
    w: 640, h: 300, unit: 60, ox: 320, oy: 150,
    draw(v) {
      // 6x4 の格子（セル中心が整数座標）
      for (let j = -2; j <= 2; j++) for (let i = -5; i <= 5; i++) v.ctx.strokeStyle = C.grid2, v.line({ x: i - 0.5, y: j - 0.5 }, { x: i + 0.5, y: j - 0.5 }, C.grid2, 1), v.line({ x: i - 0.5, y: j - 0.5 }, { x: i - 0.5, y: j + 0.5 }, C.grid2, 1);
      const cell = { x: 1, y: 0 };
      const from = sub(cell, scale(S.vel, dt));
      const i0 = Math.floor(from.x), j0 = Math.floor(from.y), tx = from.x - i0, ty = from.y - j0;
      const ws = [[i0, j0, (1 - tx) * (1 - ty)], [i0 + 1, j0, tx * (1 - ty)], [i0, j0 + 1, (1 - tx) * ty], [i0 + 1, j0 + 1, tx * ty]];
      for (const [i, j, w] of ws) { const [px, py] = v.px({ x: i - 0.5, y: j + 0.5 }); v.ctx.fillStyle = `rgba(255,209,102,${0.1 + w * 0.6})`; v.ctx.fillRect(px + 1, py + 1, v.unit - 2, v.unit - 2); v.text(`${fmt(w)}`, { x: i, y: j }, C.text, 0, 0, 'center', 12); }
      const [cx, cy] = v.px({ x: cell.x - 0.5, y: cell.y + 0.5 }); v.ctx.strokeStyle = C.blue; v.ctx.lineWidth = 3; v.ctx.strokeRect(cx, cy, v.unit, v.unit);
      v.arrow(cell, add(cell, S.vel), C.blue, 'vel', 3);
      v.arrow(cell, from, C.yellow, '', 2, [5, 5]);
      v.point(from, C.yellow, 6, true); v.text('dt 前にいた場所', from, C.yellow, 0, -16, 'center', 12);
      v.text('このセル', cell, C.blue, 0, 22, 'center', 12);
      v.drawHandles();
      setHTML('r-advect', `vel = ${vs(S.vel)}   from = sub(cell, scale(vel, dt)) = ${vs(from)}\n新しい値 = ${ws.map(([i, j, w]) => `${fmt(w)} * field[${i}][${j}]`).join(' + ')}\n${hl('重みの合計 = 1')}。近いセルほど重い（バイリニア = lerp の lerp）`);
    },
  });
  if (!v) return;
  v.handles.push({ get: () => add({ x: 1, y: 0 }, S.vel), set: p => { S.vel = clamp2(sub(p, { x: 1, y: 0 })); }, color: C.blue });
  function clamp2(q) { return { x: clamp(q.x, -3.5, 3.5), y: clamp(q.y, -2, 2) }; }
  register(secIdx('c-advect'), v);
})();

/* ---------- S2 ミニ：発散 ---------- */
(function () {
  const S = { uL: 0.6, uR: 1.2, vB: 0.3, vT: 0.9 };
  const v = makeViz('c-div', {
    w: 640, h: 300, unit: 90, ox: 320, oy: 150,
    draw(v) {
      const [x0, y0] = v.px({ x: -1, y: 1 }); v.ctx.fillStyle = 'rgba(44,169,225,0.12)'; v.ctx.fillRect(x0, y0, 2 * v.unit, 2 * v.unit); v.ctx.strokeStyle = C.blue; v.ctx.lineWidth = 2; v.ctx.strokeRect(x0, y0, 2 * v.unit, 2 * v.unit);
      v.arrow({ x: -1 - S.uL, y: 0 }, { x: -1, y: 0 }, C.yellow, `左から入る ${fmt(S.uL)}`, 3);
      v.arrow({ x: 1, y: 0 }, { x: 1 + S.uR, y: 0 }, C.yellow, `右へ出る ${fmt(S.uR)}`, 3);
      v.arrow({ x: 0, y: -1 - S.vB }, { x: 0, y: -1 }, C.pink, `下から入る ${fmt(S.vB)}`, 3);
      v.arrow({ x: 0, y: 1 }, { x: 0, y: 1 + S.vT }, C.pink, `上へ出る ${fmt(S.vT)}`, 3);
      v.drawHandles();
      const d = (S.uR - S.uL) + (S.vT - S.vB);
      const note = Math.abs(d) < 0.05 ? '≈ 0：出入りが釣り合っている（非圧縮）' : d > 0 ? '＞ 0：出るほうが多い = 湧き出し。空気が薄くなるはずだが、実際は薄くならない → 圧力を下げて周りから引き込む' : '＜ 0：入るほうが多い = 吸い込み。圧力を上げて周りへ押し出す';
      v.textPx(`div = ${fmt(d)}`, 320, 150, C.text, 'center', 18);
      setHTML('r-div', `div = (右へ出る − 左から入る) + (上へ出る − 下から入る)\n    = (${fmt(S.uR)} − ${fmt(S.uL)}) + (${fmt(S.vT)} − ${fmt(S.vB)}) = ${hl(fmt(d))}\n${note}\n投影：全セルの div を 0 にする圧力を求め、速度から圧力の傾きを引く`);
    },
  });
  if (!v) return;
  v.handles.push({ get: () => ({ x: -1 - S.uL, y: 0 }), set: p => { S.uL = clamp(-1 - p.x, -1.5, 1.8); }, color: C.yellow });
  v.handles.push({ get: () => ({ x: 1 + S.uR, y: 0 }), set: p => { S.uR = clamp(p.x - 1, -1.5, 1.8); }, color: C.yellow });
  v.handles.push({ get: () => ({ x: 0, y: -1 - S.vB }), set: p => { S.vB = clamp(-1 - p.y, -0.5, 0.6); }, color: C.pink });
  v.handles.push({ get: () => ({ x: 0, y: 1 + S.vT }), set: p => { S.vT = clamp(p.y - 1, -0.5, 0.6); }, color: C.pink });
  register(secIdx('c-div'), v);
})();

/* =========================================================
   S3 FLIP（Matthias Müller の FLIP を簡略化。MAC 格子）
   ========================================================= */
(function () {
  const FLUID = 0, AIR = 1, SOLID = 2;
  const fNumY = 34, fNumX = 54, h = 1 / fNumY, fInvSpacing = 1 / h, fNumCells = fNumX * fNumY;
  const u = new Float32Array(fNumCells), vv = new Float32Array(fNumCells), du = new Float32Array(fNumCells), dv = new Float32Array(fNumCells);
  const prevU = new Float32Array(fNumCells), prevV = new Float32Array(fNumCells), p = new Float32Array(fNumCells), s = new Float32Array(fNumCells);
  const cellType = new Int32Array(fNumCells), particleDensity = new Float32Array(fNumCells);
  const r = 0.3 * h, maxParticles = 4000;
  const pos = new Float32Array(2 * maxParticles), vel = new Float32Array(2 * maxParticles);
  let numParticles = 0, particleRestDensity = 0;
  const S = { view: 'particles', flip: 0.9, iters: 30, drift: true, frame: 0 };
  // 壁
  for (let i = 0; i < fNumX; i++) for (let j = 0; j < fNumY; j++) s[i * fNumY + j] = (i === 0 || i === fNumX - 1 || j === 0) ? 0 : 1;
  const pCellSize = 2 * r, pInvSpacing = 1 / pCellSize, pNumX = Math.floor(fNumX * h * pInvSpacing) + 1, pNumY = Math.floor(fNumY * h * pInvSpacing) + 1, pNumCells = pNumX * pNumY;
  const numCellParticles = new Int32Array(pNumCells), firstCellParticle = new Int32Array(pNumCells + 1), cellParticleIds = new Int32Array(maxParticles);
  function addBlock(x0, y0, x1, y1) {
    const d = 2 * r;
    for (let x = x0; x < x1; x += d) for (let y = y0; y < y1; y += d) { if (numParticles >= maxParticles) return; pos[2 * numParticles] = x + (hashf(numParticles) - 0.5) * r * 0.5; pos[2 * numParticles + 1] = y; vel[2 * numParticles] = 0; vel[2 * numParticles + 1] = 0; numParticles++; }
  }
  function reset() { numParticles = 0; particleRestDensity = 0; S.frame = 0; u.fill(0); vv.fill(0); addBlock(h + r, h + r, 0.55, 0.75); }
  reset();
  function integrate(dt, g) { for (let i = 0; i < numParticles; i++) { vel[2 * i + 1] += dt * g; pos[2 * i] += vel[2 * i] * dt; pos[2 * i + 1] += vel[2 * i + 1] * dt; } }
  function pushApart(iters) {
    numCellParticles.fill(0);
    for (let i = 0; i < numParticles; i++) { const xi = clamp(Math.floor(pos[2 * i] * pInvSpacing), 0, pNumX - 1), yi = clamp(Math.floor(pos[2 * i + 1] * pInvSpacing), 0, pNumY - 1); numCellParticles[xi * pNumY + yi]++; }
    let first = 0; for (let i = 0; i < pNumCells; i++) { first += numCellParticles[i]; firstCellParticle[i] = first; } firstCellParticle[pNumCells] = first;
    for (let i = 0; i < numParticles; i++) { const xi = clamp(Math.floor(pos[2 * i] * pInvSpacing), 0, pNumX - 1), yi = clamp(Math.floor(pos[2 * i + 1] * pInvSpacing), 0, pNumY - 1); const c = xi * pNumY + yi; firstCellParticle[c]--; cellParticleIds[firstCellParticle[c]] = i; }
    const minDist = 2 * r, minDist2 = minDist * minDist;
    for (let it = 0; it < iters; it++) for (let i = 0; i < numParticles; i++) {
      const px = pos[2 * i], py = pos[2 * i + 1];
      const pxi = Math.floor(px * pInvSpacing), pyi = Math.floor(py * pInvSpacing);
      const x0 = Math.max(pxi - 1, 0), y0 = Math.max(pyi - 1, 0), x1 = Math.min(pxi + 1, pNumX - 1), y1 = Math.min(pyi + 1, pNumY - 1);
      for (let xi = x0; xi <= x1; xi++) for (let yi = y0; yi <= y1; yi++) {
        const c = xi * pNumY + yi;
        for (let k = firstCellParticle[c]; k < firstCellParticle[c + 1]; k++) {
          const id = cellParticleIds[k]; if (id === i) continue;
          const qx = pos[2 * id], qy = pos[2 * id + 1]; let dx = qx - px, dy = qy - py; const d2 = dx * dx + dy * dy;
          if (d2 > minDist2 || d2 === 0) continue;
          const d = Math.sqrt(d2), sc = 0.5 * (minDist - d) / d; dx *= sc; dy *= sc;
          pos[2 * i] -= dx; pos[2 * i + 1] -= dy; pos[2 * id] += dx; pos[2 * id + 1] += dy;
        }
      }
    }
  }
  function handleWalls() {
    const minX = h + r, maxX = (fNumX - 1) * h - r, minY = h + r, maxY = (fNumY - 1) * h - r;
    for (let i = 0; i < numParticles; i++) {
      let x = pos[2 * i], y = pos[2 * i + 1];
      if (x < minX) { x = minX; vel[2 * i] = 0; } if (x > maxX) { x = maxX; vel[2 * i] = 0; }
      if (y < minY) { y = minY; vel[2 * i + 1] = 0; } if (y > maxY) { y = maxY; vel[2 * i + 1] = 0; }
      pos[2 * i] = x; pos[2 * i + 1] = y;
    }
  }
  function updateDensity() {
    const n = fNumY, h2 = 0.5 * h; particleDensity.fill(0);
    for (let i = 0; i < numParticles; i++) {
      let x = clamp(pos[2 * i], h, (fNumX - 1) * h), y = clamp(pos[2 * i + 1], h, (fNumY - 1) * h);
      const x0 = Math.floor((x - h2) * fInvSpacing), tx = ((x - h2) - x0 * h) * fInvSpacing, x1 = Math.min(x0 + 1, fNumX - 2);
      const y0 = Math.floor((y - h2) * fInvSpacing), ty = ((y - h2) - y0 * h) * fInvSpacing, y1 = Math.min(y0 + 1, fNumY - 2);
      const sx = 1 - tx, sy = 1 - ty;
      if (x0 < fNumX && y0 < fNumY) particleDensity[x0 * n + y0] += sx * sy; if (x1 < fNumX && y0 < fNumY) particleDensity[x1 * n + y0] += tx * sy;
      if (x1 < fNumX && y1 < fNumY) particleDensity[x1 * n + y1] += tx * ty; if (x0 < fNumX && y1 < fNumY) particleDensity[x0 * n + y1] += sx * ty;
    }
    if (particleRestDensity === 0) { let sum = 0, cnt = 0; for (let i = 0; i < fNumCells; i++) if (cellType[i] === FLUID) { sum += particleDensity[i]; cnt++; } if (cnt > 0) particleRestDensity = sum / cnt; }
  }
  function transfer(toGrid, flipRatio) {
    const n = fNumY, h2 = 0.5 * h;
    if (toGrid) {
      prevU.set(u); prevV.set(vv); du.fill(0); dv.fill(0); u.fill(0); vv.fill(0);
      for (let i = 0; i < fNumCells; i++) cellType[i] = s[i] === 0 ? SOLID : AIR;
      for (let i = 0; i < numParticles; i++) { const xi = clamp(Math.floor(pos[2 * i] * fInvSpacing), 0, fNumX - 1), yi = clamp(Math.floor(pos[2 * i + 1] * fInvSpacing), 0, fNumY - 1); const c = xi * n + yi; if (cellType[c] === AIR) cellType[c] = FLUID; }
    }
    for (let comp = 0; comp < 2; comp++) {
      const dx = comp === 0 ? 0 : h2, dy = comp === 0 ? h2 : 0;
      const f = comp === 0 ? u : vv, prevF = comp === 0 ? prevU : prevV, d = comp === 0 ? du : dv;
      for (let i = 0; i < numParticles; i++) {
        let x = clamp(pos[2 * i], h, (fNumX - 1) * h), y = clamp(pos[2 * i + 1], h, (fNumY - 1) * h);
        const x0 = Math.min(Math.floor((x - dx) * fInvSpacing), fNumX - 2), tx = ((x - dx) - x0 * h) * fInvSpacing, x1 = Math.min(x0 + 1, fNumX - 2);
        const y0 = Math.min(Math.floor((y - dy) * fInvSpacing), fNumY - 2), ty = ((y - dy) - y0 * h) * fInvSpacing, y1 = Math.min(y0 + 1, fNumY - 2);
        const sx = 1 - tx, sy = 1 - ty, d0 = sx * sy, d1 = tx * sy, d2 = tx * ty, d3 = sx * ty;
        const nr0 = x0 * n + y0, nr1 = x1 * n + y0, nr2 = x1 * n + y1, nr3 = x0 * n + y1;
        const pv = vel[2 * i + comp];
        if (toGrid) { f[nr0] += pv * d0; d[nr0] += d0; f[nr1] += pv * d1; d[nr1] += d1; f[nr2] += pv * d2; d[nr2] += d2; f[nr3] += pv * d3; d[nr3] += d3; }
        else {
          const off = comp === 0 ? n : 1;
          const v0 = (cellType[nr0] !== AIR || cellType[nr0 - off] !== AIR) ? 1 : 0, v1 = (cellType[nr1] !== AIR || cellType[nr1 - off] !== AIR) ? 1 : 0;
          const v2 = (cellType[nr2] !== AIR || cellType[nr2 - off] !== AIR) ? 1 : 0, v3 = (cellType[nr3] !== AIR || cellType[nr3 - off] !== AIR) ? 1 : 0;
          const dsum = v0 * d0 + v1 * d1 + v2 * d2 + v3 * d3;
          if (dsum > 0) {
            const picV = (v0 * d0 * f[nr0] + v1 * d1 * f[nr1] + v2 * d2 * f[nr2] + v3 * d3 * f[nr3]) / dsum;
            const corr = (v0 * d0 * (f[nr0] - prevF[nr0]) + v1 * d1 * (f[nr1] - prevF[nr1]) + v2 * d2 * (f[nr2] - prevF[nr2]) + v3 * d3 * (f[nr3] - prevF[nr3])) / dsum;
            vel[2 * i + comp] = (1 - flipRatio) * picV + flipRatio * (pv + corr);
          }
        }
      }
      if (toGrid) {
        for (let i = 0; i < f.length; i++) if (d[i] > 0) f[i] /= d[i];
        for (let i = 0; i < fNumX; i++) for (let j = 0; j < fNumY; j++) {
          const solid = cellType[i * n + j] === SOLID;
          if (solid || (i > 0 && cellType[(i - 1) * n + j] === SOLID)) u[i * n + j] = prevU[i * n + j];
          if (solid || (j > 0 && cellType[i * n + j - 1] === SOLID)) vv[i * n + j] = prevV[i * n + j];
        }
      }
    }
  }
  function solvePressure(iters, dt) {
    p.fill(0); const n = fNumY, cp = 1000 * h / dt, over = 1.9;
    prevU.set(u); prevV.set(vv);   // ★ 投影「前」の格子速度を覚える。FLIP はこの差分だけを粒子に返す
    for (let it = 0; it < iters; it++) for (let i = 1; i < fNumX - 1; i++) for (let j = 1; j < fNumY - 1; j++) {
      const c = i * n + j; if (cellType[c] !== FLUID) continue;
      const left = (i - 1) * n + j, right = (i + 1) * n + j, bottom = i * n + j - 1, top = i * n + j + 1;
      const sx0 = s[left], sx1 = s[right], sy0 = s[bottom], sy1 = s[top], sSum = sx0 + sx1 + sy0 + sy1; if (sSum === 0) continue;
      let div = u[right] - u[c] + vv[top] - vv[c];
      if (particleRestDensity > 0 && S.drift) { const comp = particleDensity[c] - particleRestDensity; if (comp > 0) div -= comp; }
      const pp = -div / sSum * over; p[c] += cp * pp;
      u[c] -= sx0 * pp; u[right] += sx1 * pp; vv[c] -= sy0 * pp; vv[top] += sy1 * pp;
    }
  }
  function step(dt) {
    integrate(dt, -9.81); pushApart(2); handleWalls();
    transfer(true, S.flip); updateDensity(); solvePressure(S.iters, dt); transfer(false, S.flip);
    S.frame++;
  }
  const SX = 640 / (fNumX * h), SY = 400 / (fNumY * h); // 表示：ドメイン [0, 1.588]x[0,1] → 640x400（縦横比はほぼ同じ）
  const v = makeViz('c-flip', {
    w: 640, h: 400, unit: 1, ox: 0, oy: 400,
    onClick(pp) { const x = pp.x / SX, y = pp.y / SY; addBlock(clamp(x - 0.08, h + r, 1.4), clamp(y - 0.08, h + r, 0.9), clamp(x + 0.08, h + r, 1.5), clamp(y + 0.08, h + r, 0.98)); },
    draw(v) {
      const ctx = v.ctx; ctx.fillStyle = '#182b36'; ctx.fillRect(0, 0, 640, 400);
      const n = fNumY;
      if (S.view === 'grid') {
        for (let i = 0; i < fNumX; i++) for (let j = 0; j < fNumY; j++) { const t = cellType[i * n + j]; ctx.fillStyle = t === SOLID ? '#3a5666' : t === FLUID ? 'rgba(44,169,225,0.35)' : 'rgba(255,255,255,0.03)'; ctx.fillRect(i * h * SX + 0.5, 400 - (j + 1) * h * SY + 0.5, h * SX - 1, h * SY - 1); }
      }
      ctx.fillStyle = S.view === 'grid' ? 'rgba(255,255,255,0.55)' : C.blue;
      const pr = Math.max(2, r * SX);
      for (let i = 0; i < numParticles; i++) {
        if (S.view !== 'grid') { const sp = Math.hypot(vel[2 * i], vel[2 * i + 1]); ctx.fillStyle = rgbs(mixc([44, 169, 225], [225, 240, 250], clamp(sp * 0.35, 0, 1))); }
        ctx.beginPath(); ctx.arc(pos[2 * i] * SX, 400 - pos[2 * i + 1] * SY, pr, 0, TAU); ctx.fill();
      }
      if (S.view === 'grid') for (let i = 1; i < fNumX - 1; i += 2) for (let j = 1; j < fNumY - 1; j += 2) { const c = i * n + j; if (cellType[c] !== FLUID) continue; const cx = (i + 0.5) * h * SX, cy = 400 - (j + 0.5) * h * SY; const ux = 0.5 * (u[c] + u[(i + 1) * n + j]), uy = 0.5 * (vv[c] + vv[c + 1]); v.arrow({ x: cx, y: 400 - cy }, { x: cx + ux * 12, y: 400 - cy + uy * 12 }, 'rgba(255,209,102,0.9)', '', 1.5); }
      let fluidCells = 0; for (let i = 0; i < fNumCells; i++) if (cellType[i] === FLUID) fluidCells++;
      setHTML('r-flip', `粒子 ${numParticles} 個   格子 ${fNumX}×${fNumY}（FLUID セル ${fluidCells}）   ステップ ${S.frame}\nflipRatio = ${fmt(S.flip)} → p.v = lerp(picV, flipV, ${fmt(S.flip)})   圧力の反復 = ${S.iters}   密度補正 = ${S.drift ? 'ON' : 'OFF'}\n${S.flip === 0 ? hl('PIC だけ：格子の平均を毎回そのまま受け取る → 粘っこい') : S.flip >= 0.95 ? hl('ほぼ FLIP：粒子の速度差が残る → 元気・ノイジー') : '格子で直した「変化分」と「値」を混ぜている'}`);
    },
  });
  if (!v) return;
  modeButtons('flip-view', d => { S.view = d.m; v.redraw(); });
  slider('s-flr', val => { S.flip = val; }, val => fmt(val)); slider('s-fli', val => { S.iters = val; });
  checkbox('k-fldrift', on => { S.drift = on; });
  $('#b-flip-reset').addEventListener('click', () => { reset(); v.redraw(); });
  animators.push({ section: secIdx('c-flip'), fn() { step(1 / 60); v.redraw(); } });
  register(secIdx('c-flip'), v);
})();

/* =========================================================
   S4 RBD — 2D 凸多角形（箱）の衝突と撃力
   ========================================================= */
(function () {
  const S = { bounce: 0.2, friction: 0.5, show: true, bodies: [], contacts: [], idc: 0 };
  const G = -9.8;
  const perp = r => ({ x: -r.y, y: r.x });
  function makeBox(p, w, h, mass, angle = 0, col = C.blue) {
    const b = { p, v: { x: 0, y: 0 }, angle, w: 0, hw: w / 2, hh: h / 2, invMass: mass > 0 ? 1 / mass : 0, invI: mass > 0 ? 12 / (mass * (w * w + h * h)) : 0, col };
    return b;
  }
  const verts = b => [{ x: -b.hw, y: -b.hh }, { x: b.hw, y: -b.hh }, { x: b.hw, y: b.hh }, { x: -b.hw, y: b.hh }].map(q => add(b.p, rotate(q, b.angle)));
  function reset() {
    S.bodies = [makeBox({ x: 8, y: -1 }, 20, 2, 0, 0, '#3a5666'), makeBox({ x: -1, y: 5 }, 2, 14, 0, 0, '#3a5666'), makeBox({ x: 17, y: 5 }, 2, 14, 0, 0, '#3a5666')];
    S.bodies.push(makeBox({ x: 6, y: 1.5 }, 3, 1.2, 3, 0, C.blue), makeBox({ x: 10, y: 4 }, 1.4, 1.4, 1.5, 0.6, C.yellow));
    S.idc = 0;
  }
  reset();
  function collide(A, B) {
    const va = verts(A), vb = verts(B); let best = null;
    const axesOf = vs => vs.map((q, i) => { const e = sub(vs[(i + 1) % vs.length], q); return normalize(perp(e)); });
    for (const axis of [...axesOf(va), ...axesOf(vb)]) {
      let minA = 1e9, maxA = -1e9, minB = 1e9, maxB = -1e9;
      for (const q of va) { const d = dot(q, axis); minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const q of vb) { const d = dot(q, axis); minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      const overlap = Math.min(maxA - minB, maxB - minA); if (overlap <= 0) return null;
      if (!best || overlap < best.depth) best = { depth: overlap, n: axis };
    }
    let n = best.n; if (dot(sub(B.p, A.p), n) < 0) n = scale(n, -1);
    // 接触点：B の頂点のうち最も A 側（-n 方向）にあるもの、と A の頂点のうち最も B 側にあるもの。深いほうを採用
    let pb = vb[0], db = 1e9; for (const q of vb) { const d = dot(q, n); if (d < db) { db = d; pb = q; } }
    let pa = va[0], da = -1e9; for (const q of va) { const d = dot(q, n); if (d > da) { da = d; pa = q; } }
    const point = (da - db) > 0 ? lerpVec(pa, pb, 0.5) : pb;
    return { n, depth: best.depth, point };
  }
  function resolve(A, B, c) {
    const ra = sub(c.point, A.p), rb = sub(c.point, B.p);
    const va = add(A.v, scale(perp(ra), A.w)), vb = add(B.v, scale(perp(rb), B.w));
    const rv = sub(vb, va); const vn = dot(rv, c.n);
    const ran = cross2d(ra, c.n), rbn = cross2d(rb, c.n);
    const invMassSum = A.invMass + B.invMass + ran * ran * A.invI + rbn * rbn * B.invI;
    if (vn < 0) {
      const e = Math.abs(vn) < 0.6 ? 0 : S.bounce;
      const j = -(1 + e) * vn / invMassSum;
      const imp = scale(c.n, j);
      A.v = sub(A.v, scale(imp, A.invMass)); A.w -= ran * j * A.invI;
      B.v = add(B.v, scale(imp, B.invMass)); B.w += rbn * j * B.invI;
      // 摩擦
      const t = normalize(sub(rv, scale(c.n, vn))); if (length(t) > 0) {
        const rat = cross2d(ra, t), rbt = cross2d(rb, t);
        const invT = A.invMass + B.invMass + rat * rat * A.invI + rbt * rbt * B.invI;
        let jt = -dot(rv, t) / invT; jt = clamp(jt, -j * S.friction, j * S.friction);
        const impT = scale(t, jt);
        A.v = sub(A.v, scale(impT, A.invMass)); A.w -= rat * jt * A.invI;
        B.v = add(B.v, scale(impT, B.invMass)); B.w += rbt * jt * B.invI;
      }
      c.j = j;
    }
    // 位置補正
    const corr = Math.max(c.depth - 0.01, 0) * 0.4 / (A.invMass + B.invMass || 1);
    A.p = sub(A.p, scale(c.n, corr * A.invMass)); B.p = add(B.p, scale(c.n, corr * B.invMass));
  }
  function step(dt) {
    for (const b of S.bodies) { if (!b.invMass) continue; b.v.y += G * dt; b.v = scale(b.v, 0.999); b.w *= 0.999; b.p = add(b.p, scale(b.v, dt)); b.angle += b.w * dt; if (b.p.y < -5) { b.p = { x: 8, y: 8 }; b.v = { x: 0, y: 0 }; b.w = 0; } }
    S.contacts = [];
    for (let iter = 0; iter < 3; iter++) for (let i = 0; i < S.bodies.length; i++) for (let j = i + 1; j < S.bodies.length; j++) {
      const A = S.bodies[i], B = S.bodies[j]; if (!A.invMass && !B.invMass) continue;
      if (length(sub(A.p, B.p)) > Math.hypot(A.hw, A.hh) + Math.hypot(B.hw, B.hh)) continue;
      const c = collide(A, B); if (!c) continue; resolve(A, B, c); if (iter === 0) S.contacts.push(c);
    }
  }
  const v = makeViz('c-rbd', {
    w: 640, h: 400, unit: 40, ox: 0, oy: 400,
    onClick(p) { const i = S.idc++; const b = makeBox({ x: clamp(p.x, 1.5, 14.5), y: Math.max(p.y, 3) }, 1 + hashf(i * 2 + 1) * 2, 0.8 + hashf(i * 2 + 2) * 1.6, 2, hashf(i * 2 + 3) * 1.5, rgbs(hsl2rgb(hashf(i * 2 + 5), 0.7, 0.6))); b.w = (hashf(i * 2 + 4) - 0.5) * 4; S.bodies.push(b); if (S.bodies.length > 18) S.bodies.splice(3, 1); },
    draw(v) {
      v.grid();
      for (const b of S.bodies) { v.poly(verts(b), b.invMass ? b.col + 'aa' : b.col, b.invMass ? b.col : '#4d6b7c', 2); if (b.invMass) { v.line(b.p, add(b.p, rotate({ x: b.hw, y: 0 }, b.angle)), 'rgba(255,255,255,0.6)', 1.5); v.point(b.p, '#fff', 2.5); } }
      if (S.show) for (const c of S.contacts) { v.point(c.point, C.pink, 5, true); v.arrow(c.point, add(c.point, scale(c.n, 0.8)), C.pink, '', 2); }
      const dyn = S.bodies.filter(b => b.invMass);
      const b = dyn[dyn.length - 1];
      setHTML('r-rbd', `bounce = ${fmt(S.bounce)}   friction = ${fmt(S.friction)}   剛体 ${dyn.length} 個   接触点 ${S.contacts.length}\n最後の箱: p = ${vs(b.p)}  v = ${vs(b.v)}  angle = ${fmt(b.angle)}  w（角速度）= ${hl(fmt(b.w))}\n接触点（ピンク）で j を計算 → v += n * j / mass;  w += cross2d(r, n) * j / inertia`);
    },
  });
  if (!v) return;
  slider('s-rbb', val => { S.bounce = val; }, val => fmt(val)); slider('s-rbf', val => { S.friction = val; }, val => fmt(val));
  checkbox('k-rbshow', on => { S.show = on; });
  $('#b-rbd-reset').addEventListener('click', () => { reset(); v.redraw(); });
  animators.push({ section: secIdx('c-rbd'), fn(dt) { const h = Math.min(dt, 1 / 30); for (let k = 0; k < 4; k++) step(h / 4); v.redraw(); } });
  register(secIdx('c-rbd'), v);
})();

/* ---------- S4 Glue：拘束ネットワークの破断 ---------- */
(function () {
  const S = { strength: 60, bulletMass: 30, pts: [], cons: [], bullets: [], broken: 0, t: 0 };
  const G = -9.8, CELL = 0.5;
  function reset() {
    S.pts = []; S.cons = []; S.bullets = []; S.broken = 0;
    const W = 6, H = 12; const idx = (i, j) => j * W + i;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) S.pts.push({ p: { x: 9 + i * CELL, y: 0.3 + j * CELL }, prev: null, v: { x: 0, y: 0 } });
    S.pts.forEach(q => q.prev = { ...q.p });
    const link = (a, b) => S.cons.push({ a, b, rest: length(sub(S.pts[a].p, S.pts[b].p)), broken: false, stress: 0 });
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (i + 1 < W) link(idx(i, j), idx(i + 1, j)); if (j + 1 < H) link(idx(i, j), idx(i, j + 1)); if (i + 1 < W && j + 1 < H) { link(idx(i, j), idx(i + 1, j + 1)); link(idx(i + 1, j), idx(i, j + 1)); } }
  }
  reset();
  function step(dt) {
    for (const q of S.pts) { const v = scale(sub(q.p, q.prev), 1 / dt); q.prev = q.p; q.p = add(q.p, scale(add(scale(v, 0.995), { x: 0, y: G * dt }), dt)); }
    for (const b of S.bullets) { b.v.y += G * dt; b.p = add(b.p, scale(b.v, dt)); }
    for (let it = 0; it < 6; it++) {
      for (const c of S.cons) {
        if (c.broken) continue;
        const A = S.pts[c.a], B = S.pts[c.b]; const d = sub(B.p, A.p), len = length(d) || 1e-6; const err = len - c.rest; c.stress = Math.abs(err) / c.rest;
        if (S.strength >= 0 && c.stress > 0.02 + S.strength * 0.004) { c.broken = true; S.broken++; continue; }
        const corr = scale(d, err / len * 0.5); A.p = add(A.p, corr); B.p = sub(B.p, corr);
      }
      for (const q of S.pts) { if (q.p.y < 0.15) q.p.y = 0.15; if (q.p.x < 0.2) q.p.x = 0.2; if (q.p.x > 15.8) q.p.x = 15.8; }
      // 弾との衝突（弾は重いので点を押しのける）
      for (const b of S.bullets) for (const q of S.pts) { const d = sub(q.p, b.p), l = length(d); if (l < b.r + 0.15 && l > 0) { const push = scale(d, (b.r + 0.15 - l) / l); const wq = 1 / (1 + b.m), wb = 1 - wq; q.p = add(q.p, scale(push, wb)); b.p = sub(b.p, scale(push, wq * 0.3)); b.v = scale(b.v, 0.97); } }
    }
    for (const b of S.bullets) { if (b.p.y < b.r) { b.p.y = b.r; b.v.y = -b.v.y * 0.3; b.v.x *= 0.9; } }
    S.bullets = S.bullets.filter(b => b.p.x > -2 && b.p.x < 18);
  }
  const v = makeViz('c-glue', {
    w: 640, h: 400, unit: 40, ox: 0, oy: 400,
    onClick(p) { const target = { x: 10.5, y: clamp(p.y, 1, 6) }; const start = { x: 1, y: clamp(p.y, 1, 6) }; S.bullets.push({ p: start, v: scale(normalize(sub(target, start)), 22), r: 0.45, m: S.bulletMass / 10 }); if (S.bullets.length > 4) S.bullets.shift(); },
    draw(v) {
      v.grid(); v.line({ x: 0, y: 0 }, { x: 16, y: 0 }, C.axis, 3);
      for (const c of S.cons) { if (c.broken) continue; v.line(S.pts[c.a].p, S.pts[c.b].p, rgbs(mixc([255, 209, 102], [255, 107, 157], clamp(c.stress * 20, 0, 1))), 1.5); }
      for (const q of S.pts) v.point(q.p, '#e2ecf3', 3);
      for (const b of S.bullets) v.point(b.p, C.pink, b.r * v.unit);
      v.textPx('クリックで左から弾を撃つ →', 20, 30, C.muted, 'left', 12);
      setHTML('r-glue', `strength = ${S.strength}${S.strength < 0 ? hl('（-1：絶対に切れない）') : ''}   弾の重さ = ${S.bulletMass}   拘束 ${S.cons.length} 本のうち切れた本数 = ${hl(S.broken)}\n各拘束: stretch = |length(b - a) − rest| / rest  → stretch > しきい値(strength) なら broken\n黄色 → ピンク = 伸びが大きい（切れる直前）`);
    },
  });
  if (!v) return;
  slider('s-gls', val => { S.strength = val; }); slider('s-glm', val => { S.bulletMass = val; });
  $('#b-glue-reset').addEventListener('click', () => { reset(); v.redraw(); });
  animators.push({ section: secIdx('c-glue'), fn(dt) { const h = Math.min(dt, 1 / 30); for (let k = 0; k < 2; k++) step(h / 2); v.redraw(); } });
  register(secIdx('c-glue'), v);
})();

/* =========================================================
   S5 Vellum — XPBD 布
   ========================================================= */
(function () {
  const NX = 18, NY = 12, SP = 0.28;
  const S = { iters: 8, substeps: 2, stiffExp: 5, bend: true, pin: true, showStretch: false, pts: [], cons: [], ball: { x: 0.4, y: -0.9, r: 0.45 }, maxStretch: 0 };
  const G = -9.8;
  function reset() {
    S.pts = []; S.cons = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) S.pts.push({ p: { x: -2.4 + i * SP, y: 1.6 - j * SP }, prev: { x: -2.4 + i * SP, y: 1.6 - j * SP }, inv: 1, pinned: j === 0 && (i % 4 === 0 || i === NX - 1) });
    const idx = (i, j) => j * NX + i;
    const link = (a, b, type) => S.cons.push({ a, b, rest: length(sub(S.pts[a].p, S.pts[b].p)), type, lambda: 0 });
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      if (i + 1 < NX) link(idx(i, j), idx(i + 1, j), 'stretch'); if (j + 1 < NY) link(idx(i, j), idx(i, j + 1), 'stretch');
      if (i + 1 < NX && j + 1 < NY) { link(idx(i, j), idx(i + 1, j + 1), 'shear'); link(idx(i + 1, j), idx(i, j + 1), 'shear'); }
      if (i + 2 < NX) link(idx(i, j), idx(i + 2, j), 'bend'); if (j + 2 < NY) link(idx(i, j), idx(i, j + 2), 'bend');
    }
  }
  reset();
  function step(dt) {
    const sub_dt = dt / S.substeps;
    const compliance = Math.pow(10, -S.stiffExp), alphaStretch = compliance / (sub_dt * sub_dt), alphaBend = compliance * 100 / (sub_dt * sub_dt);
    for (let ss = 0; ss < S.substeps; ss++) {
      for (const q of S.pts) { q.inv = (S.pin && q.pinned) ? 0 : 1; if (!q.inv) { q.prev = { ...q.p }; continue; } const v = scale(sub(q.p, q.prev), 1 / sub_dt); q.prev = q.p; q.p = add(q.p, scale(add(scale(v, 0.998), { x: 0, y: G * sub_dt }), sub_dt)); }
      for (const c of S.cons) c.lambda = 0;
      for (let it = 0; it < S.iters; it++) {
        for (const c of S.cons) {
          if (c.type === 'bend' && !S.bend) continue;
          const A = S.pts[c.a], B = S.pts[c.b]; const wsum = A.inv + B.inv; if (!wsum) continue;
          const d = sub(B.p, A.p), len = length(d) || 1e-6, err = len - c.rest; const alpha = c.type === 'bend' ? alphaBend : alphaStretch;
          const dl = (-err - alpha * c.lambda) / (wsum + alpha); c.lambda += dl;
          const corr = scale(d, dl / len);
          A.p = sub(A.p, scale(corr, A.inv)); B.p = add(B.p, scale(corr, B.inv));
        }
        // 衝突拘束：球と床
        for (const q of S.pts) { if (!q.inv) continue; const d = sub(q.p, S.ball), l = length(d); if (l < S.ball.r + 0.05) q.p = add(S.ball, scale(d, (S.ball.r + 0.05) / (l || 1e-6))); if (q.p.y < -1.9) q.p.y = -1.9; }
      }
    }
    let mx = 0; for (const c of S.cons) if (c.type === 'stretch') { const l = length(sub(S.pts[c.b].p, S.pts[c.a].p)); mx = Math.max(mx, l / c.rest - 1); } S.maxStretch = mx;
  }
  const v = makeViz('c-vellum', {
    w: 640, h: 400, unit: 100, ox: 320, oy: 200,
    draw(v) {
      v.grid(); v.line({ x: -3.2, y: -1.9 }, { x: 3.2, y: -1.9 }, C.axis, 2);
      v.circle(S.ball, S.ball.r, C.yellow, 2, null, 'rgba(255,209,102,0.15)');
      for (const c of S.cons) { if (c.type !== 'stretch') continue; const A = S.pts[c.a].p, B = S.pts[c.b].p; let col = 'rgba(44,169,225,0.8)'; if (S.showStretch) { const st = length(sub(B, A)) / c.rest - 1; col = rgbs(mixc([44, 169, 225], [255, 107, 157], clamp(st * 6, 0, 1))); } v.line(A, B, col, 1.5); }
      for (const q of S.pts) if (q.pinned && S.pin) v.point(q.p, C.pink, 4);
      v.drawHandles();
      const compliance = Math.pow(10, -S.stiffExp);
      setHTML('r-vellum', `点 ${S.pts.length}   拘束 ${S.cons.length}（stretch / shear / bend）   iterations = ${S.iters}   substeps = ${S.substeps}\nstiffness = 10^${S.stiffExp} → compliance = ${compliance.toExponential(0)}   alpha = compliance / dt² が「柔らかさ」として効く\n一番伸びている stretch 拘束: ${hl(fmt(S.maxStretch * 100, 1) + ' %')}   ${S.iters <= 2 ? '← 反復が少ないので直しきれず伸びる' : S.maxStretch > 1 ? '← 球をまたいだ拘束が伸びている（衝突拘束と距離拘束の綱引き。Vellum でも同じで、布を細かくするか Thickness で逃がす）' : ''}`);
    },
  });
  if (!v) return;
  v.handles.push({ get: () => S.ball, set: p => { S.ball.x = p.x; S.ball.y = p.y; }, color: C.yellow });
  S.pts.forEach((q, i) => v.handles.push({ get: () => S.pts[i].p, set: p => { S.pts[i].p = p; S.pts[i].prev = { ...p }; }, color: 'rgba(255,255,255,0.0)' }));
  const origDraw = v.drawHandles; v.drawHandles = () => { v.point(S.ball, C.yellow, 6, true); };
  slider('s-vli', val => { S.iters = val; }); slider('s-vls', val => { S.substeps = val; }); slider('s-vlk', val => { S.stiffExp = val; }, val => fmt(val, 1));
  checkbox('k-vlbend', on => { S.bend = on; }); checkbox('k-vlpin', on => { S.pin = on; }); checkbox('k-vlshow', on => { S.showStretch = on; });
  $('#b-vellum-reset').addEventListener('click', () => { reset(); v.handles.length = 1; S.pts.forEach((q, i) => v.handles.push({ get: () => S.pts[i].p, set: p => { S.pts[i].p = p; S.pts[i].prev = { ...p }; }, color: 'rgba(0,0,0,0)' })); v.redraw(); });
  animators.push({ section: secIdx('c-vellum'), fn(dt) { step(Math.min(dt, 1 / 30)); v.redraw(); } });
  register(secIdx('c-vellum'), v);
})();

/* =========================================================
   S6 MPM — MLS-MPM 2D（Hu et al. 2018 の 88 行版を移植）
   ========================================================= */
(function () {
  const NX = 64, NY = 40, DX = 1 / NY, INV_DX = NY, DT = 2.5e-4, SUB = 20;
  const P_VOL = (DX * 0.5) ** 2, P_RHO = 1, P_MASS = P_VOL * P_RHO, NU = 0.2;
  const S = { E: 1000, mat: 'jelly', play: true, pts: [], t: 0 };
  const gv = new Float32Array(NX * NY * 2), gm = new Float32Array(NX * NY);
  const MAXP = 2400;
  function addBlock(cx, cy, mat) {
    const list = [];
    for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) list.push({ x: cx - 0.09 + i * 0.013 + hashf(i * 31 + j) * 0.004, y: cy - 0.09 + j * 0.013 + hashf(j * 17 + i) * 0.004, vx: 0, vy: 0, F: [1, 0, 0, 1], C: [0, 0, 0, 0], Jp: 1, mat });
    S.pts.push(...list); if (S.pts.length > MAXP) S.pts.splice(0, S.pts.length - MAXP);
  }
  function reset() { S.pts = []; addBlock(0.45, 0.75, 'jelly'); addBlock(0.85, 0.55, 'snow'); addBlock(1.2, 0.8, 'liquid'); }
  reset();
  // 2x2 SVD: M = R(phi) * diag(sx, sy) * R(theta)
  function svd2(a, b, c, d) {
    const E = (a + d) / 2, F = (a - d) / 2, G = (c + b) / 2, H = (c - b) / 2;
    const Q = Math.hypot(E, H), R = Math.hypot(F, G);
    const a1 = Math.atan2(G, F), a2 = Math.atan2(H, E);
    return { phi: (a2 + a1) / 2, theta: (a2 - a1) / 2, sx: Q + R, sy: Q - R };
  }
  function substep() {
    gv.fill(0); gm.fill(0);
    const E = S.E, mu0 = E / (2 * (1 + NU)), la0 = E * NU / ((1 + NU) * (1 - 2 * NU));
    // P2G
    for (const p of S.pts) {
      const bx = Math.floor(p.x * INV_DX - 0.5), by = Math.floor(p.y * INV_DX - 0.5);
      const fx = p.x * INV_DX - bx, fy = p.y * INV_DX - by;
      const wx = [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2], wy = [0.5 * (1.5 - fy) ** 2, 0.75 - (fy - 1) ** 2, 0.5 * (fy - 0.5) ** 2];
      // F = (I + dt C) F
      const [c0, c1, c2, c3] = p.C; let [f0, f1, f2, f3] = p.F;
      const n0 = (1 + DT * c0) * f0 + DT * c1 * f2, n1 = (1 + DT * c0) * f1 + DT * c1 * f3, n2 = DT * c2 * f0 + (1 + DT * c3) * f2, n3 = DT * c2 * f1 + (1 + DT * c3) * f3;
      f0 = n0; f1 = n1; f2 = n2; f3 = n3;
      let h = p.mat === 'snow' ? Math.max(0.1, Math.min(5, Math.exp(10 * (1 - p.Jp)))) : (p.mat === 'jelly' ? 0.3 : 1);
      let mu = mu0 * h, la = la0 * h; if (p.mat === 'liquid') mu = 0;
      const sv = svd2(f0, f1, f2, f3); let { sx, sy } = sv; let J = 1;
      if (p.mat === 'snow') { const nsx = clamp(sx, 1 - 2.5e-2, 1 + 4.5e-3), nsy = clamp(sy, 1 - 2.5e-2, 1 + 4.5e-3); p.Jp *= (sx / nsx) * (sy / nsy); p.Jp = clamp(p.Jp, 0.6, 2); sx = nsx; sy = nsy; }
      J = sx * sy;
      const cp = Math.cos(sv.phi), sp = Math.sin(sv.phi), ct = Math.cos(sv.theta), st = Math.sin(sv.theta);
      // R = R(phi) R(theta) = R(phi+theta)
      const cr = Math.cos(sv.phi + sv.theta), sr = Math.sin(sv.phi + sv.theta);
      if (p.mat === 'liquid') { const s = Math.sqrt(J); f0 = s; f1 = 0; f2 = 0; f3 = s; }
      else if (p.mat === 'snow') {
        // F = R(phi) diag R(theta)
        const u0 = cp * sx, u1 = -sp * sy, u2 = sp * sx, u3 = cp * sy; // R(phi) * diag
        f0 = u0 * ct + u1 * st; f1 = -u0 * st + u1 * ct; f2 = u2 * ct + u3 * st; f3 = -u2 * st + u3 * ct;
      }
      p.F = [f0, f1, f2, f3];
      // stress = 2 mu (F - R) F^T + I * la * J (J - 1)
      const d0 = f0 - cr, d1 = f1 + sr, d2 = f2 - sr, d3 = f3 - cr;
      let s0 = 2 * mu * (d0 * f0 + d1 * f1) + la * J * (J - 1), s1 = 2 * mu * (d0 * f2 + d1 * f3), s2 = 2 * mu * (d2 * f0 + d3 * f1), s3 = 2 * mu * (d2 * f2 + d3 * f3) + la * J * (J - 1);
      const k = -DT * P_VOL * 4 * INV_DX * INV_DX;
      const a0 = k * s0 + P_MASS * c0, a1 = k * s1 + P_MASS * c1, a2 = k * s2 + P_MASS * c2, a3 = k * s3 + P_MASS * c3;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const gx = bx + i, gy = by + j; if (gx < 0 || gx >= NX || gy < 0 || gy >= NY) continue;
        const dpx = (i - fx) * DX, dpy = (j - fy) * DX, w = wx[i] * wy[j], g = gx * NY + gy;
        gv[2 * g] += w * (P_MASS * p.vx + a0 * dpx + a1 * dpy); gv[2 * g + 1] += w * (P_MASS * p.vy + a2 * dpx + a3 * dpy); gm[g] += w * P_MASS;
      }
    }
    // Grid
    for (let gx = 0; gx < NX; gx++) for (let gy = 0; gy < NY; gy++) {
      const g = gx * NY + gy; if (gm[g] <= 0) continue;
      gv[2 * g] /= gm[g]; gv[2 * g + 1] /= gm[g]; gv[2 * g + 1] -= DT * 50;
      if (gx < 3 && gv[2 * g] < 0) gv[2 * g] = 0; if (gx > NX - 4 && gv[2 * g] > 0) gv[2 * g] = 0;
      if (gy < 3 && gv[2 * g + 1] < 0) gv[2 * g + 1] = 0; if (gy > NY - 4 && gv[2 * g + 1] > 0) gv[2 * g + 1] = 0;
    }
    // G2P
    for (const p of S.pts) {
      const bx = Math.floor(p.x * INV_DX - 0.5), by = Math.floor(p.y * INV_DX - 0.5);
      const fx = p.x * INV_DX - bx, fy = p.y * INV_DX - by;
      const wx = [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2], wy = [0.5 * (1.5 - fy) ** 2, 0.75 - (fy - 1) ** 2, 0.5 * (fy - 0.5) ** 2];
      let vx = 0, vy = 0, C0 = 0, C1 = 0, C2 = 0, C3 = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const gx = bx + i, gy = by + j; if (gx < 0 || gx >= NX || gy < 0 || gy >= NY) continue;
        const dpx = i - fx, dpy = j - fy, w = wx[i] * wy[j], g = gx * NY + gy, gvx = gv[2 * g], gvy = gv[2 * g + 1];
        vx += w * gvx; vy += w * gvy;
        C0 += 4 * INV_DX * w * gvx * dpx; C1 += 4 * INV_DX * w * gvx * dpy; C2 += 4 * INV_DX * w * gvy * dpx; C3 += 4 * INV_DX * w * gvy * dpy;
      }
      p.vx = vx; p.vy = vy; p.C = [C0, C1, C2, C3];
      p.x = clamp(p.x + DT * vx, 2 * DX, 1.6 - 2 * DX); p.y = clamp(p.y + DT * vy, 2 * DX, 1 - 2 * DX);
    }
  }
  const COL = { liquid: C.blue, jelly: C.pink, snow: '#f0f4f7' };
  const v = makeViz('c-mpm', {
    w: 640, h: 400, unit: 400, ox: 0, oy: 400,
    onClick(p) { addBlock(clamp(p.x, 0.15, 1.45), clamp(p.y, 0.15, 0.9), S.mat); },
    draw(v) {
      const ctx = v.ctx; ctx.fillStyle = '#182b36'; ctx.fillRect(0, 0, 640, 400);
      for (const p of S.pts) { ctx.fillStyle = COL[p.mat]; ctx.fillRect(p.x * 400 - 1.5, 400 - p.y * 400 - 1.5, 3, 3); }
      const cnt = { liquid: 0, jelly: 0, snow: 0 }; for (const p of S.pts) cnt[p.mat]++;
      const sample = S.pts.find(q => q.mat === 'jelly') || S.pts[0];
      const det = sample ? sample.F[0] * sample.F[3] - sample.F[1] * sample.F[2] : 1;
      setHTML('r-mpm', `粒子 ${S.pts.length}（液体 ${cnt.liquid} / ゼリー ${cnt.jelly} / 雪 ${cnt.snow}）   格子 ${NX}×${NY}   dt = ${DT} × ${SUB} substeps/frame   E = ${S.E}\n${sample ? `ある${sample.mat === 'jelly' ? 'ゼリー' : sample.mat === 'snow' ? '雪' : '液体'}粒子の F = { i: {x: ${fmt(sample.F[0])}, y: ${fmt(sample.F[2])}}, j: {x: ${fmt(sample.F[1])}, y: ${fmt(sample.F[3])}} }   det(F) = ${hl(fmt(det, 3))}（体積比）` : ''}\n次に落とす材料: ${hl(S.mat)}   クリックで落とす`);
    },
  });
  if (!v) return;
  modeButtons('mpm-mat', d => { S.mat = d.m; v.redraw(); });
  slider('s-mpe', val => { S.E = val; });
  checkbox('k-mpplay', on => { S.play = on; });
  $('#b-mpm-reset').addEventListener('click', () => { reset(); v.redraw(); });
  animators.push({ section: secIdx('c-mpm'), fn() { if (!S.play) return; for (let k = 0; k < SUB; k++) substep(); v.redraw(); } });
  register(secIdx('c-mpm'), v);
})();
