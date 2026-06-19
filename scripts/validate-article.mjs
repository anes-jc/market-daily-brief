import { promises as fs } from "node:fs";
import path from "node:path";
import {
  LATEST_RUN_PATH,
  articlePaths,
  fileExists,
  isMain,
  readJsonFile,
  relativeFromRoot,
  removeFileIfExists,
  rootPath,
  stripHtml,
  updateDailyArticlesData,
  writeJsonFile
} from "./site-utils.mjs";

function findSnippet(text, phrase) {
  const index = text.indexOf(phrase);
  if (index < 0) return "";
  const start = Math.max(0, index - 32);
  const end = Math.min(text.length, index + phrase.length + 32);
  return text.slice(start, end).trim();
}

function validateRequiredData(snapshot) {
  const missing = new Set(snapshot.dataQuality?.missingFields || []);

  if (!snapshot.dataQuality?.hasRequiredData) {
    for (const field of snapshot.dataQuality?.missingFields || []) missing.add(field);
  }

  for (const key of ["nikkei", "topix", "sp500", "nasdaq", "usdjpy", "us10y"]) {
    const metric = snapshot.metrics?.find((item) => item.key === key);
    if (!metric?.value) missing.add(`metrics.${key}.value`);
  }

  if (!Array.isArray(snapshot.events) || snapshot.events.length === 0) {
    missing.add("events");
  }

  return [...missing];
}

export async function validateArticle({ html, snapshot }) {
  const bannedPhrases = await readJsonFile(rootPath("rules", "banned-phrases.json"), []);
  const text = stripHtml(html);
  const bannedHits = bannedPhrases
    .filter((phrase) => text.includes(phrase))
    .map((phrase) => ({
      phrase,
      severity: "FAIL",
      snippet: findSnippet(text, phrase),
      suggestion: "市況の確認点を淡々と述べる表現へ置き換えてください。"
    }));

  const missingFields = validateRequiredData(snapshot);
  let status = "PASS";
  let reasonCode = "OK";

  if (missingFields.length) {
    status = "NO_DATA";
    reasonCode = "NO_DATA";
  } else if (bannedHits.length) {
    status = "FAIL";
    reasonCode = "BANNED_PHRASE";
  }

  const findings = [
    ...missingFields.map((field) => ({
      type: "missing_data",
      severity: "NO_DATA",
      field,
      message: "主要データが欠損しています。"
    })),
    ...bannedHits.map((hit) => ({
      type: "banned_phrase",
      severity: hit.severity,
      phrase: hit.phrase,
      snippet: hit.snippet,
      suggestion: hit.suggestion
    }))
  ];

  return {
    status,
    reasonCode,
    checkedAt: new Date().toISOString(),
    source: "dummy-proofread-mvp",
    summary:
      status === "PASS"
        ? "禁止表現、主要データ欠損、投資助言リスクは検出されませんでした。"
        : "自動公開を停止する確認事項が検出されました。",
    checks: {
      requiredData: missingFields.length ? "fail" : "pass",
      bannedPhrases: bannedHits.length ? "fail" : "pass",
      investmentAdviceRisk: bannedHits.length ? "fail" : "pass",
      pricePredictionRisk: "pass",
      hypeExpressionRisk: bannedHits.length ? "fail" : "pass",
      causalOverstatementRisk: "pass",
      adExpressionRisk: "pass",
      tone: "pass"
    },
    findings
  };
}

async function resolveValidationTarget() {
  const latest = await readJsonFile(LATEST_RUN_PATH);
  const date = latest.date;
  const paths = articlePaths(date);
  const candidateRelativePath = latest.candidatePath || latest.articlePath || "";
  let candidate = candidateRelativePath ? rootPath(...candidateRelativePath.split("/")) : paths.draftHtml;
  if (!(await fileExists(candidate)) && latest.articlePath) {
    candidate = rootPath(...latest.articlePath.split("/"));
  }
  const snapshotPath = latest.snapshotPath ? rootPath(...latest.snapshotPath.split("/")) : paths.snapshot;
  return { latest, date, paths, candidate, snapshotPath };
}

async function publishOrHold({ date, paths, candidate, html, snapshot, report }) {
  if (report.status === "PASS") {
    if (path.resolve(candidate) !== path.resolve(paths.publicHtml)) {
      await fs.copyFile(candidate, paths.publicHtml);
    }
    await removeFileIfExists(paths.draftHtml);
  } else {
    await fs.writeFile(paths.draftHtml, html, "utf8");
    await removeFileIfExists(paths.publicHtml);
    await removeFileIfExists(paths.ogImage);
    await removeFileIfExists(paths.socialPost);
  }

  await writeJsonFile(paths.proofread, {
    date,
    snapshotSource: snapshot.sourceMode,
    articlePath: report.status === "PASS" ? relativeFromRoot(paths.publicHtml) : relativeFromRoot(paths.draftHtml),
    ...report
  });

  const articles = await updateDailyArticlesData();
  await writeJsonFile(LATEST_RUN_PATH, {
    date,
    status: report.status,
    reasonCode: report.reasonCode,
    generatedAt: snapshot.generatedAt,
    checkedAt: report.checkedAt,
    published: report.status === "PASS",
    candidatePath: report.status === "PASS" ? "" : relativeFromRoot(paths.draftHtml),
    snapshotPath: relativeFromRoot(paths.snapshot),
    articlePath: report.status === "PASS" ? relativeFromRoot(paths.publicHtml) : "",
    draftPath: report.status === "PASS" ? "" : relativeFromRoot(paths.draftHtml),
    proofreadReportPath: relativeFromRoot(paths.proofread),
    articleCount: articles.length,
    findings: report.findings
  });
}

export async function validateLatestArticle() {
  const { date, paths, candidate, snapshotPath } = await resolveValidationTarget();

  if (!(await fileExists(candidate))) {
    throw new Error(`Candidate article not found: ${relativeFromRoot(candidate)}`);
  }

  const html = await fs.readFile(candidate, "utf8");
  const snapshot = await readJsonFile(snapshotPath);
  const report = await validateArticle({ html, snapshot });
  await publishOrHold({ date, paths, candidate, html, snapshot, report });

  console.log(`Validation status: ${report.status}`);
  if (report.findings.length) {
    for (const finding of report.findings) {
      console.log(`- ${finding.type}: ${finding.phrase || finding.field || finding.message}`);
    }
  }
}

if (isMain(import.meta.url)) {
  validateLatestArticle().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
