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

/* ===== 追加分（小1・小2 の残り全配当漢字） — コンパクト形式 =====
 *  '漢字': [読み, 学年, カテゴリ, ability, 技名(省略可), 指示文(省略可)]
 *  技名・指示文を省略すると kanji-db.js が ability 別のテンプレートから作る。
 *  1年生は自動的に starter（最初から所持）。
 *  ability は battle-fx.js の演出名。'heal' は回復（support）。
 */
var KANJI_META_EXTRA = {
  /* ---- 小学1年生（残り56字） ---- */
  '右': ['みぎ', 1, 'movement', 'dash'], '円': ['えん', 1, 'support', 'roar', 'まるいひびき'], '王': ['おう', 1, 'support', 'power', 'おうさまのちから'],
  '音': ['おと', 1, 'support', 'roar', 'おおきなおと'], '下': ['した', 1, 'object', 'rock', 'したにおとす'], '花': ['はな', 1, 'nature', 'tree', 'はなふぶき'],
  '貝': ['かい', 1, 'water', 'water', 'かいのみず'], '学': ['まなぶ', 1, 'support', 'grow', 'まなびのちから'], '気': ['き', 1, 'support', 'heal', 'げんきかいふく'],
  '九': ['きゅう', 1, 'weapon', 'beam', 'きゅうれんビーム'], '休': ['やすむ', 1, 'support', 'heal', 'ひとやすみ'], '玉': ['たま', 1, 'object', 'stone', 'たまなげ'],
  '金': ['きん', 1, 'weapon', 'light', 'きんのひかり'], '空': ['そら', 1, 'weather', 'cloud', 'そらのちから'], '見': ['みる', 1, 'support', 'eye', 'みやぶる'],
  '五': ['ご', 1, 'weapon', 'beam', 'ごれんビーム'], '校': ['こう', 1, 'location', 'field', 'がっこうのかべ'], '左': ['ひだり', 1, 'movement', 'dash'],
  '子': ['こ', 1, 'support', 'ally', 'こどものなかま'], '四': ['よん', 1, 'weapon', 'beam', 'よんれんビーム'], '糸': ['いと', 1, 'movement', 'stop', 'いとでしばる'],
  '字': ['じ', 1, 'weapon', 'light', 'もじのひかり'], '耳': ['みみ', 1, 'support', 'eye', 'ききみみ'], '七': ['なな', 1, 'weapon', 'beam', 'ななれんビーム'],
  '車': ['くるま', 1, 'movement', 'run', 'くるまでつっこむ'], '十': ['じゅう', 1, 'weapon', 'beam', 'じゅうれんビーム'], '出': ['でる', 1, 'movement', 'run', 'とびだす'],
  '女': ['おんな', 1, 'support', 'ally', 'おんなのこのなかま'], '上': ['うえ', 1, 'support', 'grow', 'うえへのびる'], '森': ['もり', 1, 'nature', 'tree', 'もりのめざめ'],
  '正': ['ただしい', 1, 'support', 'power', 'ただしいちから'], '生': ['いきる', 1, 'support', 'heal', 'いのちのちから'], '青': ['あお', 1, 'water', 'water', 'あおいみず'],
  '夕': ['ゆう', 1, 'weather', 'sun', 'ゆうやけ'], '赤': ['あか', 1, 'fire', 'fire', 'あかいほのお'], '千': ['せん', 1, 'weapon', 'light', 'せんのひかり'],
  '先': ['さき', 1, 'movement', 'dash', 'さきまわり'], '早': ['はやい', 1, 'movement', 'dash', 'はやわざ'], '草': ['くさ', 1, 'nature', 'tree', 'くさのしげり'],
  '村': ['むら', 1, 'location', 'field', 'むらのまもり'], '男': ['おとこ', 1, 'support', 'ally', 'おとこのこのなかま'], '中': ['なか', 1, 'support', 'eye', 'まんなかをねらう'],
  '町': ['まち', 1, 'location', 'field', 'まちのかべ'], '天': ['てん', 1, 'weather', 'sunny', 'てんのひかり'], '土': ['つち', 1, 'location', 'field', 'つちのかべ'],
  '入': ['はいる', 1, 'movement', 'dash', 'とびこむ'], '年': ['とし', 1, 'support', 'grow', 'せいちょう'], '白': ['しろ', 1, 'weather', 'snow', 'しろいゆき'],
  '八': ['はち', 1, 'weapon', 'beam', 'はちれんビーム'], '百': ['ひゃく', 1, 'weapon', 'light', 'ひゃくのひかり'], '文': ['ぶん', 1, 'weapon', 'light', 'ことばのひかり'],
  '本': ['ほん', 1, 'nature', 'tree', 'おおきなき'], '名': ['な', 1, 'support', 'roar', 'なまえをよぶ'], '立': ['たつ', 1, 'support', 'grow', 'たちあがる'],
  '林': ['はやし', 1, 'nature', 'tree', 'はやしのめざめ'], '六': ['ろく', 1, 'weapon', 'beam', 'ろくれんビーム'],

  /* ---- 小学2年生（残り140字） ---- */
  '引': ['ひく', 2, 'weapon', 'bow', 'ゆみをひく'], '羽': ['はね', 2, 'animal', 'bird', 'はねのまい'], '園': ['えん', 2, 'location', 'field', 'にわのまもり'],
  '遠': ['とおい', 2, 'weapon', 'arrow', 'とおくへとばす'], '何': ['なに', 2, 'support', 'eye', 'なにかをさがす'], '科': ['か', 2, 'support', 'eye', 'かがくのめ'],
  '夏': ['なつ', 2, 'fire', 'fire', 'なつのあつさ'], '家': ['いえ', 2, 'location', 'field', 'いえのまもり'], '歌': ['うた', 2, 'support', 'roar', 'うたのちから'],
  '画': ['が', 2, 'support', 'eye', 'えをかく'], '回': ['まわる', 2, 'support', 'roar', 'まわるひびき'], '会': ['あう', 2, 'support', 'ally', 'であいのなかま'],
  '絵': ['え', 2, 'support', 'eye', 'えのちから'], '外': ['そと', 2, 'movement', 'run', 'そとへとびだす'], '角': ['かど', 2, 'weapon', 'sword', 'かどのいちげき'],
  '楽': ['たのしい', 2, 'support', 'heal', 'たのしいきぶん'], '活': ['かつ', 2, 'support', 'heal', 'かっぱつ'], '間': ['あいだ', 2, 'support', 'eye', 'すきまをねらう'],
  '丸': ['まる', 2, 'support', 'roar', 'まるいはどう'], '顔': ['かお', 2, 'support', 'eye', 'かおをみる'], '汽': ['き', 2, 'weather', 'cloud', 'ゆげのくも'],
  '記': ['しるす', 2, 'support', 'eye', 'きろくする'], '帰': ['かえる', 2, 'movement', 'walk', 'かえりみち'], '京': ['きょう', 2, 'location', 'road', 'みやこのみち'],
  '強': ['つよい', 2, 'support', 'power', 'つよくなる'], '教': ['おしえる', 2, 'support', 'ally', 'せんせいのなかま'], '近': ['ちかい', 2, 'movement', 'walk', 'ちかづく'],
  '兄': ['あに', 2, 'support', 'ally', 'おにいさんのなかま'], '形': ['かたち', 2, 'object', 'stone', 'かたちをなげる'], '計': ['はかる', 2, 'support', 'eye', 'はかるめ'],
  '元': ['もと', 2, 'support', 'heal', 'げんきのもと'], '言': ['いう', 2, 'support', 'roar', 'ことばのひびき'], '原': ['はら', 2, 'location', 'field', 'のはらのちから'],
  '戸': ['と', 2, 'location', 'field', 'とのまもり'], '古': ['ふるい', 2, 'object', 'rock', 'ふるいいわ'], '午': ['ご', 2, 'weather', 'sun', 'まひるのひかり'],
  '後': ['あと', 2, 'movement', 'stop', 'あとにひかせる'], '語': ['かたる', 2, 'support', 'roar', 'かたりのちから'], '工': ['こう', 2, 'object', 'rock', 'こうじのいわ'],
  '公': ['こう', 2, 'support', 'ally', 'みんなのなかま'], '広': ['ひろい', 2, 'location', 'field', 'ひろいだいち'], '交': ['まじる', 2, 'movement', 'dash', 'いれかわり'],
  '光': KANJI_META['光'] ? undefined : ['ひかり', 2, 'weapon', 'light'],
  '考': ['かんがえる', 2, 'support', 'eye', 'かんがえるめ'], '行': ['いく', 2, 'movement', 'run', 'つきすすむ'], '高': ['たかい', 2, 'location', 'mountain', 'たかいやま'],
  '黄': ['き', 2, 'weather', 'sun', 'きいろいひかり'], '合': ['あう', 2, 'support', 'ally', 'ちからをあわせる'], '谷': ['たに', 2, 'location', 'mountain', 'たにのかべ'],
  '国': ['くに', 2, 'location', 'mountain', 'くにのまもり'], '黒': ['くろ', 2, 'weather', 'cloud', 'くろいくも'], '今': ['いま', 2, 'movement', 'dash', 'いまだ！'],
  '才': ['さい', 2, 'support', 'power', 'さいのう'], '細': ['ほそい', 2, 'weapon', 'arrow', 'ほそいや'], '作': ['つくる', 2, 'object', 'stone', 'つくったいし'],
  '算': ['さん', 2, 'weapon', 'beam', 'けいさんビーム'], '止': KANJI_META['止'] ? undefined : ['とまる', 2, 'movement', 'stop'],
  '市': ['いち', 2, 'location', 'field', 'いちばのかべ'], '姉': ['あね', 2, 'support', 'ally', 'おねえさんのなかま'], '思': ['おもう', 2, 'support', 'eye', 'おもいのちから'],
  '紙': ['かみ', 2, 'weather', 'wind', 'かみふぶき'], '寺': ['てら', 2, 'location', 'field', 'おてらのまもり'], '自': ['じ', 2, 'support', 'power', 'じぶんのちから'],
  '時': ['とき', 2, 'movement', 'stop', 'ときをとめる'], '室': ['しつ', 2, 'location', 'field', 'へやのまもり'], '社': ['しゃ', 2, 'location', 'field', 'やしろのまもり'],
  '弱': ['よわい', 2, 'support', 'shrink', 'よわくする'], '首': ['くび', 2, 'support', 'eye', 'くびをねらう'], '秋': ['あき', 2, 'weather', 'wind', 'あきかぜ'],
  '週': ['しゅう', 2, 'support', 'power', 'いっしゅうのちから'], '春': ['はる', 2, 'nature', 'tree', 'はるのめぶき'], '書': ['かく', 2, 'support', 'eye', 'かきしるす'],
  '少': ['すこし', 2, 'support', 'shrink', 'すこしちいさく'], '場': ['ば', 2, 'location', 'field', 'ばしょのちから'], '色': ['いろ', 2, 'support', 'grow', 'いろのちから'],
  '食': ['たべる', 2, 'support', 'heal', 'ごはんでかいふく'], '心': ['こころ', 2, 'support', 'power', 'こころのちから'], '新': ['あたらしい', 2, 'support', 'heal', 'あたらしいちから'],
  '親': ['おや', 2, 'support', 'heal', 'おやのやさしさ'], '図': ['ず', 2, 'support', 'eye', 'ちずをみる'], '数': ['かず', 2, 'weapon', 'beam', 'かずのビーム'],
  '西': ['にし', 2, 'weather', 'sun', 'にしのゆうひ'], '声': ['こえ', 2, 'support', 'roar', 'おおごえ'], '切': ['きる', 2, 'weapon', 'sword', 'きりさく'],
  '船': ['ふね', 2, 'water', 'stream', 'ふねのなみ'], '線': ['せん', 2, 'weapon', 'beam', 'いっせん'], '前': ['まえ', 2, 'movement', 'walk', 'まえへすすむ'],
  '組': ['くみ', 2, 'support', 'ally', 'くみのなかま'], '多': ['おおい', 2, 'weapon', 'beam', 'たくさんビーム'], '太': ['ふとい', 2, 'support', 'grow', 'ふとくなる'],
  '体': ['からだ', 2, 'support', 'heal', 'からだのかいふく'], '台': ['だい', 2, 'location', 'mountain', 'たかだい'], '地': ['ち', 2, 'location', 'field', 'だいちのちから'],
  '池': ['いけ', 2, 'water', 'water', 'いけのみず'], '知': ['しる', 2, 'support', 'eye', 'しるちから'], '茶': ['ちゃ', 2, 'water', 'stream', 'おちゃのながれ'],
  '昼': ['ひる', 2, 'weather', 'sun', 'まひるのたいよう'], '長': ['ながい', 2, 'weapon', 'beam', 'ながいビーム'], '朝': ['あさ', 2, 'weather', 'sunny', 'あさひ'],
  '直': ['なおす', 2, 'support', 'heal', 'なおす'], '通': ['とおる', 2, 'location', 'road', 'とおりみち'], '弟': ['おとうと', 2, 'support', 'ally', 'おとうとのなかま'],
  '店': ['みせ', 2, 'location', 'field', 'みせのまもり'], '点': ['てん', 2, 'weapon', 'arrow', 'いってん'], '冬': ['ふゆ', 2, 'weather', 'snow', 'ふゆのさむさ'],
  '当': ['あたる', 2, 'weapon', 'arrow', 'あてる'], '東': ['ひがし', 2, 'weather', 'sunny', 'ひがしのあさひ'], '答': ['こたえ', 2, 'weapon', 'light', 'こたえのひかり'],
  '頭': ['あたま', 2, 'support', 'eye', 'あたまをねらう'], '同': ['おなじ', 2, 'support', 'ally', 'おなじなかま'], '読': ['よむ', 2, 'support', 'eye', 'よみとる'],
  '内': ['うち', 2, 'support', 'ally', 'うちのなかま'], '南': ['みなみ', 2, 'fire', 'fire', 'みなみのあつさ'], '肉': ['にく', 2, 'animal', 'cow', 'にくのちから'],
  '売': ['うる', 2, 'object', 'stone', 'うりもの'], '買': ['かう', 2, 'object', 'stone', 'かいもの'], '麦': ['むぎ', 2, 'nature', 'bamboo', 'むぎのほ'],
  '半': ['はん', 2, 'weapon', 'sword', 'はんぶんぎり'], '番': ['ばん', 2, 'support', 'eye', 'ばんをする'], '父': ['ちち', 2, 'support', 'power', 'おとうさんのちから'],
  '分': ['わける', 2, 'weapon', 'sword', 'わけるいちげき'], '聞': ['きく', 2, 'support', 'eye', 'ききとる'], '米': ['こめ', 2, 'nature', 'tree', 'おこめのめぐみ'],
  '母': ['はは', 2, 'support', 'heal', 'おかあさんのやさしさ'], '方': ['かた', 2, 'movement', 'walk', 'ほうこうをきめる'], '北': ['きた', 2, 'weather', 'snow', 'きたのふゆ'],
  '毎': ['まい', 2, 'support', 'power', 'まいにちのちから'], '妹': ['いもうと', 2, 'support', 'ally', 'いもうとのなかま'], '万': ['まん', 2, 'weapon', 'light', 'まんのひかり'],
  '明': ['あかるい', 2, 'weapon', 'light', 'あかるいひかり'], '鳴': ['なく', 2, 'support', 'roar', 'なきごえ'], '毛': ['け', 2, 'animal', 'dog', 'けのちから'],
  '門': ['もん', 2, 'location', 'field', 'もんのまもり'], '夜': ['よる', 2, 'weather', 'moon', 'よるのつき'], '野': ['の', 2, 'location', 'field', 'のはら'],
  '友': ['とも', 2, 'support', 'ally', 'ともだちのなかま'], '用': ['よう', 2, 'support', 'power', 'ようい'], '曜': ['よう', 2, 'weather', 'star', 'ようびのほし'],
  '来': ['くる', 2, 'movement', 'run', 'やってくる'], '里': ['さと', 2, 'location', 'road', 'さとのみち'], '理': ['り', 2, 'support', 'eye', 'りかいのめ'],
  '話': ['はなす', 2, 'support', 'roar', 'はなしのちから']
};
// 既存エントリと重複するキー（undefined にしたもの）を除去
Object.keys(KANJI_META_EXTRA).forEach(function (k) { if (KANJI_META_EXTRA[k] === undefined || KANJI_META[k]) delete KANJI_META_EXTRA[k]; });

if (typeof module !== 'undefined' && module.exports) module.exports = Object.assign({}, KANJI_META, KANJI_META_EXTRA);
