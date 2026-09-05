/* kanji-db.js — 漢字データベース
 * KANJI_META（手書きメタ）+ KANJI_STROKES（KanjiVG生成）+ カスタム登録（localStorage）を統合する。
 * カスタム登録は同じ漢字の既存データを上書きする。
 *
 * エントリ形式:
 * { kanji, reading, grade, category, ability, spell, prompt, meaning, tutorial, starter,
 *   strokes: [{start, end, direction, length, corners, path}], strokeCount, source }
 */
(function (root) {
  'use strict';
  var CUSTOM_KEY = 'kanjiRPG.customKanji.v1';
  var custom = {};
  var cache = null;

  function loadCustom() {
    try { custom = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}') || {}; } catch (e) { custom = {}; }
    cache = null;
  }
  function saveCustomStore() { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); cache = null; }

  /* ability 別の技名テンプレート（{k} = 漢字） */
  var SPELL_TPL = {
    fire: '{k}のほのお', water: '{k}のみず', stream: '{k}のながれ', sea: '{k}のおおなみ', tree: '{k}のめぐみ', bamboo: '{k}のやり',
    wind: '{k}のかぜ', snow: '{k}のゆき', rain: '{k}のあめ', star: '{k}のほし', cloud: '{k}のくも', sunny: '{k}のひざし', sun: '{k}のたいよう', moon: '{k}のつき', lightning: '{k}のいかずち',
    dog: '{k}しょうかん', cow: '{k}しょうかん', horse: '{k}しょうかん', bird: '{k}しょうかん', fish: '{k}しょうかん', bug: '{k}しょうかん',
    dash: '{k}ダッシュ', run: '{k}ダッシュ', walk: '{k}のあゆみ', stop: '{k}ストップ',
    beam: '{k}ビーム', light: '{k}のひかり', sword: '{k}ぎり', arrow: '{k}のや', bow: '{k}のゆみ', hand: '{k}のて',
    power: '{k}パワー', ally: '{k}のなかま', grow: '{k}きょだいか', shrink: '{k}しゅくしょう', roar: '{k}のひびき', eye: '{k}のめ', heal: '{k}のいやし',
    stone: '{k}なげ', rock: '{k}おとし', mountain: '{k}のやま', field: '{k}のだいち', road: '{k}のみち'
  };
  var PROMPT_TPL = {
    support: '「{k}」をかいて ちからを かせ！', animal: '「{k}」をかいて なかまを よびだせ！', movement: '「{k}」をかいて うごけ！',
    weapon: '「{k}」をかいて こうげきしろ！', object: '「{k}」をかいて なげろ！', location: '「{k}」をかいて だいちを うごかせ！'
  };
  function fill(tpl, k) { return tpl.replace(/\{k\}/g, k); }
  /** コンパクト形式 [読み, 学年, カテゴリ, ability, 技名?, 指示文?] をオブジェクトへ */
  function expandMeta(k, m) {
    if (!Array.isArray(m)) return m;
    var grade = m[1] || 2, ability = m[3] || 'generic';
    return {
      reading: m[0] || '', grade: grade, category: m[2] || 'object', ability: ability,
      spell: m[4] || fill(SPELL_TPL[ability] || '{k}のまほう', k),
      prompt: m[5] || fill(PROMPT_TPL[m[2]] || '「{k}」をかいて {s}を はなて！', k).replace('{s}', m[4] || fill(SPELL_TPL[ability] || '{k}のまほう', k)),
      starter: grade === 1, tutorial: false, meaning: m[0] || ''
    };
  }

  function build() {
    var meta = {};
    var rawMeta = Object.assign({}, root.KANJI_META_EXTRA || {}, root.KANJI_META || {});
    Object.keys(rawMeta).forEach(function (k) { meta[k] = expandMeta(k, rawMeta[k]); });
    var strokes = root.KANJI_STROKES || {};
    var out = {};
    var keys = {};
    Object.keys(meta).forEach(function (k) { keys[k] = 1; });
    Object.keys(strokes).forEach(function (k) { keys[k] = 1; });
    Object.keys(custom).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var m = meta[k] || {};
      var s = strokes[k] || null;
      var c = custom[k] || null;
      var e = {
        kanji: k,
        reading: (c && c.reading) || m.reading || '',
        grade: (c && c.grade) || m.grade || 1,
        category: (c && c.category) || m.category || 'object',
        ability: (c && c.ability) || m.ability || 'generic',
        spell: (c && c.spell) || m.spell || (k + 'のまほう'),
        prompt: (c && c.prompt) || m.prompt || ('「' + k + '」を かいて まほうを はなて！'),
        meaning: (c && c.meaning) || m.meaning || '',
        tutorial: c && c.tutorial !== undefined ? !!c.tutorial : !!m.tutorial,
        starter: c && c.starter !== undefined ? !!c.starter : !!m.starter,
        strokes: (c && c.strokes && c.strokes.length) ? c.strokes : (s ? s.strokes : null),
        source: (c && c.strokes && c.strokes.length) ? 'custom' : (s ? s.source : 'none'),
        hasMeta: !!meta[k] || !!c
      };
      e.strokeCount = e.strokes ? e.strokes.length : 0;
      out[k] = e;
    });
    return out;
  }
  function db() { if (!cache) cache = build(); return cache; }

  var KanjiDB = {
    init: function () { loadCustom(); cache = null; },
    get: function (k) { return db()[k] || null; },
    /** ストロークデータがあり、ゲームで出題できる */
    playable: function (k) { var e = db()[k]; return !!(e && e.strokes && e.strokes.length); },
    all: function () { var d = db(); return Object.keys(d).map(function (k) { return d[k]; }); },
    byGrade: function (g) { return KanjiDB.all().filter(function (e) { return e.grade === g; }); },
    /* ---- カスタム登録 ---- */
    customEntries: function () { return Object.assign({}, custom); },
    isCustom: function (k) { return !!custom[k]; },
    saveCustom: function (entry) {
      if (!entry || !entry.kanji) throw new Error('kanji is required');
      custom[entry.kanji] = {
        kanji: entry.kanji, reading: entry.reading || '', grade: entry.grade || 2, category: entry.category || 'object',
        ability: entry.ability || 'generic', spell: entry.spell || '', prompt: entry.prompt || '', meaning: entry.meaning || '',
        tutorial: !!entry.tutorial, starter: !!entry.starter, strokes: entry.strokes || [], updatedAt: Date.now()
      };
      saveCustomStore();
    },
    deleteCustom: function (k) { delete custom[k]; saveCustomStore(); },
    exportCustom: function () { return JSON.stringify({ format: 'kanjiRPG.customKanji', version: 1, kanji: custom }, null, 2); },
    importCustom: function (text, replace) {
      var o = JSON.parse(text);
      var data = o.kanji || o;
      if (replace) custom = {};
      Object.keys(data).forEach(function (k) { if (data[k] && data[k].strokes) custom[k] = data[k]; });
      saveCustomStore();
      return Object.keys(data).length;
    },
    CATEGORIES: ['fire', 'water', 'nature', 'weather', 'animal', 'movement', 'weapon', 'support', 'object', 'location']
  };
  root.KanjiDB = KanjiDB;
})(window);
