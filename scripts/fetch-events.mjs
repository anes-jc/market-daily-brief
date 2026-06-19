import {
  articlePaths,
  fetchWithTimeout,
  getRunDate,
  isMain,
  readJsonFile,
  rootPath,
  writeJsonFile
} from "./site-utils.mjs";
import { loadManualMarketEvents } from "./load-events.mjs";

const EVENT_SOURCE_CONFIG_PATH = rootPath("config", "event-sources.json");
const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function normalizeSourceUrl(url, href) {
  if (!href) return url;
  return new URL(href, url).toString();
}

function formatDateParts(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function partsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const zoned = partsInTimeZone(guess, timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
  const offset = zonedAsUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function dateInTokyo(date) {
  return formatDateParts(partsInTimeZone(date, "Asia/Tokyo"));
}

function timeInTokyo(date) {
  const parts = partsInTimeZone(date, "Asia/Tokyo");
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function monthNumber(name) {
  return MONTHS[String(name || "").replace(/\./g, "").toLowerCase()] || 0;
}

function parseMonthDay(value, defaultYear) {
  const match = String(value || "").match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\b|,)/);
  if (!match) return null;
  const month = monthNumber(match[1]);
  if (!month) return null;
  const yearMatch = String(value || "").match(/\b(20\d{2})\b/);
  return {
    year: yearMatch ? Number(yearMatch[1]) : defaultYear,
    month,
    day: Number(match[2])
  };
}

function makeEvent({ date, time, region, title, category, importance, note, source, sourceKey, sourceUrl }) {
  return {
    date,
    time: time || "未定",
    region,
    title,
    category: category || "macro",
    importance: importance || "medium",
    note,
    source: source || "official-calendar",
    sourceKey,
    sourceUrl,
    official: true
  };
}

function eventSortKey(event) {
  const regionRank = { 日本: "1", 米国: "2", 全体: "9" }[event.region] || "5";
  const time = /^\d{2}:\d{2}$/.test(event.time) ? event.time : event.time === "午前" ? "08:00" : "99:99";
  return `${regionRank}-${time}-${event.title}`;
}

function dedupeEvents(events) {
  const seen = new Set();
  const deduped = [];

  for (const event of events) {
    const key = `${event.date}|${event.time}|${event.region}|${event.title}|${event.sourceKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  return deduped.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b), "ja"));
}

function parseIcsProperties(block) {
  const properties = {};
  const unfolded = block.replace(/\r?\n[ \t]/g, "");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const rawName = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const name = rawName.split(";")[0].toUpperCase();
    properties[name] = value
      .replace(/\\n/g, " ")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
  }
  return properties;
}

function parseIcsDate(value, sourceTimeZone) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] ? Number(match[4]) : 0,
    minute: match[5] ? Number(match[5]) : 0
  };
  const utc = zonedDateTimeToUtc(parts, sourceTimeZone);
  return {
    tokyoDate: dateInTokyo(utc),
    tokyoTime: match[4] ? timeInTokyo(utc) : "未定",
    sourceDate: formatDateParts(parts)
  };
}

async function fetchBlsEvents(source, targetDate, requestTimeoutMs) {
  const response = await fetchWithTimeout(
    source.url,
    { headers: { "User-Agent": "market-daily-brief/1.0" } },
    requestTimeoutMs
  );
  if (!response.ok) throw new Error(`BLS calendar request failed: HTTP ${response.status}`);

  const text = await response.text();
  const events = [];
  for (const block of text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) {
    const properties = parseIcsProperties(block);
    const parsed = parseIcsDate(properties.DTSTART, source.timeZone || "America/New_York");
    if (!parsed || parsed.tokyoDate !== targetDate) continue;
    events.push(
      makeEvent({
        date: targetDate,
        time: parsed.tokyoTime,
        region: source.region,
        title: `BLS ${properties.SUMMARY}`,
        category: source.category,
        importance: source.importance,
        note: `BLS公式ICSから取得。米東部時間の予定を日本時間に換算しています。`,
        source: source.source,
        sourceKey: source.key,
        sourceUrl: source.url
      })
    );
  }
  return events;
}

async function fetchBeaEvents(source, targetDate, requestTimeoutMs) {
  const response = await fetchWithTimeout(
    source.url,
    { headers: { "User-Agent": "market-daily-brief/1.0" } },
    requestTimeoutMs
  );
  if (!response.ok) throw new Error(`BEA schedule request failed: HTTP ${response.status}`);

  const html = await response.text();
  const year = Number((html.match(/<th[^>]*>\s*Year\s+(20\d{2})\s*<\/th>/i) || [])[1]);
  if (!year) return [];

  const events = [];
  for (const row of html.match(/<tr class="scheduled-releases-type-[\s\S]*?<\/tr>/g) || []) {
    const dateText = stripTags((row.match(/<div class="release-date">([\s\S]*?)<\/div>/i) || [])[1]);
    const timeText = stripTags((row.match(/<small class="text-muted">([\s\S]*?)<\/small>/i) || [])[1]);
    const title = stripTags((row.match(/<td class="release-title[\s\S]*?>([\s\S]*?)<\/td>/i) || [])[1]);
    const dateParts = parseMonthDay(dateText, year);
    if (!dateParts || !title) continue;

    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const hour12 = timeMatch ? Number(timeMatch[1]) : 8;
    const minute = timeMatch ? Number(timeMatch[2]) : 30;
    const period = timeMatch ? timeMatch[3].toUpperCase() : "AM";
    const hour = period === "PM" && hour12 !== 12 ? hour12 + 12 : period === "AM" && hour12 === 12 ? 0 : hour12;
    const utc = zonedDateTimeToUtc({ ...dateParts, hour, minute }, source.timeZone || "America/New_York");
    if (dateInTokyo(utc) !== targetDate) continue;

    events.push(
      makeEvent({
        date: targetDate,
        time: timeInTokyo(utc),
        region: source.region,
        title: `BEA ${title}`,
        category: source.category,
        importance: source.importance,
        note: `BEA公式Release Scheduleから取得。米東部時間の予定を日本時間に換算しています。`,
        source: source.source,
        sourceKey: source.key,
        sourceUrl: source.url
      })
    );
  }
  return events;
}

function parseFedMeetingDays(month, dateText, year) {
  const clean = String(dateText || "").replace(/\*/g, "").trim();
  const [startText, endText] = clean.split("-");
  const startDay = Number(startText);
  const endDay = Number(endText || startText);
  const monthValue = monthNumber(month);
  if (!startDay || !endDay || !monthValue) return [];

  const days = [];
  for (let day = startDay; day <= endDay; day += 1) {
    days.push(formatDateParts({ year, month: monthValue, day }));
  }
  return days;
}

async function fetchFedFomcEvents(source, targetDate, requestTimeoutMs) {
  const response = await fetchWithTimeout(
    source.url,
    { headers: { "User-Agent": "market-daily-brief/1.0" } },
    requestTimeoutMs
  );
  if (!response.ok) throw new Error(`Federal Reserve FOMC calendar request failed: HTTP ${response.status}`);

  const year = Number(targetDate.slice(0, 4));
  const html = await response.text();
  const start = html.indexOf(`${year} FOMC Meetings`);
  if (start < 0) return [];
  const nextYearStart = html.indexOf(`${year - 1} FOMC Meetings`, start + 1);
  const section = html.slice(start, nextYearStart > start ? nextYearStart : start + 30000);
  const events = [];
  const rowPattern =
    /fomc-meeting__month[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)<\/div>([\s\S]*?)(?=<div class="(?:fomc-meeting|fomc-meeting--shaded)|<div class="panel-footer")/g;

  for (const match of section.matchAll(rowPattern)) {
    const month = stripTags(match[1]);
    const dateText = stripTags(match[2]);
    const body = match[3];
    const isSepMeeting = /\*/.test(dateText);
    const meetingDates = parseFedMeetingDays(month, dateText, year);
    if (meetingDates.includes(targetDate)) {
      events.push(
        makeEvent({
          date: targetDate,
          time: "米国時間",
          region: source.region,
          title: `FOMC会合日程${isSepMeeting ? "（SEP公表回）" : ""}`,
          category: source.category,
          importance: source.importance,
          note: "Federal Reserve公式FOMC calendarから取得。日付は米国時間の会合日です。",
          source: source.source,
          sourceKey: source.key,
          sourceUrl: source.url
        })
      );
    }

    const released = (body.match(/Released\s+([A-Za-z]+\s+\d{1,2},\s+20\d{2})/i) || [])[1];
    const releaseParts = parseMonthDay(released, year);
    if (releaseParts && formatDateParts(releaseParts) === targetDate) {
      events.push(
        makeEvent({
          date: targetDate,
          time: "米国時間",
          region: source.region,
          title: "FOMC議事要旨公表予定",
          category: source.category,
          importance: source.importance,
          note: "Federal Reserve公式FOMC calendarから取得。公表日は米国時間ベースです。",
          source: source.source,
          sourceKey: source.key,
          sourceUrl: source.url
        })
      );
    }
  }
  return events;
}

function parseBojDateList(text, defaultYear) {
  const clean = stripTags(text)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean === "-" || /to be announced/i.test(clean)) return [];

  const dates = [];
  let currentMonth = 0;
  let currentYear = defaultYear;
  for (const part of clean.split(",")) {
    const yearMatch = part.match(/\b(20\d{2})\b/);
    if (yearMatch) currentYear = Number(yearMatch[1]);
    const monthMatch = part.match(/\b([A-Za-z]{3,9})\.?\b/);
    if (monthMatch && monthNumber(monthMatch[1])) currentMonth = monthNumber(monthMatch[1]);
    const dayMatch = part.match(/\b(\d{1,2})\b/);
    if (!currentMonth || !dayMatch) continue;
    dates.push(formatDateParts({ year: currentYear, month: currentMonth, day: Number(dayMatch[1]) }));
  }
  return dates;
}

function firstHref(html, fallback) {
  const href = (String(html || "").match(/<a[^>]+href=["']([^"']+)["']/i) || [])[1];
  return href ? normalizeSourceUrl(fallback, href) : fallback;
}

async function fetchBojMpmEvents(source, targetDate, requestTimeoutMs) {
  const response = await fetchWithTimeout(
    source.url,
    { headers: { "User-Agent": "market-daily-brief/1.0" } },
    requestTimeoutMs
  );
  if (!response.ok) throw new Error(`BOJ MPM calendar request failed: HTTP ${response.status}`);

  const year = Number(targetDate.slice(0, 4));
  const html = await response.text();
  const captionIndex = html.indexOf(`Table : ${year}`);
  if (captionIndex < 0) return [];
  const tableEnd = html.indexOf("</table>", captionIndex);
  const table = html.slice(captionIndex, tableEnd > captionIndex ? tableEnd : captionIndex + 12000);
  const events = [];

  for (const row of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length < 4) continue;

    const columns = [
      {
        index: 0,
        title: "日銀 金融政策決定会合",
        time: "日程",
        note: "Bank of Japan公式MPM scheduleから取得。日付は日本時間です。"
      },
      {
        index: 1,
        title: "日銀 展望レポート公表予定",
        time: "会合後",
        note: "Bank of Japan公式MPM scheduleから取得。公表時刻は公式発表で確認してください。"
      },
      {
        index: 2,
        title: "日銀 主な意見公表予定",
        time: "08:50",
        note: "Bank of Japan公式MPM scheduleから取得。公表時刻は原則8:50です。"
      },
      {
        index: 3,
        title: "日銀 金融政策決定会合 議事要旨公表予定",
        time: "08:50",
        note: "Bank of Japan公式MPM scheduleから取得。公表時刻は原則8:50です。"
      }
    ];

    for (const column of columns) {
      const dates = parseBojDateList(cells[column.index], year);
      if (!dates.includes(targetDate)) continue;
      events.push(
        makeEvent({
          date: targetDate,
          time: column.time,
          region: source.region,
          title: column.title,
          category: source.category,
          importance: source.importance,
          note: column.note,
          source: source.source,
          sourceKey: source.key,
          sourceUrl: firstHref(cells[column.index], source.url)
        })
      );
    }
  }
  return events;
}

async function fetchSourceEvents(source, targetDate, requestTimeoutMs) {
  if (source.type === "ics") return fetchBlsEvents(source, targetDate, requestTimeoutMs);
  if (source.type === "bea-html") return fetchBeaEvents(source, targetDate, requestTimeoutMs);
  if (source.type === "fed-fomc-html") return fetchFedFomcEvents(source, targetDate, requestTimeoutMs);
  if (source.type === "boj-mpm-html") return fetchBojMpmEvents(source, targetDate, requestTimeoutMs);
  throw new Error(`Unsupported event source type: ${source.type}`);
}

export async function fetchEventDigest(date = getRunDate()) {
  const config = await readJsonFile(EVENT_SOURCE_CONFIG_PATH);
  const errors = [];
  const officialItems = [];
  const requestTimeoutMs = config.requestTimeoutMs || 15000;

  for (const source of config.sources || []) {
    if (source.enabled === false) continue;
    try {
      officialItems.push(...(await fetchSourceEvents(source, date, requestTimeoutMs)));
    } catch (error) {
      errors.push({
        source: source.source,
        key: source.key,
        url: source.url,
        message: error.message
      });
    }
  }

  const manualItems = (await loadManualMarketEvents(date)).map((event) => ({
    ...event,
    official: false
  }));
  const officialEvents = dedupeEvents(officialItems);
  const fallbackUsed = officialEvents.length === 0;
  const items = fallbackUsed ? manualItems : officialEvents;

  return {
    date,
    generatedAt: new Date().toISOString(),
    sourceMode: config.sourceMode || "official-event-calendar",
    note: config.note || "",
    fallbackUsed,
    items,
    errors,
    manualFallbackCount: manualItems.length
  };
}

export async function writeEventDigest() {
  const date = getRunDate();
  const digest = await fetchEventDigest(date);
  await writeJsonFile(articlePaths(date).eventDigest, digest);
  console.log(`Fetched event digest: data/event-digests/${date}.json`);
}

if (isMain(import.meta.url)) {
  writeEventDigest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
