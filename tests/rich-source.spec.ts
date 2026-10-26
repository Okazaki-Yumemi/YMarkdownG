import { test, expect } from "@playwright/test";

async function load(page: import("@playwright/test").Page, text: string) {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "保真.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(text),
    });
  await page.getByTitle("所见即所得", { exact: true }).click();
}

async function source(page: import("@playwright/test").Page) {
  await page.getByTitle("源码", { exact: true }).click();
  return page.locator(".cm-content").innerText();
}

test("editing one paragraph preserves untouched Markdown blocks", async ({
  page,
}) => {
  const text =
    "# 标题\n\n* 第一项\n* 第二项\n\n~~~js\nconst n = 1;\n~~~\n\n修改这里\n\n行内公式 \\(x^2\\)\n";
  await load(page, text);
  await page
    .locator(".tiptap p")
    .filter({ hasText: /^修改这里$/ })
    .fill("修改完成");
  const result = await source(page);
  expect(result).toContain("* 第一项\n* 第二项");
  expect(result).toContain("~~~js\nconst n = 1;\n~~~");
  expect(result).toContain("\\(x^2\\)");
  expect(result).toContain("修改完成");
});

test("block source applies Markdown in place, cancels safely and dismisses outside", async ({
  page,
}) => {
  await load(page, "# 标题\n\n**原文**\n\n结尾不变\n");
  await page.locator(".tiptap strong").click();
  await expect(page.locator(".rich-syntax").first()).toBeVisible();
  await page.keyboard.press("Alt+Enter");
  const input = page.getByLabel("当前块 Markdown", { exact: true });
  await expect(input).toHaveValue("**原文**");
  await input.fill("*新的内容*");
  await input.press("Control+Enter");
  await expect(page.locator(".tiptap em")).toHaveText("新的内容");
  await page.locator(".tiptap em").click();
  await page.keyboard.press("Alt+Enter");
  await input.fill("不应该保存");
  await input.press("Escape");
  await expect(page.locator(".tiptap em")).toHaveText("新的内容");
  await page.locator(".tiptap em").click();
  await page.keyboard.press("Alt+Enter");
  await input.fill("## 新标题");
  await page.locator(".tiptap p").filter({ hasText: "结尾不变" }).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator(".tiptap h2")).toHaveText("新标题");
  const result = await source(page);
  expect(result).toContain("## 新标题");
  expect(result).toContain("结尾不变");
  expect(result).not.toContain("不应该保存");
});

test("block source can split and remove blocks without losing neighboring content", async ({
  page,
}) => {
  await load(page, "# 标题\n\n中间\n\n末尾\n");
  await page
    .locator(".tiptap p")
    .filter({ hasText: /^中间$/ })
    .click();
  await page.keyboard.press("Alt+Enter");
  const input = page.getByLabel("当前块 Markdown", { exact: true });
  await input.fill("第一段\n\n第二段");
  await input.press("Control+Enter");
  await expect(page.locator(".tiptap p").filter({ hasText: /\S/ })).toHaveText([
    "第一段",
    "第二段",
    "末尾",
  ]);
  await page
    .locator(".tiptap p")
    .filter({ hasText: /^第二段$/ })
    .click();
  await page.keyboard.press("Alt+Enter");
  await expect(input).toHaveValue("第二段");
  await input.fill("");
  await input.press("Control+Enter");
  await expect(page.locator(".tiptap p").filter({ hasText: /\S/ })).toHaveText([
    "第一段",
    "末尾",
  ]);
});
