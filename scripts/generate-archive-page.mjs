import {
  AFFILIATE_DISCLOSURE,
  EXTERNAL_LINK_DISCLOSURE,
  PUBLIC_DISCLOSURE,
  SITE_DESCRIPTION,
  SITE_NAME,
  buildArticleIndex,
  escapeHtml,
  isMain,
  rootPath,
  siteUrl,
  writeTextFile
} from "./site-utils.mjs";

function latestPanel(article) {
  if (!article) {
    return '<p class="empty-state">まだ公開記事はありません。</p>';
  }

  return `
          <a class="latest-link" href="${escapeHtml(article.url)}">
            <img src="${escapeHtml(article.ogImage)}" alt="" loading="lazy">
            <span>
              <strong>${escapeHtml(article.title)}</strong>
              <small>${escapeHtml(article.dateLabel)} 公開</small>
              <em>${escapeHtml(article.summary)}</em>
            </span>
          </a>`;
}

function articleList(articles) {
  if (!articles.length) {
    return '<li class="empty-state">公開記事は生成待ちです。</li>';
  }

  return articles
    .map(
      (article) => `
          <li>
            <a href="${escapeHtml(article.url)}">
              <span>${escapeHtml(article.title)}</span>
              <small>${escapeHtml(article.dateLabel)}</small>
            </a>
          </li>`
    )
    .join("");
}

function buildArchivePage(articles) {
  const latest = articles[0];
  const title = `${SITE_NAME} Archive`;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(SITE_DESCRIPTION)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(SITE_DESCRIPTION)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(siteUrl("archive.html"))}">
    <meta property="og:image" content="${escapeHtml(latest?.absoluteOgImage || siteUrl("assets/og/latest.png"))}">
    <link rel="stylesheet" href="assets/site.css">
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="site-kicker">Morning Market Memo</p>
        <h1>${escapeHtml(SITE_NAME)}</h1>
        <p class="site-copy">${escapeHtml(SITE_DESCRIPTION)}</p>
      </div>
      <nav aria-label="Primary">
        <a href="index.html">Latest</a>
        <a href="#archive">Archive</a>
        <a href="#policy">Policy</a>
      </nav>
    </header>

    <main>
      <section class="intro-band" aria-label="Editorial policy">
        <div>
          <p>推奨しない。予想しない。煽らない。公開情報を朝の市場メモとして整理します。</p>
        </div>
      </section>

      <section id="latest" class="section-grid">
        <div>
          <p class="section-label">Latest Brief</p>
          <h2>最新の市場メモ</h2>
        </div>
        <div class="latest-panel">
          ${latestPanel(latest)}
        </div>
      </section>

      <section id="archive" class="section-grid">
        <div>
          <p class="section-label">Archive</p>
          <h2>記事一覧</h2>
        </div>
        <ol class="article-list">
          ${articleList(articles)}
        </ol>
      </section>

      <section id="policy" class="policy-section">
        <p class="section-label">Policy / Disclosure</p>
        <h2>投資助言ではありません</h2>
        <p>${escapeHtml(PUBLIC_DISCLOSURE)}</p>
        <p>${escapeHtml(AFFILIATE_DISCLOSURE)}</p>
        <h3>外部リンク・引用方針</h3>
        <p>${escapeHtml(EXTERNAL_LINK_DISCLOSURE)}</p>
      </section>
    </main>

    <footer>
      <p>${escapeHtml(SITE_NAME)}</p>
      <a href="sitemap.xml">sitemap.xml</a>
    </footer>
  </body>
</html>
`;
}

export async function generateArchivePage() {
  const articles = await buildArticleIndex();
  await writeTextFile(rootPath("archive.html"), buildArchivePage(articles));
  console.log(`Generated archive.html with ${articles.length} article(s).`);
}

if (isMain(import.meta.url)) {
  generateArchivePage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
