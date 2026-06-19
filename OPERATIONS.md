# Market Daily Brief Operations

このドキュメントは、初期MVPを現実的に運用するための設計と復旧手順です。

## 運用方針

- 投資助言、個別銘柄推奨、売買勧誘、株価予想は行わない。
- 自動生成は公開情報の整理に限定する。
- 外部データが欠ける、古い、または禁止表現が検出された場合は公開しない。
- ニュースはRSS/Atomの見出し、URL、出典、公開時刻だけを扱い、本文取得やAI要約は行わない。
- 外部リンクは出典確認用として扱い、本文転載、画像転載、記事本文の要約、埋め込み表示は行わない。

## 日次フロー

1. GitHub Actions が平日 06:15 JST に `Publish Daily Brief` を実行する。
2. `scripts/generate-daily-brief.mjs` が市場データ、公式イベント、ニュース見出しを集めて候補記事を作る。
3. `scripts/validate-article.mjs` が必須データ、データ鮮度、禁止表現を確認する。
4. PASS の場合だけ `articles/daily/YYYY-MM-DD.html` に公開する。
5. OGP、sitemap、SNS投稿文案、運用JSONを生成する。
6. GitHub Pages に公開する。
7. FAIL / NO_DATA / workflow error の場合はIssueを作る。

## 公開停止条件

- 必須市場データの取得に失敗した。
- 必須市場データが `config/market-data-sources.json` の `maxDataAgeDays` を超えて古い。
- イベントデータが空。
- 禁止表現が記事本文またはRSS見出し由来の表示文に含まれる。
- Actions の途中でエラーが発生した。

## データソース

### 市場データ

`config/market-data-sources.json` で管理する。

- 指数・為替・商品は Yahoo Finance chart endpoint を使う。
- 米10年金利は FRED のDGS10公開CSVを使う。
- APIキーは使わない。
- TOPIXは本指数の直取得が安定しないため、当面はTOPIX連動ETF `1306.T` を参考値として表示し、`世界の株価と日経先物` は補助確認リンクとして表示する。
- 取得タイムアウトは `requestTimeoutMs` で管理する。
- 必須データの鮮度上限は `maxDataAgeDays` で管理する。

### イベント

`config/event-sources.json` で公式ソースを管理し、`config/market-events.json` を手動fallbackとして使う。

- BLS、BEA、Federal Reserve、Bank of Japanの公式カレンダーを取得する。
- BLSとBEAは米東部時間を日本時間に換算する。
- Fed FOMCは公式ページの日付を米国時間ベースの会合日として扱う。
- 日銀MPMは日本時間の日付として扱う。
- 対象日の公式イベントが見つからない場合は手動確認枠へフォールバックする。

### ニュース

`config/news-sources.json` で管理する。

- 初期標準は NHK 経済ニュース RSS と Federal Reserve のRSS。
- Yahoo Finance RSS と MarketWatch top stories RSS は、買い判断・格付け・価格目標に近い見出しが混ざるため標準から外している。
- RSS取得に失敗しても、市場データが揃っていれば公開は止めない。
- 禁止表現を含む見出しは表示しない。
- 外部リンクには `rel="noopener noreferrer nofollow"` を付け、リンク先とは無関係であることをサイト上に明記する。

## 生成物

- `articles/daily/YYYY-MM-DD.html`: 公開記事
- `drafts/YYYY-MM-DD.html`: 停止時の候補記事
- `data/market-snapshots/YYYY-MM-DD.json`: 市場データと取得品質
- `data/event-digests/YYYY-MM-DD.json`: 公式イベント取得結果
- `data/news-digests/YYYY-MM-DD.json`: RSS見出しリンク
- `data/proofread-reports/YYYY-MM-DD.json`: 自動校正レポート
- `data/social-posts/YYYY-MM-DD.txt`: SNS投稿文案
- `assets/og/YYYY-MM-DD.png`: OGP画像
- `data/latest-run.json`: 最新実行状態
- `index.html`: 最新記事へ移動するトップページ
- `archive.html`: 過去記事一覧ページ

## 復旧手順

### NO_DATA

1. Issue内の `data/proofread-reports/YYYY-MM-DD.json` と `data/market-snapshots/YYYY-MM-DD.json` を確認する。
2. 外部ソース障害なら、時間を置いて `Publish Daily Brief` を手動再実行する。
3. 特定シンボルだけ継続失敗する場合は `config/market-data-sources.json` のシンボルまたは必須設定を見直す。

### BANNED_PHRASE

1. Issueまたは proofread report の検出箇所を確認する。
2. 自動生成文の問題ならテンプレートを修正する。
3. RSS見出し由来なら `rules/banned-phrases.json` または `config/news-sources.json` を調整する。

### Workflow Error

1. Actionsログで失敗ステップを確認する。
2. 外部取得タイムアウトなら手動再実行する。
3. 依存関係やファイル欠損なら修正してpushする。

## 手動実行

Actions の `Publish Daily Brief` から `workflow_dispatch` を使う。

- `brief_date`: 空ならJSTの当日
- `demo_mode`: 通常は `safe`
- `data_mode`: 通常は `live`

ローカル確認:

```bash
node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest
python scripts/generate-daily-ogp.py
node scripts/generate-archive-page.mjs
node scripts/generate-home-page.mjs
node scripts/generate-sitemap.mjs
node scripts/generate-social-post.mjs
```

ダミー検証:

```bash
BRIEF_DATA_MODE=dummy BRIEF_DEMO_MODE=safe node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest

BRIEF_DATA_MODE=dummy BRIEF_DEMO_MODE=unsafe node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest

BRIEF_DATA_MODE=dummy BRIEF_DEMO_MODE=no-data node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest
```

## 次フェーズの判断事項

- TOPIX本指数の取得元をどうするか。
- 国内統計、財務省、内閣府など日本の経済イベントを追加するか。
- ニュースソースを増やす場合、買い判断・格付け系見出しをどこまで許容しないか。
- OpenAI APIを使う場合、要約ではなく文体整形・禁止表現検査に限定するか。
- X投稿を自動投稿するか、当面は文案生成だけにするか。
