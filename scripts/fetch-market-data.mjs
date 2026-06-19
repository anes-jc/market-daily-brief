import {
  articlePaths,
  getRunDate,
  isMain,
  japaneseDateLabel,
  readJsonFile,
  rootPath,
  writeJsonFile
} from "./site-utils.mjs";

const SOURCE_CONFIG_PATH = rootPath("config", "market-data-sources.json");
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function signed(value, decimals = 2, suffix = "") {
  if (!isFiniteNumber(value)) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}${suffix}`;
}

function formatValue(value, instrument) {
  if (!isFiniteNumber(value)) return "";
  if (instrument.format === "yield") {
    return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
  if (instrument.format === "fx") {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(value, instrument) {
  if (!isFiniteNumber(value)) return "";
  if (instrument.format === "yield") return signed(value, 2, "pt");
  return signed(value, 2);
}

function formatPct(value, instrument) {
  if (!isFiniteNumber(value) || instrument.format === "yield") return "";
  return signed(value, 2, "%");
}

function applyScale(value, instrument) {
  if (!isFiniteNumber(value)) return null;
  return value * (instrument.scale ?? 1);
}

function isoDateFromUnix(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function fetchYahooChart(instrument, config) {
  const url = new URL(`${YAHOO_CHART_BASE}/${encodeURIComponent(instrument.symbol)}`);
  url.searchParams.set("range", config.range || "10d");
  url.searchParams.set("interval", config.interval || "1d");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "market-daily-brief/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart request failed for ${instrument.symbol}: HTTP ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const error = data?.chart?.error;
  if (!result || error) {
    throw new Error(`Yahoo chart returned no result for ${instrument.symbol}: ${JSON.stringify(error)}`);
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const records = timestamps
    .map((timestamp, index) => ({
      date: isoDateFromUnix(timestamp),
      close: applyScale(quote.close?.[index], instrument),
      open: applyScale(quote.open?.[index], instrument),
      high: applyScale(quote.high?.[index], instrument),
      low: applyScale(quote.low?.[index], instrument),
      volume: quote.volume?.[index] ?? null
    }))
    .filter((record) => isFiniteNumber(record.close));

  if (records.length < 2) {
    throw new Error(`Yahoo chart returned fewer than two closing prices for ${instrument.symbol}`);
  }

  const latest = records.at(-1);
  const previous = records.slice(0, -1).reverse().find((record) => isFiniteNumber(record.close));
  if (!previous) {
    throw new Error(`Yahoo chart returned no previous close for ${instrument.symbol}`);
  }

  const changeValue = latest.close - previous.close;
  const pctValue = previous.close === 0 ? null : (changeValue / previous.close) * 100;
  const sourceName = "Yahoo Finance";
  const noteParts = [
    `${latest.date}終値`,
    sourceName,
    instrument.note || "",
    instrument.proxyFor ? `${instrument.proxyFor}の参考値` : ""
  ].filter(Boolean);

  return {
    key: instrument.key,
    label: instrument.label,
    value: formatValue(latest.close, instrument),
    change: formatChange(changeValue, instrument),
    pct: formatPct(pctValue, instrument),
    note: noteParts.join(" / "),
    source: sourceName,
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.symbol)}`,
    symbol: instrument.symbol,
    latestDate: latest.date,
    previousDate: previous.date,
    raw: {
      latestClose: latest.close,
      previousClose: previous.close,
      change: changeValue,
      pct: pctValue,
      currency: result.meta?.currency || "",
      exchangeName: result.meta?.exchangeName || "",
      instrumentType: result.meta?.instrumentType || ""
    }
  };
}

function metricByKey(metrics, key) {
  return metrics.find((metric) => metric.key === key) || {};
}

