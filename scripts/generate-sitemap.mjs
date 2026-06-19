import { buildArticleIndex, isMain, siteUrl, rootPath, writeTextFile } from "./site-utils.mjs";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function generateSitemap() {
  const articles = await buildArticleIndex();
  const urls = [
    {
      loc: siteUrl(),
      lastmod: articles[0]?.date || ""
    },
    {
      loc: siteUrl("archive.html"),
      lastmod: articles[0]?.date || ""
    },
    {
      loc: siteUrl("about.html"),
      lastmod: articles[0]?.date || ""
    },
    ...articles.map((article) => ({
      loc: article.absoluteUrl,
      lastmod: article.date
    }))
  ];

  const body = urls
    .map((url) => {
      const lastmod = url.lastmod ? `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(url.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");

  await writeTextFile(
    rootPath("sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );

  console.log(`Generated sitemap.xml with ${urls.length} URL(s).`);
}

if (isMain(import.meta.url)) {
  generateSitemap().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
