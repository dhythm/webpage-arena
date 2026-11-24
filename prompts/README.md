# 旧お題（固定）と共通の制約（prompts）

新しい作品のお題は、ジャンルのお題（[`briefs/`](../briefs/)）です。ジャンル名とざっくりした領域だけを決め、商品名・コンセプト・構成は作る側が自由に決めます。`requiredSections` は空です。

このフォルダには、全お題に共通の制約（`_template.md`）と、商品名や構成まで固定していた以前のお題を「旧お題（固定）」として残しています。旧お題で作った作品のカードには「旧お題（固定）」のリンクが出ます。お題（`meta.json` の `promptPath`）は、ギャラリーで「お題別」に絞り込むときの軸になります。

| ファイル | 中身 |
| --- | --- |
| [_template.md](_template.md) | 全お題に共通の制約（ジャンルのお題にも使う） |
| [product-lp.md](product-lp.md) | 商品LP。当時のゆるいお題（`requiredSections: []`） |
| [corporate-hp.md](corporate-hp.md) | 企業HP。当時のゆるいお題（`requiredSections: []`） |
| [saas-lp.md](saas-lp.md) | SaaS — カケハシ |
| [restaurant.md](restaurant.md) | 飲食 — 青時 |
| [app-lp.md](app-lp.md) | アプリ — のまみち |
| [event.md](event.md) | イベント — 港暮らしフェス 2027 |
| [inn.md](inn.md) | 宿 — 岸ねの宿 |

ファイル名は [`site-types.json`](../site-types.json) の種別の id と同じです。

## 作品を足す（ジャンルのお題から）

1. `briefs/<slug>.md` から 1 つ選び、`_template.md` と一緒に作る AI・ツールに渡す。
2. フォルダは `<model の小文字>-<作品独自の slug>` にする（例：`grok-ledgerline`）。同じお題でも slug を揃えて prefix だけ変える運用はしない。
3. `meta.json` の `promptPath` に使ったお題（例：`briefs/accounting-saas.md`）を書く。お題に手を加えたら、その内容を `promptNotes` に書く。
4. `npm run check` を通す。`promptPath` は `null`・`prompts/<name>.md`・`briefs/<name>.md` のどれかです。旧お題（`prompts/`）を使う `legacy: false` の作品は、`index.html` にお題の `requiredSections` の id がすべて無いと失敗します（`scripts/prompts.test.mjs`）。ジャンルのお題は `requiredSections` が空なので、id は求めません。

## 作り方の残し方

お題ページは、各モデルに共通して渡した仕様です。作品ごとの指示の流れは、お題ページではなく作品フォルダの `making.md` に残します。書き方は [CONTRIBUTING.md の「作り方の残し方」](../CONTRIBUTING.md#作り方の残し方) にあります。

- プロンプトの原文は貼らない。各ステップは、頼んだこと（要旨）と変わったことを 1〜2 行で書く。誤字は直し、意味は変えない。
- 最初のステップは、お題ページへのリンク付きで「お題「○○」を渡した」と書く。例：`1. [お題「経理系SaaS」](../briefs/accounting-saas.html)を渡した。` 旧お題（固定）なら `../prompts/<type>.html` へのリンクにする。
- 2 つ目以降のステップが追加指示です（最初の生成のあとに制作側へ渡し、ページの中身を変えた指示。merge やリード・CI だけの作業は数えない）。
- `meta.json` の `making`（`oneshot`・`refined`・`unknown`）と `making.md` が合っているかは `npm run check` が見る。

## 種別（お題）を足す

1. [`site-types.json`](../site-types.json) に種別を足す。
2. 同じ PR で `briefs/<slug>.md` を足す。先頭の front matter に `type`（種別の id）と `requiredSections: []` を書く。1 つの種別にジャンルのお題が複数あってもよい。
3. 商品名・会社名・構成は書かず、ジャンル名・ざっくりした領域・想定する読み手の幅・任意の観点だけにする。「作る側が自由に決める」と明記する。

`site-types.json` の全種別に `prompts/<type>.md` があることは、いまも `npm run check` が検査します。新しい種別を足すときは、この検査をどうするかも同じ PR で決めます。

## 旧お題の文言を変えない

旧お題（固定）は、それで作った作品の記録です。文言は変えません。

## このフォルダに置かないもの

`index.html` と `meta.json` は置きません。リポジトリ直下のフォルダにこの 2 つがあると、作品として一覧・ビルドに入ります。
