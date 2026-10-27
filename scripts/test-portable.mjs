import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const executable = path.resolve(
  process.argv[2] || `release/YMarkdownG-${version}-Windows-x64.exe`,
);
const run = await fs.mkdtemp(path.resolve(".desktop-test/portable-editor-"));
const profile = path.join(run, "profile"),
  file = path.join(run, "portable.md");
await fs.mkdir(profile);
await fs.writeFile(file, "# Portable\n\nLocal file");
const server = net.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const env = { ...process.env, YMG_USER_DATA: profile, YMG_TEST: "1" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.YMG_DEV_URL;
const child = spawn(executable, [file, `--remote-debugging-port=${port}`], {
  env,
  stdio: "ignore",
  windowsHide: true,
});
let browser;
try {
  let available = false;
  for (let i = 0; i < 100; i++) {
    available = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800),
    })
      .then((response) => response.ok)
      .catch(() => false);
    if (available) break;
    if (child.exitCode !== null)
      throw new Error(`Portable exited: ${child.exitCode}`);
    await delay(300);
  }
  if (!available)
    throw new Error("Portable debugging endpoint did not become ready");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0];
  await expect(page.locator(".document-title")).toHaveText("portable.md");
  await expect(page.locator(".sidebar,.note-list")).toHaveCount(0);
  await page.getByTitle("源码", { exact: true }).click();
  await page
    .locator(".cm-content")
    .fill("# Portable\n\nStandalone save passed");
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => fs.readFile(file, "utf8"))
    .toBe("# Portable\n\nStandalone save passed");
  expect(
    await fs.stat(path.join(profile, "workspace.json")).catch(() => null),
  ).toBe(null);
  await page.evaluate(() => window.close()).catch(() => {});
  console.log(
    "Portable launch, command-line file opening, native save and clean document workflow passed:",
    run,
  );
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null)
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
}
