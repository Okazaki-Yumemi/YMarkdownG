import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const base = path.resolve(".desktop-test");
await fs.mkdir(base, { recursive: true });
const run = await fs.mkdtemp(path.join(base, "portable-"));
const profile = path.join(run, "profile");
const vault = path.join(run, "vault");
await fs.mkdir(profile);
await fs.mkdir(vault);
await fs.writeFile(
  path.join(profile, "workspace.json"),
  JSON.stringify({ root: vault }),
);
await fs.writeFile(
  path.join(vault, "便携版.md"),
  "# 便携版测试\n\n来自独立可执行文件",
);
const server = net.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const executable = path.resolve(
  process.argv[2] || "release/YMarkdownG-0.2.0-Windows-x64.exe",
);
const env = { ...process.env, YMG_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.YMG_DEV_URL;
delete env.YMG_TEST;
const child = spawn(executable, [`--remote-debugging-port=${port}`], {
  env,
  stdio: "ignore",
  windowsHide: true,
});
let browser;
try {
  const endpoint = `http://127.0.0.1:${port}`;
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${endpoint}/json/version`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 60000, intervals: [200, 500, 1000] },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForSelector(".desktop-loading", { state: "detached" });
  await expect(page.locator(".markdown-body h1")).toHaveText("便携版测试");
  expect(page.url().startsWith("file:")).toBe(true);
  await page.locator(".cm-content").fill("# 便携版测试\n\nPortable persisted");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "background.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.getByLabel("背景图片透明度").fill("55");
  await expect(page.locator(".background-layer")).toHaveCSS("opacity", "0.45");
  await expect
    .poll(() => fs.readFile(path.join(vault, "便携版.md"), "utf8"))
    .toContain("Portable persisted");
  await page.screenshot({ path: path.join(base, "portable-verified.png") });
  await page.evaluate(() => window.close());
  await expect.poll(() => child.exitCode, { timeout: 20000 }).not.toBeNull();
  console.log(
    "Portable EXE passed: independent launch, native save, custom background and opacity, clean exit.",
  );
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill();
  }
}