function buildTextSnapshot({ date, metrics, missingFields, config, errors }) {
  const nikkei = metricByKey(metrics, "nikkei");
  const topix = metricByKey(metrics, "topix");
  const sp500 = metricByKey(metrics, "sp500");
  const nasdaq = metricByKey(metrics, "nasdaq");
  const usdjpy = metricByKey(metrics, "usdjpy");
  const us10y = metricByKey(metrics, "us10y");
  const wti = metricByKey(metrics, "wti");
  const gold = metricByKey(metrics, "gold");

  const hasRequiredData = missingFields.length === 0;
  const sourceNote = hasRequiredData
    ? "公開チャートデータから終値を取得しました。ニュース本文や予想データは取得していません。"
    : "必須データの一部が取得できなかったため、公開停止対象です。";

  return {
    date,
    dateLabel: japaneseDateLabel(date),
    generatedAt: new Date().toISOString(),
    sourceMode: "live-yahoo-finance",
    demoMode: "safe",
    dataQuality: {
      hasRequiredData,
      missingFields,
      note: sourceNote,
      provider: config.marketDataProvider?.name || "Yahoo Finance chart endpoint",
      errors
    },
    metrics,
    japan: {
      indices: [
        `日経平均は${nikkei.value || "データなし"}（${[nikkei.change, nikkei.pct].filter(Boolean).join(" / ") || "前日比なし"}）です。`,
        `TOPIXは本指数の直取得が安定しないため、当面は${topix.label || "TOPIX連動ETF"}を参考値として表示します。`
      ],
      sectors: ["業種別データと売買代金は未接続です。次フェーズで利用条件が明確なデータ元を確認します。"],
      turnover: "プライム市場売買代金は未接続です。",
      drivers: ["指数、為替、米金利の水準を朝の確認材料として整理します。"]
    },
    us: {
      indices: [
        `S&P 500は${sp500.value || "データなし"}（${[sp500.change, sp500.pct].filter(Boolean).join(" / ") || "前日比なし"}）です。`,
        `NASDAQは${nasdaq.value || "データなし"}（${[nasdaq.change, nasdaq.pct].filter(Boolean).join(" / ") || "前日比なし"}）です。`
      ],
      semiconductors: "半導体関連の個別銘柄データは未接続です。",
      rates: `米10年金利は${us10y.value || "データなし"}（${us10y.change || "前日比なし"}）です。`,
      news: ["ニュース本文の自動取得は未接続です。見出し・URLのみを扱う設計で次フェーズに進めます。"]
    },
    fxRatesAndCommodities: {
      items: [
        `ドル円は${usdjpy.value || "データなし"}（${[usdjpy.change, usdjpy.pct].filter(Boolean).join(" / ") || "前日比なし"}）です。`,
        `米10年金利は${us10y.value || "データなし"}（${us10y.change || "前日比なし"}）です。`,
        `WTI原油は${wti.value || "データなし"}、金は${gold.value || "データなし"}です。`
      ]
    },
    events: [
      { region: "日本", time: "午前", title: "国内統計・日銀関連発表の確認", note: "イベントカレンダー連携前の確認枠です。" },
      { region: "米国", time: "夜", title: "米国経済指標・FRB関連発言の確認", note: "イベントカレンダー連携前の確認枠です。" }
    ],
    relatedNews: [
      { category: "日本株", text: "ニュース取得は未接続です。出典・URLのみを扱う形で追加予定です。" },
      { category: "米国株", text: "ニュース取得は未接続です。本文転載は行いません。" },
      { category: "為替・金利", text: "市場データと公式発表の確認枠を優先します。" },
      { category: "マクロ", text: "FREDなど公式性の高いデータ源は次候補として整理済みです。" }
    ],
    sources: metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      source: metric.source,
      symbol: metric.symbol,
      url: metric.sourceUrl,
      latestDate: metric.latestDate
    }))
  };
}

export async function fetchMarketSnapshot(date = getRunDate()) {
  const config = await readJsonFile(SOURCE_CONFIG_PATH);
  const metrics = [];
  const missingFields = [];
  const errors = [];

  for (const instrument of config.instruments || []) {
    try {
      const metric = await fetchYahooChart(instrument, config);
      metrics.push(metric);
    } catch (error) {
      errors.push({
        key: instrument.key,
        label: instrument.label,
        symbol: instrument.symbol,
        message: error.message
      });
      if (instrument.required) {
        missingFields.push(`metrics.${instrument.key}.value`);
      }
      metrics.push({
        key: instrument.key,
        label: instrument.label,
        value: "",
        change: "",
        pct: "",
        note: `取得失敗 / ${instrument.symbol}`,
        source: config.marketDataProvider?.name || "Yahoo Finance chart endpoint",
        sourceUrl: "",
        symbol: instrument.symbol
      });
    }
  }

  return buildTextSnapshot({ date, metrics, missingFields, config, errors });
}

export async function writeMarketSnapshot() {
  const date = getRunDate();
  const snapshot = await fetchMarketSnapshot(date);
  await writeJsonFile(articlePaths(date).snapshot, snapshot);
  console.log(`Fetched market snapshot: data/market-snapshots/${date}.json`);
}

if (isMain(import.meta.url)) {
  writeMarketSnapshot().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
