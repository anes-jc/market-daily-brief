import {
  AFFILIATE_DISCLOSURE,
  EXTERNAL_LINK_DISCLOSURE,
  LATEST_RUN_PATH,
  PUBLIC_DISCLOSURE,
  SITE_BASE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  articlePaths,
  escapeHtml,
  getDataMode,
  getDemoMode,
  getRunDate,
  isMain,
  japaneseDateLabel,
  relativeFromRoot,
  siteUrl,
  writeJsonFile,
  writeTextFile
} from "./site-utils.mjs";
import { fetchMarketSnapshot } from "./fetch-market-data.mjs";

function buildDummySnapshot(date, demoMode) {
  const noData = demoMode === "no-data";
  const unsafe = demoMode === "unsafe";

  return {
    date,
    dateLabel: japaneseDateLabel(date),
    generatedAt: new Date().toISOString(),
    sourceMode: "dummy-mvp",
    demoMode,
    dataQuality: {
      hasRequiredData: !noData,
      missingFields: noData ? ["markets.nikkei", "markets.us10y", "events"] : [],
      note: noData
        ? "主要データの一部を意図的に欠損させたNO_DATA検証用のダミーです。"
        : "外部APIを使わない初期MVP用のダミー値です。"
    },
    metrics: [
      {
        key: "nikkei",
        label: "日経平均",
        value: noData ? "" : "38,240.00",
        change: noData ? "" : "-120.50",
        pct: noData ? "" : "-0.31%",
        note: "前営業日の終値ベースのダミー値"
      },
      {
        key: "topix",
        label: "TOPIX",
        value: "2,715.80",
        change: "+6.20",
        pct: "+0.23%",
        note: "前営業日の終値ベースのダミー値"
      },
      {
        key: "sp500",
        label: "S&P 500",
        value: "5,475.10",
        change: "+8.40",
        pct: "+0.15%",
        note: "前営業日の終値ベースのダミー値"
      },
      {
        key: "nasdaq",
        label: "NASDAQ",
        value: "17,720.30",
        change: "-32.10",
        pct: "-0.18%",
        note: "前営業日の終値ベースのダミー値"
      },
      {
        key: "usdjpy",
        label: "ドル円",
        value: "157.20",
        change: "+0.35",
        pct: "+0.22%",
        note: "ニューヨーク時間終盤のダミー値"
      },
      {
        key: "us10y",
        label: "米10年金利",
        value: noData ? "" : "4.27%",
        change: noData ? "" : "+0.02pt",
        pct: "",
        note: "米国債市場のダミー値"
      }
    ],
    japan: {
      indices: ["日経平均は小幅安、TOPIXは小幅高のダミー値で記録しました。", "大型株と内需株の強弱がまちまちという想定です。"],
      sectors: ["精密機器、電気機器が相対的にしっかり。", "海運、鉄鋼は利益確定の動きが重い想定です。"],
      turnover: "プライム市場売買代金は3.8兆円のダミー値です。",
      drivers: unsafe
        ? ["短期筋の動きが目立ち、押し目買いを狙いたい局面という表現を検証用に含めています。"]
        : ["海外金利の動き、為替水準、決算発表への反応が主な確認材料です。"]
    },
    us: {
      indices: ["S&P 500は小幅高、NASDAQは小幅安のダミー値です。", "主要3指数は方向感がそろわない展開として整理しています。"],
      semiconductors: "半導体関連は銘柄ごとの決算材料で強弱が分かれた想定です。",
      rates: "米10年金利は小幅上昇のダミー値です。",
      news: ["金融政策を巡る発言、企業決算、雇用指標への反応を確認します。"]
    },
    fxRatesAndCommodities: {
      items: [
        "ドル円は157円台前半のダミー値です。",
        "米10年金利は4.27%のダミー値です。",
        "WTI原油は78.40ドル、金は2,335ドルのダミー値です。"
      ]
    },
    events: noData
      ? []
      : [
          { region: "日本", time: "08:30", title: "全国消費者物価指数", note: "MVP用のダミー予定です。" },
          { region: "米国", time: "21:30", title: "週間新規失業保険申請件数", note: "MVP用のダミー予定です。" },
          { region: "米国", time: "23:00", title: "景気先行指数", note: "MVP用のダミー予定です。" }
        ],
    relatedNews: [
      { category: "日本株", text: "主要企業の決算発表と為替感応度が確認点です。" },
      { category: "米国株", text: "大型テック株の決算と金利の反応が確認点です。" },
      { category: "為替・金利", text: "金融政策を巡る発言と米金利の変化を確認します。" },
      { category: "マクロ", text: "物価指標と雇用関連指標の発表予定を整理します。" }
    ]
  };
}

