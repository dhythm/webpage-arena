# お題（prompts）

同じお題を別の AI・ツールに渡して、見比べられる作品を増やすためのフォルダです。お題（`meta.json` の `promptPath`）は、ギャラリーで「お題別」に並べるときの軸になります。

| ファイル | 中身 |
| --- | --- |
| [_template.md](_template.md) | 全お題に共通の制約 |
| [product-lp.md](product-lp.md) | 商品LP。当時のゆるいお題（`requiredSections: []`） |
| [corporate-hp.md](corporate-hp.md) | 企業HP。当時のゆるいお題（`requiredSections: []`） |
| [saas-lp.md](saas-lp.md) | SaaS — カケハシ |
| [restaurant.md](restaurant.md) | 飲食 — 青時 |
| [app-lp.md](app-lp.md) | アプリ — のまみち |
| [event.md](event.md) | イベント — 港暮らしフェス 2027 |
| [inn.md](inn.md) | 宿 — 岸ねの宿 |

ファイル名は [`site-types.json`](../site-types.json) の種別の id と同じです。

## 同じお題で作品を足す（比較の手順）

1. `_template.md` と `prompts/<type>.md` を、作る AI・ツールにそのまま渡す。文言は言い換えない。
2. フォルダは `<model の小文字>-<slug>` にする。同じお題なら slug は揃え、フォルダの prefix だけ変える（例：`claude-kakehashi` と `grok-kakehashi`）。
3. `meta.json` の `promptPath` に同じパス（例：`prompts/saas-lp.md`）を書く。プロンプトに手を加えたら、その内容を `promptNotes` に書く。
4. `npm run check` を通す。`legacy: false` で `promptPath` を持つ作品は、`index.html` にお題の `requiredSections` の id がすべて無いと失敗します（`scripts/prompts.test.mjs`）。

同じ `promptPath` の作品どうしが、同じ条件で作った比較対象になります。

## 作り方の残し方

お題ページは、各モデルに共通して渡した仕様です。作品ごとの指示の流れは、お題ページではなく作品フォルダの `making.md` に残します。書き方は [CONTRIBUTING.md の「作り方の残し方」](../CONTRIBUTING.md#作り方の残し方) にあります。

- プロンプトの原文は貼らない。各ステップは、頼んだこと（要旨）と変わったことを 1〜2 行で書く。誤字は直し、意味は変えない。
- 最初のステップは、お題ページへのリンク付きで「お題「○○」を渡した」と書く。例：`1. [お題「SaaS」](../prompts/saas-lp.html)を渡した。`
- 2 つ目以降のステップが追加指示です（最初の生成のあとに制作側へ渡し、ページの中身を変えた指示。merge やリード・CI だけの作業は数えない）。
- `meta.json` の `making`（`oneshot`・`refined`・`unknown`）と `making.md` が合っているかは `npm run check` が見る。

## 種別（お題）を足す

1. [`site-types.json`](../site-types.json) に種別を足す。
2. 同じ PR で `prompts/<type>.md` を足す。先頭の front matter に `requiredSections`（必須セクションの id の一覧）を書く。
3. ブランド名・一文・対象・CTA・必須セクションまで固定する。

`site-types.json` の全種別にお題ファイルがあることは `npm run check` が検査します。

## お題の文言を変えない

作品を作り始めたあとにお題の文言を変えると、比較の条件がずれます。変えるときは別の PR にして、理由を書きます。

## このフォルダに置かないもの

`index.html` と `meta.json` は置きません。リポジトリ直下のフォルダにこの 2 つがあると、作品として一覧・ビルドに入ります。
