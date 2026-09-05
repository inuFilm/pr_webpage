/* input-pad.js — 漢字入力エリア
 * Pointer Events（mouse / touch / pen 統一）で1画ずつ記録し、pointerup で判定する。
 *  正解 → 線を残す・発光・パーティクル・onStroke({ok:true})
 *  不正解 → その線だけ「跳ねる→薄くなる→消える」、正しい始点を光らせる・onStroke({ok:false})
 * ヒントレベル: 1=全画+番号+動くガイド / 2=次の画だけ薄く / 3=始点だけ / 4=なし
 */
(function (root) {
  'use strict';
  var G = root.Geometry;

  function InputPad(container, opts) {
    opts = opts || {};
    this.container = container;
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1; this.size = 100;
    this.entry = null;
    this.strokeIndex = 0;
    this.accepted = [];
    this.current = null;
    this.activePointer = null;
    this.rejected = [];
    this.sparks = [];
    this.hintLevel = 1;
    this.strokeHints = [];
    this.mistakesOnCurrent = 0;
    this.totalMistakes = 0;
    this.startGlowUntil = 0;
    this.hintBoostUntil = 0;
    this.completedAt = 0;
    this.color = '#62e6ff';
    this.enabled = true;
    this.recordOnly = !!opts.recordOnly; // 開発者モード: 判定せず記録だけ
    this.onStroke = opts.onStroke || function () {};
    this.onComplete = opts.onComplete || function () {};
    this.onRawStroke = opts.onRawStroke || null;
    this.running = true;
    this._bind();
    this.resize();
    var self = this;
    this._ro = new ResizeObserver(function () { self.resize(); });
    this._ro.observe(container);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  InputPad.prototype.resize = function () {
    var r = this.container.getBoundingClientRect();
    var s = Math.max(10, Math.min(r.width, r.height));
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.size = s;
    this.canvas.width = Math.round(s * this.dpr);
    this.canvas.height = Math.round(s * this.dpr);
    this.canvas.style.width = s + 'px';
    this.canvas.style.height = s + 'px';
  };

  InputPad.prototype.destroy = function () {
    this.running = false;
    if (this._ro) this._ro.disconnect();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  };

  /* ---------- 状態操作 ---------- */
  InputPad.prototype.setKanji = function (entry, o) {
    o = o || {};
    this.entry = entry;
    this.strokeIndex = 0;
    this.accepted = [];
    this.current = null;
    this.rejected = [];
    this.sparks = [];
    this.mistakesOnCurrent = 0;
    this.totalMistakes = 0;
    this.startGlowUntil = 0;
    this.hintBoostUntil = 0;
    this.completedAt = 0;
    this.hintLevel = o.hintLevel || 1;
    this.strokeHints = o.strokeHints || [];
    // assist: 'full' = ミスするたびに段階的に補助を強める / 'minimal' = 3回ミスで始点だけ / 'none' = 何も出さない
    this.assist = o.assist || 'full';
    this.color = o.color || '#62e6ff';
    this.enabled = true;
    this.container.classList.remove('perfect');
  };
  InputPad.prototype.clear = function () { this.setKanji(this.entry, { hintLevel: this.hintLevel, strokeHints: this.strokeHints, color: this.color, assist: this.assist }); };
  /** やり直し: 今の漢字を最初から（ミスには数えない） */
  InputPad.prototype.redo = function () {
    if (!this.entry || this.completedAt) return;
    this.strokeIndex = 0; this.accepted = []; this.current = null; this.rejected = []; this.activePointer = null; this.mistakesOnCurrent = 0;
  };
  /** ヒントボタン: 数秒間だけ Level1 相当（全表示 + 動くガイド） */
  InputPad.prototype.showHint = function (ms) { this.hintBoostUntil = performance.now() + (ms || 3500); this.startGlowUntil = performance.now() + (ms || 3500); };
  InputPad.prototype.setEnabled = function (v) { this.enabled = v; this.container.classList.toggle('disabled', !v); };

  InputPad.prototype.effectiveHint = function () {
    var now = performance.now();
    var lvl = this.strokeHints[this.strokeIndex] || this.hintLevel;
    if (now < this.hintBoostUntil) return 1;
    if (this.assist === 'none') return lvl;
    if (this.assist === 'minimal') return this.mistakesOnCurrent >= 3 ? Math.min(lvl, 3) : lvl;
    if (this.mistakesOnCurrent >= 3) lvl = Math.min(lvl, 1);
    else if (this.mistakesOnCurrent >= 2) lvl = Math.min(lvl, 2);
    else if (this.mistakesOnCurrent >= 1) lvl = Math.min(lvl, 3);
    return lvl;
  };

  /* ---------- 入力 ---------- */
  InputPad.prototype._bind = function () {
    var self = this, c = this.canvas;
    c.style.touchAction = 'none';
    function pos(e) { var r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    c.addEventListener('pointerdown', function (e) {
      if (!self.enabled) return;
      if (!self.recordOnly && (!self.entry || self.completedAt)) return;
      if (self.activePointer !== null) return; // 2本目以降は無視（パームリジェクション簡易）
      if (e.pointerType === 'touch' && e.width > 40 && e.height > 40) return; // 手のひららしき接触は無視
      self.activePointer = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      self.current = [pos(e)];
      e.preventDefault();
    });
    c.addEventListener('pointermove', function (e) {
      if (e.pointerId !== self.activePointer || !self.current) return;
      var p = pos(e);
      var last = self.current[self.current.length - 1];
      if (G.dist(p, last) > 0.003) self.current.push(p);
      e.preventDefault();
    });
    function up(e) {
      if (e.pointerId !== self.activePointer) return;
      self.activePointer = null;
      var pts = self.current; self.current = null;
      if (pts && pts.length) self._finishStroke(pts);
      e.preventDefault();
    }
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', function (e) { if (e.pointerId === self.activePointer) up(e); });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  InputPad.prototype._finishStroke = function (pts) {
    if (this.recordOnly) { if (this.onRawStroke) this.onRawStroke(pts); return; }
    if (!this.entry || !this.entry.strokes) return;
    var idx = this.strokeIndex, total = this.entry.strokes.length;
    var tpl = this.entry.strokes[idx];
    var res = root.Recognizer.judge(pts, tpl);
    if (res.ok) {
      this.accepted.push(pts);
      this._spawnSparks(pts);
      this.mistakesOnCurrent = 0;
      this.strokeIndex++;
      var done = this.strokeIndex >= total;
      this.onStroke({ ok: true, index: idx, total: total, done: done, result: res });
      if (done) {
        this.completedAt = performance.now();
        if (this.totalMistakes === 0) this.container.classList.add('perfect');
        var self = this;
        setTimeout(function () { self.onComplete({ mistakes: self.totalMistakes }); }, 60);
      }
    } else {
      this.rejected.push({ pts: pts, t0: performance.now() });
      this.mistakesOnCurrent++;
      this.totalMistakes++;
      this.startGlowUntil = performance.now() + 1600;
      this.onStroke({ ok: false, index: idx, total: total, result: res });
    }
  };

  InputPad.prototype._spawnSparks = function (pts) {
    var n = Math.min(26, 8 + Math.floor(G.pathLength(pts) * 30));
    var rs = G.resample(pts, n);
    for (var i = 0; i < rs.length; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.05 + Math.random() * 0.25;
      this.sparks.push({ x: rs[i][0], y: rs[i][1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.1, life: 0, max: 0.45 + Math.random() * 0.35, r: 0.006 + Math.random() * 0.01, hue: Math.random() < 0.5 ? this.color : '#ffffff' });
    }
  };

  /* ---------- 描画 ---------- */
  InputPad.prototype._loop = function (ts) {
    if (!this.running) return;
    var dt = this._last ? Math.min(0.05, (ts - this._last) / 1000) : 0.016;
    this._last = ts;
    this._update(dt);
    this._draw(ts / 1000);
    requestAnimationFrame(this._loop);
  };
  InputPad.prototype._update = function (dt) {
    var now = performance.now();
    this.rejected = this.rejected.filter(function (r) { return now - r.t0 < 750; });
    for (var i = this.sparks.length - 1; i >= 0; i--) {
      var s = this.sparks[i];
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 0.25 * dt; s.vx *= 0.96; s.vy *= 0.96;
      if (s.life > s.max) this.sparks.splice(i, 1);
    }
  };

  InputPad.prototype._draw = function (time) {
    var ctx = this.ctx, S = this.size, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    this._drawMat(ctx, S);
    var w = S * 0.058;
    if (this.overlayDraw) this.overlayDraw(ctx, S, w);
    if (!this.entry || !this.entry.strokes) {
      if (this.current && this.current.length) this._drawInk(ctx, this.current, S, w, 1, 0, false, true);
      return;
    }
    var strokes = this.entry.strokes;
    var idx = this.strokeIndex;
    var lvl = this.completedAt ? 4 : this.effectiveHint();
    var now = performance.now();

    // Level 1: 全画を薄く + 番号
    if (lvl <= 1 && !this.completedAt) {
      for (var i = idx; i < strokes.length; i++) this._drawPath(ctx, strokes[i].path, S, 'rgba(180,190,230,0.22)', w * 0.9);
      for (var j = idx; j < strokes.length; j++) this._drawNumber(ctx, strokes[j], j + 1, S, j === idx);
    }
    // 次の画のガイド（Level 1/2）
    if (lvl <= 2 && !this.completedAt && strokes[idx]) {
      this._drawPath(ctx, strokes[idx].path, S, this._rgba(this.color, lvl === 1 ? 0.5 : 0.32), w);
      if (lvl === 1) this._drawMovingGuide(ctx, strokes[idx], S, time);
    }
    // 始点（Level 3 以下）+ ミス後の始点グロー
    if (!this.completedAt && strokes[idx]) {
      var glow = now < this.startGlowUntil;
      if (lvl <= 3 || glow) this._drawStartPoint(ctx, strokes[idx].start, S, time, glow);
    }
    // 受理済みの画
    var pulse = this.completedAt ? 0.5 + 0.5 * Math.sin((now - this.completedAt) / 90) : 0;
    for (var a = 0; a < this.accepted.length; a++) this._drawInk(ctx, this.accepted[a], S, w, 1, pulse);
    // 不正解の画（跳ねて薄くなって消える）
    for (var r = 0; r < this.rejected.length; r++) {
      var rj = this.rejected[r];
      var age = (now - rj.t0) / 750;
      var bounce = Math.sin(Math.min(1, age * 3) * Math.PI) * S * 0.035;
      ctx.save(); ctx.translate(0, -bounce);
      this._drawInk(ctx, rj.pts, S, w, 1 - age, 0, true);
      ctx.restore();
    }
    // 書いている途中の線
    if (this.current && this.current.length) this._drawInk(ctx, this.current, S, w, 1, 0, false, true);
    // スパーク
    for (var s = 0; s < this.sparks.length; s++) {
      var sp = this.sparks[s];
      var k = 1 - sp.life / sp.max;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = sp.hue;
      ctx.beginPath(); ctx.arc(sp.x * S, sp.y * S, sp.r * S * (0.6 + k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  InputPad.prototype._drawMat = function (ctx, S) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.04); ctx.lineTo(S / 2, S * 0.96); ctx.moveTo(S * 0.04, S / 2); ctx.lineTo(S * 0.96, S / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
    var m = S * 0.06, L = S * 0.08;
    [[m, m, 1, 1], [S - m, m, -1, 1], [m, S - m, 1, -1], [S - m, S - m, -1, -1]].forEach(function (c) {
      ctx.beginPath(); ctx.moveTo(c[0], c[1] + L * c[3]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + L * c[2], c[1]); ctx.stroke();
    });
    ctx.restore();
  };

  InputPad.prototype._drawPath = function (ctx, path, S, style, width) {
    if (!path || path.length < 2) return;
    ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(path[0][0] * S, path[0][1] * S);
    for (var i = 1; i < path.length; i++) ctx.lineTo(path[i][0] * S, path[i][1] * S);
    ctx.stroke(); ctx.restore();
  };

  InputPad.prototype._drawInk = function (ctx, pts, S, w, alpha, pulse, rejected, live) {
    if (!pts || pts.length === 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var glowColor = rejected ? 'rgba(255,255,255,0.5)' : this.color;
    // 外側グロー
    ctx.shadowColor = glowColor; ctx.shadowBlur = w * (1.2 + pulse * 1.5);
    ctx.strokeStyle = rejected ? 'rgba(220,225,255,0.8)' : (live ? 'rgba(255,255,255,0.95)' : '#fff8e6');
    ctx.lineWidth = w;
    this._path(ctx, pts, S);
    ctx.stroke();
    if (!rejected) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = this._rgba(this.color, live ? 0.35 : 0.55);
      ctx.lineWidth = w * 0.45;
      this._path(ctx, pts, S); ctx.stroke();
    }
    if (pts.length === 1) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pts[0][0] * S, pts[0][1] * S, w / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };
  InputPad.prototype._path = function (ctx, pts, S) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
    if (pts.length < 3) { for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * S, pts[i][1] * S); return; }
    for (var j = 1; j < pts.length - 1; j++) {
      var mx = (pts[j][0] + pts[j + 1][0]) / 2 * S, my = (pts[j][1] + pts[j + 1][1]) / 2 * S;
      ctx.quadraticCurveTo(pts[j][0] * S, pts[j][1] * S, mx, my);
    }
    var l = pts[pts.length - 1]; ctx.lineTo(l[0] * S, l[1] * S);
  };

  InputPad.prototype._drawNumber = function (ctx, stroke, n, S, isNext) {
    var p = stroke.start;
    var d = stroke.direction || [1, 0];
    // 進行方向の逆側に少しずらして表示
    var x = (p[0] - d[0] * 0.045) * S, y = (p[1] - d[1] * 0.045) * S;
    var r = S * 0.032;
    ctx.save();
    ctx.fillStyle = isNext ? this._rgba(this.color, 0.9) : 'rgba(120,130,180,0.6)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isNext ? '#0b1026' : '#fff';
    ctx.font = 'bold ' + (S * 0.04) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + S * 0.002);
    ctx.restore();
  };

  InputPad.prototype._drawMovingGuide = function (ctx, stroke, S, time) {
    var path = stroke.path; if (!path || path.length < 2) return;
    var period = Math.max(0.9, Math.min(2.2, (stroke.length || 0.5) * 2.2));
    var k = (time % period) / period;
    var n = path.length - 1;
    var f = k * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    var x = (path[i][0] + (path[i + 1][0] - path[i][0]) * t) * S;
    var y = (path[i][1] + (path[i + 1][1] - path[i][1]) * t) * S;
    ctx.save();
    // 通過済み部分を明るく
    ctx.strokeStyle = this._rgba(this.color, 0.85); ctx.lineWidth = S * 0.02; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(path[0][0] * S, path[0][1] * S);
    for (var j = 1; j <= i; j++) ctx.lineTo(path[j][0] * S, path[j][1] * S);
    ctx.lineTo(x, y); ctx.stroke();
    ctx.shadowColor = '#fff'; ctx.shadowBlur = S * 0.03;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, S * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  InputPad.prototype._drawStartPoint = function (ctx, p, S, time, strong) {
    var pulse = 0.5 + 0.5 * Math.sin(time * 6);
    var r = S * (0.03 + pulse * 0.012) * (strong ? 1.4 : 1);
    ctx.save();
    ctx.shadowColor = strong ? '#fff' : this.color; ctx.shadowBlur = S * (strong ? 0.05 : 0.02);
    ctx.fillStyle = this._rgba(strong ? '#ffffff' : this.color, strong ? 0.95 : 0.7);
    ctx.beginPath(); ctx.arc(p[0] * S, p[1] * S, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this._rgba(this.color, 0.6 * (1 - pulse)); ctx.lineWidth = S * 0.006;
    ctx.beginPath(); ctx.arc(p[0] * S, p[1] * S, r * (1.5 + pulse * 1.2), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  InputPad.prototype._rgba = function (hex, a) {
    if (hex[0] !== '#') return hex;
    var h = hex.length === 4 ? hex.replace(/./g, function (c, i) { return i ? c + c : c; }) : hex;
    var n = parseInt(h.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  root.InputPad = InputPad;
})(window);
