# webpage-arena

同じお題を、いろいろな AI に作らせて見比べるためのリポジトリです。お題は「架空の商品のランディングページ」と「架空の企業のホームページ」の2つで、AI ごとに1組ずつ作っています。

フォルダ名は `<作った AI>-<ページ>` の形です。各フォルダは独立していて、共通のフレームワークやビルドを必要としません。商品・企業・人物・価格・数値はすべて架空です。

## 作品

| フォルダ | 作った AI | コンセプト | 主な体験 |
| --- | --- | --- | --- |
| [gpt-nagi](gpt-nagi/) | GPT | NAGI — 音と、暮らしのあいだに。陶器のようなポータブルスピーカー | 音の試聴、3色のイメージ切替、FAQ、先行案内のデモ |
| [gpt-umi](gpt-umi/) | GPT | UMI 海洋循環研究所 — 海の可能性を、社会の次へ。 | 研究テーマの絞り込み、プロジェクト詳細、ジャーナル、相談フォームのデモ |
| [grok-lp](grok-lp/) | Grok | 閑炉 一号 — 火を、机の端に。 | 香炉を一つ買うまでの物語、仕上げの比較、注文の手順 |
| [grok-corporate](grok-corporate/) | Grok | 潮罫社 — 港の深さは、紙の上で決まる。 | 事業、海図、会社、採用、連絡先 |
| [gemini-lp](gemini-lp/) | Gemini | 雨聲 AMENE — 空気が湿ると、雨の日の匂いがする。気象連動ディフューザー | 天候調香シミュレーター、微粒子 Canvas、環境音試聴、素材切替、予約デモ |
| [gemini-corporate](gemini-corporate/) | Gemini | 森羅木工構造 — 100年後の森を、都市に組む。次世代木造エンジニアリング | 木組の CAD 図、応力ベクトル切替、実績フィルタ、炭素固定試算、FS 相談 |
| [devin-meguru](devin-meguru/) | Devin | MEGURU — 覗くと、夜が咲く。真鍮と硝子の万華鏡 | 実際に動く万華鏡、中身の切替、断面図、予約デモ |
| [devin-tsumugiya](devin-tsumugiya/) | Devin | つむぎや織物 — たて糸は規律。よこ糸は、実験。桐生の織元 | 織り途中の帯、よこ糸を選ぶ縞見本、見本帳、年表、相談デモ |
| [claude-lp](claude-lp/) | Claude | TOKI — 朝は、三十分かけてやってくる。和紙の目覚ましランプ | WebGL で描いた和紙のランプと夜明けスライダー、素材の描画、仕上げ選択、予約デモ |
| [claude-corporate](claude-corporate/) | Claude | KAISŌ Materials — 海から、建てる。海藻のコンクリートと断熱材 | 光がカーソルを追う打放しコンクリートの壁、素材の断面図、炭素台帳の絞り込み、サンプル請求デモ |
| [muse-halo-lp](muse-halo-lp/) | Muse | HALO — 指先から、からだの声を聞く。チタン製スマートリング | 使い方の3ステップ、スペック、料金プラン、FAQ |
| [muse-arcline-hp](muse-arcline-hp/) | Muse | Arcline — 中堅・中小企業のクラウド移行と DX 支援 | 事業内容、選ばれる理由、導入事例、代表メッセージ、会社概要 |

デザインの意図は [DESIGN.md](DESIGN.md) と各フォルダの README に、画像・フォントの出典は [ASSETS.md](ASSETS.md) にあります。

## ローカルプレビュー

Node.js 20.11 以降が必要です。実行時に必要な依存パッケージはありません。

```sh
npm run dev
```

- 一覧ページ：http://127.0.0.1:4173/
- 各作品：http://127.0.0.1:4173/<フォルダ名>/（例：http://127.0.0.1:4173/claude-lp/）

`PORT=4180 npm run dev` でポートを変えられます。サーバーは localhost でだけ待ち受けます。

## ビルド

```sh
npm run build      # dist/ に全作品と一覧ページを出力し、HTML のローカル参照先を検査
npm run preview    # dist/ をプレビュー
```

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
- `npm run test:a11y`：gpt-nagi・gpt-umi を axe-core（WCAG 2.2 AA までのルール）で検査。

結果は `qa/` に書き出されます。`qa/` は実行のたびに作り直される生成物なので、Git の管理対象から外しています。

## 共通の約束

- HTML・CSS・JavaScript だけで作る。各フォルダは単独で動く。
- 商品・企業・価格・仕様・データ・人物は架空にし、ページ上でもそう明記する。根拠のない受賞歴・レビュー・利用者数は載せない。
- フォームはブラウザの中で完結するデモにし、送信・保存・決済はしない。
- フォントは作品ごとに選ぶ。配信方法も作品ごとに違い、自己配信（gpt-*・devin-*）、Google Fonts（claude-*）、端末のフォント（そのほか）が混在している。
