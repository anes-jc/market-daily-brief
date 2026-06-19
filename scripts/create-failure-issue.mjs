import {
  LATEST_RUN_PATH,
  isMain,
  readJsonFile,
  relativeFromRoot,
  rootPath,
  siteUrl,
  todayInTokyo
} from "./site-utils.mjs";

async function readLatestRun() {
  try {
    return await readJsonFile(LATEST_RUN_PATH);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function buildIssueBody({ date, latest, workflowConclusion, runUrl }) {
  const status = latest?.status || "ERROR";
  const reasonCode = workflowConclusion && workflowConclusion !== "success" ? "WORKFLOW_ERROR" : latest?.reasonCode || status;
  const findings = latest?.findings || [];
  const findingLines = findings.length
    ? findings
        .map((finding) => {
          if (finding.type === "banned_phrase") {
            return `- ${finding.phrase}: ${finding.snippet || "検出箇所の取得なし"}`;
          }
          if (finding.type === "missing_data") {
            return `- ${finding.field}: ${finding.message}`;
          }
          return `- ${finding.message || JSON.stringify(finding)}`;
        })
        .join("\n")
    : "- 検出内容の詳細は Actions ログを確認してください。";

  const draftPath = latest?.draftPath || `drafts/${date}.html`;
  const reportPath = latest?.proofreadReportPath || `data/proofread-reports/${date}.json`;
  const summary =
    reasonCode === "WORKFLOW_ERROR"
      ? "GitHub Actions の途中でエラーが発生したため、自動公開を完了できませんでした。"
      : "自動公開を停止する確認事項が検出されたため、公開しませんでした。";

  return `公開状態：未公開
原因区分：${reasonCode}

概要：
${summary}

確認してほしいこと：
- ${draftPath} を確認
- ${reportPath} を確認
- 問題なければ手動修正後に再実行

検出された内容：
${findingLines}

公開予定URL：
${siteUrl(`articles/daily/${date}.html`)}

Actions 実行：
${runUrl || "Actions 画面を確認してください。"}

このIssueは Market Daily Brief の自動生成ワークフローが作成しました。`;
}

async function githubRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "market-daily-brief-action",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${text}`);
  }
  return data;
}

export async function createFailureIssue() {
  const latest = await readLatestRun();
  const workflowConclusion = process.env.WORKFLOW_CONCLUSION || "";
  const shouldCreate =
    (workflowConclusion && workflowConclusion !== "success") || (latest?.status && latest.status !== "PASS");

  if (!shouldCreate) {
    console.log("No failure issue needed.");
    return;
  }

  const date = latest?.date || todayInTokyo();
  const title = `【要確認】${date} の Market Daily Brief は公開されませんでした`;
  const repo = process.env.GITHUB_REPOSITORY || "";
  const token = process.env.GITHUB_TOKEN || "";
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";
  const body = buildIssueBody({ date, latest, workflowConclusion, runUrl });

  if (!repo || !token) {
    console.log("GitHub token or repository is not available. Issue body follows:");
    console.log(`TITLE: ${title}`);
    console.log(body);
    return;
  }

  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  const issues = await githubRequest(`/repos/${encodedRepo}/issues?state=open&per_page=50`, { token });
  const existing = issues.find((issue) => issue.title === title && !issue.pull_request);

  if (existing) {
    await githubRequest(`/repos/${encodedRepo}/issues/${existing.number}/comments`, {
      method: "POST",
      token,
      body: { body: `同じ日の自動生成で再度確認が必要になりました。\n\n${body}` }
    });
    console.log(`Updated existing issue #${existing.number}.`);
    return;
  }

  const issue = await githubRequest(`/repos/${encodedRepo}/issues`, {
    method: "POST",
    token,
    body: { title, body }
  });
  console.log(`Created issue #${issue.number}: ${issue.html_url}`);
}

if (isMain(import.meta.url)) {
  createFailureIssue().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
