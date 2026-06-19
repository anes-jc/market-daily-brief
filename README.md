# Market Daily Brief

Market Daily Brief は、朝に読む、株式・為替・金利・イベントの市場メモです。

このサイトは投資助言サイトではありません。公開情報を整理することを目的とし、個別銘柄の推奨、売買の勧誘、投資判断の助言、株価予想は行いません。

## MVP Scope

初期MVPでは OpenAI API と X API は使いません。現在は API キー不要の公開チャートデータを取得する `live` モードと、検証用の `dummy` モードを用意しています。GitHub Actions の手動実行または平日朝の定時実行で、記事生成、禁止表現チェック、ダミー校正レポート、OGP画像、sitemap、X投稿文案までを生成します。

## Local Run

```bash
node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest
python scripts/generate-daily-ogp.py
node scripts/generate-archive-page.mjs
node scripts/generate-home-page.mjs
node scripts/generate-sitemap.mjs
node scripts/generate-social-post.mjs
```

ダミーデータで実行する場合:

```bash
BRIEF_DATA_MODE=dummy node scripts/generate-daily-brief.mjs
```

禁止表現の draft 化を確認する場合:

```bash
BRIEF_DEMO_MODE=unsafe node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest
```

主要データ欠損の NO_DATA 判定を確認する場合:

```bash
BRIEF_DEMO_MODE=no-data node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest
```

## Generated Files

- `articles/daily/YYYY-MM-DD.html`: PASS の記事
- `drafts/YYYY-MM-DD.html`: WARN / FAIL / NO_DATA の記事候補
- `data/market-snapshots/YYYY-MM-DD.json`: 市場スナップショット
- `data/event-digests/YYYY-MM-DD.json`: 公式イベントカレンダー取得結果
- `data/news-digests/YYYY-MM-DD.json`: RSS見出しリンク集
- `data/proofread-reports/YYYY-MM-DD.json`: ダミー校正レポート
- `assets/og/YYYY-MM-DD.png`: OGP画像
- `data/social-posts/YYYY-MM-DD.txt`: X投稿文案
- `data/daily-articles.js`: 記事一覧データ
- `index.html`: 最新記事へ移動するトップページ
- `archive.html`: 過去記事一覧ページ
- `sitemap.xml`: GitHub Pages 用 sitemap

## Data Sources

実データ取得の設定は `config/market-data-sources.json` にあります。イベント自動取得の設定は `config/event-sources.json`、手動fallbackは `config/market-events.json`、ニュースRSSの設定は `config/news-sources.json` にあります。詳細な方針は `data-sources.md` を参照してください。

運用設計、停止条件、復旧手順は `OPERATIONS.md` を参照してください。

現時点では、日経平均、S&P 500、NASDAQ、ドル円、WTI原油、金を公開チャートデータから取得し、米10年金利はFREDの公開CSVから取得します。TOPIX本指数は安定取得元が未確定のため、当面は TOPIX連動ETF `1306.T` を参考値として明示します。

イベントカレンダーはBLS、BEA、Federal Reserve、Bank of Japanの公式カレンダーを取得します。対象日の公式イベントが見つからない場合は、手動JSONの確認枠へフォールバックします。

関連ニュースはRSS/Atomから見出し、URL、出典、公開時刻だけを取得します。本文取得、本文転載、AI要約は行いません。

## Policy

推奨しない。予想しない。煽らない。公開情報を毎朝整理する。

共通免責文:

```text
当サイトは、株式・為替・金利・経済イベントに関する公開情報を整理することを目的としています。
個別銘柄の推奨、売買の勧誘、投資判断の助言、株価予想を目的とするものではありません。
最終的な投資判断は、利用者ご自身の責任で行ってください。
```
