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
    road: 'みちが ない！ みちを つくれ！'
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
      { enemy: { name: 'まおうの てさき', shape: 'ghost', color: '#a03a5a', hp: 300, attack: 16 }, intro: 'まおうの しろだ！ てさきが たちふさがる！',
        events: [{ review: 'any' }, { review: 'any' }, { review: 'any' }] },
      { enemy: { name: '漢字の魔王', shape: 'dragon', color: '#ff3a5a', hp: 480, attack: 18, boss: true }, intro: 'ついに まおうが あらわれた！ おぼえた 漢字を すべて つかえ！',
        events: [{ review: 'any' }, { review: 'grade2' }, { review: 'any' }, { review: 'grade2' }, { review: 'any' }, { review: 'any' }] }
    ]
  }
];

if (typeof module !== 'undefined' && module.exports) module.exports = { STAGES: STAGES, STAGE_THEMES: STAGE_THEMES, SITUATIONS: SITUATIONS };