function metricCard(metric) {
  const value = metric.value || "データなし";
  const change = [metric.change, metric.pct].filter(Boolean).join(" / ") || "変化率なし";
  const source = metric.source || metric.note || "";
  return `
          <div class="metric">
            <b>${escapeHtml(metric.label)}</b>
            <span>${escapeHtml(value)}</span>
            <small class="metric-change">${escapeHtml(change)}</small>
            <small class="metric-note">${escapeHtml(source)}</small>
          </div>`;
}

function bulletList(items) {
  return `<ul class="brief-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function metricSourceDetails(metrics) {
  const rows = metrics
    .filter((metric) => metric.note || metric.source)
    .map((metric) => {
      const sourceLabel = metric.source || "Source";
      const sourceLink = metric.sourceUrl ? externalLink(metric.sourceUrl, sourceLabel) : escapeHtml(sourceLabel);
      const referenceLinks = Array.isArray(metric.referenceLinks)
        ? metric.referenceLinks
            .filter((link) => link && link.label && link.url)
            .map((link) => externalLink(link.url, link.label))
        : [];
      const links = [sourceLink, ...referenceLinks].filter(Boolean);
      const linkBlock = links.length ? `<small class="source-links">${links.join(" / ")}</small>` : "";
      return `<li><b>${escapeHtml(metric.label)}</b><span>${escapeHtml(metric.note || sourceLabel)}${linkBlock}</span></li>`;
    })
    .join("");
  if (!rows) return "";
  return `<details class="source-details">
            <summary>データ出典・注記</summary>
            <ul>${rows}</ul>
          </details>`;
}

function externalLink(url, label) {
  return `<a href="${escapeHtml(url)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(label)}</a>`;
}

function eventList(events) {
  if (!events.length) return "<p>本日のイベントデータは取得できていません。</p>";
  return `<ul class="brief-list">${events
    .map((event) => {
      const sourceLabel = event.source && event.source !== event.sourceKey ? event.source : "";
      const source = sourceLabel
        ? ` <small>${event.sourceUrl ? externalLink(event.sourceUrl, sourceLabel) : escapeHtml(sourceLabel)}</small>`
        : "";
      return `<li>${escapeHtml(event.region)} ${escapeHtml(event.time)} ${escapeHtml(event.title)}: ${escapeHtml(event.note)}${source}</li>`;
    })
    .join("")}</ul>`;
}

function relatedNewsList(news) {
  return `<ul class="brief-list news-list">${news.map(relatedNewsItem).join("")}</ul>`;
}

function relatedNewsItem(item) {
  const meta = [item.source, formatPublishedAt(item.publishedAt)].filter(Boolean).join(" / ");
  const title = item.url ? externalLink(item.url, item.text) : escapeHtml(item.text);
  const suffix = meta ? ` <small>${escapeHtml(meta)}</small>` : "";
  return `<li>${escapeHtml(item.category)}: ${title}${suffix}</li>`;
}

