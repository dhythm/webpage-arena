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

## 種別（お題）を足す

1. [`site-types.json`](../site-types.json) に種別を足す。
2. 同じ PR で `prompts/<type>.md` を足す。先頭の front matter に `requiredSections`（必須セクションの id の一覧）を書く。
3. ブランド名・一文・対象・CTA・必須セクションまで固定する。

`site-types.json` の全種別にお題ファイルがあることは `npm run check` が検査します。

## お題の文言を変えない

作品を作り始めたあとにお題の文言を変えると、比較の条件がずれます。変えるときは別の PR にして、理由を書きます。

## このフォルダに置かないもの

`index.html` と `meta.json` は置きません。リポジトリ直下のフォルダにこの 2 つがあると、作品として一覧・ビルドに入ります。
