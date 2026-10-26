import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await fs.mkdir(".desktop-test", { recursive: true });
const run = await fs.mkdtemp(path.resolve(".desktop-test/rich-"));
const vault = path.join(run, "知识库"),
  profile = path.join(run, "profile");
await fs.mkdir(vault);
await fs.mkdir(profile);
await fs.mkdir(path.join(vault, "研究/数学"), { recursive: true });
await fs.mkdir(path.join(vault, "开发/TypeScript"), { recursive: true });
await fs.writeFile(
  path.join(profile, "workspace.json"),
  JSON.stringify({ root: vault }),
);
const file = path.join(vault, "研究/数学/研究笔记.md");
await fs.writeFile(
  file,
  String.raw`# 研究笔记

在同一个文档里书写、推导和整理。**重要的想法**，不必离开编辑器。

## 数学与代码

高斯分布的密度函数：

$$
f(x)=\frac{1}{\sigma\sqrt{2\pi}}\exp\left(-\frac{(x-\mu)^2}{2\sigma^2}\right)
$$

行内公式 $E=mc^2$ 也可以直接阅读。

` +
    "```typescript\nconst notebook = { title: 'Research', local: true };\n```\n\n" +
    String.raw`## 实验记录

| 方法 | 样本数 | 状态 |
| --- | --- | --- |
| 基线 | 42 | 完成 |
| 改进 | 64 | 进行中 |

- [x] 整理数据
- [ ] 记录分析结果

<!-- preserve raw HTML safely -->

继续记录`,
);
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
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1440, 960);
    w.show();
    w.focus();
  });
  await page.waitForSelector(".desktop-loading", { state: "detached" });
  return { app, page };
}
let running = await launch();
try {
  let { app, page } = running;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByTitle("所见即所得", { exact: true }).click();
  await expect(page.locator(".tiptap .katex")).toHaveCount(2);
  await page.locator(".tiptap td p").filter({ hasText: /^42$/ }).fill("128");
  await page
    .locator(".tiptap p")
    .filter({ hasText: /^继续记录$/ })
    .click();
  await page.keyboard.press("End");
  await page.keyboard.type(" animated input");
  await expect(
    page.locator(".rich-motion-layer .ymg-animated-caret"),
  ).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: "中文输入",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await cdp.send("Input.insertText", { text: "中文输入" });
  await expect(page.locator(".tiptap")).toContainText("中文输入");
  await page.keyboard.type(" $a+b$ ");
  await expect(page.locator(".tiptap .katex")).toHaveCount(3);
  await page.locator(".rich-math.math-block").first().dblclick();
  await page
    .getByLabel("LaTeX 公式", { exact: true })
    .fill(String.raw`\int_0^1 x^2\,dx=\frac{1}{3}`);
  await page.getByRole("button", { name: "应用公式", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(() => fs.readFile(file, "utf8")).toContain("128");
  const saved = await fs.readFile(file, "utf8");
  expect(saved).not.toContain("$a+b$$");
  for (const text of [
    "中文输入",
    "a+b",
    "\\int_0^1",
    "preserve raw HTML",
    "const notebook",
  ])
    expect(saved).toContain(text);
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 5000 });
  await page.locator(".rich-scroll").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: path.join(run, "wysiwyg.png"), scale: "css" });
  await page.getByTitle("源码", { exact: true }).click();
  await page.getByTitle("分屏", { exact: true }).click();
  await page.screenshot({ path: path.join(run, "desktop.png"), scale: "css" });
  await page
    .getByRole("button", { name: "目录 研究/数学", exact: true })
    .click({ button: "right" });
  await page.screenshot({
    path: path.join(run, "folder-menu.png"),
    clip: { x: 0, y: 170, width: 800, height: 620 },
    scale: "css",
  });
  await page.keyboard.press("Escape");
  await page.getByTitle("设置", { exact: true }).click();
  await page.screenshot({ path: path.join(run, "settings.png"), scale: "css" });
  await page.keyboard.press("Escape");
  await page.getByTitle("所见即所得", { exact: true }).click();
  await page
    .locator(".tiptap p")
    .filter({ hasText: "继续记录" })
    .first()
    .click();
  await page.keyboard.press("Alt+Enter");
  const blockInput = page.getByLabel("当前块 Markdown", { exact: true });
  await blockInput.fill((await blockInput.inputValue()) + " 保存块草稿");
  await blockInput.press("Control+s");
  await expect.poll(() => fs.readFile(file, "utf8")).toContain("保存块草稿");
  await page
    .locator(".tiptap p")
    .filter({ hasText: "保存块草稿" })
    .first()
    .click();
  await page.keyboard.press("Alt+Enter");
  await blockInput.fill((await blockInput.inputValue()) + " 退出前草稿");
  await app.close();
  running = await launch();
  ({ app, page } = running);
  await expect(page.locator(".tiptap")).toContainText("中文输入");
  await expect(page.locator(".tiptap table")).toContainText("128");
  await expect(page.locator(".tiptap")).toContainText("退出前草稿");
  expect(errors).toEqual([]);
  console.log(
    "Rich editing, native save, tables, formulas, IME, caret and mode restoration passed:",
    run,
  );
} finally {
  await running.app.close();
}
