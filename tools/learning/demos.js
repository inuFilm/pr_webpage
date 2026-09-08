'use strict';
(() => {
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const encode = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  const decode = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  function filteredWave(center, cycles, phase, pixelWidth) {
    // Exact box average of a sine across one pixel (not a general texture filter).
    const a = Math.PI * cycles * pixelWidth;
    const sinc = Math.abs(a) < 1e-8 ? 1 : Math.sin(a) / a;
    return 0.5 + 0.5 * Math.sin(2 * Math.PI * (cycles * center + phase)) * sinc;
  }
  function bezierPoint(p, t) {
    const u = 1 - t;
    return [0, 1].map(k => u*u*u*p[0][k] + 3*u*u*t*p[1][k] + 3*u*t*t*p[2][k] + t*t*t*p[3][k]);
  }
  function arcTable(p, steps = 400) {
    const table = [{ t: 0, distance: 0 }];
    let prev = bezierPoint(p, 0), total = 0;
    for (let i = 1; i <= steps; i++) {
      const point = bezierPoint(p, i / steps);
      total += Math.hypot(point[0] - prev[0], point[1] - prev[1]);
      table.push({ t: i / steps, distance: total }); prev = point;
    }
    return table;
  }
  function distanceToT(table, fraction) {
    const total = table[table.length - 1].distance;
    if (total < 1e-9) return 0; // A collapsed curve has no direction or travel distance.
    const target = clamp01(fraction) * total;
    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].distance < target) lo = mid; else hi = mid;
    }
    const a = table[lo], b = table[hi], span = b.distance - a.distance;
    const w = span > 0 ? (target - a.distance) / span : 0;
    return a.t + (b.t - a.t) * w;
  }
  function remainingVelocity(drag, fps, seconds = 1) {
    return {
      euler: Math.pow(1 - drag / fps, Math.round(seconds * fps)),
      exact: Math.exp(-drag * seconds)
    };
  }
  const math = { encode, decode, filteredWave, bezierPoint, arcTable, distanceToT, remainingVelocity };
  if (typeof module !== 'undefined' && module.exports) module.exports = math;
  if (typeof document === 'undefined') return;

  const colors = { ink: '#eef3f6', muted: '#b1c8d5', blue: '#55c9f6', yellow: '#ffd166', bg: '#102431' };
  const drawables = [];
  document.querySelectorAll('[data-learning-demo]').forEach(root => {
    const kind = root.dataset.learningDemo, canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { root.querySelector('[data-readout]').textContent = 'この環境では図を表示できません。本文とコードをご覧ください。'; return; }
    const w = 640, h = kind === 'curve' ? 390 : 320, dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = '100%'; canvas.style.aspectRatio = w + ' / ' + h;
    ctx.scale(dpr, dpr);
    const get = name => Number(root.querySelector('[data-control="' + name + '"]').value);
    const readout = root.querySelector('[data-readout]');
    const text = (s, x, y, color = colors.ink) => { ctx.fillStyle = color; ctx.font = '14px sans-serif'; ctx.fillText(s, x, y); };
    const line = (points, color, width = 2) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke();
    };
    const dot = (p, color, r = 5) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(...p, r, 0, Math.PI * 2); ctx.fill(); };
    function draw() {
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, w, h);
      root.querySelectorAll('input[type="range"]').forEach(input => {
        const output = input.parentElement.querySelector('output');
        if (output) output.textContent = input.value;
      });
      if (kind === 'sampling') {
        const f = get('cycles'), n = get('samples'), phase = get('phase');
        const labels = ['高解像度の参考（512区間で平均）', '低解像度：中心を1回だけ読む', '低解像度：1画素の幅で平均する'];
        for (let row = 0; row < 3; row++) {
          text(labels[row], 20, 24 + row * 92);
          const count = row === 0 ? 512 : n;
          for (let i = 0; i < count; i++) {
            const u = (i + 0.5) / count;
            const v = row === 1 ? 0.5 + 0.5 * Math.sin(2 * Math.PI * (f * u + phase)) : filteredWave(u, f, phase, 1 / count);
            const c = Math.round(clamp01(v) * 255);
            ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
            ctx.fillRect(20 + i * 600 / count, 34 + row * 92, 600 / count + 0.2, 49);
          }
        }
        readout.textContent = '模様 ' + f + ' 周 / 標本 ' + n + ' 個。ナイキスト境界は ' + (n / 2) + ' 周。' +
          (f >= n / 2 ? '境界以上では元の波を一意に復元できません。' : '境界未満です。平均化によるコントラストの変化も観察してください。') +
          ' この箱型平均は高周波を弱めますが、完全な帯域制限ではありません。';
      } else if (kind === 'color') {
        const t = get('mix');
        const encoded = t, linear = decode(0) * (1 - t) + decode(1) * t, correct = encode(linear);
        [encoded, correct].forEach((v, i) => {
          text(i ? '光の量を混ぜてから sRGB に戻す' : 'sRGB の数字を直接混ぜる', 20 + i * 310, 28);
          const c = Math.round(v * 255); ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
          ctx.fillRect(20 + i * 310, 42, 285, 110);
          text('表示 sRGB = ' + v.toFixed(3), 20 + i * 310, 177);
        });
        for (let i = 0; i < 600; i++) {
          for (let row = 0; row < 2; row++) {
            const v = row ? encode(i / 599) : i / 599;
            const c = Math.round(v * 255); ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
            ctx.fillRect(20 + i, 212 + row * 40, 1, 26);
          }
        }
        text('上：数値を補間 / 下：光の量を補間（黒 → 白）', 20, 302, colors.muted);
        readout.textContent = '白の割合 ' + t.toFixed(2) + '。直接補間した灰色の光量は ' + decode(encoded).toFixed(3) +
          '、線形補間の光量は ' + linear.toFixed(3) + '。RGB各成分に同じ変換を使えます。';
      } else if (kind === 'curve') {
        const bend = get('bend'), fraction = get('phase');
        const p = [[30, 106], [30 + bend * 170, 25], [65, 153 - bend * 80], [600, 70]];
        const table = arcTable(p), t = distanceToT(table, fraction);
        for (let row = 0; row < 2; row++) {
          const shift = point => [point[0], point[1] + row * 180 + 20];
          text(row ? '距離を等分：点の間隔・流れる速さを揃える' : 't を等分：曲線の場所によって点が詰まる', 20, 20 + row * 180);
          line(Array.from({length: 161}, (_, i) => shift(bezierPoint(p, i / 160))), colors.muted);
          for (let i = 0; i <= 12; i++) dot(shift(bezierPoint(p, row ? distanceToT(table, i / 12) : i / 12)), colors.blue, 3);
          dot(shift(bezierPoint(p, row ? t : fraction)), colors.yellow, 8);
        }
        readout.textContent = '進行 ' + fraction.toFixed(2) + ' → 上の t = ' + fraction.toFixed(3) +
          ' / 下の t = ' + t.toFixed(3) + '。全長 ≈ ' + table[table.length - 1].distance.toFixed(1) +
          ' 図の単位。400分割の折れ線で距離を近似しています。曲線の長さが変われば、同じ周回時間でも実距離の速さは変わります。';
      } else if (kind === 'decay') {
        const drag = get('drag');
        text('1秒後の速度（初速1、抵抗だけを適用）', 20, 26);
        [30, 60, 120].forEach((fps, i) => {
          const result = remainingVelocity(drag, fps);
          const y = 65 + i * 76;
          text(fps + ' fps', 20, y);
          [[result.euler, colors.blue], [result.exact, colors.yellow]].forEach(([v, c], j) => {
            ctx.fillStyle = c; ctx.fillRect(100, y - 16 + j * 25, 330 * v, 15);
            text(v.toFixed(5), 450, y - 3 + j * 25, c);
          });
        });
        text('青：1 − drag × dt / 黄：exp(−drag × dt)', 20, 306, colors.muted);
        readout.textContent = 'drag = ' + drag + ' /秒。指数式は一定係数の抵抗だけなら時間刻みを変えても同じ減速。位置の積分や衝突まで正確になるわけではありません。';
      }
    }
    root.addEventListener('input', draw);
    const play = root.querySelector('[data-play]');
    const phase = root.querySelector('[data-control="phase"]');
    drawables.push({ root, draw, play, phase }); draw();
    const code = root.parentElement.querySelector('[data-demo-code="' + kind + '"]');
    if (code) {
      const fn = kind === 'sampling' ? [filteredWave] : kind === 'color' ? [decode, encode] :
        kind === 'curve' ? [clamp01, bezierPoint, arcTable, distanceToT] : [remainingVelocity];
      code.textContent = fn.map(f => f.toString()).join('\n\n');
    }
  });
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) for (const item of drawables) {
      if (!item.play?.checked || !item.root.closest('.lesson')?.classList.contains('active')) continue;
      item.phase.value = ((Number(item.phase.value) + dt * 0.18) % 1).toFixed(3); item.draw();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
