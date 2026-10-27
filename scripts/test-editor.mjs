import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await fs.mkdir(".desktop-test", { recursive: true });
const run = await fs.mkdtemp(path.resolve(".desktop-test/editor-"));
const profile = path.join(run, "profile"),
  file = path.join(run, "写作.md");
const second = path.join(run, "其他.md"),
  savedAs = path.join(run, "另存.md"),
  pdf = path.join(run, "导出.pdf");
await fs.mkdir(profile);
const sample =
  "# Markdown 示例\n\n**粗体** 与 *斜体*。\n\n## 数学与代码\n\n行内公式 $E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n```typescript\nconst square = (x: number) => x * x;\nconsole.log(square(3));\n```\n\n| 内容 | 状态 |\n| --- | --- |\n| Markdown | 完成 |\n| 思考 | 继续 |\n\n末尾段落";
await fs.writeFile(file, sample);
await fs.writeFile(second, "# 其他文档\n\n不要改动");
const png = await fs.readFile("public/icon-192.png");
const background = path.join(run, "large-background.png");
await fs.writeFile(
  background,
  Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]),
);
const env = { ...process.env, YMG_USER_DATA: profile, YMG_TEST: "1" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.YMG_DEV_URL;
let app;
const errors = [];
async function launch(initial = file) {
  app = await electron.launch({
    executablePath: process.argv[2] || require("electron"),
    args: process.argv[2] ? [initial] : [".", initial],
    env,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1280, 900);
    win.show();
    win.focus();
  });
  await app.evaluate(
    ({ dialog }, values) => {
      globalThis.__saves = [];
      globalThis.__answers = [];
      globalThis.__promptCount = 0;
      globalThis.__openNext = values.second;
      dialog.showOpenDialog = async (_win, options) => {
        const file = options.title.includes("背景")
          ? values.background
          : options.title.includes("图片")
            ? values.image
            : globalThis.__openNext;
        return { canceled: !file, filePaths: file ? [file] : [] };
      };
      dialog.showSaveDialog = async (_win, options) => {
        const file = options.title.includes("PDF")
          ? values.pdf
          : globalThis.__saves.shift();
        return { canceled: !file, filePath: file };
      };
      dialog.showMessageBox = async () => {
        globalThis.__promptCount++;
        return { response: globalThis.__answers.shift() ?? 0 };
      };
    },
    { second, pdf, background, image: path.resolve("public/icon-192.png") },
  );
  await expect(page.locator(".document-title")).toContainText(
    path.basename(initial),
  );
  return page;
}
try {
  let page = await launch();
  await expect(page.locator(".tiptap h1")).toHaveText("Markdown 示例");
  await expect(page.locator(".sidebar,.note-list,.folder-tree")).toHaveCount(0);
  const api = await page.evaluate(() => ({
    libraries: typeof window.desktop.libraries,
    createFolder: typeof window.desktop.createFolder,
    updates: typeof window.desktop.checkUpdates,
    pdf: typeof window.desktop.exportPDF,
    node: typeof window.require,
  }));
  expect(api).toEqual({
    libraries: "undefined",
    createFolder: "undefined",
    updates: "undefined",
    pdf: "function",
    node: "undefined",
  });
  await expect(page.locator(".tiptap .katex")).toHaveCount(2);
  await page.screenshot({ path: path.join(run, "editor.png"), scale: "css" });
  await page.getByTitle("设置", { exact: true }).click();
  await page.screenshot({ path: path.join(run, "settings.png"), scale: "css" });
  await page.keyboard.press("Escape");
  await page.getByTitle("分屏", { exact: true }).click();
  await page.screenshot({ path: path.join(run, "split.png"), scale: "css" });
  const changed = sample + "\n\n本地修改";
  await page.locator(".cm-content").fill(changed);
  await expect(page.locator(".statusbar")).toContainText("未保存");
  expect(await fs.readFile(file, "utf8")).toBe(sample);
  await page.keyboard.press("Control+s");
  await expect.poll(() => fs.readFile(file, "utf8")).toBe(changed);
  await expect(page.locator(".statusbar")).toContainText("已保存");

  // Clean external edits reload on focus; dirty edits are never overwritten.
  await fs.writeFile(file, changed + "\n\n外部更新");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".cm-content")).toContainText("外部更新");
  await page.locator(".cm-content").fill(changed + "\n\n保留本地");
  await fs.writeFile(file, changed + "\n\n再次外部更新");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".external-banner")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.locator(".toast")).toContainText("外部修改");
  expect(await fs.readFile(file, "utf8")).toContain("再次外部更新");
  await app.evaluate(
    (_electron, file) => globalThis.__saves.push(file),
    savedAs,
  );
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => fs.readFile(savedAs, "utf8")).toContain("保留本地");
  await expect(page.locator(".document-title")).toContainText("另存.md");

  // A canceled document switch preserves the entire unsaved buffer.
  await page.locator(".cm-content").fill(changed + "\n\n尚未保存");
  await app.evaluate(() => globalThis.__answers.push(2));
  await page.getByTitle("打开 Ctrl+O").click();
  await expect(page.getByTitle("打开 Ctrl+O")).toBeEnabled();
  await expect(page.locator(".cm-content")).toContainText("尚未保存");
  await expect(page.locator(".document-title")).toContainText("另存.md");
  await app.evaluate(() => globalThis.__answers.push(1));
  await page.getByTitle("打开 Ctrl+O").click();
  await expect(page.locator(".document-title")).toHaveText("其他.md");
  expect(await fs.readFile(second, "utf8")).toBe("# 其他文档\n\n不要改动");
  await app.evaluate(
    (_electron, file) => (globalThis.__openNext = file),
    savedAs,
  );
  await page.getByTitle("打开 Ctrl+O").click();
  await expect(page.locator(".document-title")).toContainText("另存.md");

  // Exercise image paste without changing the user's system clipboard.
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.evaluate((base64) => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        [Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))],
        "paste.png",
        { type: "image/png" },
      ),
    );
    document.activeElement.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, png.toString("base64"));
  await expect
    .poll(() =>
      page
        .locator(".preview-pane img")
        .evaluateAll(
          (images) => images.filter((img) => img.naturalWidth > 0).length,
        ),
    )
    .toBe(1);
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => fs.readFile(savedAs, "utf8"))
    .toMatch(/!\[图片\]\(ymg-image-.*\.png\)/);
  await expect(page.locator(".cm-content")).not.toContainText("pending-image-");
  expect(
    (await fs.readdir(run)).filter((name) => name.startsWith("ymg-image-"))
      .length,
  ).toBe(1);

  await page.getByTitle("导出 PDF").click();
  await expect
    .poll(async () => (await fs.stat(pdf).catch(() => ({ size: 0 }))).size)
    .toBeGreaterThan(20000);
  const pdfBytes = await fs.readFile(pdf);
  expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdfBytes.toString("latin1")).toContain("KaTeX");
  await expect(page.getByTitle("导出 PDF")).toBeEnabled();
  await expect(page.locator(".cm-content")).not.toContainText("pending-image-");

  await page.getByTitle("设置", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "更新", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: path.join(run, "settings.png"), scale: "css" });
  await page.getByRole("button", { name: "背景", exact: true }).click();
  await page.getByRole("button", { name: "选择背景图片", exact: true }).click();
  await expect(page.locator(".background-layer")).toHaveAttribute(
    "style",
    /ymg-asset:/,
  );
  await page.getByLabel("背景图片透明度", { exact: true }).fill("60");
  await expect(page.locator(".background-layer")).toHaveCSS("opacity", "0.4");
  await page.keyboard.press("Escape");
  await page.getByTitle("所见即所得", { exact: true }).click();
  await page
    .locator(".tiptap p")
    .filter({ hasText: /保留本地/ })
    .click();
  await page.keyboard.press("End");
  await page.keyboard.type(" animated input");
  await expect(
    page.locator(".rich-motion-layer .ymg-animated-caret"),
  ).toBeVisible();
  await page.keyboard.press("Alt+Enter");
  const block = page.getByLabel("当前块 Markdown", { exact: true });
  await block.fill((await block.inputValue()) + " 退出草稿");
  await app.evaluate(() => globalThis.__answers.push(2));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await expect
    .poll(() => app.evaluate(() => globalThis.__promptCount))
    .toBeGreaterThanOrEqual(3);
  await expect(page.getByTitle("保存 Ctrl+S")).toBeEnabled();
  expect(await fs.readFile(savedAs, "utf8")).not.toContain("退出草稿");
  await app.evaluate(() => globalThis.__answers.push(0));
  const closed = app.waitForEvent("close", { timeout: 15000 });
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    .catch(() => {});
  await closed;
  expect(await fs.readFile(savedAs, "utf8")).toContain("退出草稿");
  page = await launch(savedAs);
  await expect(page.locator(".tiptap")).toContainText("退出草稿");
  await expect(page.locator(".background-layer")).toHaveCSS("opacity", "0.4");
  await expect(page.locator(".tiptap img")).toBeVisible();
  await page.getByTitle("新建 Ctrl+N").click();
  await expect(page.locator(".document-title")).toHaveText("未命名.md");
  await page.getByTitle("源码", { exact: true }).click();
  await page.locator(".cm-content").fill("# 新文档\n\n未保存内容");
  await page.keyboard.press("Control+s");
  await expect(page.getByTitle("保存 Ctrl+S")).toBeEnabled();
  await expect(page.locator(".document-title")).toContainText("未命名.md");
  await expect(page.locator(".statusbar")).toContainText("未保存");
  const created = path.join(run, "新文档.md");
  expect(await fs.stat(created).catch(() => null)).toBe(null);
  await app.evaluate(
    (_electron, file) => globalThis.__saves.push(file),
    created,
  );
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => fs.readFile(created, "utf8"))
    .toBe("# 新文档\n\n未保存内容");
  expect(errors).toEqual([]);
  console.log(
    "Single-file editing, save/save-as, conflict protection, cancel/close, images, PDF, background, caret and restart passed:",
    run,
  );
} finally {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
