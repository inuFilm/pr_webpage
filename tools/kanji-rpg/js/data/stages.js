/* stages.js — ステージ構成
 *
 * stage = { id, name, subtitle, kind: 'tutorial'|'basic'|'main'|'boss', theme, kanjiList(表示用), waves: [...] }
 * wave  = { enemy: {name, shape, color, hp, attack} | null, intro, events: [...] }
 * event = { kanji: '火', text: '指示文(省略時はメタの prompt)', situation: '状況説明' }
 *       | { review: 'grade1'|'grade2'|'any', situation }   ← 苦手・久しぶりの漢字をスケジューラが選ぶ
 *
 * 敵の shape: slime / ghost / golem / bat / wolf / knight / dragon / cloud / fish / boar
 */
var STAGE_THEMES = {
  tutorial: { sky: ['#1a1440', '#2d1f6b'], ground: '#241b4d', accent: '#c56bff' },
  forest:   { sky: ['#0f2a2a', '#1a4a3a'], ground: '#1d3b25', accent: '#5ed36a' },
  cave:     { sky: ['#1c1a24', '#3a2f3a'], ground: '#2a2230', accent: '#c9a27a' },
  sky:      { sky: ['#123a6b', '#3f8ad6'], ground: '#2a5a8a', accent: '#b9d9ff' },
  sea:      { sky: ['#0a2a55', '#0f5a8a'], ground: '#0b3a5a', accent: '#3fb8ff' },
  savanna:  { sky: ['#4a2a12', '#b06a2a'], ground: '#5a3a1a', accent: '#ffb347' },
  road:     { sky: ['#2a1a3a', '#6b3a6b'], ground: '#3a2a3a', accent: '#7ef9ff' },
  tower:    { sky: ['#1a1a2a', '#2a2a4a'], ground: '#1a1a24', accent: '#ffd700' },
  boss:     { sky: ['#2a0a12', '#5a1020'], ground: '#2a0a10', accent: '#ff5b6e' }
};

/* 復習イベントで使う状況文（ability → 文）。無ければカテゴリ、さらに無ければ汎用。 */
var SITUATIONS = {
  ability: {
    water: 'てきが ほのおを はいた！ 水で けそう！',
    fire: 'つめたい かぜが ふいてきた！ ほのおで あたためろ！',
    stream: 'てきが せまってくる！ 水のながれで おしもどせ！',
    sea: 'てきが たくさん あらわれた！ おおなみで ながせ！',
    stone: 'てきの まもりが かたい！ いしを なげろ！',
    rock: 'いわかべが じゃまだ！ 岩で こわせ！',
    power: 'いまの ちからでは たりない！ ちからを ためろ！',
    run: 'てきが にげた！ おいかけろ！',
    dash: 'てきの こうげきが はやい！ すばやく うごけ！',
    walk: 'まえに すすもう！',
    stop: 'てきが つっこんでくる！ とめろ！',
    eye: 'てきの じゃくてんが わからない！ 目で さがせ！',
    hand: 'てきを ひっつかめ！',
    tree: 'たかい ところに いる！ 木を はやして とどけ！',
    mountain: 'てきの こうげきを ふせげ！ 山を よべ！',
    rain: 'ほのおが ひろがっている！ あめを ふらせろ！',
    wind: 'けむりで まえが みえない！ 風で ふきとばせ！',
    snow: 'てきが あつくなっている！ 雪で ひやせ！',
    lightning: 'てきが とんでいる！ かみなりで おとせ！',
    light: 'くらくて みえない！ ひかりを はなて！',
    sunny: 'くもって みえない！ 空を はらせ！',
    cloud: 'ひざしが つよすぎる！ 雲で かげを つくれ！',
    star: 'よるだ！ 星を ふらせろ！',
    dog: 'なかまが ほしい！ 犬を よべ！',
    bug: 'てきの うごきを とめたい！ 虫の なかまを よべ！',
    bird: 'そらから せめろ！ 鳥を よべ！',
    horse: 'とおくに いる！ 馬で かけぬけろ！',
    cow: 'かべを おしたおせ！ 牛を よべ！',
    fish: 'みずのなかの てきだ！ 魚を よべ！',
    sword: 'てきの よろいを きりさけ！',
    arrow: 'とおくの てきを ねらえ！',
    bow: 'ゆみを かまえろ！',
    beam: 'まっすぐな ひかりで うちぬけ！',
    ally: 'ひとりじゃ たいへんだ！ なかまを よべ！',
    grow: 'まほうを おおきく しろ！',
    shrink: 'てきが おおきすぎる！ ちいさく しろ！',
    roar: 'おおごえで おどろかせろ！',
    moon: 'よるの てきだ！ 月のひかりで てらせ！',
    sun: 'くらい！ たいようを よべ！',
    field: 'だいちの ちからを かりろ！',
    bamboo: 'たけを はやして つきさせ！',
    road: 'みちが ない！ みちを つくれ！',
    heal: 'きずが いたい… かいふくの まほうだ！'
  },
  category: {
    fire: 'ほのおの まほうを つかおう！',
    water: '水の まほうを つかおう！',
    nature: 'しぜんの ちからを かりろ！',
    weather: 'てんきの まほうを つかおう！',
    animal: 'しょうかんじゅうを よべ！',
    movement: 'すばやく うごけ！',
    weapon: 'ぶきの まほうで こうげき！',
    support: 'ちからを たかめろ！',
    object: 'ものを なげて こうげき！',
    location: 'ばしょの まほうを つかおう！'
  }
};

