import { getRunDate, isMain, readJsonFile, rootPath } from "./site-utils.mjs";

const EVENT_CONFIG_PATH = rootPath("config", "market-events.json");
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayNameInTokyo(date) {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  return DAY_NAMES[parsed.getUTCDay()];
}

function dayTags(date) {
  const day = dayNameInTokyo(date);
  const tags = new Set([day]);
  if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day)) {
    tags.add("weekday");
  } else {
    tags.add("weekend");
  }
  return tags;
}

function normalizeEvent(event, sourceMode, date) {
  return {
    region: event.region || "全体",
    time: event.time || "未定",
    title: event.title || "イベント確認",
    category: event.category || "macro",
    importance: event.importance || "medium",
    note: event.note || "イベントカレンダー設定から読み込みました。",
    date,
    source: sourceMode
  };
}

function eventSortKey(event) {
  const regionRank = { 日本: "1", 米国: "2", 全体: "9" }[event.region] || "5";
  return `${regionRank}-${event.time}-${event.title}`;
}

export async function loadManualMarketEvents(date = getRunDate()) {
  const config = await readJsonFile(EVENT_CONFIG_PATH);
  const tags = dayTags(date);
  const sourceMode = config.sourceMode || "manual-config";

  const dated = (config.datedEvents || [])
    .filter((event) => event.date === date)
    .map((event) => normalizeEvent(event, sourceMode, date));

  const recurring = (config.recurringEvents || [])
    .filter((event) => (event.days || []).some((day) => tags.has(day)))
    .map((event) => normalizeEvent(event, sourceMode, date));

  const selected = dated.length ? dated : recurring;
  const events = selected.length
    ? selected
    : (config.fallbackEvents || []).map((event) => normalizeEvent(event, sourceMode, date));

  return events.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b), "ja"));
}

export async function loadMarketEvents(date = getRunDate()) {
  return loadManualMarketEvents(date);
}

if (isMain(import.meta.url)) {
  loadMarketEvents().then(
    (events) => {
      console.log(JSON.stringify(events, null, 2));
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
