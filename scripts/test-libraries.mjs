import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await fs.mkdir(".desktop-test", { recursive: true });
const run = await fs.mkdtemp(path.resolve(".desktop-test/libraries-"));
const first = path.join(run, "第一文件夹"),
  second = path.join(run, "第二文件夹"),
  profile = path.join(run, "profile");
for (const folder of [first, second, profile]) await fs.mkdir(folder);
await fs.writeFile(
  path.join(profile, "workspace.json"),
  JSON.stringify({ root: first }),
);
await fs.writeFile(path.join(first, "第一篇.md"), "# 第一篇");
await fs.writeFile(path.join(second, "第二篇.md"), "# 第二篇");
const env = { ...process.env, YMG_USER_DATA: profile, YMG_TEST: "1" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.YMG_DEV_URL;
async function launch() {
  const app = await electron.launch({
    executablePath: process.argv[2] || require("electron"),
    args: process.argv[2] ? [] : ["."],
    env,
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".desktop-loading", { state: "detached" });
  return { app, page };
}
let running = await launch();
try {
  let { app, page } = running;
  await expect(page.locator(".markdown-body h1")).toHaveText("第一篇");
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, second);
  await page.locator(".workspace").click();
  await page.getByRole("button", { name: "收录文件夹…", exact: true }).click();
  await expect(page.locator(".markdown-body h1")).toHaveText("第二篇");
  await page.locator(".cm-content").fill("# 第二篇\n\n原目录写入");
  await page.locator(".workspace").click();
  await page
    .locator(".library-entry")
    .filter({ hasText: "第一文件夹" })
    .locator("button")
    .first()
    .click();
  await expect(page.locator(".markdown-body h1")).toHaveText("第一篇");
  expect(await fs.readFile(path.join(second, "第二篇.md"), "utf8")).toContain(
    "原目录写入",
  );
  await app.close();
  running = await launch();
  ({ app, page } = running);
  await page.locator(".workspace").click();
  await expect(page.locator(".library-entry")).toHaveCount(2);
  await page.getByTitle("移除收录 第二文件夹", { exact: true }).click();
  await expect(page.locator(".library-entry")).toHaveCount(1);
  expect(await fs.readFile(path.join(second, "第二篇.md"), "utf8")).toContain(
    "原目录写入",
  );
  console.log(
    "Collected folders switch, save, restore and untrack without deleting:",
    run,
  );
} finally {
  await running.app.close();
}
