import {
  LATEST_RUN_PATH,
  articlePaths,
  isMain,
  japaneseDateLabel,
  readJsonFile,
  relativeFromRoot,
  siteUrl,
  writeTextFile
} from "./site-utils.mjs";

export async function generateSocialPost() {
  const latest = await readJsonFile(LATEST_RUN_PATH);
  const paths = articlePaths(latest.date);

  if (latest.status !== "PASS") {
    console.log(`Skip social post because latest status is ${latest.status}.`);
    return;
  }

  const text = `本日の Market Daily Brief を更新しました。\n\n株式・為替・金利・イベントの朝の市場メモです。投資助言ではありません。\n\n${japaneseDateLabel(latest.date)}版\n${siteUrl(`articles/daily/${latest.date}.html`)}\n`;
  await writeTextFile(paths.socialPost, text);
  console.log(`Generated social post: ${relativeFromRoot(paths.socialPost)}`);
}

if (isMain(import.meta.url)) {
  generateSocialPost().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
