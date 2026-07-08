// ============================================================
// 技術メモの記事データベース（このファイルが記事一覧の唯一の情報源）
//
// 新しい記事を公開する手順:
//   1. tech/articles/template.html をコピーして tech/articles/<slug>.html を作る
//   2. この配列の【先頭】にエントリを1件追加する（新しい記事ほど上）
//
// slug  : tech/articles/<slug>.html のファイル名部分（英数字とハイフンのみ）
// category : サイドバーの見出しになる。既存カテゴリ名と同じ文字列なら同じグループに入る
// date  : YYYY-MM-DD
// ============================================================
window.TECH_ARTICLES = [
  {
    slug: "site-structure",
    title: "このサイトの構成メモ",
    category: "サイト運用",
    date: "2026-07-08",
    description: "makeinufilm.com の構成と、この技術メモセクションの仕組み。"
  },
  {
    slug: "how-to-add-article",
    title: "記事の追加方法",
    category: "サイト運用",
    date: "2026-07-08",
    description: "この技術メモに新しい記事を追加する手順。"
  }
];
