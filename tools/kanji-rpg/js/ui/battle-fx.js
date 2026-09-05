/* battle-fx.js — バトル画面（上半分）の演出
 * 敵・プレイヤー・魔法・召喚をカテゴリ別の演出システムで描く（画像素材なし / Canvas 図形）。
 *
 *  strokeFx(category, ability, progress) : 一画成功ごとの演出（魔力チャージが育つ）
 *  cast(category, ability, kanji)        : 漢字完成時の魔法発動。Promise はヒット時に resolve
 *  enemyHit(dmg, crit) / enemyDefeat() / playerHit(dmg)
 */
(function (root) {
  'use strict';

  var STYLE = {
    fire:     { color: '#ff6b2b', color2: '#ffd23f', shape: 'circle', gravity: -0.25 },
    water:    { color: '#3fb8ff', color2: '#d8f3ff', shape: 'drop', gravity: 0.35 },
    nature:   { color: '#5ed36a', color2: '#c8ff9a', shape: 'leaf', gravity: 0.08 },
    weather:  { color: '#b9d9ff', color2: '#ffffff', shape: 'spark', gravity: 0 },
    animal:   { color: '#ffb347', color2: '#fff1c4', shape: 'feather', gravity: 0.08 },
    movement: { color: '#7ef9ff', color2: '#ffffff', shape: 'spark', gravity: 0 },
    weapon:   { color: '#ffd700', color2: '#ffffff', shape: 'spark', gravity: 0 },
    support:  { color: '#d59bff', color2: '#ffffff', shape: 'circle', gravity: -0.15 },
    object:   { color: '#c9a27a', color2: '#7a5a3a', shape: 'rock', gravity: 0.45 },
    location: { color: '#a3c47c', color2: '#e0d3a0', shape: 'rock', gravity: 0.25 }
  };
  var ABILITY_STYLE = {
    snow: { color: '#ffffff', color2: '#bfe9ff', shape: 'flake' }, lightning: { color: '#ffe94a', color2: '#ffffff' },
    sun: { color: '#ffd23f', color2: '#fff7c4', shape: 'circle' }, sunny: { color: '#ffd23f', color2: '#fff7c4', shape: 'circle' },
    wind: { color: '#a6f0d8', color2: '#ffffff', shape: 'leaf' }, cloud: { color: '#dfe7f5', color2: '#ffffff', shape: 'circle' },
    rain: { color: '#6fa8ff', color2: '#d8f3ff', shape: 'drop', gravity: 0.5 }, star: { color: '#ffe680', color2: '#ffffff', shape: 'star' },
    moon: { color: '#f5f0c0', color2: '#ffffff', shape: 'circle' }, light: { color: '#ffffff', color2: '#fff5b0' }, beam: { color: '#fff5b0' },
    sea: { color: '#2f8fdc' }, stream: { color: '#62d0ff' }, bug: { color: '#9be05a', shape: 'circle' }, fish: { color: '#6fc8ff', shape: 'drop' },
    power: { color: '#ff5b6e', color2: '#ffd23f' }, eye: { color: '#7ef9ff' }, stop: { color: '#ff5b6e', color2: '#ffffff' },
    rock: { color: '#8a7a6a', color2: '#4a3a2a' }, mountain: { color: '#6a8a5a' }, road: { color: '#ffd75e', shape: 'spark' }
  };
  function styleOf(category, ability) { return Object.assign({}, STYLE[category] || STYLE.object, ABILITY_STYLE[ability] || {}); }

  function BattleFX(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.w = 100; this.h = 100; this.dpr = 1;
    this.theme = root.STAGE_THEMES.tutorial;
    this.enemy = null;
    this.effects = []; this.particles = []; this.numbers = []; this.ambient = [];
    this.shake = 0; this.flashA = 0; this.flashColor = '#fff';
    this.player = { scale: 1, dashX: 0, aura: null, auraT: 0, allyT: 0, hitT: 0 };
    this.charge = 0; this.chargeStyle = STYLE.support;
    this.env = []; // 山・木など、しばらく残る背景物
    this.running = true; this.time = 0;
    var self = this;
    this._ro = new ResizeObserver(function () { self.resize(); });
    this._ro.observe(canvas.parentNode);
    this.resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  BattleFX.prototype.resize = function () {
    var r = this.canvas.parentNode.getBoundingClientRect();
    this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.ambient = [];
    for (var i = 0; i < 40; i++) this.ambient.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.5, s: Math.random() * 0.02 + 0.005, p: Math.random() * 6 });
  };
  BattleFX.prototype.destroy = function () { this.running = false; this._ro.disconnect(); };
  BattleFX.prototype.setTheme = function (name) { this.theme = root.STAGE_THEMES[name] || root.STAGE_THEMES.tutorial; this.env = []; };

  /* ---------- 位置 ---------- */
  BattleFX.prototype.playerPos = function () { return { x: this.w * 0.17 + this.player.dashX, y: this.h * 0.74 }; };
  BattleFX.prototype.staffTip = function () { var p = this.playerPos(); var u = this.unit(); return { x: p.x + u * 0.62, y: p.y - u * 1.05 }; };
  BattleFX.prototype.enemyPos = function () { return { x: this.w * 0.74, y: this.h * 0.58 }; };
  BattleFX.prototype.unit = function () { return Math.min(this.w, this.h) * 0.16; };

  /* ---------- 敵 ---------- */
  BattleFX.prototype.setEnemy = function (def) {
    if (!def) { this.enemy = null; return; }
    this.enemy = Object.assign({ maxHp: def.hp, state: 'enter', t: 0, hitT: 0, kb: 0, scale: def.boss ? 1.35 : 1, alpha: 1, shrink: 1, frozen: 0 }, def);
  };
  BattleFX.prototype.enemyHit = function (dmg, crit) {
    var e = this.enemyPos();
    if (this.enemy) { this.enemy.hitT = 0.25; this.enemy.kb = 1; }
    this.shakeFx(crit ? 14 : 8);
    this.numbers.push({ x: e.x, y: e.y - this.unit() * 0.9, text: String(dmg), t: 0, dur: 1.0, color: crit ? '#ffd75e' : '#ffffff', big: !!crit });
    root.Events.emit('enemy:hit', { damage: dmg, enemy: this.enemy });
  };
  BattleFX.prototype.enemyDefeat = function () {
    var self = this;
    return new Promise(function (res) {
      if (!self.enemy) return res();
      self.enemy.state = 'dead'; self.enemy.t = 0;
      var e = self.enemyPos();
      self.burst(e.x, e.y, styleOf('weapon'), 40, 1.6);
      root.Events.emit('enemy:defeat', { enemy: self.enemy });
      setTimeout(function () { self.enemy = null; res(); }, 900);
    });
  };
  BattleFX.prototype.enemyAttack = function (dmg) {
    var self = this;
    return new Promise(function (res) {
      if (!self.enemy) return res();
      var e = self.enemyPos(), p = self.playerPos();
      var col = self.enemy.color;
      self.projectile(e.x - self.unit() * 0.6, e.y, p.x, p.y - self.unit() * 0.6, { color: col, color2: '#fff', shape: 'circle' }, 0.45, self.unit() * 0.22);
      setTimeout(function () {
        self.player.hitT = 0.4; self.shakeFx(6);
        self.numbers.push({ x: p.x, y: p.y - self.unit() * 1.4, text: String(dmg), t: 0, dur: 1.0, color: '#ff8e9e' });
        self.burst(p.x, p.y - self.unit() * 0.6, { color: col, color2: '#fff', shape: 'spark' }, 14, 0.8);
        root.Events.emit('player:hit', { damage: dmg });
        res();
      }, 450);
    });
  };

  /* ---------- 汎用エフェクト ---------- */
  BattleFX.prototype.fx = function (dur, draw, onEnd) { this.effects.push({ t: 0, dur: dur, draw: draw, onEnd: onEnd }); };
  BattleFX.prototype.shakeFx = function (amp) { this.shake = Math.max(this.shake, amp); };
  BattleFX.prototype.flash = function (color, a) { this.flashColor = color || '#fff'; this.flashA = Math.max(this.flashA, a || 0.5); };
  BattleFX.prototype.burst = function (x, y, st, n, power) {
    power = power || 1; var u = this.unit();
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random() * 1.4) * u * 4 * power;
      this.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.5 + Math.random() * 0.6, r: u * (0.05 + Math.random() * 0.1) * power, color: Math.random() < 0.6 ? st.color : st.color2, shape: st.shape || 'circle', g: (st.gravity || 0) * u * 30, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
  };
  BattleFX.prototype.emit = function (x, y, st, n, opts) {
    opts = opts || {}; var u = this.unit();
    for (var i = 0; i < n; i++) {
      var a = (opts.angle !== undefined ? opts.angle : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (opts.spread || 6.3);
      var sp = (opts.speed || 1) * u * (0.8 + Math.random() * 1.6);
      this.particles.push({ x: x + (Math.random() - 0.5) * (opts.jitter || 0), y: y + (Math.random() - 0.5) * (opts.jitter || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: (opts.life || 0.8) * (0.6 + Math.random() * 0.8), r: u * (opts.size || 0.08) * (0.5 + Math.random()), color: Math.random() < 0.6 ? st.color : st.color2, shape: st.shape || 'circle', g: (st.gravity || 0) * u * 30, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6 });
    }
  };
  BattleFX.prototype.projectile = function (x0, y0, x1, y1, st, dur, size, arc) {
    var self = this;
    this.fx(dur, function (ctx, k) {
      var x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - (arc || 0) * Math.sin(k * Math.PI);
      self.emit(x, y, st, 2, { speed: 0.3, life: 0.4, size: size / self.unit() * 0.4 });
      ctx.save(); ctx.shadowColor = st.color; ctx.shadowBlur = size;
      var g = ctx.createRadialGradient(x, y, 0, x, y, size); g.addColorStop(0, '#fff'); g.addColorStop(0.4, st.color2 || '#fff'); g.addColorStop(1, st.color);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
  };

  /* ---------- 一画ごとの演出 ---------- */
  BattleFX.prototype.strokeFx = function (category, ability, progress) {
    var st = styleOf(category, ability);
    this.chargeStyle = st; this.charge = progress;
    var tip = this.staffTip();
    var n = Math.round(4 + progress * 16);
    this.emit(tip.x, tip.y, st, n, { speed: 0.6 + progress, life: 0.7, size: 0.07 + progress * 0.08, angle: -Math.PI / 2, spread: 2.2 });
    var self = this, u = this.unit(), e = this.enemyPos();
    // カテゴリ別のちょい足し（葉が舞う / 羽が出る / 雫が落ちる …）
    if (category === 'weather' || category === 'nature') {
      for (var i = 0; i < 3 + progress * 6; i++) this.particles.push({ x: Math.random() * this.w * 0.5, y: Math.random() * this.h * 0.4, vx: u * (1 + progress * 3), vy: u * 0.3, life: 0, max: 1.0, r: u * 0.08, color: st.color, shape: st.shape, g: 0, rot: 0, vr: 5 });
    } else if (category === 'animal') {
      var p = this.playerPos();
      for (var j = 0; j < 2 + progress * 4; j++) this.particles.push({ x: p.x + u * 0.8 + Math.random() * u, y: p.y - u * 0.5 - Math.random() * u, vx: (Math.random() - 0.5) * u, vy: -u * 0.8, life: 0, max: 1.2, r: u * 0.12, color: st.color, shape: 'feather', g: u * 6, rot: Math.random() * 6, vr: 3 });
    } else if (category === 'weapon' || category === 'movement') {
      this.fx(0.25, function (ctx, k) { ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = st.color; ctx.lineWidth = 3; for (var q = 0; q < 3; q++) { var y = tip.y + (q - 1) * u * 0.3; ctx.beginPath(); ctx.moveTo(tip.x + k * u * 3, y); ctx.lineTo(tip.x + k * u * 3 + u * (0.6 + progress), y); ctx.stroke(); } ctx.restore(); });
    } else if (category === 'support') {
      this.fx(0.5, function (ctx, k) { var p2 = self.playerPos(); ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = st.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(p2.x, p2.y, u * (0.6 + k * 1.2), u * (0.2 + k * 0.4), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); });
    } else if (category === 'water') {
      for (var d = 0; d < 3 + progress * 5; d++) this.particles.push({ x: tip.x + (Math.random() - 0.5) * u * 2, y: tip.y - u * 0.5, vx: 0, vy: u, life: 0, max: 1.0, r: u * 0.07, color: st.color, shape: 'drop', g: u * 12, rot: 0, vr: 0 });
    } else if (category === 'fire') {
      if (progress > 0.5) this.emit(e.x, e.y + u * 0.6, st, 3, { speed: 0.5, life: 0.5, size: 0.06, angle: -Math.PI / 2, spread: 1 });
    }
  };

  /* ---------- 漢字完成: 魔法発動 ---------- */
  BattleFX.prototype.cast = function (category, ability, kanji) {
    var self = this, st = styleOf(category, ability), u = this.unit();
    var e = this.enemyPos(), p = this.playerPos(), tip = this.staffTip();
    var impact = 500;
    this.charge = 0;
    root.Events.emit('magic:cast', { kanji: kanji, category: category, ability: ability });
    var tx = this.enemy ? e.x : this.w * 0.72, ty = this.enemy ? e.y : this.h * 0.5;

    function hit(power, extraColor) { self.burst(tx, ty, st, Math.round(26 * power), power); self.flash(extraColor || st.color, 0.25 * power); }

    switch (ability) {
      /* ---- fire ---- */
      case 'fire': default:
        if (category === 'fire' || ability === 'fire') {
          this.projectile(tip.x, tip.y, tx, ty, st, 0.45, u * 0.35); impact = 460;
          setTimeout(function () { hit(1.6, '#ffb347'); self.emit(tx, ty, st, 30, { speed: 1.2, life: 0.9, size: 0.14, angle: -Math.PI / 2, spread: 2 }); }, impact);
          break;
        }
        // 汎用: 光球
        this.projectile(tip.x, tip.y, tx, ty, st, 0.45, u * 0.3); impact = 460; setTimeout(function () { hit(1.2); }, impact); break;

      /* ---- water ---- */
      case 'water': case 'stream': case 'sea': {
        var hgt = ability === 'sea' ? 1.4 : (ability === 'stream' ? 0.6 : 0.9);
        impact = 620;
        this.fx(0.75, function (ctx, k) {
          var x = self.w * (-0.2 + k * 1.1);
          ctx.save(); ctx.globalAlpha = 0.85 * (k < 0.85 ? 1 : (1 - k) / 0.15);
          var g = ctx.createLinearGradient(0, self.h * 0.75 - u * hgt * 1.6, 0, self.h * 0.8); g.addColorStop(0, st.color2); g.addColorStop(1, st.color);
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - u * 3, self.h * 0.82);
          for (var i = 0; i <= 12; i++) { var xx = x - u * 3 + i * u * 0.5; var yy = self.h * 0.78 - u * hgt * (0.5 + 0.5 * Math.sin(i * 0.9 + k * 12)) * Math.min(1, k * 3); ctx.lineTo(xx, yy); }
          ctx.lineTo(x + u * 3, self.h * 0.82); ctx.closePath(); ctx.fill();
          if (ability === 'stream') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; for (var l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(x - u * 2, self.h * 0.7 - l * u * 0.2); ctx.lineTo(x + u * 2, self.h * 0.7 - l * u * 0.2); ctx.stroke(); } }
          ctx.restore();
          self.emit(x + u, self.h * 0.72, st, 2, { speed: 0.6, life: 0.5, size: 0.06, angle: -Math.PI / 2, spread: 1.5 });
        });
        setTimeout(function () { hit(hgt); }, impact); break;
      }

      /* ---- nature ---- */
      case 'tree': case 'bamboo': {
        impact = 520; var cnt = ability === 'bamboo' ? 3 : 1;
        this.fx(1.6, function (ctx, k) {
          var grow = Math.min(1, k * 2.2), fade = k > 0.75 ? (1 - k) / 0.25 : 1;
          ctx.save(); ctx.globalAlpha = fade;
          for (var i = 0; i < cnt; i++) {
            var x = tx + (i - (cnt - 1) / 2) * u * 0.7, base = self.h * 0.84, hh = u * (ability === 'bamboo' ? 3.2 : 2.6) * grow;
            ctx.fillStyle = ability === 'bamboo' ? '#7fc95a' : '#7a4a2a'; ctx.fillRect(x - u * 0.12, base - hh, u * 0.24, hh);
            if (ability === 'bamboo') { ctx.fillStyle = '#3a7a2a'; for (var s = 1; s < 5; s++) ctx.fillRect(x - u * 0.14, base - hh * s / 5, u * 0.28, 4); ctx.beginPath(); ctx.moveTo(x - u * 0.12, base - hh); ctx.lineTo(x + u * 0.12, base - hh); ctx.lineTo(x, base - hh - u * 0.5); ctx.fill(); }
            else if (grow > 0.5) { ctx.fillStyle = st.color; var lr = u * 1.1 * (grow - 0.5) * 2; ctx.beginPath(); ctx.arc(x, base - hh, lr, 0, Math.PI * 2); ctx.arc(x - lr * 0.7, base - hh + lr * 0.4, lr * 0.7, 0, Math.PI * 2); ctx.arc(x + lr * 0.7, base - hh + lr * 0.4, lr * 0.7, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.restore();
        });
        setTimeout(function () { hit(1.2); }, impact); break;
      }

      /* ---- weather ---- */
      case 'wind': {
        impact = 480;
        this.fx(0.8, function (ctx, k) {
          ctx.save(); ctx.strokeStyle = st.color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.globalAlpha = k < 0.7 ? 0.9 : (1 - k) / 0.3;
          for (var i = 0; i < 14; i++) { var y = self.h * (0.15 + (i * 0.061) % 0.65); var x = ((k * 1.6 + i * 0.13) % 1.3 - 0.15) * self.w; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + u * 1.2, y - u * 0.2, x + u * 2.4, y); ctx.stroke(); }
          ctx.restore();
          self.emit(self.w * 0.1, self.h * (0.2 + Math.random() * 0.5), st, 2, { speed: 3, life: 0.6, size: 0.08, angle: 0, spread: 0.4 });
        });
        setTimeout(function () { hit(1.2, '#ffffff'); self.shakeFx(10); }, impact); break;
      }
      case 'snow': case 'rain': case 'star': {
        impact = 700; var cnt2 = ability === 'star' ? 7 : 40;
        this.fx(0.9, function (ctx, k) {
          for (var i = 0; i < (ability === 'star' ? 1 : 3); i++) self.particles.push({ x: tx + (Math.random() - 0.5) * u * 3.5, y: -u * 0.3, vx: ability === 'snow' ? (Math.random() - 0.5) * u : 0, vy: u * (ability === 'rain' ? 14 : ability === 'star' ? 8 : 4), life: 0, max: 0.9, r: u * (ability === 'star' ? 0.18 : 0.08), color: Math.random() < 0.7 ? st.color : st.color2, shape: st.shape, g: 0, rot: Math.random() * 6, vr: 4 });
        });
        setTimeout(function () { hit(1.2, ability === 'snow' ? '#bfe9ff' : st.color); if (self.enemy && ability === 'snow') self.enemy.frozen = 2.5; }, impact); break;
      }
      case 'cloud': {
        impact = 650;
        this.fx(1.8, function (ctx, k) {
          var x = self.w * (0.1 + Math.min(1, k * 1.5) * 0.62), y = self.h * 0.22; var a = k > 0.8 ? (1 - k) / 0.2 : 1;
          ctx.save(); ctx.globalAlpha = 0.95 * a; ctx.fillStyle = st.color;
          [[0, 0, 1], [-1, 0.3, 0.7], [1, 0.3, 0.75], [0.5, -0.4, 0.6], [-0.5, -0.3, 0.55]].forEach(function (c) { ctx.beginPath(); ctx.arc(x + c[0] * u, y + c[1] * u, u * c[2], 0, Math.PI * 2); ctx.fill(); });
          if (k > 0.45) { ctx.globalAlpha = 0.4 * a; ctx.fillStyle = '#0a1030'; ctx.beginPath(); ctx.ellipse(tx, self.h * 0.84, u * 1.6, u * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        });
        setTimeout(function () { hit(1.0, '#dfe7f5'); }, impact); break;
      }
      case 'sunny': case 'sun': case 'moon': {
        impact = 550;
        this.fx(1.2, function (ctx, k) {
          var cx = self.w * 0.55, cy = self.h * 0.08, a = k > 0.7 ? (1 - k) / 0.3 : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.rotate(k * 0.8);
          ctx.fillStyle = st.color; ctx.shadowColor = st.color; ctx.shadowBlur = u;
          if (ability === 'moon') { ctx.beginPath(); ctx.arc(0, 0, u * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(u * 0.4, -u * 0.2, u * 0.75, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.beginPath(); ctx.arc(0, 0, u * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.35 * a; for (var i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(-u * 0.3, u); ctx.lineTo(u * 0.3, u); ctx.lineTo(0, u * 5 * Math.min(1, k * 2)); ctx.fill(); } }
          ctx.restore();
        });
        setTimeout(function () { self.flash(st.color, 0.6); hit(1.1, st.color); }, impact); break;
      }
      case 'lightning': {
        impact = 380;
        setTimeout(function () {
          self.flash('#ffffff', 0.8); self.shakeFx(14);
          self.fx(0.4, function (ctx, k) {
            ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.shadowColor = st.color; ctx.shadowBlur = 24; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(tx + u * 0.5, 0); var y = 0, x = tx + u * 0.5; while (y < ty - u * 0.3) { y += u * 0.5; x += (Math.random() - 0.5) * u * 0.8; ctx.lineTo(x, y); } ctx.lineTo(tx, ty); ctx.stroke();
            ctx.strokeStyle = st.color; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
          });
          hit(1.6, '#ffe94a');
        }, impact); break;
      }

      /* ---- animal ---- */
      case 'dog': case 'cow': case 'horse': case 'bird': case 'fish': case 'bug': {
        impact = 620;
        this.fx(0.7, function (ctx, k) {
          var x = p.x + u + (tx - u * 1.2 - p.x - u) * Math.min(1, k * 1.15);
          var y = ability === 'bird' ? p.y - u * 2 + Math.sin(k * 10) * u * 0.3 : (ability === 'fish' ? p.y - u * 0.3 + Math.sin(k * 8) * u * 0.4 : p.y - u * 0.4 - Math.abs(Math.sin(k * 14)) * u * 0.35);
          ctx.save(); ctx.globalAlpha = k > 0.9 ? (1 - k) * 10 : 1; ctx.fillStyle = st.color; ctx.shadowColor = st.color2; ctx.shadowBlur = 10;
          self._drawCreature(ctx, ability, x, y, u, k);
          ctx.restore();
          self.emit(x - u * 0.6, y + u * 0.3, { color: '#ffffff', color2: st.color, shape: 'circle' }, 1, { speed: 0.4, life: 0.4, size: 0.06 });
        });
        setTimeout(function () { hit(1.4); self.shakeFx(10); }, impact); break;
      }

      /* ---- movement ---- */
      case 'dash': case 'run': case 'walk': {
        impact = 380; var far = ability === 'walk' ? u * 1.5 : (tx - p.x - u * 1.6);
        this.fx(0.75, function (ctx, k) {
          var kk = k < 0.5 ? k * 2 : (1 - k) * 2; self.player.dashX = far * Math.sin(kk * Math.PI / 2);
          ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = st.color; ctx.lineWidth = 3;
          for (var i = 0; i < 6; i++) { var y = p.y - u * 1.5 + i * u * 0.35; var x = p.x + self.player.dashX - u * (0.8 + Math.random() * 1.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - u * (0.6 + Math.random()), y); ctx.stroke(); }
          ctx.restore();
          if (ability === 'walk' && Math.random() < 0.3) self.emit(p.x + self.player.dashX, p.y, { color: '#c9b79a', color2: '#fff', shape: 'circle' }, 2, { speed: 0.3, life: 0.5, size: 0.08, angle: -Math.PI / 2, spread: 1.5 });
        }, function () { self.player.dashX = 0; });
        setTimeout(function () { hit(ability === 'walk' ? 0.8 : 1.3); }, impact); break;
      }
      case 'stop': {
        impact = 420;
        this.fx(1.3, function (ctx, k) {
          ctx.save(); var a = k > 0.7 ? (1 - k) / 0.3 : 1; ctx.globalAlpha = a; ctx.translate(tx, ty);
          ctx.strokeStyle = st.color; ctx.lineWidth = 6; ctx.shadowColor = st.color; ctx.shadowBlur = 20;
          ctx.beginPath(); ctx.arc(0, 0, u * 1.8 * Math.min(1, k * 2.5), 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = 'bold ' + u * 1.6 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('止', 0, 0);
          ctx.restore();
        });
        setTimeout(function () { hit(1.1, '#ff5b6e'); if (self.enemy) self.enemy.frozen = 2.5; }, impact); break;
      }

      /* ---- weapon ---- */
      case 'beam': case 'light': {
        var beams = kanji === '二' ? 2 : kanji === '三' ? 3 : 1; var wide = ability === 'light';
        impact = 300;
        this.fx(0.55, function (ctx, k) {
          ctx.save(); ctx.globalAlpha = k < 0.6 ? 1 : (1 - k) / 0.4; ctx.strokeStyle = '#fff'; ctx.shadowColor = st.color; ctx.shadowBlur = 24; ctx.lineCap = 'round';
          for (var i = 0; i < beams; i++) { var oy = (i - (beams - 1) / 2) * u * 0.55; ctx.lineWidth = wide ? u * 0.9 : u * 0.22; ctx.beginPath(); ctx.moveTo(tip.x, tip.y + oy); ctx.lineTo(tip.x + (tx - tip.x) * Math.min(1, k * 2.5), ty + oy * 0.5 + (tip.y - ty) * (1 - Math.min(1, k * 2.5))); ctx.stroke(); }
          ctx.restore();
        });
        setTimeout(function () { hit(0.9 + beams * 0.3 + (wide ? 0.6 : 0), '#fff'); }, impact); break;
      }
      case 'sword': {
        impact = 330;
        this.fx(0.5, function (ctx, k) {
          ctx.save(); ctx.globalAlpha = k < 0.6 ? 1 : (1 - k) / 0.4; ctx.translate(tx, ty); ctx.strokeStyle = '#fff'; ctx.shadowColor = st.color; ctx.shadowBlur = 20; ctx.lineWidth = u * 0.25; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(0, 0, u * 1.6, -2.4, -2.4 + Math.min(1, k * 2) * 3.2); ctx.stroke(); ctx.restore();
        });
        setTimeout(function () { hit(1.5, '#fff'); }, impact); break;
      }
      case 'arrow': case 'bow': {
        impact = ability === 'bow' ? 520 : 420;
        this.fx(0.6, function (ctx, k) {
          ctx.save(); ctx.strokeStyle = st.color; ctx.lineWidth = 5; ctx.shadowColor = st.color; ctx.shadowBlur = 12; ctx.globalAlpha = k < 0.3 ? 1 : Math.max(0, 1 - (k - 0.3) / 0.5);
          ctx.beginPath(); ctx.arc(p.x + u * 0.9, p.y - u * 1.1, u * 0.9, -1.2, 1.2); ctx.stroke(); // 弓
          ctx.beginPath(); ctx.moveTo(p.x + u * 0.9 + Math.cos(-1.2) * u * 0.9, p.y - u * 1.1 + Math.sin(-1.2) * u * 0.9); ctx.lineTo(p.x + u * 0.6 - k * u * 0.2, p.y - u * 1.1); ctx.lineTo(p.x + u * 0.9 + Math.cos(1.2) * u * 0.9, p.y - u * 1.1 + Math.sin(1.2) * u * 0.9); ctx.stroke();
          ctx.restore();
        });
        if (ability === 'arrow') {
          this.fx(0.42, function (ctx, k) {
            var x = tip.x + (tx - tip.x) * k, y = tip.y + (ty - tip.y) * k; var ang = Math.atan2(ty - tip.y, tx - tip.x);
            ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.shadowColor = st.color; ctx.shadowBlur = 14;
            ctx.beginPath(); ctx.moveTo(-u * 1.2, 0); ctx.lineTo(u * 0.3, 0); ctx.moveTo(u * 0.3, 0); ctx.lineTo(0, -u * 0.25); ctx.moveTo(u * 0.3, 0); ctx.lineTo(0, u * 0.25); ctx.stroke(); ctx.restore();
          });
        }
        setTimeout(function () { hit(ability === 'arrow' ? 1.4 : 0.9, '#fff'); }, impact); break;
      }
      case 'hand': {
        impact = 480;
        this.fx(0.9, function (ctx, k) {
          var y = -u * 3 + (ty - u * 0.8 + u * 3) * Math.min(1, k * 2.1); var a = k > 0.75 ? (1 - k) / 0.25 : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = st.color; ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; ctx.translate(tx, y);
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-u * 0.9, -u * 0.5, u * 1.8, u * 1.6, u * 0.3) : ctx.rect(-u * 0.9, -u * 0.5, u * 1.8, u * 1.6); ctx.fill();
          for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-u * 0.85 + i * u * 0.45, -u * 1.5, u * 0.36, u * 1.2, u * 0.15) : ctx.rect(-u * 0.85 + i * u * 0.45, -u * 1.5, u * 0.36, u * 1.2); ctx.fill(); }
          ctx.restore();
        });
        setTimeout(function () { hit(1.5); self.shakeFx(14); }, impact); break;
      }

      /* ---- support ---- */
      case 'power': case 'ally': case 'grow': case 'roar': case 'eye': case 'shrink': {
        impact = 500;
        if (ability === 'power') { this.player.aura = st.color; this.player.auraT = 6; }
        if (ability === 'grow') { this.player.scale = 1.45; setTimeout(function () { self.player.scale = 1; }, 6000); }
        if (ability === 'ally') this.player.allyT = 8;
        if (ability === 'shrink') setTimeout(function () { if (self.enemy) { self.enemy.shrink = 0.65; } }, impact);
        if (ability === 'roar') this.fx(0.8, function (ctx, k) { ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = st.color; ctx.lineWidth = 5; for (var i = 0; i < 3; i++) { var r = u * (0.5 + k * 4 + i * 0.6); ctx.beginPath(); ctx.arc(p.x + u * 0.6, p.y - u * 1.2, r, -0.9, 0.9); ctx.stroke(); } ctx.restore(); });
        if (ability === 'eye') this.fx(1.6, function (ctx, k) { ctx.save(); ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1; ctx.strokeStyle = st.color; ctx.lineWidth = 4; ctx.shadowColor = st.color; ctx.shadowBlur = 12; var r = u * (2.2 - Math.min(1, k * 2) * 1.2); ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(tx - r * 1.3, ty); ctx.lineTo(tx + r * 1.3, ty); ctx.moveTo(tx, ty - r * 1.3); ctx.lineTo(tx, ty + r * 1.3); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + u + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', tx, ty - r - u * 0.2); ctx.restore(); });
        this.emit(p.x, p.y - u * 0.8, st, 30, { speed: 1.2, life: 1.0, size: 0.1, angle: -Math.PI / 2, spread: 1.6 });
        setTimeout(function () { hit(0.8); }, impact); break;
      }

      /* ---- object ---- */
      case 'stone': case 'rock': {
        impact = 600; var big = ability === 'rock';
        this.fx(0.6, function (ctx, k) {
          var x = tip.x + (tx - tip.x) * k, y = tip.y + (ty - tip.y) * k - Math.sin(k * Math.PI) * u * (big ? 3 : 2);
          ctx.save(); ctx.translate(x, y); ctx.rotate(k * 6); ctx.fillStyle = st.color; ctx.strokeStyle = st.color2; ctx.lineWidth = 3;
          var r = u * (big ? 0.7 : 0.4); ctx.beginPath(); for (var i = 0; i < 7; i++) { var a = i / 7 * Math.PI * 2; var rr = r * (0.8 + 0.25 * Math.sin(i * 3)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        });
        setTimeout(function () { hit(big ? 1.7 : 1.2, '#c9a27a'); self.shakeFx(big ? 16 : 9); }, impact); break;
      }

      /* ---- location ---- */
      case 'mountain': case 'field': case 'road': {
        impact = 560;
        if (ability === 'road') this.fx(1.4, function (ctx, k) { ctx.save(); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; ctx.strokeStyle = st.color; ctx.lineWidth = u * 0.5; ctx.shadowColor = st.color; ctx.shadowBlur = 20; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (tx - p.x) * Math.min(1, k * 1.8), self.h * 0.84); ctx.stroke(); ctx.restore(); });
        else this.env.push({ kind: ability, t: 0, dur: 5, x: ability === 'mountain' ? self.w * 0.48 : tx, color: st.color, color2: st.color2 });
        setTimeout(function () { hit(1.2, st.color2); self.shakeFx(12); }, impact); break;
      }
    }
    return new Promise(function (res) { setTimeout(res, impact); });
  };

  BattleFX.prototype._drawCreature = function (ctx, kind, x, y, u, k) {
    ctx.beginPath();
    if (kind === 'bird') {
      var flap = Math.sin(k * 30) * u * 0.5;
      ctx.moveTo(x - u * 1.2, y - flap); ctx.quadraticCurveTo(x - u * 0.5, y + u * 0.2, x, y); ctx.quadraticCurveTo(x + u * 0.5, y + u * 0.2, x + u * 1.2, y - flap);
      ctx.lineTo(x + u * 0.9, y + u * 0.15); ctx.lineTo(x, y + u * 0.35); ctx.lineTo(x - u * 0.9, y + u * 0.15); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x + u * 0.45, y + u * 0.15, u * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'fish') {
      ctx.ellipse(x, y, u * 1.1, u * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - u * 0.9, y); ctx.lineTo(x - u * 1.6, y - u * 0.5); ctx.lineTo(x - u * 1.6, y + u * 0.5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + u * 0.6, y - u * 0.1, u * 0.1, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'bug') {
      for (var i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2 + k * 8; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * u * 0.9, y + Math.sin(a * 1.3) * u * 0.7, u * 0.22, u * 0.14, a, 0, Math.PI * 2); ctx.fill(); }
    } else { // 四足（犬・牛・馬）
      var big = kind === 'cow' || kind === 'horse';
      var bw = u * (big ? 1.4 : 1.0), bh = u * (big ? 0.7 : 0.5);
      ctx.ellipse(x, y, bw, bh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + bw * 0.95, y - bh * 0.7, u * (big ? 0.42 : 0.35), 0, Math.PI * 2); ctx.fill(); // 頭
      if (kind === 'horse') { ctx.beginPath(); ctx.moveTo(x + bw * 0.5, y - bh); ctx.lineTo(x + bw * 0.9, y - bh * 1.9); ctx.lineTo(x + bw * 1.0, y - bh * 0.6); ctx.fill(); }
      if (kind === 'cow') { ctx.beginPath(); ctx.moveTo(x + bw * 0.8, y - bh * 1.3); ctx.lineTo(x + bw * 0.6, y - bh * 2.0); ctx.lineTo(x + bw * 0.9, y - bh * 1.5); ctx.moveTo(x + bw * 1.1, y - bh * 1.3); ctx.lineTo(x + bw * 1.35, y - bh * 2.0); ctx.lineTo(x + bw * 1.05, y - bh * 1.5); ctx.fill(); }
      if (kind === 'dog') { ctx.beginPath(); ctx.moveTo(x + bw * 0.8, y - bh * 1.3); ctx.lineTo(x + bw * 0.7, y - bh * 2); ctx.lineTo(x + bw * 1.0, y - bh * 1.4); ctx.fill(); }
      var legPh = Math.sin(k * 26) * u * 0.3;
      [-0.6, -0.25, 0.3, 0.65].forEach(function (lx, i) { var ph = i % 2 ? legPh : -legPh; ctx.fillRect(x + bw * lx - u * 0.08 + ph * 0.5, y + bh * 0.6, u * 0.16, u * 0.55 + ph * 0.3); });
      ctx.beginPath(); ctx.moveTo(x - bw * 0.95, y - bh * 0.2); ctx.lineTo(x - bw * 1.4, y - bh * 1.2 + legPh); ctx.lineTo(x - bw * 0.85, y + bh * 0.2); ctx.fill(); // 尾
    }
  };

  /* ---------- メインループ ---------- */
  BattleFX.prototype._loop = function (ts) {
    if (!this.running) return;
    var dt = this._last ? Math.min(0.12, (ts - this._last) / 1000) : 0.016; this._last = ts; this.time += dt;
    this._update(dt); this._draw();
    requestAnimationFrame(this._loop);
  };
  BattleFX.prototype._update = function (dt) {
    var i;
    for (i = this.effects.length - 1; i >= 0; i--) { var f = this.effects[i]; f.t += dt; if (f.t >= f.dur) { if (f.onEnd) f.onEnd(); this.effects.splice(i, 1); } }
    for (i = this.particles.length - 1; i >= 0; i--) { var p = this.particles[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.985; p.rot += p.vr * dt; if (p.life > p.max) this.particles.splice(i, 1); }
    for (i = this.numbers.length - 1; i >= 0; i--) { var n = this.numbers[i]; n.t += dt; if (n.t > n.dur) this.numbers.splice(i, 1); }
    for (i = this.env.length - 1; i >= 0; i--) { var e = this.env[i]; e.t += dt; if (e.t > e.dur) this.env.splice(i, 1); }
    if (this.enemy) { var en = this.enemy; en.t += dt; if (en.hitT > 0) en.hitT -= dt; en.kb *= Math.pow(0.02, dt); if (en.frozen > 0) en.frozen -= dt; if (en.shrink < 1) en.shrink = Math.min(1, en.shrink + dt * 0.05); if (en.state === 'enter' && en.t > 0.6) en.state = 'idle'; }
    if (this.player.auraT > 0) { this.player.auraT -= dt; if (this.player.auraT <= 0) this.player.aura = null; }
    if (this.player.allyT > 0) this.player.allyT -= dt;
    if (this.player.hitT > 0) this.player.hitT -= dt;
    this.shake *= Math.pow(0.001, dt); if (this.shake < 0.3) this.shake = 0;
    this.flashA *= Math.pow(0.002, dt); if (this.flashA < 0.01) this.flashA = 0;
    for (i = 0; i < this.ambient.length; i++) { var a = this.ambient[i]; a.y -= a.s * dt; if (a.y < 0) a.y = 1; }
  };

  BattleFX.prototype._draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, u = this.unit(), th = this.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    // 背景
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(-20, -20, w + 40, h + 40);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (var i = 0; i < this.ambient.length; i++) { var a = this.ambient[i]; ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.time * 2 + a.p); ctx.beginPath(); ctx.arc(a.x * w, a.y * h * 0.8, a.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    // 地面
    var gg = ctx.createLinearGradient(0, h * 0.78, 0, h); gg.addColorStop(0, th.ground); gg.addColorStop(1, '#05070f');
    ctx.fillStyle = gg; ctx.fillRect(-20, h * 0.8, w + 40, h * 0.25);
    ctx.fillStyle = th.accent; ctx.globalAlpha = 0.25; ctx.fillRect(-20, h * 0.8, w + 40, 3); ctx.globalAlpha = 1;
    // 環境物（山など）
    for (var e = 0; e < this.env.length; e++) this._drawEnv(ctx, this.env[e], u, h);
    // プレイヤー
    this._drawPlayer(ctx, u);
    // 敵
    if (this.enemy) this._drawEnemy(ctx, u);
    // エフェクト
    for (var f = 0; f < this.effects.length; f++) { var fx = this.effects[f]; ctx.save(); fx.draw(ctx, Math.min(1, fx.t / fx.dur), fx.t); ctx.restore(); }
    // パーティクル
    for (var p = 0; p < this.particles.length; p++) this._drawParticle(ctx, this.particles[p]);
    // ダメージ数値
    for (var n = 0; n < this.numbers.length; n++) {
      var num = this.numbers[n], k = num.t / num.dur;
      ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.font = '900 ' + (u * (num.big ? 0.95 : 0.7) * (1 + (k < 0.2 ? (0.2 - k) * 3 : 0))) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = num.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      var yy = num.y - k * u * 0.9; ctx.strokeText(num.text, num.x, yy); ctx.fillText(num.text, num.x, yy); ctx.restore();
    }
    ctx.restore();
    if (this.flashA > 0) { ctx.globalAlpha = this.flashA; ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  };

  BattleFX.prototype._drawEnv = function (ctx, e, u, h) {
    var k = Math.min(1, e.t * 2), fade = e.t > e.dur - 1 ? e.dur - e.t : 1;
    ctx.save(); ctx.globalAlpha = fade;
    if (e.kind === 'mountain') {
      var hh = u * 3.2 * k; ctx.fillStyle = e.color; ctx.beginPath(); ctx.moveTo(e.x - u * 3, h * 0.82); ctx.lineTo(e.x, h * 0.82 - hh); ctx.lineTo(e.x + u * 3, h * 0.82); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(e.x - u * 0.7, h * 0.82 - hh * 0.75); ctx.lineTo(e.x, h * 0.82 - hh); ctx.lineTo(e.x + u * 0.7, h * 0.82 - hh * 0.75); ctx.lineTo(e.x + u * 0.3, h * 0.82 - hh * 0.7); ctx.lineTo(e.x - u * 0.2, h * 0.82 - hh * 0.72); ctx.fill();
    } else if (e.kind === 'field') {
      ctx.fillStyle = e.color2; for (var i = 0; i < 4; i++) { var hh2 = u * (0.8 + (i % 2) * 0.6) * k; ctx.fillRect(e.x - u * 1.6 + i * u * 0.8, h * 0.82 - hh2, u * 0.7, hh2); }
    }
    ctx.restore();
  };

  BattleFX.prototype._drawPlayer = function (ctx, u) {
    var p = this.playerPos(), s = this.player.scale;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s);
    if (this.player.hitT > 0 && Math.floor(this.player.hitT * 20) % 2) ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, u * 0.05, u * 0.7, u * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    if (this.player.aura) { ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 8); ctx.strokeStyle = this.player.aura; ctx.lineWidth = 4; ctx.shadowColor = this.player.aura; ctx.shadowBlur = 20; ctx.beginPath(); ctx.ellipse(0, -u * 0.8, u * 0.9, u * 1.2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    var bob = Math.sin(this.time * 2.5) * u * 0.03;
    // ローブ
    ctx.fillStyle = '#3b2a7a'; ctx.beginPath(); ctx.moveTo(-u * 0.55, 0); ctx.quadraticCurveTo(-u * 0.5, -u * 1.0 + bob, 0, -u * 1.25 + bob); ctx.quadraticCurveTo(u * 0.5, -u * 1.0 + bob, u * 0.55, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a3fb0'; ctx.beginPath(); ctx.moveTo(-u * 0.2, 0); ctx.lineTo(-u * 0.05, -u * 1.0 + bob); ctx.lineTo(u * 0.15, -u * 1.0 + bob); ctx.lineTo(u * 0.25, 0); ctx.fill();
    // フード・顔
    ctx.fillStyle = '#4a34a0'; ctx.beginPath(); ctx.arc(0, -u * 1.35 + bob, u * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe1c4'; ctx.beginPath(); ctx.arc(u * 0.06, -u * 1.3 + bob, u * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a1a4a'; ctx.beginPath(); ctx.arc(u * 0.16, -u * 1.32 + bob, u * 0.04, 0, Math.PI * 2); ctx.fill();
    // 杖
    ctx.strokeStyle = '#c9a27a'; ctx.lineWidth = u * 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(u * 0.4, 0); ctx.lineTo(u * 0.62, -u * 1.05); ctx.stroke();
    var st = this.chargeStyle, ch = this.charge;
    ctx.save(); ctx.shadowColor = st.color; ctx.shadowBlur = u * (0.2 + ch * 0.8);
    var r = u * (0.12 + ch * 0.28 + Math.sin(this.time * 6) * 0.02 * (1 + ch));
    var gr = ctx.createRadialGradient(u * 0.62, -u * 1.05, 0, u * 0.62, -u * 1.05, r); gr.addColorStop(0, '#fff'); gr.addColorStop(1, st.color);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(u * 0.62, -u * 1.05, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // 仲間
    if (this.player.allyT > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, this.player.allyT); ctx.translate(-u * 1.1, 0); ctx.scale(0.75, 0.75); ctx.fillStyle = '#2a6a5a'; ctx.beginPath(); ctx.moveTo(-u * 0.5, 0); ctx.lineTo(0, -u * 1.2); ctx.lineTo(u * 0.5, 0); ctx.fill(); ctx.fillStyle = '#ffe1c4'; ctx.beginPath(); ctx.arc(0, -u * 1.3, u * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.restore();
  };

  BattleFX.prototype._drawEnemy = function (ctx, u) {
    var en = this.enemy, pos = this.enemyPos();
    var s = u * 1.15 * en.scale * en.shrink;
    var enter = en.state === 'enter' ? Math.min(1, en.t / 0.6) : 1;
    var dead = en.state === 'dead' ? Math.min(1, en.t / 0.9) : 0;
    var bob = en.frozen > 0 ? 0 : Math.sin(this.time * 3 + 1) * s * 0.05;
    ctx.save();
    ctx.translate(pos.x + en.kb * u * 0.6 + (1 - enter) * u * 2, pos.y + bob + dead * u * 0.5);
    ctx.globalAlpha = enter * (1 - dead);
    ctx.scale(1 - dead * 0.6, 1 - dead * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, s * 0.95, s * 0.9, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    var color = en.hitT > 0 && Math.floor(en.hitT * 30) % 2 === 0 ? '#ffffff' : en.color;
    if (en.frozen > 0) color = this._mix(color, '#bfe9ff', 0.6);
    this._drawEnemyShape(ctx, en.shape, s, color, en);
    if (en.frozen > 0) { ctx.globalAlpha *= 0.35; ctx.fillStyle = '#bfe9ff'; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.15, s * 1.05, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };

  BattleFX.prototype._drawEnemyShape = function (ctx, shape, s, color, en) {
    var dark = this._mix(color, '#000000', 0.35);
    ctx.fillStyle = color;
    function eyes(x, y, r, spread) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - spread, y, r, 0, Math.PI * 2); ctx.arc(x + spread, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a0a1a'; ctx.beginPath(); ctx.arc(x - spread - r * 0.3, y, r * 0.5, 0, Math.PI * 2); ctx.arc(x + spread - r * 0.3, y, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
    switch (shape) {
      case 'ghost':
        ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.75, Math.PI, 0); for (var i = 0; i <= 6; i++) { var x = s * 0.75 - i * s * 0.25; ctx.lineTo(x, s * 0.75 + (i % 2 ? -s * 0.15 : 0)); } ctx.closePath(); ctx.fill();
        eyes(-s * 0.1, -s * 0.15, s * 0.14, s * 0.28); break;
      case 'golem':
        ctx.fillStyle = color; ctx.fillRect(-s * 0.6, -s * 0.5, s * 1.2, s * 1.4); ctx.fillStyle = dark; ctx.fillRect(-s * 0.95, -s * 0.4, s * 0.32, s * 1.0); ctx.fillRect(s * 0.63, -s * 0.4, s * 0.32, s * 1.0);
        ctx.fillStyle = color; ctx.fillRect(-s * 0.4, -s * 0.95, s * 0.8, s * 0.5); ctx.fillStyle = '#ffe94a'; ctx.fillRect(-s * 0.3, -s * 0.8, s * 0.18, s * 0.12); ctx.fillRect(s * 0.1, -s * 0.8, s * 0.18, s * 0.12); break;
      case 'bat': {
        var flap = Math.sin(this.time * 12) * s * 0.35;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-s * 0.9, -s * 0.9 + flap, -s * 1.6, -s * 0.2 + flap); ctx.quadraticCurveTo(-s * 1.0, s * 0.1 + flap * 0.5, 0, s * 0.3); ctx.quadraticCurveTo(s * 1.0, s * 0.1 + flap * 0.5, s * 1.6, -s * 0.2 + flap); ctx.quadraticCurveTo(s * 0.9, -s * 0.9 + flap, 0, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.4); ctx.lineTo(-s * 0.3, -s * 0.85); ctx.lineTo(-s * 0.05, -s * 0.45); ctx.moveTo(s * 0.35, -s * 0.4); ctx.lineTo(s * 0.3, -s * 0.85); ctx.lineTo(s * 0.05, -s * 0.45); ctx.fill();
        eyes(-s * 0.05, -s * 0.15, s * 0.1, s * 0.16); break;
      }
      case 'wolf': case 'boar': {
        var stout = shape === 'boar';
        ctx.beginPath(); ctx.ellipse(s * 0.1, s * 0.2, s * 0.95, s * (stout ? 0.6 : 0.5), 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-s * 0.85, -s * 0.15, s * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 1.0, -s * 0.5); ctx.lineTo(-s * 0.95, -s * 0.95); ctx.lineTo(-s * 0.7, -s * 0.55); ctx.moveTo(-s * 0.6, -s * 0.5); ctx.lineTo(-s * 0.5, -s * 0.9); ctx.lineTo(-s * 0.35, -s * 0.5); ctx.fill();
        ctx.fillStyle = dark; [-0.5, -0.1, 0.5, 0.85].forEach(function (lx) { ctx.fillRect(s * lx - s * 0.1, s * 0.6, s * 0.2, s * 0.4); });
        if (stout) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-s * 1.15, 0); ctx.lineTo(-s * 1.35, -s * 0.25); ctx.lineTo(-s * 1.05, -s * 0.1); ctx.fill(); }
        eyes(-s * 0.85, -s * 0.2, s * 0.09, s * 0.14); break;
      }
      case 'knight':
        ctx.fillStyle = dark; ctx.fillRect(-s * 0.55, -s * 0.3, s * 1.1, s * 1.2); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -s * 0.6, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-s * 0.45, -s * 0.6, s * 0.9, s * 0.35);
        ctx.fillStyle = '#0a0a1a'; ctx.fillRect(-s * 0.35, -s * 0.7, s * 0.7, s * 0.12); ctx.fillStyle = '#ff5b6e'; ctx.fillRect(-s * 0.3, -s * 0.68, s * 0.14, s * 0.08); ctx.fillRect(s * 0.05, -s * 0.68, s * 0.14, s * 0.08);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-s * 0.85, s * 0.2, s * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.moveTo(s * 0.8, s * 0.6); ctx.lineTo(s * 1.1, -s * 0.9); ctx.stroke(); break;
      case 'dragon': {
        var flap2 = Math.sin(this.time * 5) * s * 0.3;
        ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2); ctx.quadraticCurveTo(0, -s * 1.9 + flap2, s * 1.3, -s * 1.4 + flap2); ctx.lineTo(s * 0.5, -s * 0.1); ctx.fill();
        ctx.beginPath(); ctx.ellipse(s * 0.2, s * 0.3, s * 1.0, s * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 1.0, s * 0.3); ctx.quadraticCurveTo(s * 1.9, s * 0.4, s * 2.0, -s * 0.6 + flap2 * 0.3); ctx.quadraticCurveTo(s * 1.7, s * 0.6, s * 1.0, s * 0.8); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.35; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.1); ctx.quadraticCurveTo(-s * 1.0, -s * 0.9, -s * 1.1, -s * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-s * 1.2, -s * 1.3, s * 0.5, s * 0.32, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe94a'; ctx.beginPath(); ctx.arc(-s * 1.3, -s * 1.4, s * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-s * 1.55, -s * 1.15); ctx.lineTo(-s * 1.8, -s * 1.0); ctx.lineTo(-s * 1.55, -s * 0.95); ctx.fill(); break;
      }
      case 'fish':
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.1, s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 0.9, 0); ctx.lineTo(s * 1.7, -s * 0.6); ctx.lineTo(s * 1.7, s * 0.6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.5); ctx.lineTo(s * 0.1, -s * 1.1); ctx.lineTo(s * 0.4, -s * 0.5); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-s * 1.0, s * 0.05); for (var t = 0; t < 4; t++) ctx.lineTo(-s * 0.9 + t * s * 0.2, s * 0.25 - (t % 2) * s * 0.12); ctx.lineTo(-s * 0.2, s * 0.05); ctx.fill();
        eyes(-s * 0.55, -s * 0.15, s * 0.11, 0); break;
      case 'slime': default:
        ctx.beginPath(); ctx.moveTo(-s * 0.95, s * 0.7); ctx.quadraticCurveTo(-s * 1.0, -s * 0.9, 0, -s * 0.9); ctx.quadraticCurveTo(s * 1.0, -s * 0.9, s * 0.95, s * 0.7); ctx.quadraticCurveTo(0, s * 1.0, -s * 0.95, s * 0.7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-s * 0.4, -s * 0.5, s * 0.22, s * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
        eyes(-s * 0.15, -s * 0.1, s * 0.15, s * 0.32);
        ctx.strokeStyle = '#1a0a1a'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.25, s * 0.25, 0.2, Math.PI - 0.2); ctx.stroke(); break;
    }
  };

  BattleFX.prototype._drawParticle = function (ctx, p) {
    var k = 1 - p.life / p.max;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.5)); ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    var r = p.r * (0.5 + k * 0.7);
    switch (p.shape) {
      case 'spark': ctx.fillRect(-r * 2, -r * 0.35, r * 4, r * 0.7); break;
      case 'drop': ctx.beginPath(); ctx.ellipse(0, 0, r * 0.6, r * 1.3, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'leaf': ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'flake': ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, r * 0.3); for (var i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(r * 1.4, 0); ctx.stroke(); } break;
      case 'star': ctx.beginPath(); for (var j = 0; j < 10; j++) { var a = j * Math.PI / 5 - Math.PI / 2, rr = j % 2 ? r * 0.6 : r * 1.5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); break;
      case 'feather': ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.quadraticCurveTo(r * 1.1, 0, 0, r * 1.6); ctx.quadraticCurveTo(-r * 1.1, 0, 0, -r * 1.6); ctx.fill(); break;
      case 'rock': ctx.beginPath(); for (var q = 0; q < 6; q++) { var aa = q / 6 * Math.PI * 2, rq = r * (0.8 + 0.3 * ((q * 7) % 3) / 2); ctx.lineTo(Math.cos(aa) * rq, Math.sin(aa) * rq); } ctx.closePath(); ctx.fill(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  BattleFX.prototype._mix = function (a, b, t) {
    function h2r(h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; }); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    if (a[0] !== '#' || b[0] !== '#') return a;
    var A = h2r(a), B = h2r(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  };

  BattleFX.styleOf = styleOf;
  root.BattleFX = BattleFX;
})(window);
