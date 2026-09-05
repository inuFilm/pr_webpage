/* kanji-meta.js — 漢字のゲーム用メタデータ（手書き・編集可）
 *
 * ストローク座標は kanji-strokes.js（KanjiVG から生成）または
 * 開発者モードで登録したデータ（localStorage）から読み込まれます。
 *
 *  reading  : 子ども向けの読み（かな）
 *  grade    : 1 = 小学1年生, 2 = 小学2年生
 *  category : fire / water / nature / weather / animal / movement / weapon / support / object / location
 *  ability  : 演出のサブタイプ（カテゴリ内で共有される演出システムのバリエーション）
 *  spell    : 技名（完成時に表示）
 *  prompt   : バトル中の指示文
 *  tutorial : チュートリアルで使う
 *  starter  : ゲーム開始時から所持している（1年生漢字）
 */
var KANJI_META = {
  /* ===== 小学1年生 ===== */
  '一': { reading: 'いち', grade: 1, category: 'weapon', ability: 'beam', spell: 'ひかりのせん', prompt: '「一」をかいて ひかりのせんを はなて！', tutorial: true, starter: true, meaning: 'ひとつ' },
  '二': { reading: 'に', grade: 1, category: 'weapon', ability: 'beam', spell: 'にれんビーム', prompt: '「二」で 2本の ひかりを はなて！', starter: true, meaning: 'ふたつ' },
  '三': { reading: 'さん', grade: 1, category: 'weapon', ability: 'beam', spell: 'さんれんビーム', prompt: '「三」で 3本の ひかりを はなて！', starter: true, meaning: 'みっつ' },
  '人': { reading: 'ひと', grade: 1, category: 'support', ability: 'ally', spell: 'なかまのちから', prompt: '「人」をかいて なかまを よぼう！', tutorial: true, starter: true, meaning: 'にんげん' },
  '大': { reading: 'おおきい', grade: 1, category: 'support', ability: 'grow', spell: 'きょだいか', prompt: '「大」をかいて まほうを おおきくしろ！', tutorial: true, starter: true, meaning: 'おおきい' },
  '小': { reading: 'ちいさい', grade: 1, category: 'support', ability: 'shrink', spell: 'ちいさくなれ', prompt: '「小」で てきを ちいさくしろ！', starter: true, meaning: 'ちいさい' },
  '山': { reading: 'やま', grade: 1, category: 'location', ability: 'mountain', spell: 'だいさんしょうかん', prompt: '「山」をかいて きょだいな山を よびだせ！', starter: true, meaning: 'やま' },
  '川': { reading: 'かわ', grade: 1, category: 'water', ability: 'stream', spell: 'げきりゅう', prompt: '「川」をかいて 水のながれを おこせ！', starter: true, meaning: 'かわ' },
  '火': { reading: 'ひ', grade: 1, category: 'fire', ability: 'fire', spell: 'かえんのまほう', prompt: '「火」をかいて ほのおを はなて！', tutorial: true, starter: true, meaning: 'ほのお' },
  '水': { reading: 'みず', grade: 1, category: 'water', ability: 'water', spell: 'すいりゅうだん', prompt: '「水」をかいて ほのおを けせ！', tutorial: true, starter: true, meaning: 'みず' },
  '木': { reading: 'き', grade: 1, category: 'nature', ability: 'tree', spell: 'だいじゅのめざめ', prompt: '「木」をかいて 木を はやせ！', starter: true, meaning: 'き' },
  '月': { reading: 'つき', grade: 1, category: 'weather', ability: 'moon', spell: 'げっこう', prompt: '「月」をかいて 月のひかりを あびせろ！', starter: true, meaning: 'つき' },
  '日': { reading: 'ひ', grade: 1, category: 'weather', ability: 'sun', spell: 'たいようのひかり', prompt: '「日」をかいて たいようを よべ！', starter: true, meaning: 'たいよう' },
  '雨': { reading: 'あめ', grade: 1, category: 'weather', ability: 'rain', spell: 'あめふらし', prompt: '「雨」をかいて あめを ふらせろ！', starter: true, meaning: 'あめ' },
  '石': { reading: 'いし', grade: 1, category: 'object', ability: 'stone', spell: 'いしなげ', prompt: '「石」をかいて いわを なげろ！', starter: true, meaning: 'いし' },
  '田': { reading: 'た', grade: 1, category: 'location', ability: 'field', spell: 'だいちのかべ', prompt: '「田」をかいて だいちを うごかせ！', starter: true, meaning: 'たんぼ' },
  '竹': { reading: 'たけ', grade: 1, category: 'nature', ability: 'bamboo', spell: 'たけやり', prompt: '「竹」をかいて たけを はやせ！', starter: true, meaning: 'たけ' },
  '犬': { reading: 'いぬ', grade: 1, category: 'animal', ability: 'dog', spell: 'いぬしょうかん', prompt: '「犬」をかいて 犬を よびだせ！', starter: true, meaning: 'いぬ' },
  '虫': { reading: 'むし', grade: 1, category: 'animal', ability: 'bug', spell: 'むしのぐんぜい', prompt: '「虫」をかいて 虫のなかまを よべ！', starter: true, meaning: 'むし' },
  '力': { reading: 'ちから', grade: 1, category: 'support', ability: 'power', spell: 'パワーアップ', prompt: '「力」をかいて ちからを ためろ！', starter: true, meaning: 'ちから' },
  '口': { reading: 'くち', grade: 1, category: 'support', ability: 'roar', spell: 'おおごえ', prompt: '「口」をかいて おおごえで おどろかせろ！', starter: true, meaning: 'くち' },
  '目': { reading: 'め', grade: 1, category: 'support', ability: 'eye', spell: 'じゃくてんはっけん', prompt: '「目」をかいて じゃくてんを みつけろ！', starter: true, meaning: 'め' },
  '手': { reading: 'て', grade: 1, category: 'weapon', ability: 'hand', spell: 'まほうのて', prompt: '「手」をかいて おおきな手で たたけ！', starter: true, meaning: 'て' },
  '足': { reading: 'あし', grade: 1, category: 'movement', ability: 'dash', spell: 'スピードアップ', prompt: '「足」をかいて すばやく うごけ！', starter: true, meaning: 'あし' },

  /* ===== 小学2年生 ===== */
  '雲': { reading: 'くも', grade: 2, category: 'weather', ability: 'cloud', spell: 'くものカーテン', prompt: '「雲」をかいて 雲を よびだせ！', meaning: 'くも' },
  '雪': { reading: 'ゆき', grade: 2, category: 'weather', ability: 'snow', spell: 'ふぶき', prompt: '「雪」をかいて 雪を ふらせろ！', meaning: 'ゆき' },
  '風': { reading: 'かぜ', grade: 2, category: 'weather', ability: 'wind', spell: 'とっぷう', prompt: '「風」をかいて 風を よびだせ！', meaning: 'かぜ' },
  '晴': { reading: 'はれ', grade: 2, category: 'weather', ability: 'sunny', spell: 'かいせい', prompt: '「晴」をかいて 空を はらせろ！', meaning: 'はれ' },
  '星': { reading: 'ほし', grade: 2, category: 'weather', ability: 'star', spell: 'ほしふり', prompt: '「星」をかいて 星を ふらせろ！', meaning: 'ほし' },
  '光': { reading: 'ひかり', grade: 2, category: 'weapon', ability: 'light', spell: 'こうせん', prompt: '「光」をかいて ひかりを はなて！', meaning: 'ひかり' },
  '電': { reading: 'でんき', grade: 2, category: 'weather', ability: 'lightning', spell: 'いかずち', prompt: '「電」をかいて かみなりを おとせ！', meaning: 'かみなり・でんき' },
  '海': { reading: 'うみ', grade: 2, category: 'water', ability: 'sea', spell: 'おおなみ', prompt: '「海」をかいて おおなみを おこせ！', meaning: 'うみ' },
  '岩': { reading: 'いわ', grade: 2, category: 'object', ability: 'rock', spell: 'がんせきおとし', prompt: '「岩」をかいて 岩を おとせ！', meaning: 'いわ' },
  '牛': { reading: 'うし', grade: 2, category: 'animal', ability: 'cow', spell: 'うしのとっしん', prompt: '「牛」をかいて 牛を よびだせ！', meaning: 'うし' },
  '魚': { reading: 'さかな', grade: 2, category: 'animal', ability: 'fish', spell: 'さかなのぐんぜい', prompt: '「魚」をかいて 魚を よびだせ！', meaning: 'さかな' },
  '鳥': { reading: 'とり', grade: 2, category: 'animal', ability: 'bird', spell: 'とりしょうかん', prompt: '「鳥」をかいて 鳥を よびだせ！', meaning: 'とり' },
  '馬': { reading: 'うま', grade: 2, category: 'animal', ability: 'horse', spell: 'うましょうかん', prompt: '「馬」をかいて 馬を よびだせ！', meaning: 'うま' },
  '走': { reading: 'はしる', grade: 2, category: 'movement', ability: 'run', spell: 'ダッシュ', prompt: '「走」をかいて おいかけろ！', meaning: 'はしる' },
  '歩': { reading: 'あるく', grade: 2, category: 'movement', ability: 'walk', spell: 'まえへすすめ', prompt: '「歩」をかいて まえに すすめ！', meaning: 'あるく' },
  '止': { reading: 'とまる', grade: 2, category: 'movement', ability: 'stop', spell: 'ストップ', prompt: '「止」をかいて てきを とめろ！', meaning: 'とまる' },
  '道': { reading: 'みち', grade: 2, category: 'location', ability: 'road', spell: 'ひかりのみち', prompt: '「道」をかいて みちを つくれ！', meaning: 'みち' },
  '刀': { reading: 'かたな', grade: 2, category: 'weapon', ability: 'sword', spell: 'かたないっせん', prompt: '「刀」をかいて 刀で きれ！', meaning: 'かたな' },
  '弓': { reading: 'ゆみ', grade: 2, category: 'weapon', ability: 'bow', spell: 'ゆみをひく', prompt: '「弓」をかいて 弓を かまえろ！', meaning: 'ゆみ' },
  '矢': { reading: 'や', grade: 2, category: 'weapon', ability: 'arrow', spell: 'ひかりのや', prompt: '「矢」をかいて 矢を はなて！', meaning: 'や' }
};

if (typeof module !== 'undefined' && module.exports) module.exports = KANJI_META;
