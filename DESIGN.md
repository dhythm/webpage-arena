# Design decisions

## NAGI

静かな部屋に置く小さな音響製品。対象は、家での読書やコーヒーの時間を大切にする人。ページの仕事は、音と触感を想像してもらい、製品を知ってもらうこと。

- 色: paper `#f3f0e8`、ink `#30382c`、olive `#3b4733`、clay `#995333`、line `#d4d4c8`。
- 文字: Zen Old Minchoの日本語見出しで余韻をつくり、Manropeと端末の日本語ゴシックで操作と仕様を読む。
- 構成: 左に言葉、右に触感の伝わる大きな写真。その後、暮らしの思想、実際に操作できる音、色と仕様へ進む。
- 固有性: 陶器の粒子、布ループ、真鍮色のダイヤルを持つ専用生成写真。オリーブ色の試聴空間に、再生時だけ動く波形を配置。登録の文章まで静かな語り口を揃える。

```text
logo                navigation          invitation
story in Mincho     | tactile product photograph
                    | afternoon light
philosophy          | daily scenes
full-width audio experience
product image       | color / specs / invitation
questions           | disclosure rows
quiet closing
```

暖色の紙と明朝体は、この製品の陶器・石・午後の光に結び付けた選択。汎用的なSaaSの機能カードや、根拠のない受賞・レビュー・利用者数は置かない。価格や架空性は明示し、色変更は写真の色調イメージであると説明する。

## UMI

海の再生を事業につなぐ研究開発会社。対象は、共同研究を考える企業、地域、研究者。ページの仕事は、研究領域と進め方を示し、相談の入口へ案内すること。

- 色: ocean `#1039df`、signal `#d7fa54`、white `#f5f6ef`、ink `#112e3a`、field `#e8ece5`。
- 文字: Space Groteskの英数字と、Noto Sans JPの力強い日本語。大見出しは左揃え、観測値は整列。
- 構成: コバルトの画面に海藻林、観測フィールドの図、3つの研究テーマ、実装の順序、現場の記事、相談。
- 固有性: 3本の線で循環を表すUのロゴ、海中写真、レーダー型フィールド図、海藻素材の積層リング、港の波形。プロジェクトごとに同じ写真を並べず、研究領域に合う表現をつくる。

```text
lab identity          navigation / contact
large Japanese copy   | underwater forest
ocean signal strip with pause control
purpose               | field observation diagram
project themes / filter
3 distinct project visuals → detail dialogs
science / design      | three-step implementation
field journal → articles
contact invitation → local demo form
large lab wordmark
```

ライムは海中で光を受ける海藻から抽出したアクセント。見出しの一文字だけを強調する初期案は、レビューで取り除いた。常時動く部分には停止操作を用意し、波形はプロジェクトの海という対象に結び付ける。

## AMENE (gemini-lp)

天候や気圧の微動に呼応して香りを調律する卓上気象調香ディフューザー。対象は、都市生活の中で自然の機微や静寂を重んじる生活者。

- 色: 深雨 `#161b22`、濡瓦 `#1e242d`、霞白 `#e8eef2`、雨筋 `#2b343f`、翠雨 `#38a3a5`。
- 文字: 見出しは「BIZ UDPMincho」等の端正な和文明朝体。UIや諸元は現代的なシステムサンセリフ。
- 構成: 気象ステーションのような非対称グリッド。左に現在の気象観測とコピー、右に玄昌石と黒鉛アルミのディフューザー造形。その後に調香思想、天候調香シミュレーター、素材と色、諸元、FAQ、先行案内へ。
- 固有性: 4つの天候モード（霖雨・薄日・薫風・夜霧）に連動する気象調香シミュレーター、大気微粒子Canvas描画、Web Audio APIによる天候周波数環境音のリアルタイム合成、玄昌石と黒鉛アルミの3色質感プレビュー、WCAG対応先行案内ダイアログ。

## SHINRA (gemini-corporate)

伝統木組技術の幾何学と最新の有限要素法（FEM）構造解析・大断面CLTを融合する構造エンジニアリング企業。対象は、都市開発デベロッパー、組織設計事務所、自治体の公共建築担当、構造設計者。

- 色: 針葉樹深緑 `#1a3328`、生成り木肌紙 `#f7f5f0`、墨黒 `#161819`、桧木肌 `#c89658`、朱印 `#bd3220`。
- 文字: 建築図面の精緻さを宿すモダン日本語ゴシックと、等幅数値フォント（tabular-nums）。
- 構成: 建築図面グリッドと構造指標（延床、固定炭素量、大臣認定数、最大スパン）。その後に技術基盤、CAD木組解析ビューワー、主要設計実績、木造化炭素シミュレーター、会社概要、FS相談窓口へ。
- 固有性: 3種の特許木組接合部（金輪継ぎハイブリッド、三方差し立体トラス、CLT偏心ブレース）のCADベクトル図面と応力ベクトル（曲げ・せん断・軸力）インタラクティブ解析ビューワー、建築用途別実績フィルタ、階数・延床面積に応じた木材量・CO₂炭素固定量シミュレーター、フィジビリティ調査相談ダイアログ。

## Review and refinement

[Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) とローカルimagegenスキルを使用。

レビューでは写真と文章の主従、行長、モバイルの折り返し、装飾の必要性を確認。AI生成によくある定型テンプレート（暖色クリーム＋テラコッタ、黒背景＋アシッドグリーン、番号の過剰使用、全セクションの均一フェードイン）を徹底して排除し、それぞれの題材の本質（AMENEの大気と湿度の静けさ、SHINRAの構造力学と木工幾何学の緊張感）に根ざした独自のタイポグラフィ、配色、インタラクションを構築しました。
