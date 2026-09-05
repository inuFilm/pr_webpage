/* combos.js — 合体魔法（熟語）データ
 * MVP では発動しない。バトル側は完成した漢字の履歴を見て 'combo:available' を発火するだけ。
 * 将来: 連続で書いた漢字がここに一致したら合体魔法を発動する。
 *
 *  kanji   : 続けて書く漢字の並び（順序あり）
 *  word    : 熟語
 *  reading : 読み
 *  category/ability : 演出
 *  power   : 倍率
 */
var COMBOS = [
  { kanji: ['火', '山'], word: '火山', reading: 'かざん', category: 'fire', ability: 'volcano', spell: 'かざんふんか', power: 2.5 },
  { kanji: ['雪', '山'], word: '雪山', reading: 'ゆきやま', category: 'weather', ability: 'snowmountain', spell: 'ゆきやまなだれ', power: 2.2 },
  { kanji: ['大', '雨'], word: '大雨', reading: 'おおあめ', category: 'weather', ability: 'heavyrain', spell: 'おおあめ', power: 2.0 },
  { kanji: ['海', '水'], word: '海水', reading: 'かいすい', category: 'water', ability: 'seawater', spell: 'かいすいのうず', power: 2.0 },
  { kanji: ['電', '光'], word: '電光', reading: 'でんこう', category: 'weather', ability: 'flash', spell: 'でんこうせっか', power: 2.4 },
  { kanji: ['風', '雨'], word: '風雨', reading: 'ふうう', category: 'weather', ability: 'storm', spell: 'あらし', power: 2.2 },
  { kanji: ['山', '道'], word: '山道', reading: 'やまみち', category: 'location', ability: 'mountainroad', spell: 'やまみちを ひらく', power: 1.8 },
  { kanji: ['人', '力'], word: '人力', reading: 'じんりき', category: 'support', ability: 'humanpower', spell: 'みんなのちから', power: 1.8 },
  { kanji: ['大', '人'], word: '大人', reading: 'おとな', category: 'support', ability: 'adult', spell: 'おとなのちから', power: 1.6 },
  { kanji: ['小', '刀'], word: '小刀', reading: 'こがたな', category: 'weapon', ability: 'knife', spell: 'こがたな', power: 1.5 },
  { kanji: ['弓', '矢'], word: '弓矢', reading: 'ゆみや', category: 'weapon', ability: 'bowarrow', spell: 'ゆみやのいちげき', power: 2.6 }
];

if (typeof module !== 'undefined' && module.exports) module.exports = COMBOS;