function formatPublishedAt(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function jsonScript(data) {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

export function renderArticle(snapshot) {
  const title = `${SITE_NAME} ${snapshot.dateLabel}版`;
  const description = `${snapshot.dateLabel}の株式・為替・金利・イベントを整理した朝の市場メモです。`;
  const articleUrl = siteUrl(`articles/daily/${snapshot.date}.html`);
  const ogUrl = siteUrl(`assets/og/${snapshot.date}.png`);
  const sourceText =
    snapshot.sourceMode === "dummy-mvp"
      ? "数値は初期MVP用のダミーで、外部APIは使用していません。"
      : "市場データは公開チャートデータから自動取得した終値ベースの参考値です。";
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    image: [ogUrl],
    datePublished: `${snapshot.date}T06:15:00+09:00`,
    dateModified: snapshot.generatedAt || `${snapshot.date}T06:15:00+09:00`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl
    },
    author: {
      "@type": "Organization",
      name: SITE_NAME
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_BASE_URL
    },
    isAccessibleForFree: true,
    about: ["株式", "為替", "金利", "経済イベント"],
    genre: "Market memo"
  };

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(articleUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
    <meta property="og:locale" content="ja_JP">
    <meta property="og:url" content="${escapeHtml(articleUrl)}">
    <meta property="og:image" content="${escapeHtml(ogUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${escapeHtml(title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogUrl)}">
    <meta name="twitter:image:alt" content="${escapeHtml(title)}">
    <link rel="stylesheet" href="../../assets/site.css">
    <script type="application/ld+json">${jsonScript(articleJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="site-kicker">Morning Market Memo</p>
        <a href="../../index.html" class="home-link">${escapeHtml(SITE_NAME)}</a>
      </div>
      <nav aria-label="Primary">
        <a href="../../index.html">Latest</a>
        <a href="../../archive.html">Archive</a>
        <a href="../../about.html">About</a>
      </nav>
    </header>

    <main class="brief-article">
      <article>
        <header class="article-hero">
          <time datetime="${escapeHtml(snapshot.date)}">${escapeHtml(snapshot.dateLabel)}</time>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}${escapeHtml(sourceText)}</p>
        </header>

        <section class="brief-section">
          <p class="section-label">Today's Brief</p>
          <h2>主要市場の確認</h2>
          <div class="metric-grid">
            ${snapshot.metrics.map(metricCard).join("")}
          </div>
          ${metricSourceDetails(snapshot.metrics)}
        </section>

        <section class="brief-section">
          <p class="section-label">Japan</p>
          <h2>前日の日本株</h2>
          ${bulletList([...snapshot.japan.indices, ...snapshot.japan.sectors, snapshot.japan.turnover, ...snapshot.japan.drivers])}
        </section>

        <section class="brief-section">
          <p class="section-label">United States</p>
          <h2>米国市場</h2>
          ${bulletList([...snapshot.us.indices, snapshot.us.semiconductors, snapshot.us.rates, ...snapshot.us.news])}
        </section>

        <section class="brief-section">
          <p class="section-label">FX / Rates / Commodities</p>
          <h2>為替・金利・商品</h2>
          ${bulletList(snapshot.fxRatesAndCommodities.items)}
        </section>

        <section class="brief-section">
          <p class="section-label">Events</p>
          <h2>本日のイベント</h2>
          ${eventList(snapshot.events)}
        </section>

        <section class="brief-section">
          <p class="section-label">Related News</p>
          <h2>関連ニュース</h2>
          ${relatedNewsList(snapshot.relatedNews)}
        </section>

        <section id="policy" class="brief-section">
          <p class="section-label">Policy / Disclosure</p>
          <h2>投資助言ではありません</h2>
          <div class="disclosure-box">
            <p>${escapeHtml(PUBLIC_DISCLOSURE)}</p>
            <p>${escapeHtml(AFFILIATE_DISCLOSURE)}</p>
            <p>${escapeHtml(EXTERNAL_LINK_DISCLOSURE)}</p>
          </div>
        </section>
      </article>
    </main>

    <footer>
      <p>${escapeHtml(SITE_NAME)}</p>
      <div class="footer-links">
        <a href="${escapeHtml(SITE_BASE_URL)}">Top</a>
        <a href="../../archive.html">Archive</a>
        <a href="../../about.html">About</a>
      </div>
    </footer>
  </body>
</html>
`;
}

export async function generateDailyBrief() {
  const date = getRunDate();
  const demoMode = getDemoMode();
  const dataMode = getDataMode();
  const paths = articlePaths(date);
  const useDummy = dataMode === "dummy" || demoMode !== "safe";
  const snapshot = useDummy ? buildDummySnapshot(date, demoMode) : await fetchMarketSnapshot(date);
  const html = renderArticle(snapshot);

  await writeJsonFile(paths.snapshot, snapshot);
  if (snapshot.eventDigest) {
    await writeJsonFile(paths.eventDigest, snapshot.eventDigest);
  }
  if (snapshot.newsDigest) {
    await writeJsonFile(paths.newsDigest, snapshot.newsDigest);
  }
  await writeTextFile(paths.draftHtml, html);
  await writeJsonFile(LATEST_RUN_PATH, {
    date,
    status: "DRAFT_READY",
    demoMode,
    dataMode: useDummy ? "dummy" : "live",
    generatedAt: snapshot.generatedAt,
    candidatePath: relativeFromRoot(paths.draftHtml),
    snapshotPath: relativeFromRoot(paths.snapshot),
    eventDigestPath: snapshot.eventDigest ? relativeFromRoot(paths.eventDigest) : "",
    newsDigestPath: snapshot.newsDigest ? relativeFromRoot(paths.newsDigest) : "",
    articlePath: relativeFromRoot(paths.publicHtml),
    proofreadReportPath: relativeFromRoot(paths.proofread)
  });

  console.log(`Generated candidate brief: ${relativeFromRoot(paths.draftHtml)}`);
  console.log(`Generated ${useDummy ? "dummy" : "live"} snapshot: ${relativeFromRoot(paths.snapshot)}`);
}

if (isMain(import.meta.url)) {
  generateDailyBrief().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
