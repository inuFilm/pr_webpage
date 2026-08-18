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
    "slug": "sidefx-animate-kinefx-01-basics",
    "title": "Houdini 22 KineFX アニメーション 1 — リグをノードとして扱う",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part I の日本語メモです。Apex Add Character と Scene Animate だけで始められる手軽さ、config controls での IK/FK 切替、H22 で統合された選択セットパネル、Animation Catalog について。"
  },
  {
    "slug": "sidefx-animate-kinefx-02-ragdoll-shotsculpt",
    "title": "Houdini 22 KineFX アニメーション 2 — Ragdoll で引きずり出して Shot Sculpt で盛る",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part I の日本語メモです。Ragdoll を焼く前に必要な Texas switch、locator と tether constraint、Shot Sculpt の World Space 設定について。"
  },
  {
    "slug": "sidefx-animate-kinefx-03-set-driven-key",
    "title": "Houdini 22 KineFX アニメーション 3 — Set Driven Key でびっくり箱の仕掛けを作る",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part I の日本語メモです。APEX の Set Driven Key がアニメーション全体を駆動する仕組み、APEX Rig Pose でのレイヤー作成、fit min/max での範囲調整について。"
  },
  {
    "slug": "sidefx-animate-kinefx-04-secondary-motion-mixer",
    "title": "Houdini 22 KineFX アニメーション 4 — Secondary Motion と Motion Mixer で仕上げる",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part I の日本語メモです。spring を translate と rotation で使い分ける、二重適用の罠、New Clip と Motion Mixer、Apex Scene 出力への切り替えについて。"
  },
  {
    "slug": "sidefx-animate-kinefx-05-props-and-quick-rig",
    "title": "Houdini 22 KineFX アニメーション 5 — 小物を Prop として足す／3点の線から IK リグを作る",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part I の Q&A から。Apex Scene Add Prop での小物の追加と child→parent の拘束、Line から Rig Doctor と AutoRig Component だけで IK リグを組む最短手順について。"
  },
  {
    "slug": "sidefx-animate-kinefx-06-mocap-retarget",
    "title": "Houdini 22 KineFX アニメーション 6 — モーキャプを自作キャラにリターゲットする",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part II の日本語メモです。Biped Setup のマッピングテンプレート、青いジョイントだけ押せば済む手動マッピング、キャラクター系ノード共通の3入力3出力の規則について。"
  },
  {
    "slug": "sidefx-animate-kinefx-07-motion-mixer-export",
    "title": "Houdini 22 KineFX アニメーション 7 — Motion Mixer でモーキャプを合成して書き出す",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part II の日本語メモです。Match Joint での足の接地、weight を音量のように扱うブレンド、Motion Mixer 内での直接アニメーション、FBX 書き出し時のアンパックの落とし穴について。"
  },
  {
    "slug": "sidefx-animate-kinefx-08-snake-procedural",
    "title": "Houdini 22 KineFX アニメーション 8 — Path Deform で蛇に木を登らせる",
    "category": "houdini-animation",
    "date": "2026-08-18",
    "description": "SideFX 公式ウェビナー Animate in KineFX Part II 最終回の日本語メモです。Bezier Curve のスナップ、Path Deform で骨格をカーブに乗せる方法、Animation from Skeleton でプロシージャルな動きをレイヤーとして扱う考え方について。"
  },
  {
    "slug": "sidefx-charcreate-00-intro",
    "title": "Houdini キャラクター制作コース（SideFX 公式）— 全体の構成とリグファーストの考え方",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character（全10本・3時間06分）の日本語学習メモです。第0回は全体の構成とリグファーストの考え方、および全9回へのリンク。"
  },
  {
    "slug": "sidefx-charcreate-01-prerig-modelling",
    "title": "Houdini キャラクター制作 1 — プリリグを先に作ってモデルを駆動する",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第1回の日本語メモです。「点はジョイントである」という KineFX の原則と、Rig Doctor でスケルトンを作ってモデルを生やす手順について。"
  },
  {
    "slug": "sidefx-charcreate-02-procedural-modeling",
    "title": "Houdini キャラクター制作 2 — VDB と Quad Remesher でプロシージャルにモデリングする",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第2回の日本語メモです。指の線から爪を生やす VDB Combine の使い方、Convert VDB の Adaptivity、Point Deform でスカルプトの差分を伝える方法について。"
  },
  {
    "slug": "sidefx-charcreate-03-cloth-modeling",
    "title": "Houdini キャラクター制作 3 — 体から服を切り出してパネルとシワを作る",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第3回の日本語メモです。Labs Box Clip での服の切り出し、UV シームからのパネル分割、Ray でのポケット貼り付け、Vellum ブラシでのシワ作りについて。"
  },
  {
    "slug": "sidefx-charcreate-04-blendshapes",
    "title": "Houdini キャラクター制作 4 — 片側だけ彫れば済むプロシージャルなブレンドシェイプ",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第4回の日本語メモです。ブレンドシェイプの命名規則、ミラー用の VEX、マスクでの範囲限定、顔から抽出したカーブで作るスライダーについて。"
  },
  {
    "slug": "sidefx-charcreate-05-hair-groom",
    "title": "Houdini キャラクター制作 5 — カーブとマスクでヒゲと髪をグルーミングする",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第5回の日本語メモです。Volume Velocity from Curves と Guide Advect でヘアの流れを作る方法、忘れると変形に追従しない Guide Skin Attribute Lookup について。"
  },
  {
    "slug": "sidefx-charcreate-06-kinefx-skinning",
    "title": "Houdini キャラクター制作 6 — ウェイトを塗らずに済ませる KineFX スキニング",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第6回の日本語メモです。Attribute Composite でスキニングをレイヤーとして重ねる方法と、プロキシメッシュ経由の転送について。"
  },
  {
    "slug": "sidefx-charcreate-07-apex-control-rig",
    "title": "Houdini キャラクター制作 7 — APEX AutoRig Builder でコントロールリグを組む",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第7回の日本語メモです。APEX が要求する Pack Folder の構成、groom の間引きと width での補い方、AutoRig Builder のコンポーネントについて。"
  },
  {
    "slug": "sidefx-charcreate-08-karma-lighting",
    "title": "Houdini キャラクター制作 8 — Solaris と Karma でライティングしてレンダリングする",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第8回の日本語メモです。MaterialX Geometry Color で Cd を拾うシンプルなマテリアル、Material Linker での割り当て、レイヤー分けレンダリングについて。"
  },
  {
    "slug": "sidefx-charcreate-09-unreal-integration",
    "title": "Houdini キャラクター制作 9 — APEX から Unreal Engine へ書き出す",
    "category": "houdini-character",
    "date": "2026-08-18",
    "description": "SideFX 公式チュートリアル Create a Procedural Character 第9回・最終回の日本語メモです。Configure Clip Anim による FBX 出力、name からのマテリアル一括割り当て、groom_group_id での毛束の分離について。"
  },
  {
    "slug": "article-20260708-2345",
    "title": "HoudiniTEST",
    "category": "houdini",
    "date": "2026-07-08",
    "description": "Houdinimawarinohanashi"
  },
  {
    "slug": "site-structure",
    "title": "このサイトの構成メモ",
    "category": "サイト運用",
    "date": "2026-07-08",
    "description": "makeinufilm.com の構成と、この技術メモセクションの仕組み。"
  },
  {
    "slug": "how-to-add-article",
    "title": "記事の追加方法",
    "category": "サイト運用",
    "date": "2026-07-08",
    "description": "この技術メモに新しい記事を追加する手順。"
  }
];
