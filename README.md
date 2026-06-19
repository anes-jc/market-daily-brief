# Market Daily Brief

Market Daily Brief は、朝に読む、株式・為替・金利・イベントの市場メモです。

このサイトは投資助言サイトではありません。公開情報を整理することを目的とし、個別銘柄の推奨、売買の勧誘、投資判断の助言、株価予想は行いません。

## MVP Scope

初期MVPでは外部API、OpenAI API、X APIを使いません。GitHub Actions の手動実行でダミー市場データから記事を生成し、禁止表現チェック、ダミー校正レポート、OGP画像、sitemap、X投稿文案までを生成します。

## Local Run

```bash
node scripts/generate-daily-brief.mjs
node scripts/validate-article.mjs --latest
python scripts/generate-daily-ogp.py
node scripts/generate-sitemap.mjs
node scripts/generate-social-post.mjs
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
- `data/market-snapshots/YYYY-MM-DD.json`: ダミー市場スナップショット
- `data/proofread-reports/YYYY-MM-DD.json`: ダミー校正レポート
- `assets/og/YYYY-MM-DD.png`: OGP画像
- `data/social-posts/YYYY-MM-DD.txt`: X投稿文案
- `data/daily-articles.js`: 記事一覧データ
- `sitemap.xml`: GitHub Pages 用 sitemap

## Policy

推奨しない。予想しない。煽らない。公開情報を毎朝整理する。

共通免責文:

```text
当サイトは、株式・為替・金利・経済イベントに関する公開情報を整理することを目的としています。
個別銘柄の推奨、売買の勧誘、投資判断の助言、株価予想を目的とするものではありません。
最終的な投資判断は、利用者ご自身の責任で行ってください。
```
