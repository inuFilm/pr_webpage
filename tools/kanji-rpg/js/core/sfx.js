/* sfx.js — 効果音（WebAudio 簡易シンセ）と読み上げ（SpeechSynthesis）
 * すべて Events を購読して動く。音源ファイルに差し替える場合はここを書き換える。
 */
(function (root) {
  'use strict';
  var ctx = null;
  var master = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = masterGain(); master.connect(ctx.destination);
    } catch (e) { return false; }
    return true;
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
      // 最初のユーザー操作で AudioContext を作る
      var unlock = function () { ensure(); document.removeEventListener('pointerdown', unlock); };
      document.addEventListener('pointerdown', unlock);

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
    tone: tone, noise: noise, setVolume: setVolume, volume: volume,
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
