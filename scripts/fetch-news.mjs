import { getRunDate, isMain, readJsonFile, rootPath, writeJsonFile } from "./site-utils.mjs";

const NEWS_CONFIG_PATH = rootPath("config", "news-sources.json");
const BANNED_PHRASES_PATH = rootPath("rules", "banned-phrases.json");

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

function decodeXml(value) {
  return stripBom(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

function stripTags(value) {
  return decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstTag(block, tagNames) {
  for (const tagName of tagNames) {
    const escaped = tagName.replace(":", "\\:");
    const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i");
    const match = block.match(pattern);
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function firstLink(block) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (href) return decodeXml(href[1]);
  return firstTag(block, ["link"]);
}

function parseDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function parseFeedItems(xml) {
  const content = stripBom(xml);
  const rssItems = [...content.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomItems = [...content.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = rssItems.length ? rssItems : atomItems;

  return blocks.map((block) => ({
    title: stripTags(firstTag(block, ["title"])),
    url: firstLink(block),
    publishedAt: parseDate(firstTag(block, ["pubDate", "published", "updated", "dc:date"])),
    guid: firstTag(block, ["guid", "id"])
  }));
}

function withinMaxAge(item, maxAgeHours) {
  if (!item.publishedAt || !maxAgeHours) return true;
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  return ageMs <= maxAgeHours * 60 * 60 * 1000;
}

function normalizedText(value) {
  return String(value || "").toLocaleLowerCase("en-US");
}

function findBannedPhrase(title, bannedPhrases) {
  const normalizedTitle = normalizedText(title);
  return bannedPhrases.find((phrase) => normalizedTitle.includes(normalizedText(phrase))) || "";
}

async function fetchFeed(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "market-daily-brief/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`RSS request failed for ${source.key}: HTTP ${response.status}`);
  }

  const xml = await response.text();
  return parseFeedItems(xml)
    .filter((item) => item.title && item.url)
    .map((item) => ({
      category: source.category,
      source: source.source,
      sourceKey: source.key,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      language: source.language || "",
      guid: item.guid || item.url
    }));
}

function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = `${item.url || ""}::${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export async function fetchNewsDigest(date = getRunDate()) {
  const config = await readJsonFile(NEWS_CONFIG_PATH);
  const bannedPhrases = await readJsonFile(BANNED_PHRASES_PATH, []);
  const errors = [];
  const skipped = [];
  const collected = [];

  for (const source of config.sources || []) {
    try {
      const sourceItems = await fetchFeed(source);
      const selected = [];

      for (const item of sourceItems) {
        if (!withinMaxAge(item, config.maxAgeHours)) continue;
        const bannedPhrase = findBannedPhrase(item.title, bannedPhrases);
        if (bannedPhrase) {
          skipped.push({
            source: item.source,
            title: item.title,
            phrase: bannedPhrase,
            reason: "banned_phrase"
          });
          continue;
        }
        selected.push(item);
        if (selected.length >= (source.maxItems || 3)) break;
      }

      collected.push(...selected);
    } catch (error) {
      errors.push({
        source: source.source,
        key: source.key,
        url: source.url,
        message: error.message
      });
    }
  }

  const items = dedupeItems(collected)
    .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
    .slice(0, config.maxItemsTotal || 10);

  return {
    date,
    generatedAt: new Date().toISOString(),
    sourceMode: config.sourceMode || "rss-headlines",
    note: config.note || "",
    items,
    errors,
    skipped
  };
}

export async function writeNewsDigest() {
  const date = getRunDate();
  const digest = await fetchNewsDigest(date);
  const path = rootPath("data", "news-digests", `${date}.json`);
  await writeJsonFile(path, digest);
  console.log(`Fetched news digest: data/news-digests/${date}.json`);
}

if (isMain(import.meta.url)) {
  writeNewsDigest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
