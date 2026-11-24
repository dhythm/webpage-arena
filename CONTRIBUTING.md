# 作品を足すときの規約

新しい LP や制作（AI・ツール）を足すのは、リポジトリ直下にフォルダを 1 つ足すだけです。一覧・ビルド・スモークテストは各フォルダの `meta.json` から自動で追従します。規約は `npm run check` が検査します。

## フォルダ名

- 形は `<model の小文字>-<slug>` です（例：`claude-kakehashi`）。
- 同じお題を別の制作で作るときは、prefix だけ変えます（例：`grok-kakehashi`）。
- Grok で作った作品は必ず `grok-` で始めます。
- 既存のフォルダ名は変えません。

## 必須ファイル

- `index.html`
- `meta.json`
- `making.md`（`making` が `oneshot` か `refined` のときだけ。[作り方の残し方](#作り方の残し方)）

`index.html` があって `meta.json` が無いフォルダ、またはその逆は `npm run check` で失敗します。一覧から黙って漏れるのを防ぐためです。

## 自分のフォルダの外を触らない

- 新規作品の変更は、自分のフォルダの中だけにします。
- 画像・フォントなどの出典は `ASSETS.md` ではなく `<フォルダ>/README.md` に書きます。デザインの意図も同じ README に書きます。
- ルート `README.md` の作品表にも追記しません。

## meta.json

```json
{
  "id": "grok-kakehashi",
  "title": "KAKEHASHI",
  "tagline": "ページの一行目に置くコピー。",
  "type": "saas-lp",
  "model": "Grok",
  "tool": "Cursor",
  "promptPath": "prompts/saas-lp.md",
  "promptNotes": "お題のプロンプトをそのまま使用",
  "created": "2026-12-01",
  "thumbnail": "thumb.webp",
  "legacy": false,
  "externalOrigins": [],
  "making": "oneshot"
}
```

| フィールド | 必須 | 中身 |
| --- | --- | --- |
| `id` | 必須 | フォルダ名と同じ。`model` の小文字＋`-` で始まる |
| `title` | 必須 | 作品名 |
| `tagline` | 必須 | 一行のコピー |
| `type` | 必須 | [`site-types.json`](site-types.json) にある種別 |
| `model` | 必須 | 制作。ギャラリーの「制作」欄に出る値。モデル名かツール名。例：Claude / GPT / Cursor / DeepSeek / GLM。決まった一覧はない |
| `tool` | 必須 | 使ったツール。分からなければ推測せず `"unknown"` |
| `promptPath` | 必須 | `null` か、実在する `prompts/*.md` |
| `promptNotes` | 必須 | プロンプトについての補足 |
| `created` | 必須 | `YYYY-MM-DD` |
| `thumbnail` | 必須 | `"thumb.webp"`（640×400・60KB 以下。`npm run thumbs` で作る）。全作品で必須 |
| `legacy` | 必須 | 新規作品は `false` |
| `externalOrigins` | 必須 | 読み込みを許す外部オリジン。新規作品は `[]` |
| `modelVersion` | 任意 | 制作（model）の版 |
| `thumbWait` | 任意 | サムネイル撮影前に待つセレクタ |
| `making` | 新規作品は必須（既存作品は任意） | 作り方の区分。`"oneshot"`・`"refined"`・`"unknown"` のどれか。キーがなければ `unknown`。追加指示の回数は書かない（`making.md` から数える） |

`type` の語彙は `site-types.json` だけに置きます。種別を増やすときは、そのファイルを変える PR を別に出します。

## 新規作品（`legacy: false`）の制約

- `externalOrigins` は空にします。外部フォントは読み込まず、同梱の woff2 か端末のフォントを使います。
- フォルダの合計は 2MB 以下にします。
- 実行時に AI・API キー・有料サービスを使いません。HTML/JS/CSS に AI API のホスト、鍵らしき文字列、`<form action="http` があると失敗します（既存作品も同じ検査を受けます）。
- フォームはブラウザの中で完結するデモにし、送信・保存・決済はしません。

## 作り方の残し方

作品ごとに、どんな順序と流れで指示して今の形になったかを `<フォルダ>/making.md` に残します。ページの旧版は保存しません。ビルドで `dist/making/<id>.html` になり、カードに区分と「作り方を読む」が出ます。

- プロンプトの原文は貼りません。原文には誤字があり、同じ文を渡しても同じページになるとは限らないためです。
- 1 ステップは、最上位の番号付きの項目 1 つです。「頼んだこと（要旨）」と「変わったこと」を合わせて 1〜2 行で書きます。
- 誤字は直します。意味は変えません。再現手順ではなく、作ったときの筋道として書きます。
- 最初のステップは、お題ページへのリンク付きで「お題「○○」を渡した」と書きます（リンク先は `../prompts/<type>.html`）。
- 根拠（issue・PR・コミット）は HTML コメントで残します。ページには出ません。
- 断り書きはページのテンプレートが出します。`making.md` には書きません。

`meta.json` の `making` は次のとおりです。

| `making` | `making.md` | カードの区分 |
| --- | --- | --- |
| `oneshot` | ステップがちょうど 1 つ | ワンショット |
| `refined` | ステップが 2 つ以上 | ブラッシュアップ（追加の指示N回）。N はステップ数 − 1 |
| `unknown`（またはキーなし） | 置かない | 出さない |

`promptPath` が `null` の作品は `unknown` だけです。根拠のない作品に区分や記録を付けません。

**追加指示**は、最初の生成のあとに制作側（作った AI・ツール）へ新たに渡した指示のうち、ページの中身を変えたものです。それぞれが 1 回です。リードやデザイナーのレビューでの修正依頼も、制作側へ渡して中身が変わったなら数えます。次は数えません。

- main の取り込み（merge）
- 制作側を通さない、リードや CI の作業
- 変更のない再確認
- 最初の生成の中で制作側が自分で分けたコミット（失敗するテストの骨格 → 本体、など）

例：

```md
# 作り方：カケハシ（claude-kakehashi）
<!-- 根拠：issue #10、PR #24（34adb7b, 2a642df, 84c2e11）。原文は載せない -->
1. [お題「SaaS」](../prompts/saas-lp.html)を渡した。
   - 変わったこと：請求と入金消込の LP を、一画面の照合デモ付きで作った。
2. 375px で照合パネルが入金一覧に重なる点と、読み上げの重複の修正を頼んだ。
   - 変わったこと：パネルが重ならなくなり、読み上げは変化したときだけになった。
```

`making` の値と `making.md` のステップ数、最初のステップのお題リンクが合っているかは `npm run check` が検査します。

## 生成物

`dist/`・`qa/`・`sites.json` はコミットしません。`dist/` と `sites.json` が Git の追跡対象に入っていると `npm run check` が失敗します。
