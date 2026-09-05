/* main.js — 起動 */
(function (root) {
  'use strict';
  function boot() {
    root.SaveData.load();
    root.KanjiDB.init();
    // 追加エリア（固定ステージに出てこない2年生漢字をカテゴリ別に自動生成）
    if (root.buildExtraStages) root.STAGES.push.apply(root.STAGES, root.buildExtraStages(root.KanjiDB.all()));
    root.SFX.init();
    root.Screens.init();
    root.Battle.init();

    // 縦向きヒント
    var hintShown = false, hintTimer = null;
    function orient() {
      var portrait = window.innerHeight > window.innerWidth;
      var inBattle = root.Screens.current() === 'battle';
      var el = document.getElementById('orientation-hint');
      if (!inBattle) { hintShown = false; el.classList.add('hidden'); return; }
      if (portrait && !hintShown) {
        hintShown = true; el.classList.remove('hidden');
        clearTimeout(hintTimer); hintTimer = setTimeout(function () { el.classList.add('hidden'); }, 4000);
      } else if (!portrait) { el.classList.add('hidden'); }
    }
    window.addEventListener('resize', orient);
    setInterval(orient, 1000);

    // データ不足チェック（ストロークデータの無い漢字を開発者向けに警告）
    var missing = root.KanjiDB.all().filter(function (e) { return e.hasMeta && !root.KanjiDB.playable(e.kanji); }).map(function (e) { return e.kanji; });
    if (missing.length) console.warn('[KanjiRPG] 書き順データが無い漢字（開発者モードで登録してください）:', missing.join(' '));

    // 合体魔法は MVP では未発動。データ構造と検知だけ用意
    root.Events.on('combo:available', function (p) { console.log('[combo] ' + p.combo.word + ' (' + p.combo.reading + ') が発動可能 — 将来実装'); });

    // 音声リスト読み込み（iOS/Chrome 対応）
    if ('speechSynthesis' in window) { try { window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
