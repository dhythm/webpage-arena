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

## Review and refinement

[Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) とローカルimagegenスキルを使用。環境に汎用frontend-designスキルがなかったため、公開SKILL.mdを読み、実装の最終レビューに適用した。

レビューでは写真と文章の主従、行長、モバイルの折り返し、装飾の必要性を確認。NAGIのモバイル見出しの孤立文字と320pxの装飾はみ出しを修正。自動監査で見つかった補助文字のコントラストを改善し、キーボードでフォームが完結することを検証した。全セクションを同じフェードアニメーションで隠す方式は使わず、内容は初めから読める。
