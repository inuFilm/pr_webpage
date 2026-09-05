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
      enemyPunish(); // 書き順ミス → 敵の攻撃
    }
  }

  /* ---------- 敵の攻撃（書き順をミスした時だけ） ---------- */
  function enemyPunish() {
    if (!S || !S.enemy || S.dead || S.stage.kind === 'tutorial') return;
    if (fx.enemy && fx.enemy.frozen > 0) { notice(S.enemy.name + 'は こおっていて うごけない！', 900); return; }
    var atk = S.enemy.attack || 10;
    if (S.buff.speed > 0) { atk = Math.round(atk * 0.5); S.buff.speed--; }
    S.playerHp = Math.max(0, S.playerHp - atk);
    setHp('#player-hp', S.playerHp, 100);
    notice(S.enemy.name + 'の こうげき！', 800);
    fx.enemyAttack(atk);
    if (S.playerHp <= 0) {
      S.dead = true;
      pad.setEnabled(false);
      if (S.resolveWrite) { var f = S.resolveWrite; S.resolveWrite = null; f({ dead: true, mistakes: pad.totalMistakes }); }
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

  /* ---------- むずかしさ ---------- */
  // 'normal' | 'hard'（書き順ガイドなし） | 'expert'（漢字も隠す）。チュートリアルは常に normal
  function difficulty() { if (!S || S.stage.kind === 'tutorial') return 'normal'; return root.Screens.currentMode(); }
  /** 超上級で漢字を隠すか。まだ手に入れていない漢字は形を見せる */
  function isSecret(entry) { return difficulty() === 'expert' && root.SaveData.isAcquired(entry.kanji); }
  /** 隠しモード用: 文中の漢字を読みに置き換える */
  function maskText(text, entry) { if (!text || !isSecret(entry)) return text; return text.split(entry.kanji).join(entry.reading); }
  function revealKanji(ms) {
    if (!S || !S.entry) return;
    var el = $('#cur-kanji');
    el.textContent = S.entry.kanji; el.classList.remove('secret'); el.classList.remove('reveal'); void el.offsetWidth; el.classList.add('reveal');
    clearTimeout(S.revealTimer);
    S.revealTimer = setTimeout(function () { if (S && S.secret && !S.completed) { el.textContent = '？'; el.classList.add('secret'); } }, ms || 3500);
  }
  function updateStageTitle() {
    var m = difficulty();
    $('#stage-title').innerHTML = S.stage.name + (m !== 'normal' ? '<span class="hud-mode ' + m + '">' + root.Screens.modeLabel(m) + '</span>' : '');
  }

  /* ---------- 漢字を書かせる ---------- */
  function writeKanji(entry) {
    return new Promise(function (res) {
      S.resolveWrite = res;
      var mode = difficulty();
      var color = root.BattleFX.styleOf(entry.category, entry.ability).color;
      if (mode === 'normal') {
        // チュートリアルは書き方を覚える場なので常にフルガイド
        var base = S.stage.kind === 'tutorial' ? 1 : root.Scheduler.hintLevelFor(entry.kanji);
        pad.setKanji(entry, { hintLevel: base, strokeHints: root.Scheduler.strokeHintLevels(entry.kanji, base), color: color, assist: 'full' });
      } else {
        // 上級・超上級: ガイドなし。3回ミスでやっと始点だけ
        pad.setKanji(entry, { hintLevel: 4, strokeHints: [], color: color, assist: 'minimal' });
      }
      pad.setEnabled(true);
      S.secret = isSecret(entry); S.completed = false;
      var ck = $('#cur-kanji');
      ck.textContent = S.secret ? '？' : entry.kanji; ck.classList.toggle('secret', S.secret); ck.classList.remove('reveal');
      $('#cur-reading').textContent = entry.reading;
      $('#cur-stroke').textContent = 1; $('#cur-total').textContent = entry.strokeCount;
      $('#mana-fill').style.width = '0%';
      fx.charge = 0; fx.chargeStyle = root.BattleFX.styleOf(entry.category, entry.ability);
    });
  }

  /**
   * ダメージ計算
   *  ノーミス完成 → クリティカル（×1.6）。ミスありは通常。
   *  通常ステージ: 敵はウェーブ最後の漢字で倒れる（全部の漢字を練習させる）
   *  ボス（wave.loop）: 上限なし。ミスありは半減 → ミスすると戦闘が長引き、その間ミスするたびに大ダメージを受ける
   */
  function computeDamage(entry, mistakes, isLast, loop) {
    var e = S.enemy; if (!e) return { dmg: 0, crit: false };
    var share = Math.ceil(e.maxHp / Math.max(1, S.waveAttackCount));
    var crit = mistakes === 0;
    var dmg = share;
    if (crit) dmg = Math.round(dmg * 1.6);
    else if (loop) dmg = Math.round(dmg * 0.5);
    var mode = difficulty();
    if (mode === 'hard') dmg = Math.round(dmg * 1.2); else if (mode === 'expert') dmg = Math.round(dmg * 1.5);
    if (S.buff.power) { dmg = Math.round(dmg * 1.5); S.buff.power = false; }
    if (entry.category === 'support') dmg = Math.round(dmg * 0.5);
    if (!loop) {
      if (!isLast && e.hp - dmg < 1) dmg = e.hp - 1; // 最後の漢字で倒す
      if (isLast) dmg = Math.max(dmg, e.hp);
    }
    return { dmg: Math.max(1, dmg), crit: crit };
  }
  function heal(amount, label) {
    if (!S || amount <= 0 || S.playerHp >= 100) return;
    var before = S.playerHp;
    S.playerHp = Math.min(100, S.playerHp + amount);
    setHp('#player-hp', S.playerHp, 100);
    fx.playerHeal(S.playerHp - before);
    if (label) notice(label, 900);
  }

  /* ---------- ステージ進行 ---------- */
  async function runStage(stage, t) {
    fx.setTheme(stage.theme);
    updateStageTitle();
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
      S.dead = false;
      if (wave.intro) { instruction(''); await notice(wave.intro, 2000); }
      if (!alive(t)) return;

      for (var ei = 0; ei < events.length; ei++) {
        var ev = events[ei];
        var entry = root.KanjiDB.get(ev.kanji);
        if (!entry || !root.KanjiDB.playable(ev.kanji)) { console.warn('stroke data missing:', ev.kanji); continue; }
        S.entry = entry; S.usedKanji.push(entry.kanji);
        root.SaveData.markSeen(entry.kanji);
        if (ev.situation) { notice(maskText(ev.situation, entry), 2200); }
        instruction(maskText(ev.text || entry.prompt, entry));

        var result = await writeKanji(entry);
        if (!alive(t)) return;
        pad.setEnabled(false);

        // ミスで HP が 0 になった
        if (result.dead) {
          await wait(700);
          await notice(wave.enemy && wave.enemy.boss ? 'まおうに やられた…' : 'たおれてしまった…', 1200);
          var choice = await root.Screens.gameOver();
          if (!alive(t)) return;
          if (choice === 'map') { stop(); root.Screens.show('stages'); return; }
          S.playerHp = 100; setHp('#player-hp', 100, 100); S.dead = false;
          S.enemy.hp = S.enemy.maxHp; fx.setEnemy(S.enemy); updateEnemyHud();
          events = resolveEvents(stage, wave); S.waveAttackCount = events.length;
          ei = -1; // このウェーブを最初から
          continue;
        }
        // 完成したら隠していた漢字を見せる
        S.completed = true; clearTimeout(S.revealTimer);
        $('#cur-kanji').textContent = entry.kanji; $('#cur-kanji').classList.remove('secret');
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
          var d = computeDamage(entry, result.mistakes, isLast, !!wave.loop);
          S.enemy.hp -= d.dmg;
          fx.enemyHit(d.dmg, d.crit);
          updateEnemyHud();
        }
        // 回復: 回復魔法 +30 / ノーミス完成 +8（ボス戦は回復なし）
        if (entry.ability === 'heal') heal(wave.loop ? 15 : 30, 'HPかいふく！');
        else if (result.mistakes === 0 && !wave.loop) heal(8);
        await wait(500);
        hideBigKanji();
        if (!alive(t)) return;

        if (S.enemy && S.enemy.hp <= 0) {
          await notice(S.enemy.name + 'を たおした！', 1200);
          await fx.enemyDefeat();
          S.enemy = null; updateEnemyHud();
        }
        // ボス: 用意した漢字を使い切っても倒せていなければ、復習漢字を追加して戦闘を続ける
        if (wave.loop && S.enemy && isLast && events.length < 14) {
          var more = resolveEvents(stage, { events: [{ review: 'any' }] });
          if (more.length) events.push(more[0]);
        }

        // 2年生漢字の新規取得
        if (entry.grade === 2 && root.SaveData.acquire(entry.kanji)) {
          S.newKanji.push(entry.kanji);
          await wait(200);
          await root.Screens.newKanjiCard(entry);
        }
        if (!alive(t)) return;

        await wait(250);
      }
      if (S.enemy) { S.enemy.hp = 0; updateEnemyHud(); await fx.enemyDefeat(); S.enemy = null; }
      // ウェーブ突破で回復
      if (wi < stage.waves.length - 1) heal(20);
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
    S = { stage: stage, waveIdx: 0, playerHp: 100, enemy: null, usedKanji: [], newKanji: [], buff: { power: false, speed: 0 }, running: true, kanjiHistory: [], entry: null, resolveWrite: null, dead: false };
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
    $('#btn-hint').addEventListener('click', function () {
      root.Events.emit('ui:click');
      if (!pad) return;
      pad.showHint(3500);
      if (S && S.secret) revealKanji(3500); // 超上級: 隠している漢字も少しだけ見せる
    });
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

  /** ポーズ中にむずかしさを変えたとき: 次の漢字から反映。HUD は即時更新 */
  function onModeChanged() { if (S && S.running) updateStageTitle(); }

  root.Battle = { init: init, start: start, stop: stop, state: function () { return S; }, onModeChanged: onModeChanged, difficulty: difficulty };
})(window);
