#!/usr/bin/env node
/* bump-version.js — index.html の <script src="...?v=XXX"> / <link href="...?v=XXX"> のバージョンを更新する
 *
 * GitHub Pages はファイルに Cache-Control: max-age=600 を付け、ブラウザも JS/CSS を長くキャッシュするため、
 * index.html だけ更新されて古い JS が読まれることがある。URL のクエリを変えれば必ず再取得される。
 *
 * 使い方: node tools/bump-version.js            → 日時ベースの版（例 20260905-1730）
 *         node tools/bump-version.js 1.2.0      → 任意の文字列
 * デプロイ（コミット）前に実行する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const ver = process.argv[2] || `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

let html = fs.readFileSync(file, 'utf8');
let count = 0;
// 既存の ?v=... を置換、無ければ付与（ローカル相対パスの js/ css/ のみ対象）
html = html.replace(/((?:src|href)="(?:js|css)\/[^"?]+)(?:\?v=[^"]*)?"/g, (m, base) => { count++; return `${base}?v=${ver}"`; });
// 画面表示用のバージョン（タイトル画面）
html = html.replace(/(<span id="app-version">)[^<]*(<\/span>)/, `$1v${ver}$2`);
fs.writeFileSync(file, html, 'utf8');
console.log(`version ${ver} → ${count} tags updated in index.html`);
