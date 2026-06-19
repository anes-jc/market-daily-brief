import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE_BASE_URL = "https://anes-jc.github.io/market-daily-brief";
export const SITE_NAME = "Market Daily Brief";
export const SITE_DESCRIPTION = "朝に読む、株式・為替・金利・イベントの市場メモ。";
export const PUBLIC_DISCLOSURE =
  "当サイトは、株式・為替・金利・経済イベントに関する公開情報を整理することを目的としています。個別銘柄の推奨、売買の勧誘、投資判断の助言、株価予想を目的とするものではありません。最終的な投資判断は、利用者ご自身の責任で行ってください。";
export const AFFILIATE_DISCLOSURE =
  "当サイトは一部アフィリエイトリンクを含む場合があります。掲載の有無や報酬条件は、記事本文の市場整理には影響しません。";

export const LATEST_RUN_PATH = rootPath("data/latest-run.json");

export function rootPath(...parts) {
  return path.join(ROOT_DIR, ...parts);
}

export function isMain(importMetaUrl) {
  return Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function relativeFromRoot(filePath) {
  return toPosixPath(path.relative(ROOT_DIR, filePath));
}

export function siteUrl(relativePath = "") {
  const clean = relativePath.replace(/^\/+/, "");
  return clean ? `${SITE_BASE_URL}/${clean}` : `${SITE_BASE_URL}/`;
}

export function getArgValue(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return "";
}

export function getRunDate() {
  const fromArg = getArgValue("date");
  const fromEnv = process.env.BRIEF_DATE || "";
  const value = (fromArg || fromEnv || todayInTokyo()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`BRIEF_DATE must be YYYY-MM-DD. Received: ${value}`);
  }
  return value;
}

export function getDemoMode() {
  const fromArg = getArgValue("demo-mode");
  const fromEnv = process.env.BRIEF_DEMO_MODE || "";
  const mode = (fromArg || fromEnv || "safe").trim();
  if (!["safe", "unsafe", "no-data"].includes(mode)) {
    throw new Error(`BRIEF_DEMO_MODE must be safe, unsafe, or no-data. Received: ${mode}`);
  }
  return mode;
}

export function getDataMode() {
  const fromArg = getArgValue("data-mode");
  const fromEnv = process.env.BRIEF_DATA_MODE || "";
  const mode = (fromArg || fromEnv || "live").trim();
  if (!["live", "dummy"].includes(mode)) {
    throw new Error(`BRIEF_DATA_MODE must be live or dummy. Received: ${mode}`);
  }
  return mode;
}

export function todayInTokyo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function japaneseDateLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeTextFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function writeJsonFile(filePath, data) {
  await writeTextFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function readJsonFile(filePath, fallback = undefined) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function articlePaths(date) {
  return {
    publicHtml: rootPath("articles", "daily", `${date}.html`),
    draftHtml: rootPath("drafts", `${date}.html`),
    snapshot: rootPath("data", "market-snapshots", `${date}.json`),
    newsDigest: rootPath("data", "news-digests", `${date}.json`),
    proofread: rootPath("data", "proofread-reports", `${date}.json`),
    ogImage: rootPath("assets", "og", `${date}.png`),
    socialPost: rootPath("data", "social-posts", `${date}.txt`)
  };
}

export function extractMeta(html, name) {
  const pattern = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

export function extractTitle(html) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : SITE_NAME;
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export async function buildArticleIndex() {
  const articleDir = rootPath("articles", "daily");
  await ensureDir(articleDir);
  const files = await fs.readdir(articleDir);
  const articles = [];

  for (const file of files) {
    if (!/^\d{4}-\d{2}-\d{2}\.html$/.test(file)) continue;
    const date = file.replace(/\.html$/, "");
    const htmlPath = path.join(articleDir, file);
    const html = await fs.readFile(htmlPath, "utf8");
    const title = extractTitle(html);
    const summary = extractMeta(html, "description") || SITE_DESCRIPTION;
    articles.push({
      date,
      dateLabel: japaneseDateLabel(date),
      title,
      summary,
      url: `articles/daily/${file}`,
      absoluteUrl: siteUrl(`articles/daily/${file}`),
      ogImage: `assets/og/${date}.png`,
      absoluteOgImage: siteUrl(`assets/og/${date}.png`)
    });
  }

  return articles.sort((a, b) => b.date.localeCompare(a.date));
}

export async function updateDailyArticlesData() {
  const articles = await buildArticleIndex();
  const content = `window.MARKET_DAILY_ARTICLES = ${JSON.stringify(articles, null, 2)};\n`;
  await writeTextFile(rootPath("data", "daily-articles.js"), content);
  return articles;
}
