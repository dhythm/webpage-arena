# webpage-arena

同じお題を、いろいろな AI に作らせて見比べるためのリポジトリです。お題は「架空の商品のランディングページ」と「架空の企業のホームページ」の2つで、AI ごとに1組ずつ作っています。

フォルダ名は `<作った AI>-<ページ>` の形です。各フォルダは独立していて、共通のフレームワークやビルドを必要としません。商品・企業・人物・価格・数値はすべて架空です。

## ギャラリー

作品の一覧は、各フォルダの `meta.json` から自動で作るギャラリーで見ます（作品表は手で書きません）。トップはジャンル（`meta.type`）ごとに 1 行で、作成日の新しい順に最大 6 件（`scripts/catalog.mjs` の `TOP_LIMIT`）を並べます。各行の「すべて見る（N件）」から、そのジャンルの全作品を並べたジャンルページ（`genre/<ジャンル>/`）へ移れます。お題・種別・制作・ツールで絞り込むと、6 件の上限を外して全作品から絞ります。

- ローカルでは `npm run dev` を起動して http://127.0.0.1:4173/ を開きます。
- GitHub Pages はまだ有効化されていません。有効化はユーザーの操作です（Settings → Pages → Source：GitHub Actions）。有効化後の公開 URL は https://dhythm.github.io/webpage-arena/ で、有効化して main への push（か main での手動実行）があるまでは、この URL では見られません。
- 有効化後は、`.github/workflows/pages.yml` が main への push（と手動実行）のたびに `npm run build` の `dist/` だけを公開します。PR では動きません。
- 有効化されるまでは、pages workflow は「Pages 未有効のためスキップ」と notice を出して緑で終わり、何も公開しません。Source が「Deploy from a branch」のままだと、「Source を GitHub Actions に」という error で失敗し、何も公開しません。
- お題の本文は [prompts/](prompts/) にあります。ギャラリーの「プロンプトを読む」から、本文と全お題に共通の制約を読めます。
- 作品の足し方と `meta.json` の規約は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。

デザインの意図は [DESIGN.md](DESIGN.md) と各フォルダの README に、画像・フォントの出典は [ASSETS.md](ASSETS.md) にあります。

## ローカルプレビュー

Node.js 20.11 以降が必要です。実行時に必要な依存パッケージはありません。

```sh
npm run dev
```

- ギャラリー：http://127.0.0.1:4173/（`meta.json` と `index.html` のテンプレートから、その場で描きます）
- 各作品：http://127.0.0.1:4173/<フォルダ名>/（例：http://127.0.0.1:4173/claude-lp/）

`PORT=4180 npm run dev` でポートを変えられます。サーバーは localhost でだけ待ち受けます。

## ビルド

```sh
npm run build      # dist/ に全作品とギャラリーを出力し、HTML のローカル参照先を検査
npm run preview    # dist/ をプレビュー
```

`npm run build` は、ギャラリーのカードを `dist/index.html` に HTML として焼き込みます（JavaScript なしでも一覧が見えます）。お題は `dist/prompts/<お題のファイル名>.html`（例：`prompts/saas-lp.md` → `dist/prompts/saas-lp.html`）に、全お題に共通の制約と、そのお題の作品の一覧と一緒に書き出します。ジャンルページは `dist/genre/<ジャンル>/index.html` に、作品が 1 件以上あるジャンルだけ書き出します。`dist/` は生成物なのでコミットしません。

`npm run dev` と `npm run build` は、どちらも `scripts/catalog.mjs` の同じ関数でギャラリーを描きます。

## ブラウザテスト

```sh
npm ci
npx playwright install chromium
# 別ターミナルで npm run dev を起動した状態で:
npm test
npm run test:a11y
```

いまテストの対象になっているのは一部の作品だけです。

- `npm test`：gpt-nagi・gpt-umi のレイアウト（320〜1920px）、画像の出し分け、主要操作、キーボード操作、reduced-motion、外部通信がないこと。grok-lp・grok-corporate の同じ6幅でのレイアウトと画像の読み込み。
- `npm run test:a11y`：ギャラリー・ジャンルページ（商品LP・SaaS）・gpt-nagi・gpt-umi を axe-core（WCAG 2.2 AA までのルール）で検査。
- `npm run test:sites`：全作品のスモークテスト（375px・1280px で横はみ出し・外部通信・エラーがないこと）。ギャラリーについては、カード数が作品数と同じこと、絞り込みの件数が `meta.json` から数えた件数と同じこと、該当なしの文言、`dist/` を `/webpage-arena/` の下で配信し、トップ・ジャンルページ・お題ページ・各作品の全 HTML の `href` と `src` をたどってリンク切れが 0 件であることも確かめます。

結果は `qa/` に書き出されます。`qa/` は実行のたびに作り直される生成物なので、Git の管理対象から外しています。

## 共通の約束

- HTML・CSS・JavaScript だけで作る。各フォルダは単独で動く。
- 商品・企業・価格・仕様・データ・人物は架空にし、ページ上でもそう明記する。根拠のない受賞歴・レビュー・利用者数は載せない。
- フォームはブラウザの中で完結するデモにし、送信・保存・決済はしない。
- フォントは作品ごとに選ぶ。配信方法も作品ごとに違い、自己配信（gpt-*・devin-*）、Google Fonts（claude-*）、端末のフォント（そのほか）が混在している。

## LP の追加手順

新しい LP や制作（AI・ツール）を足すのは、フォルダを 1 つ足すだけです。詳しい規約は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。

1. リポジトリ直下に `<model の小文字>-<slug>` のフォルダを作り、`index.html` を置く（例：`claude-kakehashi`）。
2. 同じフォルダに `meta.json` を書く。
3. `npm run thumbs -- <id>` でサムネイルを撮る。
4. `npm run check` で規約を検査する。
5. `npm run test:sites` で全作品のスモークテストを回す。
6. 自分のフォルダだけを変更した PR を出す。

同じお題を別の制作で作るときは、同じ `promptPath` を使い、フォルダの prefix だけ変えます（例：`claude-kakehashi` と `grok-kakehashi`）。
