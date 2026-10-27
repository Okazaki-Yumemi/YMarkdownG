import { test, expect } from "@playwright/test";
const sample =
  "# 单文档\n\n**加粗** 与 $x^2$\n\n```js\nconst n = 42;\n```\n\n## 结尾\n\n继续写作";
async function open(page: import("@playwright/test").Page, text = sample) {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "笔记.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(text),
    });
}
test("single document UI retains rendering, code, math and rich editing without library controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator(".tiptap h1")).toHaveText("单文档");
  await expect(page.locator(".sidebar,.note-list,.folder-tree")).toHaveCount(0);
  await page.getByTitle("分屏", { exact: true }).click();
  await expect(page.locator(".preview-pane .katex")).toHaveCount(1);
  await expect(page.locator(".hljs-keyword").first()).toBeVisible();
  await page.locator(".cm-content").fill(sample + "\n\n实时变化");
  await expect(page.locator(".preview-pane")).toContainText("实时变化");
  await page.getByTitle("所见即所得", { exact: true }).click();
  await page
    .locator(".tiptap p")
    .filter({ hasText: /^继续写作$/ })
    .fill("编辑完成");
  await page.getByTitle("源码", { exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("编辑完成");
  expect(errors).toEqual([]);
});
test("settings keep themes, custom dropdown, background transparency and motion; dismiss outside", async ({
  page,
}) => {
  await open(page);
  await page.getByTitle("设置", { exact: true }).click();
  await page.getByRole("button", { name: "GitHub Light", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/light/);
  await page.getByRole("button", { name: "排版", exact: true }).click();
  await page.getByRole("combobox", { name: "正文字体" }).click();
  await page.getByRole("option", { name: "等宽" }).click();
  await expect(
    page.getByRole("combobox", { name: "正文字体" }),
  ).toHaveAttribute("data-value", "mono");
  await page.getByRole("button", { name: "背景", exact: true }).click();
  await page
    .locator("input[type=file]")
    .nth(2)
    .setInputFiles("public/icon-192.png");
  await page.getByLabel("背景图片透明度", { exact: true }).fill("60");
  await expect(page.locator(".background-layer")).toHaveCSS("opacity", "0.4");
  await page.getByRole("button", { name: "动效", exact: true }).click();
  await page.getByLabel("打字反馈强度", { exact: true }).fill("80");
  await page.locator(".settings-backdrop").click({ position: { x: 3, y: 3 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/light/);
  await expect(page.locator(".background-layer")).toHaveCSS("opacity", "0.4");
});
test("hiding chrome keeps a settings entry and focus mode exits", async ({
  page,
}) => {
  await open(page);
  await page.getByTitle("设置", { exact: true }).click();
  await page.getByRole("button", { name: "布局", exact: true }).click();
  for (const label of ["显示顶部文件栏", "显示格式工具栏", "显示底部状态栏"])
    await page.getByLabel(label, { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar,.formatbar,.statusbar")).toHaveCount(0);
  await page.getByTitle("设置", { exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+f");
  await expect(page.locator(".app")).toHaveClass(/focus-mode/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).not.toHaveClass(/focus-mode/);
});
test("preview sanitizes HTML and scroll synchronization remains bidirectional", async ({
  page,
}) => {
  await open(
    page,
    Array.from(
      { length: 55 },
      (_, i) => `## Section ${i}\n\n${"paragraph ".repeat(20)}\n`,
    ).join("\n") +
      '<img src=x onerror="window.broken=1"><script>window.broken=1</script>',
  );
  await page.getByTitle("分屏", { exact: true }).click();
  await expect(page.locator(".preview-pane script,[onerror]")).toHaveCount(0);
  await page
    .locator(".cm-scroller")
    .evaluate((el) => (el.scrollTop = el.scrollHeight * 0.5));
  await expect
    .poll(() => page.locator(".preview-pane").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(300);
  await page.locator(".preview-pane").evaluate((el) => (el.scrollTop = 150));
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((el) => el.scrollTop))
    .toBeLessThan(700);
});