var STAGES = [
  {
    id: 'tutorial', name: 'はじまりの森', subtitle: 'チュートリアル — まほうの つかいかた', kind: 'tutorial', theme: 'tutorial',
    kanjiList: ['一', '人', '大', '火', '水'],
    waves: [
      { enemy: null, intro: 'ようこそ、漢字術師のたまごよ。まずは まほうの つかいかたを おぼえよう！',
        events: [
          { kanji: '一', text: 'まずは「一」を かいてみよう！ ひだりから みぎへ なぞろう！' },
          { kanji: '人', text: 'つぎは「人」だ！ 1画ずつ ていねいに！' },
          { kanji: '大', text: '「大」を かこう！ 3画で かんせいだ！' }
        ] },
      { enemy: { name: 'ほのおスライム', shape: 'slime', color: '#ff7a3a', hp: 100, attack: 8 }, intro: 'てきが あらわれた！ 「火」の まほうで たおそう！',
        events: [{ kanji: '火', text: '「火」を かいて ほのおを はなて！' }] },
      { enemy: { name: 'ひのたまゴースト', shape: 'ghost', color: '#ff5b6e', hp: 100, attack: 8 }, intro: 'ひのたまが せまってくる！ 「水」で けせ！',
        events: [{ kanji: '水', text: '「水」を かいて ほのおを けせ！' }] }
    ]
  },
  {
    id: 'basic1', name: 'みどりの谷', subtitle: '初級1 — しぜんの まほう', kind: 'basic', theme: 'forest',
    kanjiList: ['木', '山', '川', '雨', '石'],
    waves: [
      { enemy: { name: 'どくキノコ', shape: 'slime', color: '#a56bff', hp: 120, attack: 8 }, intro: 'たにに どくキノコが はえている！',
        events: [{ kanji: '木', situation: 'たかい ところに いる！ 木を はやして とどけ！' }, { kanji: '山', situation: 'どくの けむりだ！ 山で ふせげ！' }] },
      { enemy: { name: 'くさりコウモリ', shape: 'bat', color: '#8a6bff', hp: 150, attack: 10 }, intro: 'コウモリの ぐんぜいだ！',
        events: [{ kanji: '川' }, { kanji: '雨', situation: 'ほのおが ひろがっている！ あめを ふらせろ！' }, { kanji: '石' }] }
    ]
  },
  {
    id: 'basic2', name: 'ひかりの洞窟', subtitle: '初級2 — しょうかん と きょうか', kind: 'basic', theme: 'cave',
    kanjiList: ['犬', '虫', '力', '手', '足'],
    waves: [
      { enemy: { name: 'いわゴーレム', shape: 'golem', color: '#9a8a7a', hp: 150, attack: 12 }, intro: 'ゴーレムが みちを ふさいでいる！',
        events: [{ kanji: '犬', situation: 'ひとりじゃ たいへんだ！ 犬を よべ！' }, { kanji: '力', situation: 'ゴーレムは かたい！ ちからを ためろ！' }, { kanji: '手' }] },
      { enemy: { name: 'かげオオカミ', shape: 'wolf', color: '#5a5a8a', hp: 150, attack: 12 }, intro: 'はやい てきだ！',
        events: [{ kanji: '足', situation: 'てきが はやい！ すばやく うごけ！' }, { kanji: '虫' }, { review: 'grade1' }] }
    ]
  },
  {
    id: 'main1', name: '天気の国', subtitle: '本編1 — あたらしい まほう', kind: 'main', theme: 'sky',
    kanjiList: ['雲', '雪', '風', '晴', '光'],
    waves: [
      { enemy: { name: 'そらのクラゲ', shape: 'ghost', color: '#7fd6ff', hp: 160, attack: 10 }, intro: '空の国に ついた！ ふしぎな ちからを かんじる…',
        events: [{ kanji: '雲', situation: 'あたらしい 漢字の ちからだ！ 「雲」を かいてみよう！' }, { review: 'grade1' }, { kanji: '雪' }] },
      { enemy: { name: 'あらしのトリ', shape: 'bat', color: '#3f8ad6', hp: 200, attack: 12 }, intro: 'あらしを よぶ トリだ！',
        events: [{ kanji: '風' }, { kanji: '晴', situation: 'くろい くもで みえない！ 空を はらせ！' }, { review: 'grade1' }, { kanji: '光' }] }
    ]
  },
  {
    id: 'main2', name: '自然の国', subtitle: '本編2 — うみ と ほし', kind: 'main', theme: 'sea',
    kanjiList: ['海', '岩', '星', '電'],
    waves: [
      { enemy: { name: 'うみのカニ', shape: 'golem', color: '#ff6b5b', hp: 180, attack: 12 }, intro: 'うみべに おおきな カニが！',
        events: [{ kanji: '海' }, { review: 'grade1' }, { kanji: '岩' }] },
      { enemy: { name: 'よるのサメ', shape: 'fish', color: '#4a6aa0', hp: 220, attack: 14 }, intro: 'よるの うみから サメが！',
        events: [{ kanji: '星' }, { review: 'any' }, { kanji: '電' }, { review: 'grade1' }] }
    ]
  },
  {
    id: 'main3', name: '動物の国', subtitle: '本編3 — しょうかんじゅう', kind: 'main', theme: 'savanna',
    kanjiList: ['牛', '魚', '鳥', '馬'],
    waves: [
      { enemy: { name: 'あばれイノシシ', shape: 'boar', color: '#8a5a3a', hp: 200, attack: 14 }, intro: 'イノシシが つっこんでくる！',
        events: [{ kanji: '牛', situation: 'かべを おしたおせ！ 牛を よべ！' }, { review: 'grade1' }, { kanji: '魚' }] },
      { enemy: { name: 'そらのワシ', shape: 'bat', color: '#c9a27a', hp: 240, attack: 14 }, intro: 'おおきな ワシが おそってくる！',
        events: [{ kanji: '鳥' }, { review: 'grade2' }, { kanji: '馬' }, { review: 'any' }] }
    ]
  },
  {
    id: 'main4', name: '冒険の国', subtitle: '本編4 — はしれ！ すすめ！', kind: 'main', theme: 'road',
    kanjiList: ['走', '歩', '止', '道'],
    waves: [
      { enemy: { name: 'にげるドロボウ', shape: 'knight', color: '#6a6a9a', hp: 200, attack: 12 }, intro: 'ドロボウが たからを もって にげる！',
        events: [{ kanji: '走', situation: 'てきが にげた！ おいかけろ！' }, { review: 'grade1' }, { kanji: '止', situation: 'つかまえろ！ とめろ！' }] },
      { enemy: { name: 'まよいのキシ', shape: 'knight', color: '#9a4a6a', hp: 260, attack: 15 }, intro: 'みちが きえた！ キシが たちふさがる！',
        events: [{ kanji: '歩' }, { kanji: '道', situation: 'みちが ない！ みちを つくれ！' }, { review: 'any' }, { review: 'grade2' }] }
    ]
  },
  {
    id: 'main5', name: '武器の塔', subtitle: '本編5 — ぶきの まほう', kind: 'main', theme: 'tower',
    kanjiList: ['刀', '弓', '矢'],
    waves: [
      { enemy: { name: 'よろいのキシ', shape: 'knight', color: '#b0b0c0', hp: 240, attack: 15 }, intro: 'とうの ばんにんが あらわれた！',
        events: [{ kanji: '刀' }, { review: 'grade1' }, { kanji: '弓' }, { kanji: '矢' }] },
      { enemy: { name: 'とうのりゅう', shape: 'dragon', color: '#6a3aa0', hp: 320, attack: 16 }, intro: 'とうの ちょうじょうに りゅうが！',
        events: [{ review: 'grade2' }, { kanji: '矢', situation: 'とおくの てきを ねらえ！ もういちど 「矢」だ！' }, { review: 'any' }, { review: 'grade2' }] }
    ]
  },
  {
    id: 'boss', name: '漢字の魔王', subtitle: 'ボス — すべての まほうを つかえ！', kind: 'boss', theme: 'boss',
    kanjiList: [],
    waves: [
      // loop: true → 用意した漢字で倒しきれなければ復習漢字を追加して戦闘が続く（ミスありは与ダメージ半減）
      { enemy: { name: 'まおうの てさき', shape: 'ghost', color: '#a03a5a', hp: 300, attack: 25 }, intro: 'まおうの しろだ！ ここでは 1回の ミスが おおきな ダメージになる！',
        loop: true, events: [{ review: 'any' }, { review: 'any' }, { review: 'any' }] },
      { enemy: { name: '漢字の魔王', shape: 'dragon', color: '#ff3a5a', hp: 480, attack: 50, boss: true }, intro: 'ついに まおうが あらわれた！ ミスは ゆるされない… おぼえた 漢字を すべて つかえ！',
        loop: true, events: [{ review: 'any' }, { review: 'grade2' }, { review: 'any' }, { review: 'grade2' }, { review: 'any' }, { review: 'any' }] }
    ]
  }
];

