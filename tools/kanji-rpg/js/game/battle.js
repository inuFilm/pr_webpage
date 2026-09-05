/* battle.js — バトル進行（中心ループ）
 *  敵/イベント表示 → 漢字提示 → 一画ごと判定・演出 → 完成 → 魔法発動 → ダメージ → 次の漢字 → ステージクリア
 */
(function (root) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var pad = null, fx = null;
  var token = 0;          // start() ごとに増える。古い非同期処理を止めるため
  var S = null;           // 現在のバトル状態

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function alive(t) { return t === token && S && S.running; }

  function ensureViews() {
    if (!pad) {
      pad = new root.InputPad($('#input-pad'), {
        onStroke: onStroke,
        onComplete: function (r) { if (S && S.resolveWrite) { var f = S.resolveWrite; S.resolveWrite = null; f(r); } }
      });
    }
    if (!fx) fx = new root.BattleFX($('#battle-canvas'));
    pad.resize(); fx.resize();
  }

  /* ---------- HUD ---------- */
  function setHp(sel, v, max) { $(sel).style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; }
  function setMana(v) { var el = $('#mana-fill'); el.style.width = Math.round(v * 100) + '%'; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  function instruction(text) { var el = $('#instruction-text'); el.textContent = text; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function notice(text, ms) {
    var el = $('#stage-notice'); el.textContent = text; el.classList.remove('hidden');
    return wait(ms || 1600).then(function () { if (el.textContent === text) el.classList.add('hidden'); });
  }
  function showBigKanji(entry) {
    var el = $('#big-kanji'); el.classList.remove('hidden', 'out');
    el.querySelector('.big-kanji-char').textContent = entry.kanji;
    el.querySelector('.big-kanji-spell').textContent = entry.spell;
  }
  function hideBigKanji() { var el = $('#big-kanji'); el.classList.add('out'); setTimeout(function () { el.classList.add('hidden'); }, 350); }
  function updateEnemyHud() {
    if (S.enemy) { $('#enemy-name').textContent = S.enemy.name; setHp('#enemy-hp', S.enemy.hp, S.enemy.maxHp); }
    else { $('#enemy-name').textContent = '—'; setHp('#enemy-hp', 0, 1); }
  }

  /* ---------- 一画ごとのコールバック ---------- */
  function onStroke(r) {
    if (!S || !S.entry) return;
    var e = S.entry;
    if (r.ok) {
      root.SaveData.recordStroke(e.kanji, r.index, true);
      var progress = (r.index + 1) / r.total;
      setMana(progress);
      fx.strokeFx(e.category, e.ability, progress);
      $('#cur-stroke').textContent = Math.min(r.total, r.index + 2);
      root.Events.emit('stroke:ok', { kanji: e.kanji, index: r.index, total: r.total, category: e.category, ability: e.ability });
    } else {
      root.SaveData.recordStroke(e.kanji, r.index, false);
      root.Events.emit('stroke:ng', { kanji: e.kanji, index: r.index, total: r.total, reasons: r.result.reasons });
    }
  }

  /* ---------- イベント解決（復習スロット → 具体的な漢字） ---------- */
  function resolveEvents(stage, wave) {
    var used = S.usedKanji.slice();
    return wave.events.map(function (ev) {
      if (ev.kanji) { used.push(ev.kanji); return ev; }
      var pool = ev.review || 'any';
      var k = root.Scheduler.pickOne(pool, used.concat(stage.kanjiList));
      if (!k) k = root.Scheduler.pickOne(pool, used);
      if (!k) k = root.Scheduler.pickOne('any', []);
      if (!k) return null;
      used.push(k);
      var e = root.KanjiDB.get(k);
      var sit = ev.situation || root.SITUATIONS.ability[e.ability] || root.SITUATIONS.category[e.category] || '';
      return { kanji: k, situation: sit, review: true };
    }).filter(Boolean);
  }

  /* ---------- 漢字を書かせる ---------- */
  function writeKanji(entry) {
    return new Promise(function (res) {
      S.resolveWrite = res;
      // チュートリアルは書き方を覚える場なので常にフルガイド
      var base = S.stage.kind === 'tutorial' ? 1 : root.Scheduler.hintLevelFor(entry.kanji);
      var color = root.BattleFX.styleOf(entry.category, entry.ability).color;
      pad.setKanji(entry, { hintLevel: base, strokeHints: root.Scheduler.strokeHintLevels(entry.kanji, base), color: color });
      pad.setEnabled(true);
      $('#cur-kanji').textContent = entry.kanji; $('#cur-reading').textContent = entry.reading;
      $('#cur-stroke').textContent = 1; $('#cur-total').textContent = entry.strokeCount;
      $('#mana-fill').style.width = '0%';
      fx.charge = 0; fx.chargeStyle = root.BattleFX.styleOf(entry.category, entry.ability);
    });
  }

  function computeDamage(entry, mistakes, isLast) {
    var e = S.enemy; if (!e) return 0;
    var share = Math.ceil(e.maxHp / Math.max(1, S.waveAttackCount));
    var dmg = share;
    var crit = mistakes === 0;
    if (crit) dmg = Math.round(dmg * 1.3);
    if (S.buff.power) { dmg = Math.round(dmg * 1.5); S.buff.power = false; }
    if (entry.category === 'support') dmg = Math.round(share * 0.5);
    if (!isLast && e.hp - dmg < 1) dmg = e.hp - 1; // 最後の漢字で倒す（残りの漢字も練習できるように）
    if (isLast) dmg = Math.max(dmg, e.hp);
    return { dmg: Math.max(1, dmg), crit: crit };
  }

  /* ---------- ステージ進行 ---------- */
  async function runStage(stage, t) {
    fx.setTheme(stage.theme);
    $('#stage-title').textContent = stage.name;
    S.playerHp = S.playerHp || 100;
    setHp('#player-hp', S.playerHp, 100);

    for (var wi = S.waveIdx; wi < stage.waves.length; wi++) {
      S.waveIdx = wi;
      var wave = stage.waves[wi];
      S.enemy = wave.enemy ? Object.assign({ maxHp: wave.enemy.hp }, wave.enemy) : null;
      fx.setEnemy(S.enemy);
      updateEnemyHud();
      var events = resolveEvents(stage, wave);
      S.waveAttackCount = events.length;
      if (wave.intro) { instruction(''); await notice(wave.intro, 2000); }
      if (!alive(t)) return;

      for (var ei = 0; ei < events.length; ei++) {
        var ev = events[ei];
        var entry = root.KanjiDB.get(ev.kanji);
        if (!entry || !root.KanjiDB.playable(ev.kanji)) { console.warn('stroke data missing:', ev.kanji); continue; }
        S.entry = entry; S.usedKanji.push(entry.kanji);
        root.SaveData.markSeen(entry.kanji);
        if (ev.situation) { notice(ev.situation, 2200); }
        instruction(ev.text || entry.prompt);

        var result = await writeKanji(entry);
        if (!alive(t)) return;
        pad.setEnabled(false);
        var rec = root.SaveData.recordComplete(entry.kanji, result.mistakes);
        S.kanjiHistory.push(entry.kanji);
        checkCombo();

        // 完成演出
        showBigKanji(entry);
        root.Events.emit('kanji:complete', { kanji: entry.kanji, reading: entry.reading, spell: entry.spell, category: entry.category, ability: entry.ability, perfect: result.mistakes === 0 });
        instruction(entry.spell + '！');
        await wait(650);
        if (!alive(t)) return;
        if (entry.ability === 'power') S.buff.power = true;
        if (entry.ability === 'dash' || entry.ability === 'run') S.buff.speed = 2;

        await fx.cast(entry.category, entry.ability, entry.kanji);
        if (!alive(t)) return;

        var isLast = ei === events.length - 1;
        if (S.enemy) {
          var d = computeDamage(entry, result.mistakes, isLast);
          S.enemy.hp -= d.dmg;
          fx.enemyHit(d.dmg, d.crit);
          updateEnemyHud();
        }
        await wait(500);
        hideBigKanji();
        if (!alive(t)) return;

        if (S.enemy && S.enemy.hp <= 0) {
          await notice(S.enemy.name + 'を たおした！', 1200);
          await fx.enemyDefeat();
          S.enemy = null; updateEnemyHud();
        }

        // 2年生漢字の新規取得
        if (entry.grade === 2 && root.SaveData.acquire(entry.kanji)) {
          S.newKanji.push(entry.kanji);
          await wait(200);
          await root.Screens.newKanjiCard(entry);
        }
        if (!alive(t)) return;

        // 敵の反撃（チュートリアル以外・敵が生きている時）
        if (S.enemy && stage.kind !== 'tutorial') {
          var atk = S.enemy.attack || 10;
          if (S.buff.speed) { atk = Math.round(atk * 0.5); S.buff.speed--; }
          if (fx.enemy && fx.enemy.frozen > 0) atk = 0;
          if (atk > 0) {
            await notice(S.enemy.name + 'の こうげき！', 900);
            await fx.enemyAttack(atk);
            S.playerHp = Math.max(0, S.playerHp - atk);
            setHp('#player-hp', S.playerHp, 100);
            if (S.playerHp <= 0) {
              var choice = await root.Screens.gameOver();
              if (!alive(t)) return;
              if (choice === 'map') { stop(); root.Screens.show('stages'); return; }
              S.playerHp = 70; setHp('#player-hp', 70, 100);
              S.enemy.hp = S.enemy.maxHp; fx.setEnemy(S.enemy); updateEnemyHud();
              ei = -1; // このウェーブをやり直し
              continue;
            }
          }
        }
        await wait(250);
      }
      if (S.enemy) { S.enemy.hp = 0; updateEnemyHud(); await fx.enemyDefeat(); S.enemy = null; }
      S.playerHp = Math.min(100, S.playerHp + 15);
      setHp('#player-hp', S.playerHp, 100);
    }
    if (!alive(t)) return;
    await stageClear(stage);
  }

  async function stageClear(stage) {
    root.SaveData.clearStage(stage.id);
    root.Events.emit('stage:clear', { stageId: stage.id });
    instruction('ステージクリア！');
    await notice('STAGE CLEAR!', 1200);
    var idx = root.STAGES.findIndex(function (s) { return s.id === stage.id; });
    var next = root.STAGES[idx + 1];
    var html = '<div>' + stage.name + ' を クリアした！</div>';
    if (S.newKanji.length) html += '<div style="margin-top:8px">あたらしく おぼえた漢字</div><div class="newlist">' + S.newKanji.join('') + '</div>';
    var used = S.usedKanji.filter(function (k, i, a) { return a.indexOf(k) === i; });
    html += '<div style="margin-top:8px;color:var(--muted);font-size:15px">つかった漢字: ' + used.join(' ') + '</div>';
    var choice = await root.Screens.stageClear(html, !!next);
    stop();
    if (choice === 'next' && next) start(next.id); else root.Screens.show('stages');
  }

  function checkCombo() {
    var h = S.kanjiHistory;
    if (!root.COMBOS || h.length < 2) return;
    root.COMBOS.forEach(function (c) {
      var n = c.kanji.length; if (h.length < n) return;
      var tail = h.slice(-n);
      if (tail.every(function (k, i) { return k === c.kanji[i]; })) root.Events.emit('combo:available', { kanji: tail, combo: c });
    });
  }

  /* ---------- 公開 API ---------- */
  function start(stageId) {
    var stage = root.STAGES.find(function (s) { return s.id === stageId; });
    if (!stage) return;
    token++;
    var t = token;
    S = { stage: stage, waveIdx: 0, playerHp: 100, enemy: null, usedKanji: [], newKanji: [], buff: { power: false, speed: 0 }, running: true, kanjiHistory: [], entry: null, resolveWrite: null };
    root.SaveData.get().lastStage = stageId; root.SaveData.save();
    root.Screens.show('battle');
    ensureViews();
    pad.setKanji(null); pad.setEnabled(false);
    $('#big-kanji').classList.add('hidden');
    $('#stage-notice').classList.add('hidden');
    $('#cur-kanji').textContent = '？'; $('#cur-reading').textContent = ''; $('#cur-stroke').textContent = '-'; $('#cur-total').textContent = '-';
    $('#mana-fill').style.width = '0%';
    runStage(stage, t).catch(function (e) { console.error(e); });
  }
  function stop() { if (S) S.running = false; token++; if (pad) { pad.setKanji(null); pad.setEnabled(false); } if (fx) { fx.setEnemy(null); fx.effects = []; fx.env = []; fx.numbers = []; fx.particles = []; fx.player.dashX = 0; fx.player.scale = 1; fx.player.aura = null; fx.player.allyT = 0; } }

  function init() {
    $('#btn-hint').addEventListener('click', function () { root.Events.emit('ui:click'); if (pad) pad.showHint(3500); });
    $('#btn-redo').addEventListener('click', function () { root.Events.emit('ui:click'); if (pad) pad.redo(); });
    $('#btn-pause').addEventListener('click', async function () {
      root.Events.emit('ui:click');
      if (!S || !S.running || !pad) return;
      var wasEnabled = pad.enabled; pad.setEnabled(false);
      var c = await root.Screens.pause();
      if (c === 'map') { stop(); root.Screens.show('stages'); }
      else pad.setEnabled(wasEnabled);
    });
  }

  root.Battle = { init: init, start: start, stop: stop, state: function () { return S; } };
})(window);
