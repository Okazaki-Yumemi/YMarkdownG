import { test, expect } from "@playwright/test";
import { selectChoice } from "../scripts/select-choice.mjs";

test("themes, modal settings, custom selects and outside dismissal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".workspace").click();
  await expect(page.locator(".workspace-dropdown")).toBeVisible();
  await page.locator(".cm-content").click();
  await expect(page.locator(".workspace-dropdown")).toHaveCount(0);
  await page.getByLabel("文档视图").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("文档视图")).toHaveAttribute(
    "data-value",
    "cards",
  );
  await page.getByLabel("文档视图").click();
  await page.locator(".cm-content").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.keyboard.press("Control+,");
  await expect(
    page.getByRole("dialog", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "GitHub Light", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/theme-github-light/);
  await expect(page.locator(".app")).toHaveCSS("--base", "#ffffff");
  await page.getByRole("button", { name: "One Dark Pro", exact: true }).click();
  await expect(page.locator(".app")).toHaveCSS("--base", "#282c34");
  await page.getByRole("button", { name: "布局", exact: true }).click();
  await page.getByLabel("显示格式工具栏").uncheck();
  await page.getByLabel("显示底部状态栏").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator(".editor-toolbar")).not.toBeVisible();
  await expect(page.locator(".statusbar")).not.toBeVisible();
  await expect(page.getByLabel("编辑模式")).toBeVisible();
  await page.keyboard.press("Control+,");
  await page.getByLabel("显示顶部文件栏").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar")).not.toBeVisible();
  await page.keyboard.press("Control+,");
  await page.getByLabel("显示顶部文件栏").check();
  await page.keyboard.press("Escape");
  await page.getByTitle("显示工具栏", { exact: true }).click();
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/theme-one-dark-pro/);
  await expect(page.locator(".statusbar")).not.toBeVisible();
});

test("sidebar resizes and large folder trees scroll without hiding notes", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "ymg-folders",
      JSON.stringify(
        Array.from(
          { length: 120 },
          (_, i) => `项目 ${String(i).padStart(3, "0")}`,
        ),
      ),
    ),
  );
  await page.goto("/");
  const tree = page.locator(".folders");
  expect(await tree.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  expect((await tree.boundingBox())!.height).toBeLessThan(350);
  await expect(
    page.getByRole("button", { name: "新建笔记", exact: true }),
  ).toBeVisible();
  const divider = page.getByRole("separator", { name: "调整侧栏宽度" });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(450, box.y + 100, { steps: 10 });
  await page.mouse.up();
  expect((await page.locator(".sidebar").boundingBox())!.width).toBeGreaterThan(
    420,
  );
  await page.reload();
  expect((await page.locator(".sidebar").boundingBox())!.width).toBeGreaterThan(
    420,
  );
  await divider.dblclick();
  expect((await page.locator(".sidebar").boundingBox())!.width).toBe(300);
});

test("LaTeX renders inline, display, brackets and leaves code literal", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".cm-content").fill(
    String.raw`# 数学

行内 $E=mc^2$ 与 \(a^2+b^2=c^2\)。

$$
\begin{aligned}
f(x)&=\frac{1}{\sqrt{2\pi}}\\
g(x)&=\sum_{i=1}^{n}x_i
\end{aligned}
$$

\[\int_0^1 x^2\,dx=\frac{1}{3}\]

\`\`\`latex
$not_math$
\`\`\`
`.replaceAll("\\`", "`"),
  );
  await expect(page.locator(".markdown-body .katex")).toHaveCount(4);
  await expect(page.locator(".katex-display")).toHaveCount(2);
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await expect(page.locator(".code-block")).toContainText("$not_math$");
  expect(
    await page.locator(".markdown-body > .md-source-block").count(),
  ).toBeGreaterThan(4);
});

test("source and preview scroll in both directions and preview jumps to source", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".cm-content")
    .fill(
      Array.from(
        { length: 70 },
        (_, i) =>
          `## Section ${i}\n\n${"paragraph ".repeat((i % 5) * 8 + 5)}\n\n${i % 3 === 0 ? "```js\nconst a = 1;\nconst b = 2;\n```" : ""}\n`,
      ).join("\n"),
    );
  const source = page.locator(".cm-scroller"),
    preview = page.locator(".preview-pane");
  expect(await source.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await source.evaluate((el) => (el.scrollTop = el.scrollHeight * 0.55));
  await expect
    .poll(() => preview.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(500);
  await source.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect
    .poll(() =>
      preview.evaluate((el) =>
        Math.abs(el.scrollTop - (el.scrollHeight - el.clientHeight)),
      ),
    )
    .toBeLessThan(3);
  await preview.evaluate((el) => (el.scrollTop = 400));
  await expect
    .poll(() => source.evaluate((el) => el.scrollTop))
    .toBeLessThan(1000);
  await page
    .locator(".markdown-body h2")
    .filter({ hasText: /^Section 25$/ })
    .dblclick();
  await expect(
    page
      .locator(".cm-line")
      .filter({ hasText: /Section 25/ })
      .first(),
  ).toBeVisible();
});

test("WYSIWYG preserves Markdown, edits tables and math, and keeps animated caret", async ({
  page,
}) => {
  await page.goto("/");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const original =
    "# 富文本测试\n\n**加粗** 与 *斜体* 和 $x^2$\n\n| 标题 | 数值 |\n| --- | --- |\n| 测试 | 42 |\n\n- [x] 已完成\n- [ ] 未完成\n\n```python\nprint(42)\n```\n\n$$\n\\frac{a}{b}\n$$\n\n<!-- 保留注释 -->\n\n结束段落";
  await page.locator(".cm-content").fill(original);
  await page.getByTitle("所见即所得", { exact: true }).click();
  await expect(page.locator(".tiptap h1")).toHaveText("富文本测试");
  await expect(page.locator(".tiptap table")).toBeVisible();
  await expect(page.locator(".tiptap .katex")).toHaveCount(2);
  await page.getByTitle("源码", { exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ymg-notes") || "[]").find(
            (note: { title: string }) => note.title === "富文本测试",
          )?.content,
      ),
    )
    .toBe(original);
  await page.getByTitle("所见即所得", { exact: true }).click();
  await page.locator(".tiptap p").filter({ hasText: "结束段落" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" WYSIWYG edited");
  await expect(
    page.locator(".rich-motion-layer .ymg-animated-caret"),
  ).toBeVisible();
  await page.getByRole("button", { name: "插入公式", exact: true }).click();
  await page
    .getByLabel("LaTeX 公式", { exact: true })
    .fill(String.raw`\sum_{i=1}^{n}i`);
  await page.getByRole("button", { name: "应用公式", exact: true }).click();
  await expect(page.locator(".tiptap .katex")).toHaveCount(3);
  await page.getByTitle("源码", { exact: true }).click();
  const markdown = await page.locator(".cm-content").innerText();
  for (const text of [
    "WYSIWYG edited",
    "42",
    "已完成",
    "print(42)",
    "\\frac{a}{b}",
    "保留注释",
    "\\sum_{i=1}^{n}i",
  ])
    expect(markdown).toContain(text);
  expect(errors).toEqual([]);
});
