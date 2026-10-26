import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const run = await fs.mkdtemp(path.resolve(".desktop-test/pdf-"));
const vault = path.join(run, "vault"),
  profile = path.join(run, "profile"),
  pdf = path.join(run, "导出测试.pdf");
await fs.mkdir(vault);
await fs.mkdir(profile);
await fs.writeFile(
  path.join(profile, "workspace.json"),
  JSON.stringify({ root: vault }),
);
await fs.writeFile(
  path.join(vault, "测试.md"),
  "# 中文 PDF 测试\n\n行内 $E=mc^2$\n\n$$\n\\int_0^1 x^2 \\,dx=\\frac{1}{3}\n$$\n\n**加粗内容**\n\n```typescript\nconst answer = 42;\n```\n\n| 标题 | 内容 |\n| --- | --- |\n| 测试 | 中文表格 |\n\n" +
    Array.from({ length: 80 }, (_, i) => `段落 ${i}：中文长文分页测试。`).join(
      "\n\n",
    ),
);
const env = { ...process.env, YMG_USER_DATA: profile, YMG_TEST: "1" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.YMG_DEV_URL;
const app = await electron.launch({
  executablePath: process.argv[2] || require("electron"),
  args: process.argv[2] ? [] : ["."],
  env,
});
try {
  const page = await app.firstWindow();
  await page.waitForSelector(".desktop-loading", { state: "detached" });
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, pdf);
  await page.getByTitle("一键导出 PDF", { exact: true }).click();
  await expect(page.getByTitle("一键导出 PDF", { exact: true })).toBeEnabled({
    timeout: 15000,
  });
  const buffer = await fs.readFile(pdf);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  expect(buffer.length).toBeGreaterThan(10000);
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await page.getByTitle("一键导出 PDF", { exact: true }).click();
  await expect(page.getByTitle("一键导出 PDF", { exact: true })).toBeEnabled();
  console.log(
    "PDF exported with Chinese, tables, code and multi-page content:",
    pdf,
  );
} finally {
  await app.close();
}
