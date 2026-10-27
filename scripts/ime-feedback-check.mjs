import { expect } from "@playwright/test";

export async function probeFeedback(page) {
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    window.__imeProbe = { original, pulses: [] };
    Element.prototype.animate = function (...args) {
      if (this.classList.contains("ymg-animated-caret")) {
        const layer = this.closest(".rich-motion-layer");
        if (layer)
          window.__imeProbe.pulses.push({
            composing: layer.classList.contains("is-composing"),
            visible: !layer.hidden && layer.getBoundingClientRect().width > 0,
            x: this.getBoundingClientRect().left,
          });
      }
      return original.apply(this, args);
    };
  });
}
export async function restoreFeedback(page) {
  await page.evaluate(() => {
    if (!window.__imeProbe) return;
    Element.prototype.animate = window.__imeProbe.original;
    delete window.__imeProbe;
  });
}
export async function checkIMEFeedback(page) {
  const session = await page.context().newCDPSession(page);
  await probeFeedback(page);
  const count = () => page.evaluate(() => window.__imeProbe.pulses.length);
  try {
    let previous = 0;
    for (const text of ["n", "ni", "niha", "nihao"]) {
      await session.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await expect.poll(count).toBeGreaterThan(previous);
      previous = await count();
      const pulse = await page.evaluate(() => window.__imeProbe.pulses.at(-1));
      expect(pulse.visible).toBe(true);
      expect(pulse.composing).toBe(true);
      await expect(
        page.locator(".rich-motion-layer.is-composing"),
      ).toBeVisible();
    }
    const positions = await page.evaluate(() =>
      window.__imeProbe.pulses
        .filter((pulse) => pulse.composing)
        .map((pulse) => pulse.x),
    );
    expect(positions.at(-1)).toBeGreaterThan(positions[0]);
    const caret = await page
      .locator(".tiptap")
      .evaluate((el) => getComputedStyle(el).caretColor);
    expect(caret).not.toBe("rgba(0, 0, 0, 0)");
    await session.send("Input.insertText", { text: "你好" });
    await expect(page.locator(".tiptap")).toContainText("你好");
    await expect(page.locator(".rich-surface")).not.toHaveClass(/is-composing/);
    await session.send("Input.imeSetComposition", {
      text: "qux",
      selectionStart: 3,
      selectionEnd: 3,
    });
    await expect(page.locator(".tiptap")).toContainText("qux");
    await session.send("Input.imeSetComposition", {
      text: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    await expect(page.locator(".tiptap")).not.toContainText("qux");
    previous = await count();
    await page.keyboard.type("!");
    await expect.poll(count).toBeGreaterThan(previous);
    expect(
      await page.evaluate(() => window.__imeProbe.pulses.at(-1).composing),
    ).toBe(false);
    await expect(page.locator(".tiptap")).toContainText("你好!");
    await expect(page.locator(".tiptap")).not.toContainText("nihao");
  } finally {
    await session
      .send("Input.imeSetComposition", {
        text: "",
        selectionStart: 0,
        selectionEnd: 0,
      })
      .catch(() => {});
    await restoreFeedback(page);
    await session.detach();
  }
}
