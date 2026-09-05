# 漢字サモナーズ — 漢字召喚RPG（MVP）

小学1〜2年生向け。**漢字を正しい書き順で書くこと自体がバトル操作**になる Web アプリです。
一画ごとに魔力がたまり、漢字が完成すると意味に対応した魔法・召喚が発動します。

## 起動

ビルド不要。`index.html` をブラウザで開くだけで動きます（file:// でも可）。
タブレットで使うときはローカルサーバーを立てると便利です。

```bash
cd kanji-rpg
python -m http.server 8000
# → http://<PCのIP>:8000/ をタブレットで開く
```

横画面推奨。マウス / 指 / ペン（Pointer Events）に対応。

## 構成

```
index.html
css/style.css
js/
  data/
    kanji-meta.js      漢字のメタデータ（読み・学年・カテゴリ・能力・技名・指示文）— 手で編集する
    kanji-strokes.js   書き順テンプレート（KanjiVG から自動生成）— 手で編集しない
    svgpath.js         SVG path → 折れ線 変換（KanjiVG 取り込み用）
    stages.js          ステージ/ウェーブ/イベント定義、状況文
    combos.js          合体魔法（熟語）データ（MVP では検知のみ）
  core/
    geometry.js        リサンプリング・簡略化・折れ検出・ストロークデータ生成
    recognizer.js      書き順判定（始点/終点/方向/軌跡/折れ、寛容な閾値）
    scheduler.js       復習出題（苦手・最近覚えた・久しぶり）とヒントレベル決定
    storage.js         セーブデータ（localStorage）
    kanji-db.js        メタ + ストローク + カスタム登録 の統合
    events.js          イベントバス（効果音・読み上げ用フック）
    sfx.js             WebAudio 簡易効果音 / SpeechSynthesis 読み上げ
  ui/
    input-pad.js       漢字入力エリア（判定・ヒント・演出）
    battle-fx.js       バトル演出（敵・魔法・召喚・パーティクル）
  game/
    screens.js         画面遷移・地図・図鑑・オーバーレイ
    battle.js          バトル進行（中心ループ）
  dev/devmode.js       開発者モード（書き順テンプレート登録）
tools/build-kanji.js   KanjiVG から kanji-strokes.js を生成する Node スクリプト
```

## 書き順データ

書き順は推測で作らず、**KanjiVG**（http://kanjivg.tagaini.net / CC BY-SA 3.0）の
ストロークデータから生成しています。生成済みの 44 字は `js/data/kanji-strokes.js` にあります。

### 漢字を追加する（配当漢字すべてへの拡張）

1. `js/data/kanji-meta.js` に漢字を追加（読み・学年・カテゴリ・能力・技名・指示文）
2. ストロークを生成:
   ```bash
   node tools/build-kanji.js
   ```
   meta に無い漢字を一時的に生成したいときは `node tools/build-kanji.js 花 草` のように引数で指定。
3. `js/data/stages.js` のイベントに漢字を配置

### 開発者モード（ブラウザ内で登録）

タイトル → 開発者モード。

- 漢字を選ぶ（または新規入力）→ 1画目を正しく描く → **この画を登録** → 2画目 … → **保存**
- 始点・終点・方向・軌跡・折れ位置は登録時に自動取得
- **判定テスト** で実際の判定結果（理由・数値）を確認
- **JSON書き出し / 読み込み**、**KanjiVGから取り込み**（ネット接続が必要）
- カスタム登録は localStorage に保存され、同じ漢字の既存データを上書きしてゲームに反映される

## 判定仕様（recognizer.js）

字形の完璧さではなく書き順を判定します。期待する画のテンプレートと比較して、

- 始点のずれ（≦0.20）／ 終点のずれ（≦0.24）
- 24点リサンプリング後の平均距離（≦0.17）
- 全体の進行方向（cos ≧ 0.35）
- 長さ比（0.35〜3.0）
- 折れ点を通過しているか（≦0.20）

を満たせば正解。閾値は `Recognizer.TOL` で調整できます。
別の画を先に書いた場合は始点・軌跡が一致しないので不正解になります。

## ヒントレベルと習熟度

- Level 1: 全画表示 + 画数番号 + 動くガイド
- Level 2: 次の画だけ薄く表示
- Level 3: 書き始めの位置だけ
- Level 4: ノーヒント

初見の漢字は Level 1、1年生の既習漢字は Level 2 から開始。
初回にノーミスなら Level 3 へ、2回以上ミスなら Level 1 へ自動調整。
その後は 2 回連続ノーミスで 1 段階上がり、2 回以上ミスで 1 段階下がります。
画単位の失敗記録から苦手な画だけヒントを強めます（本人には表示しません）。

同じ漢字の中でミスした場合も、1回目→始点が光る、2回目→その画が薄く表示、3回目→フルガイド と段階的に補助します。

## むずかしさ（地図画面・ポーズ画面で切替）

| モード | 書き順ガイド | 漢字の表示 | ミス時の補助 | ダメージ倍率 |
|---|---|---|---|---|
| ふつう | 習熟度に応じて Level 1〜4 | 表示 | 1回→始点 / 2回→その画 / 3回→フルガイド | ×1.0 |
| 上級 | なし | 表示 | 3回ミスで始点のみ | ×1.2 |
| 超上級 | なし | **隠す**（「？」と読みだけ。指示文中の漢字も読みに置換） | 3回ミスで始点のみ | ×1.5 |

超上級でも、まだ取得していない漢字は形を表示します（初見で当てさせない）。
ヒントボタンは全モードで使え、超上級では隠した漢字も 3.5 秒だけ見せます。
チュートリアルは常に「ふつう」です。設定は `settings.difficulty` に保存されます。

## 復習

ステージの `{ review: 'grade1' | 'grade2' | 'any' }` イベントは、スケジューラが
「間違いが多い」「最近覚えた」「しばらく出ていない」漢字を優先して選びます。
ボスは全イベントが review スロットです。

## セーブデータ（localStorage）

`kanjiRPG.save.v1`: クリアステージ、取得漢字、漢字ごとの習熟度・使用回数・最終練習日時、画ごとの正解/失敗数、設定。
`kanjiRPG.customKanji.v1`: 開発者モードで登録した漢字。

開発者モードの「セーブデータ初期化」で消せます。

## イベント（効果音・読み上げ差し替え用）

`Events.on(name, fn)` で購読。`stroke:ok` `stroke:ng` `kanji:complete` `magic:cast` `enemy:hit`
`enemy:defeat` `player:hit` `kanji:new` `stage:clear` `ui:click` `combo:available`。
MVP では `sfx.js` が WebAudio のシンセ音と SpeechSynthesis で対応しています。

## 今後の拡張ポイント

- 配当漢字の全追加: meta 追加 + `build-kanji.js`
- 合体魔法: `combos.js` に定義済み。`battle.js` の `combo:available` で発動処理を追加
- ステージ/ボス追加: `stages.js`
- 効果音/BGM: `sfx.js` を音源再生に差し替え
- 複数ユーザー/保護者用履歴: `storage.js` のキーをユーザー別に

## クレジット

書き順データ: KanjiVG — Copyright (C) Ulrich Apel, CC BY-SA 3.0 (http://kanjivg.tagaini.net)