/* ===== 追加エリア（自動生成） =====
 * 上のステージに出てこない2年生漢字を、カテゴリごとに5字ずつのステージにする。
 * ボスの後に並び、順番に解放される。main.js が KanjiDB 初期化後に STAGES へ追加する。
 */
var EXTRA_CATEGORY = {
  fire:     { name: 'ほのおの国', theme: 'boss',    enemies: [['マグマスライム', 'slime', '#ff6b2b'], ['ほのおのトリ', 'bat', '#ff9f2e']] },
  water:    { name: 'みずの国',   theme: 'sea',     enemies: [['みずのゴースト', 'ghost', '#3fb8ff'], ['おおガニ', 'golem', '#4a8ad6']] },
  nature:   { name: 'しぜんの国', theme: 'forest',  enemies: [['はっぱムシ', 'slime', '#5ed36a'], ['もりのオオカミ', 'wolf', '#3a7a4a']] },
  weather:  { name: 'てんきの国', theme: 'sky',     enemies: [['くものクラゲ', 'ghost', '#b9d9ff'], ['かみなりドリ', 'bat', '#ffe94a']] },
  animal:   { name: 'どうぶつの国', theme: 'savanna', enemies: [['あばれウシ', 'boar', '#8a5a3a'], ['そらのタカ', 'bat', '#c9a27a']] },
  movement: { name: 'うごきの国', theme: 'road',    enemies: [['はやあしドロボウ', 'knight', '#6a6a9a'], ['かげのキシ', 'knight', '#4a4a7a']] },
  weapon:   { name: 'ぶきの国',   theme: 'tower',   enemies: [['てつのゴーレム', 'golem', '#9a9ab0'], ['はがねのキシ', 'knight', '#b0b0c0']] },
  support:  { name: 'ちからの国', theme: 'tutorial', enemies: [['まほうのゴースト', 'ghost', '#c56bff'], ['やみのキシ', 'knight', '#7a4aa0']] },
  object:   { name: 'ものの国',   theme: 'cave',    enemies: [['いわスライム', 'slime', '#c9a27a'], ['いわゴーレム', 'golem', '#8a7a6a']] },
  location: { name: 'ばしょの国', theme: 'forest',  enemies: [['まよいのゴースト', 'ghost', '#a3c47c'], ['だいちのゴーレム', 'golem', '#6a8a5a']] }
};
function buildExtraStages(entries) {
  var covered = {};
  STAGES.forEach(function (s) { (s.kanjiList || []).forEach(function (k) { covered[k] = 1; }); });
  var order = ['weather', 'nature', 'water', 'fire', 'animal', 'movement', 'weapon', 'location', 'object', 'support'];
  var byCat = {};
  entries.filter(function (e) { return e.grade === 2 && !covered[e.kanji] && e.strokes && e.strokes.length; })
    .sort(function (a, b) { return a.strokeCount - b.strokeCount; })
    .forEach(function (e) { (byCat[e.category] = byCat[e.category] || []).push(e.kanji); });
  var out = [];
  var stageNo = 0;
  order.forEach(function (cat) {
    var list = byCat[cat] || [];
    var info = EXTRA_CATEGORY[cat] || EXTRA_CATEGORY.object;
    for (var i = 0, n = 1; i < list.length; i += 5, n++) {
      var chunk = list.slice(i, i + 5);
      stageNo++;
      var hp = 200 + Math.min(120, stageNo * 6), atk = 10 + Math.min(8, Math.floor(stageNo / 3));
      var e1 = info.enemies[0], e2 = info.enemies[1];
      var w1 = chunk.slice(0, Math.ceil(chunk.length / 2)).map(function (k) { return { kanji: k }; });
      var w2 = chunk.slice(Math.ceil(chunk.length / 2)).map(function (k) { return { kanji: k }; });
      w1.splice(Math.min(2, w1.length), 0, { review: 'grade1' });
      w2.push({ review: 'any' });
      var waves = [{ enemy: { name: e1[0], shape: e1[1], color: e1[2], hp: hp, attack: atk }, intro: info.name + ' ' + n + ' — あたらしい 漢字の ちからを さがせ！', events: w1 }];
      if (w2.length > 1) waves.push({ enemy: { name: e2[0], shape: e2[1], color: e2[2], hp: hp + 40, attack: atk + 2 }, intro: 'つぎの てきだ！', events: w2 });
      out.push({ id: 'extra-' + cat + '-' + n, name: info.name + ' ' + n, subtitle: '追加エリア — ' + chunk.join(' '), kind: 'extra', theme: info.theme, kanjiList: chunk, waves: waves });
    }
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { STAGES: STAGES, STAGE_THEMES: STAGE_THEMES, SITUATIONS: SITUATIONS, buildExtraStages: buildExtraStages };
