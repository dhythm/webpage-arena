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
  "externalOrigins": []
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

`type` の語彙は `site-types.json` だけに置きます。種別を増やすときは、そのファイルを変える PR を別に出します。

## 新規作品（`legacy: false`）の制約

- `externalOrigins` は空にします。外部フォントは読み込まず、同梱の woff2 か端末のフォントを使います。
- フォルダの合計は 2MB 以下にします。
- 実行時に AI・API キー・有料サービスを使いません。HTML/JS/CSS に AI API のホスト、鍵らしき文字列、`<form action="http` があると失敗します（既存作品も同じ検査を受けます）。
- フォームはブラウザの中で完結するデモにし、送信・保存・決済はしません。

## 生成物

`dist/`・`qa/`・`sites.json` はコミットしません。`dist/` と `sites.json` が Git の追跡対象に入っていると `npm run check` が失敗します。
