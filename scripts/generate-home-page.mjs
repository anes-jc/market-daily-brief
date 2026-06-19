import {
  SITE_DESCRIPTION,
  SITE_NAME,
  buildArticleIndex,
  escapeHtml,
  isMain,
  rootPath,
  siteUrl,
  writeTextFile
} from "./site-utils.mjs";

function buildHomePage(articles) {
  const latest = articles[0];

  if (!latest) {
    return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(SITE_NAME)}</title>
    <meta name="description" content="${escapeHtml(SITE_DESCRIPTION)}">
    <meta property="og:title" content="${escapeHtml(SITE_NAME)}">
    <meta property="og:description" content="${escapeHtml(SITE_DESCRIPTION)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(siteUrl())}">
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
        <a href="archive.html">Archive</a>
        <a href="archive.html#policy">Policy</a>
      </nav>
    </header>

    <main>
      <section class="intro-band" aria-label="Latest brief">
        <div>
          <p>まだ公開記事はありません。GitHub Actions の初回実行後に、このURLは最新記事へ移動します。</p>
        </div>
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

  const redirectTarget = latest.url;
  const redirectScript = JSON.stringify(redirectTarget);

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(latest.title)}</title>
    <meta name="description" content="${escapeHtml(latest.summary)}">
    <meta property="og:title" content="${escapeHtml(latest.title)}">
    <meta property="og:description" content="${escapeHtml(latest.summary)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(siteUrl())}">
    <meta property="og:image" content="${escapeHtml(latest.absoluteOgImage)}">
    <link rel="canonical" href="${escapeHtml(latest.absoluteUrl)}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(redirectTarget)}">
    <link rel="stylesheet" href="assets/site.css">
    <script>
      window.location.replace(${redirectScript});
    </script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="site-kicker">Morning Market Memo</p>
        <h1>${escapeHtml(SITE_NAME)}</h1>
        <p class="site-copy">${escapeHtml(SITE_DESCRIPTION)}</p>
      </div>
      <nav aria-label="Primary">
        <a href="${escapeHtml(redirectTarget)}">Latest</a>
        <a href="archive.html">Archive</a>
        <a href="archive.html#policy">Policy</a>
      </nav>
    </header>

    <main>
      <section class="intro-band" aria-label="Latest brief redirect">
        <div>
          <p>最新の Market Daily Brief に移動します。</p>
          <p><a href="${escapeHtml(redirectTarget)}">最新記事を開く</a> / <a href="archive.html">過去記事一覧を見る</a></p>
        </div>
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

export async function generateHomePage() {
  const articles = await buildArticleIndex();
  await writeTextFile(rootPath("index.html"), buildHomePage(articles));
  console.log(`Generated index.html for ${articles[0]?.date || "no published article"}.`);
}

if (isMain(import.meta.url)) {
  generateHomePage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
