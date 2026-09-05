#!/usr/bin/env node
/* build-kanji.js — KanjiVG から書き順ストロークデータを生成する
 *
 * 使い方:
 *   node tools/build-kanji.js            # kanji-meta.js にある全漢字を生成
 *   node tools/build-kanji.js 花 草 花   # 追加で指定した漢字も生成（meta 未登録でも可）
 *
 * 出力: js/data/kanji-strokes.js
 *
 * データ元: KanjiVG (https://kanjivg.tagaini.net) — CC BY-SA 3.0
 * SVG は tools/kanjivg-cache/ にキャッシュされます。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Geometry = require('../js/core/geometry.js');
const SvgPath = require('../js/data/svgpath.js');
const META = require('../js/data/kanji-meta.js');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'kanjivg-cache');
const OUT = path.join(ROOT, 'js', 'data', 'kanji-strokes.js');
const VIEWBOX = 109; // KanjiVG は 109x109
const SAMPLES = 24;

if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });

function codeOf(k) { return k.codePointAt(0).toString(16).padStart(5, '0'); }

async function fetchSvg(k) {
  const file = path.join(CACHE, codeOf(k) + '.svg');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${codeOf(k)}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${k} (${url})`);
  const text = await res.text();
  fs.writeFileSync(file, text, 'utf8');
  return text;
}

function convert(svgText) {
  const ds = SvgPath.extractKanjiVGStrokes(svgText);
  return ds.map(d => {
    const raw = SvgPath.pathToPoints(d, 16).map(p => [p[0] / VIEWBOX, p[1] / VIEWBOX]);
    return Geometry.buildStrokeData(raw, SAMPLES);
  });
}

async function main() {
  const extra = process.argv.slice(2);
  const list = Array.from(new Set(Object.keys(META).concat(extra)));
  // 既存の出力を読み、失敗時に保持できるようにする
  let existing = {};
  if (fs.existsSync(OUT)) {
    try {
      const m = {};
      const src = fs.readFileSync(OUT, 'utf8');
      const fn = new Function('module', src + '\nreturn KANJI_STROKES;');
      existing = fn(m) || {};
    } catch (e) { existing = {}; }
  }
  const out = Object.assign({}, existing);
  for (const k of list) {
    try {
      const svg = await fetchSvg(k);
      const strokes = convert(svg);
      if (!strokes.length) throw new Error('no strokes found');
      out[k] = { source: 'kanjivg', strokeCount: strokes.length, strokes };
      console.log(`OK  ${k}  ${strokes.length}画${META[k] ? '' : '  (meta 未登録)'}`);
    } catch (e) {
      console.error(`NG  ${k}  ${e.message}`);
    }
  }
  const header =
    '/* kanji-strokes.js — 自動生成ファイル（tools/build-kanji.js）\n' +
    ' * 書き順データは KanjiVG (http://kanjivg.tagaini.net) を元に生成。\n' +
    ' * KanjiVG: Copyright (C) Ulrich Apel, CC BY-SA 3.0\n' +
    ' * 座標は 0〜1 の正規化座標。各画: start / end / direction / length / corners / path\n' +
    ' * 手で編集せず、開発者モードまたはビルドツールで更新してください。\n */\n';
  const body = 'var KANJI_STROKES = ' + JSON.stringify(out) + ';\n' +
    "if (typeof module !== 'undefined' && module.exports) module.exports = KANJI_STROKES;\n";
  fs.writeFileSync(OUT, header + body, 'utf8');
  console.log(`\nwrote ${OUT}  (${Object.keys(out).length} kanji)`);
}

main().catch(e => { console.error(e); process.exit(1); });
