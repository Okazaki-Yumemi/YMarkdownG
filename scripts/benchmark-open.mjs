import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await fs.mkdir(".desktop-test", { recursive: true });
const run = await fs.mkdtemp(path.resolve(".desktop-test/open-benchmark-"));
const file = path.join(run, "benchmark.md");
const content =
  "# 打开性能\n\n" +
  Array.from(
    { length: 20 },
    (_, i) => `## 段落 ${i}\n\n${"Markdown 正文。".repeat(20)}\n`,
  ).join("\n") +
  "\nOPEN_BENCHMARK";
await fs.writeFile(file, content);
const runs = [];
for (let i = 0; i < 3; i++) {
  const env = {
    ...process.env,
    YMG_USER_DATA: path.join(run, `profile-${i}`),
    YMG_TEST: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.YMG_DEV_URL;
  const started = performance.now();
  const app = await electron.launch({
    executablePath: process.argv[2] || require("electron"),
    args: process.argv[2] ? [file] : [".", file],
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".tiptap[contenteditable=true]")).toContainText(
      "OPEN_BENCHMARK",
    );
    const editableMs = Math.round(performance.now() - started);
    const renderer = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadedMs: Math.round(navigation.loadEventEnd),
      };
    });
    runs.push({ editableMs, ...renderer });
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
}
const result = {
  executable: process.argv[2] || "development Electron",
  fileBytes: Buffer.byteLength(content),
  runs,
  medianEditableMs: [...runs].sort((a, b) => a.editableMs - b.editableMs)[1]
    .editableMs,
  method:
    "Three fresh processes and profiles, normal filesystem cache, hidden test window; includes Playwright connection overhead. Installed/unpacked executable only, not a self-extracting portable launcher.",
};
await fs.writeFile(
  path.join(run, "result.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
console.log("Saved:", path.join(run, "result.json"));
