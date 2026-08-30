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
    "slug": "article-20260830-1810",
    "title": "始端と終端を繋げる際のsweepのエラー",
    "category": "houdini-tips",
    "date": "2026-08-30",
    "description": "sweepと始端終端の繋ぎ方について"
  },
  {
    "slug": "tools",
    "title": "ツールまとめ — ブラウザでそのまま使える自作ツール",
    "category": "ツール",
    "date": "2026-08-29",
    "description": "公開している自作 Web ツールの一覧。VRM モデルにポーズを付けて作画資料にする VRM Pose Ref など。すべて端末内で動作し、モデルやデータは外部に送信されません。"
  },
  {
    "slug": "sidefx-foundations-01-soccerball",
    "title": "Houdini 22 入門 1 — 上流を差し替えてサッカーボールを作る",
    "category": "houdini",
    "date": "2026-08-24",
    "description": "Set Project から始めて、箱を押し出して細分化し、最後にその箱を Platonic Solids に差し替えます。下流を作り直さずに形だけ入れ替えられるという、Houdini のいちばん基本的な性質を確かめる回です。"
  },
  {
    "slug": "nodes-vex",
    "title": "VEX — よく使う関数と、行列まわりの実例",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "wrangle 系ノードの使い分けから、アトリビュートの読み書き・数学・乱数・ベクトル・行列と回転まで。よく使う VEX 関数を用途別にまとめ、行列操作は動くサンプルを添えました。関数名は Houdini 22.0.368 の同梱ヘルプと照合済みです。"
  },
  {
    "slug": "nodes-pyro",
    "title": "Pyro のノード — どれが何をするのか",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "Pyro 関連のノードを「発生源 / 焼く / 解く / 見た目 / ボリューム操作」の5段に分けて、1ノードずつ用途と要のパラメータをまとめました。名前と既定値は Houdini 22.0.368 の実機で照合しています。"
  },
  {
    "slug": "nodes-flip",
    "title": "FLIP のノード — 3本の線を通す形を覚える",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "FLIP と白泡のノードを「器 / 解く / 面にする / 白泡 / 軽くする」に分けて、1ノードずつ用途と要のパラメータをまとめました。配線が3本1組になっている理由と、止めた境界が水を消す話も含みます。"
  },
  {
    "slug": "nodes-mpm",
    "title": "MPM のノード — 10個しかないので全部",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "MPM（物質点法）のノードは SOP 8個 + DOP 2個で全部です。器・材料・コリジョン・ソルバ・出口の並びと、1ノードずつの用途・要のパラメータをまとめました。"
  },
  {
    "slug": "nodes-rbd",
    "title": "RBD のノード — 割る・束ねる・繋ぐ・解く",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "破壊まわりのノードを「割る / パックする / 拘束を作る / 解く / 仕上げ」に分けて、1ノードずつ用途と要のパラメータをまとめました。パックし忘れると重力でも落ちない話、assemble が glue を殺す話も含みます。"
  },
  {
    "slug": "nodes-cfx",
    "title": "CFX のノード — Vellum・毛・群衆・筋肉",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "キャラクターFX まわりのノードを Vellum / ヘア / 群衆 / 筋肉・皮膚 の4系統に分けて、1ノードずつ用途と要のパラメータをまとめました。Vellum が「拘束を作ってから解く」形である理由も含みます。"
  },
  {
    "slug": "nodes-apex",
    "title": "APEX のノード — 名前空間で地図を作る",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "APEX の 598 ノードを名前空間ごとに整理し、リグを組むときに実際に触るものは1ノードずつ、配列・辞書・文字列などの機械的な族はまとめ表にしました。ノード名は Houdini 22.0.368 の同梱ヘルプと照合済みです。"
  },
  {
    "slug": "nodes-mtlx",
    "title": "MaterialX のノード — 型が厳密なシェーダー",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "MaterialX のノードをサーフェス・BSDF・テクスチャ・座標・ノイズ・色・数学・合成に分けて、1ノードずつ用途をまとめました。signature で型が変わる仕組みと、結線が黙って外れる落とし穴も実測を交えて説明します。"
  },
  {
    "slug": "nodes-cop",
    "title": "COP のノード — テクスチャを作る道具",
    "category": "houdini-nodes",
    "date": "2026-08-19",
    "description": "Copernicus のノードを「入口・生成・色・フィルタ・変形・合成・PBR・ジオメトリ連携」に分けて、1ノードずつ用途と要のパラメータをまとめました。タイリングと法線の向き、書き出しの色空間の話も含みます。"
  },
  {
    "slug": "solaris-00-map",
    "title": "Solaris と Karma の地図 — 何が複雑なのかを先に整理する",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "Solaris が難しく感じる理由を USD / LOPs / Karma の3層に切り分けて、まず1枚レンダリングするまでの最小構成をまとめます。ノード名と既定値は Houdini 22.0.368 の実機で確認しました。"
  },
  {
    "slug": "solaris-01-stage",
    "title": "ステージに載せる — SOP から LOP への4つの入口",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "SOP Import / SOP Create / SOP Modify / Scene Import をノード単位で解説します。USD の階層が SOP 側のアトリビュートで決まること、効きそうで効かないパラメータを実機で検証しました。"
  },
  {
    "slug": "solaris-02-layer",
    "title": "レイヤーと Layer Break — 編集はどこに書かれるのか",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "USD には「消す」が無いという話から、LOP の編集がどのレイヤーに書かれるのかを整理します。Layer Break の前後でレイヤーの中身がどう変わるかを実機で書き出して確認しました。"
  },
  {
    "slug": "solaris-03-scenegraph",
    "title": "シーングラフを読む・選ぶ — プリムパターンの5段階",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "Solaris のほぼ全ノードで使う「どのプリムに効かせるか」の書き方を5段階で整理します。13種類のパターンを実機で評価して、当たるもの・当たらないものを確認しました。"
  },
  {
    "slug": "solaris-04-reference",
    "title": "リファレンスとバリアント — アセットを組み合わせる",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "SubLayer と Reference の違い、そして1つのアセットに複数の姿を持たせるバリアントを扱います。実機で棚に2つ並べ、上流を1か所いじると両方が変わることを確認しました。"
  },
  {
    "slug": "solaris-05-material",
    "title": "マテリアル — MaterialX と Material Library",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "USD のマテリアルが Material プリムと Shader プリムの2階建てになっている話から、MaterialX / Principled / USD Preview Surface の使い分けまで。実機で1つ作り、プリムパターンで3つに割り当てました。"
  },
  {
    "slug": "solaris-06-light-camera",
    "title": "ライトとカメラ — 型の対応と、数字が変わる話",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "ライトのノードが USD 側でどの型になるかを実測し、Intensity と Exposure の関係を整理します。カメラの Focal Length が 50 と 0.5 で食い違う理由も確認しました。"
  },
  {
    "slug": "solaris-07-karma",
    "title": "Karma を回す — 4つの詰め合わせを分解する",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "karma LOP に入っている Render Var / Render Product / Render Settings / USD Render ROP の役割を分けて整理します。標準 AOV セットの中身も実機で確認しました。"
  },
  {
    "slug": "solaris-08-sampling",
    "title": "サンプリングとノイズ — どのノイズにどれが効くのか",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "Karma のサンプルが Primary と Secondary の2階建てになっていること、Quality が本数ではなく倍率であることを整理し、症状別にどのパラメータを触るかの早見表を作りました。"
  },
  {
    "slug": "solaris-09-output",
    "title": "書き出しとワークフローへの組み込み",
    "category": "houdini-solaris",
    "date": "2026-08-19",
    "description": "USD ROP の Save Style 4種類で出力ファイルがどう変わるかを整理し、husk でのバッチレンダリングまで。既存のワークフローにどこから Solaris を差し込むかを3段階で提案します。シリーズ最終回。"
  },
  {
    "slug": "rtvfx-01-getting-started",
    "title": "リアルタイムVFXの学び始め — Real Time VFX の定番スレッドから",
    "category": "realtime-vfx",
    "date": "2026-08-19",
    "description": "リアルタイムVFXを学び始めるための道案内です。コミュニティフォーラム Real Time VFX の定番スレッドを読み、何をどの順番で押さえるかと、2016〜2018年の情報をいま読むときの注意点をまとめました。"
  },
  {
    "slug": "rtvfx-02-textures-flipbooks",
    "title": "リアルタイムVFX 2 — テクスチャとフリップブック",
    "category": "realtime-vfx",
    "date": "2026-08-19",
    "description": "Real Time VFX の定番スレッドから、VFX のテクスチャ制作とフリップブックの基礎をまとめました。GDC 2022 の講演と公開資料、チャンネルパッキングで RGB 192コマ・RGBA 256コマを詰める手法について。"
  },
  {
    "slug": "rtvfx-03-timing-principles",
    "title": "リアルタイムVFX 3 — タイミングと演出の原則",
    "category": "realtime-vfx",
    "date": "2026-08-19",
    "description": "Real Time VFX で実際に交わされたタイミングの批評を追いながら、何が判断されているのかをまとめました。要素を足すより寿命を延ばす、口で音を出して間隔を測る、といった具体的な手立てについて。"
  },
  {
    "slug": "rtvfx-04-reading-old-posts",
    "title": "リアルタイムVFX 4 — 古い記事を読むための読み替えガイド",
    "category": "realtime-vfx",
    "date": "2026-08-19",
    "description": "Real Time VFX の定番スレッドは 2016〜2018年のものが多く、Cascade 前提の記述が残っています。何が古びて何が古びないかを整理し、古い記事から意図を読み取って現行ドキュメントで裏を取る読み方をまとめました。"
  },
  {
    "slug": "simon-axe-01-curve",
    "title": "Houdini で斧を作る 1 — 参照画像とカーブで輪郭を取る",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe modeling チュートリアルの日本語メモです。Reference Images ノード、Curve のプリセットと描き方、Convert / Resample / Facet で点の数を整える手順について。"
  },
  {
    "slug": "simon-axe-02-main-shape",
    "title": "Houdini で斧を作る 2 — 刃のメインシェイプを立ち上げる",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe modeling チュートリアルの日本語メモです。Group Create の Bounding Box で壊れないエッジ選択を作る方法、Boolean での引き算、Duplicate での穴の展開について。"
  },
  {
    "slug": "simon-axe-03-plates",
    "title": "Houdini で斧を作る 3 — ざっくり描いて引き算で揃える",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe modeling チュートリアルの日本語メモです。完璧にトレースせず Boolean で輪郭を揃える発想、Match Size でプレートを密着させる方法、法線でのグループ作成について。"
  },
  {
    "slug": "simon-axe-04-handle",
    "title": "Houdini で斧を作る 4 — ハンドルの稜線とグリップ",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe modeling チュートリアルの日本語メモです。Cube を45度回して Boolean Intersection で断面の稜線を作る方法、Collision and Limits 付きのベベル、グリップのくぼみについて。"
  },
  {
    "slug": "simon-axe-05-bolts-highpoly",
    "title": "Houdini で斧を作る 5 — ボルトの仕組みとハイポリ／ローポリ",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe modeling チュートリアルの日本語メモです。Copy to Points でのボルト配置と仕組みの使い回し、ID アトリビュートでのマスク生成、Remesh to Grid と PolyReduce について。"
  },
  {
    "slug": "simon-axe-06-copernicus-setup",
    "title": "Houdini で斧を作る 6 — Copernicus でテクスチャリングを始める",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe Texturing チュートリアルの日本語メモです。Copernicus ネットワークの初期設定、bake セットアップで付いてくる low/high/cage、Bake Geometry Textures が出力できる12種類のマップについて。"
  },
  {
    "slug": "simon-axe-07-baking",
    "title": "Houdini で斧を作る 7 — ケージを作ってマップをベイクする",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe Texturing チュートリアルの日本語メモです。Normal と Peak で作るケージ、Edge マップの設定、Cd をカスタムアトリビュートとして焼く方法、UV の縁を消す処理について。"
  },
  {
    "slug": "simon-axe-08-material-hda",
    "title": "Houdini で斧を作る 8 — マテリアル HDA と Cable 型",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe Texturing チュートリアルの日本語メモです。色からマスクを作る手順、AO / Curvature / Pattern を入力に持つマテリアル HDA、複数テクスチャを束ねる Cable 型について。"
  },
  {
    "slug": "simon-axe-09-roughness-hda",
    "title": "Houdini で斧を作る 9 — ラフネスと HDA のインターフェース",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe Texturing チュートリアルの日本語メモです。Screen と Multiply でのラフネス作り、HDA のパラメータをフォルダで整理する方法、Match Current Definition でのツール確定について。"
  },
  {
    "slug": "simon-axe-10-blending-export",
    "title": "Houdini で斧を作る 10 — マテリアルを重ねて書き出す",
    "category": "houdini-modeling",
    "date": "2026-08-18",
    "description": "Simon Houdini さんの Axe Texturing チュートリアル最終回の日本語メモです。マスクの流用によるメタルネス、Reference と Delete Channel、Triplanar が動かない原因、ROP Image Output での一括書き出しについて。"
  },
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
  }
];
