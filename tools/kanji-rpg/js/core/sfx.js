/* sfx.js — 効果音（WebAudio 簡易シンセ）と読み上げ（SpeechSynthesis）
 * すべて Events を購読して動く。音源ファイルに差し替える場合はここを書き換える。
 */
(function (root) {
  'use strict';
  var ctx = null;
  var master = null;
  var keepAlive = null;
  var lastCtxTime = 0, lastWallTime = 0, stalled = false;
  var recreations = 0;

  /* ---- AudioContext の生成・復帰・監視 ----
   * ブラウザ（特に iOS Safari / Android Chrome）は、タブ切替・読み上げ・他アプリの音などで
   * AudioContext を suspended / interrupted にする。復帰はユーザー操作の中で resume() する必要が
   * あるため、pointerdown 等を常時監視して kick() する。currentTime が進まない（黙って死んでいる）
   * ケースは stall として検出し、コンテキストを作り直す。
   */
  function createContext() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      if (ctx && ctx.state !== 'closed') { try { ctx.close(); } catch (e) { /* ignore */ } }
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = masterGain(); master.connect(ctx.destination);
      // 無音のループ音源で音声セッションを維持（iOS の自動停止対策）
      var buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      keepAlive = ctx.createBufferSource(); keepAlive.buffer = buf; keepAlive.loop = true;
      var kg = ctx.createGain(); kg.gain.value = 0.0001; keepAlive.connect(kg); kg.connect(ctx.destination);
      keepAlive.start();
      ctx.onstatechange = function () { if (ctx && ctx.state !== 'running') setTimeout(kick, 50); };
      lastCtxTime = ctx.currentTime; lastWallTime = performance.now(); stalled = false;
      if (recreations > 0) console.info('[SFX] AudioContext recreated (#' + recreations + ')');
      return true;
    } catch (e) { console.warn('[SFX] AudioContext creation failed', e); ctx = null; master = null; return false; }
  }

  /** 止まっていれば起こす。ユーザー操作のハンドラ内から呼ぶのが最も確実。 */
  function kick() {
    if (!ctx) return createContext();
    if (ctx.state === 'closed' || stalled) { recreations++; return createContext(); }
    if (ctx.state !== 'running') {
      try { var p = ctx.resume(); if (p && p.catch) p.catch(function () { /* ジェスチャ外では拒否されることがある */ }); } catch (e) { /* ignore */ }
    }
    return true;
  }

  /** 音を鳴らす直前に呼ぶ。stall 検出も行う。 */
  function ensure() {
    if (!ctx) return createContext();
    var now = performance.now();
    if (ctx.state === 'running') {
      // 実時間が 1.5 秒以上進んでいるのにオーディオ時計が止まっている → 黙って死んでいる
      if (now - lastWallTime > 1500) {
        if (ctx.currentTime <= lastCtxTime + 0.001) { stalled = true; }
        lastCtxTime = ctx.currentTime; lastWallTime = now;
      }
      if (stalled) { recreations++; return createContext(); }
      return true;
    }
    lastWallTime = now; lastCtxTime = ctx.currentTime;
    return kick();
  }

  function installRecoveryHooks() {
    var opts = { passive: true, capture: true };
    ['pointerdown', 'touchend', 'mousedown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { kick(); }, opts); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(kick, 100); });
    root.addEventListener('focus', function () { setTimeout(kick, 100); });
    root.addEventListener('pageshow', function () { setTimeout(kick, 100); });
  }
  function enabled() { return root.SaveData ? root.SaveData.getSetting('sfx') : true; }
  /** 音量 0..1（セーブ設定）→ マスターゲイン */
  function volume() { var v = root.SaveData ? root.SaveData.getSetting('volume') : 0.6; return Math.max(0, Math.min(1, typeof v === 'number' ? v : 0.6)); }
  function masterGain() { return 0.7 * volume() * volume(); } // 対数っぽいカーブ
  function setVolume(v) {
    if (root.SaveData) root.SaveData.setSetting('volume', v);
    if (master) master.gain.setTargetAtTime(masterGain(), ctx.currentTime, 0.02);
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!enabled() || !ensure()) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, delay) {
    if (!enabled() || !ensure()) return;
    var t0 = ctx.currentTime + (delay || 0);
    var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var s = ctx.createBufferSource(); s.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.3;
    s.connect(f); f.connect(g); g.connect(master); s.start(t0);
  }

  var SFX = {
    init: function () {
      // ユーザー操作のたびに AudioContext を起こす（初回生成 + 途中で止まった時の復帰）
      installRecoveryHooks();

      root.Events.on('stroke:ok', function (p) {
        var step = p ? p.index : 0;
        tone(520 + step * 60, 0.12, 'triangle', 0.4, 780 + step * 60);
        tone(1040 + step * 80, 0.18, 'sine', 0.15, null, 0.03);
      });
      root.Events.on('stroke:ng', function () { tone(220, 0.16, 'sine', 0.2, 160); });
      root.Events.on('kanji:complete', function (p) {
        [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.35, null, i * 0.07); });
        tone(1568, 0.5, 'sine', 0.2, null, 0.3);
        if (p && p.reading) Voice.speak(p.kanji + '、' + p.reading);
      });
      root.Events.on('magic:cast', function () { noise(0.5, 0.25); tone(200, 0.5, 'sawtooth', 0.15, 60); });
      root.Events.on('enemy:hit', function () { noise(0.25, 0.4); tone(120, 0.2, 'square', 0.2, 50); });
      root.Events.on('enemy:defeat', function () { [392, 494, 587, 784].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.3, null, i * 0.1); }); });
      root.Events.on('player:hit', function () { tone(160, 0.25, 'sawtooth', 0.25, 80); });
      root.Events.on('kanji:new', function () { [659, 784, 988, 1318, 1568].forEach(function (f, i) { tone(f, 0.35, 'sine', 0.3, null, i * 0.12); }); });
      root.Events.on('stage:clear', function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.4, 'triangle', 0.3, null, i * 0.12); }); });
      root.Events.on('ui:click', function () { tone(880, 0.06, 'square', 0.12); });
    },
    tone: tone, noise: noise, setVolume: setVolume, volume: volume, kick: kick,
    /** デバッグ用: 内部 AudioContext（開発者コンソール用） */
    _ctx: function () { return ctx; },
    /** デバッグ用: 現在の状態 */
    status: function () { return ctx ? { state: ctx.state, currentTime: ctx.currentTime, stalled: stalled, recreations: recreations, gain: master ? master.gain.value : null } : { state: 'none' }; },
    /** 音量スライダー用の試し鳴らし */
    preview: function () { tone(660, 0.12, 'triangle', 0.5, 990); }
  };

  var Voice = {
    speak: function (text) {
      if (!root.SaveData || !root.SaveData.getSetting('voice')) return;
      if (!('speechSynthesis' in root)) return;
      try {
        root.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP'; u.rate = 0.95; u.pitch = 1.1; u.volume = volume();
        // iOS では読み上げ中に AudioContext が interrupted になることがあるので、終わったら起こす
        u.onend = function () { setTimeout(kick, 50); }; u.onerror = u.onend;
        var voices = root.speechSynthesis.getVoices();
        var ja = voices.filter(function (v) { return /ja/i.test(v.lang); });
        if (ja.length) u.voice = ja[0];
        root.speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    }
  };

  root.SFX = SFX;
  root.Voice = Voice;
})(window);
