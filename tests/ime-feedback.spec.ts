import { test, expect } from "@playwright/test";
import {
  checkIMEFeedback,
  probeFeedback,
  restoreFeedback,
} from "../scripts/ime-feedback-check.mjs";

async function prepare(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "输入.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("输入："),
    });
  await page.getByTitle("所见即所得", { exact: true }).click();
  await page.locator(".tiptap p").click();
  await page.keyboard.press("End");
}
test("preedit letters pulse at the native caret; Chinese commit and cancellation preserve text", async ({
  page,
}) => {
  await prepare(page);
  await checkIMEFeedback(page);
  await page.getByTitle("源码", { exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("输入：你好!");
});
for (const scenario of [
  "zero feedback",
  "disabled cursor",
  "reduced motion",
] as const) {
  test(`IME respects ${scenario}`, async ({ page }) => {
    if (scenario === "reduced motion")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else
      await page.addInitScript(
        (scenario) =>
          localStorage.setItem(
            "ymg-prefs",
            JSON.stringify(
              scenario === "zero feedback"
                ? { typingFeedback: 0 }
                : { smoothCursor: false },
            ),
          ),
        scenario,
      );
    await prepare(page);
    await probeFeedback(page);
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Input.imeSetComposition", {
        text: "ni",
        selectionStart: 2,
        selectionEnd: 2,
      });
      await expect(page.locator(".rich-surface")).toHaveClass(/is-composing/);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
          ),
      );
      expect(
        await page.evaluate(() => (window as any).__imeProbe.pulses.length),
      ).toBe(0);
      await session.send("Input.insertText", { text: "你" });
      await expect(page.locator(".tiptap")).toHaveText("输入：你");
    } finally {
      await restoreFeedback(page);
      await session.detach();
    }
  });
}
