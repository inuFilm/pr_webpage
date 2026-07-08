# makeinufilm.com (pr_webpage)

GitHub Pages で配信している個人サイト。main ブランチ直下がそのまま公開される（ビルド工程なし）。
カスタムドメインは `CNAME`（makeinufilm.com）。

## 構成

- `index.html` / `en.html` — トップページ（日本語 / 英語）。Bootstrap 3 + jQuery のシングルページ
- `tech/` — 技術メモセクション（サイドバー付き記事ページ。Bootstrap/jQuery 非依存）
- `css/` `js/` `fonts/` `img/` — トップページ用アセット
- `.nojekyll` — GitHub Pages の Jekyll 処理を無効化

## 技術メモの記事を追加する

1. `tech/articles/template.html` をコピーして `tech/articles/<slug>.html` を作り、本文を書く
2. `tech/articles.js` の `window.TECH_ARTICLES` 配列の先頭にエントリを1件追加する
3. main に push すると GitHub Pages が自動反映する

詳細手順はサイト上の記事「記事の追加方法」（`tech/articles/how-to-add-article.html`）を参照。

## ローカル確認

ブラウザで HTML ファイルを直接開くだけでよい（`file://` で全機能が動く設計）。
