import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const testRoot = path.resolve(".desktop-test");
await fs.mkdir(testRoot, { recursive: true });
const run = await fs.mkdtemp(path.join(testRoot, "electron-"));
const userData = path.join(run, "profile");
const vault = path.join(run, "vault");
await fs.mkdir(userData);
await fs.mkdir(vault);
await fs.mkdir(path.join(vault, "DeepInfer"));
await fs.writeFile(
  path.join(userData, "workspace.json"),
  JSON.stringify({ root: vault }),
);
await fs.writeFile(
  path.join(vault, "桌面测试.md"),
  "# 桌面测试\n\n```typescript\nconst desktop = true;\n```\n\n第一行文字\n\n第二行文字\n\n光标跳转到这里",
);
const errors = [];
async function launch(executable) {
  const env = { ...process.env, YMG_USER_DATA: userData, YMG_TEST: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.YMG_DEV_URL;
  const app = await electron.launch({
    executablePath: executable || require("electron"),
    args: executable ? [] : ["."],
    env,
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.focus();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".desktop-loading", { state: "detached" });
  return { app, page };
}
let running;
try {
  running = await launch(process.argv[2]);
  const { app, page } = running;
  await expect(page.locator(".workspace")).toContainText("vault");
  await expect(page.locator(".markdown-body h1")).toHaveText("桌面测试");
  expect(page.url().startsWith("file:")).toBe(true);
  const security = await page.evaluate(() => ({
    bridge: !!window.desktop,
    node: typeof window.require,
    process: typeof window.process,
    icon: document.querySelector(".brand-symbol img").naturalWidth,
  }));
  expect(security).toEqual({
    bridge: true,
    node: "undefined",
    process: "undefined",
    icon: 256,
  });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nDesktop typing feedback");
  await expect(page.locator(".ymg-animated-caret")).toBeVisible();
  await page.waitForTimeout(200);
  const from = await page
    .locator(".ymg-animated-caret")
    .evaluate((el) => el.style.transform);
  await page.keyboard.press("Control+Home");
  await page.waitForTimeout(25);
  const during = await page
    .locator(".ymg-animated-caret")
    .evaluate((el) => el.style.transform);
  await page.waitForTimeout(350);
  const after = await page
    .locator(".ymg-animated-caret")
    .evaluate((el) => el.style.transform);
  expect(during).not.toEqual(from);
  expect(during).not.toEqual(after);
  await page.keyboard.press("Control+End");
  // Exercise Chromium's native IME composition route rather than appending text through React.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: "中文输入",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await cdp.send("Input.insertText", { text: "中文输入" });
  await expect(page.locator(".markdown-body")).toContainText("中文输入");
  await page.getByRole("button", { name: "动效", exact: true }).click();
  await page.getByLabel("光标动画时长").fill("180");
  await page.getByLabel("打字反馈强度").fill("65");
  await page.getByLabel("平滑光标", { exact: true }).uncheck();
  await expect(page.locator(".cm-editor")).not.toHaveClass(
    /ymg-motion-enabled/,
  );
  await page.getByLabel("平滑光标", { exact: true }).check();
  await page.getByRole("button", { name: "背景", exact: true }).click();
  const largeImage = path.join(run, "large-background.png");
  await fs.writeFile(
    largeImage,
    Buffer.concat([
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=",
        "base64",
      ),
      Buffer.alloc(4 * 1024 * 1024),
    ]),
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, largeImage);
  await page.getByRole("button", { name: /上传背景图片/ }).click();
  await expect(page.locator(".background-layer")).toHaveAttribute(
    "style",
    /ymg-asset:/,
  );
  const backgrounds = await fs.readdir(path.join(userData, "backgrounds"));
  expect(
    (await fs.stat(path.join(userData, "backgrounds", backgrounds[0]))).size,
  ).toBeGreaterThan(3 * 1024 * 1024);
  expect(
    await page.evaluate(() => localStorage.getItem("ymg-prefs").length),
  ).toBeLessThan(2000);
  await page.getByLabel("背景图片透明度").fill("45");
  await page.getByLabel("编辑区不透明度").fill("70");
  await expect(page.locator(".background-layer")).toHaveCSS("opacity", "0.55");
  await page
    .getByRole("button", { name: "目录 DeepInfer", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "新建子目录" }).click();
  await page.getByLabel("目录路径").fill("学习笔记");
  await page.getByRole("button", { name: "创建目录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "目录 DeepInfer/学习笔记", exact: true }),
  ).toBeVisible();
  expect(
    (await fs.stat(path.join(vault, "DeepInfer", "学习笔记"))).isDirectory(),
  ).toBe(true);
  await page
    .getByRole("button", { name: "目录 DeepInfer/学习笔记", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "在此新建笔记" }).click();
  await expect(page.getByLabel("笔记存储目录")).toHaveValue(
    "DeepInfer/学习笔记",
  );
  await page.getByLabel("笔记名称").fill("右键创建笔记");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await expect
    .poll(() =>
      fs
        .readFile(
          path.join(vault, "DeepInfer", "学习笔记", "右键创建笔记.md"),
          "utf8",
        )
        .catch(() => ""),
    )
    .toContain("# 右键创建笔记");
  const context = async (folder, action) => {
    await page
      .getByRole("button", { name: `目录 ${folder}`, exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: action, exact: true }).click();
  };
  await context("DeepInfer/学习笔记", "重命名");
  await page.getByLabel("新目录名称").fill("已改名");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "目录 DeepInfer/已改名", exact: true }),
  ).toBeVisible();
  await context("DeepInfer/已改名", "移动目录");
  await page.getByLabel("目标父目录").selectOption("");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "目录 已改名", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "目录 已改名", exact: true })
    .dragTo(page.getByRole("button", { name: "目录 DeepInfer", exact: true }));
  await expect(
    page.getByRole("button", { name: "目录 DeepInfer/已改名", exact: true }),
  ).toBeVisible();
  await page
    .locator(".note-card")
    .filter({ hasText: "右键创建笔记" })
    .dragTo(page.getByRole("button", { name: "笔记空间根目录", exact: true }));
  await expect
    .poll(() =>
      fs.readFile(path.join(vault, "右键创建笔记.md"), "utf8").catch(() => ""),
    )
    .toContain("右键创建笔记");
  await context("DeepInfer/已改名", "删除目录");
  await page.getByRole("button", { name: "移入回收目录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "目录 DeepInfer/已改名", exact: true }),
  ).toHaveCount(0);
  expect(
    (await fs.readdir(path.join(vault, ".ymarkdowng-trash"))).some((name) =>
      name.endsWith("已改名"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(page.locator(".update-version")).toContainText("0.2.1");
  await app.evaluate(({ net }) => {
    const original = net.fetch;
    net.fetch = (url, options) =>
      String(url).includes("api.github.com")
        ? Promise.resolve(
            new Response(JSON.stringify({ tag_name: "v99.0.0" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        : original(url, options);
  });
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "打开新版下载页", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^全部笔记/ }).click();
  await page.locator(".note-card").filter({ hasText: "桌面测试" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nCLOSE_FLUSH");
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect
    .poll(() => fs.readFile(path.join(vault, "桌面测试.md"), "utf8"))
    .toContain("CLOSE_FLUSH");
  await new Promise((resolve) => {
    if (!app.process().exitCode && app.process().exitCode !== 0)
      app.process().once("exit", resolve);
    else resolve();
  });
  running = await launch(process.argv[2]);
  await expect(running.page.locator(".markdown-body")).toContainText(
    "CLOSE_FLUSH",
  );
  await expect(running.page.locator(".markdown-body")).toContainText(
    "中文输入",
  );
  await expect(running.page.locator(".canvas")).toHaveClass(/bg-custom/);
  await expect(running.page.getByLabel("背景图片透明度")).toHaveValue("45");
  await expect(running.page.getByLabel("编辑区不透明度")).toHaveValue("70");
  await expect(running.page.locator(".background-layer")).toHaveCSS(
    "opacity",
    "0.55",
  );
  await running.page.getByRole("button", { name: "动效", exact: true }).click();
  await expect(running.page.getByLabel("光标动画时长")).toHaveValue("180");
  await expect(running.page.getByLabel("打字反馈强度")).toHaveValue("65");
  await running.page.screenshot({
    path: path.join(testRoot, "desktop-verified.png"),
  });
  expect(errors).toEqual([]);
  console.log(
    "Desktop passed: standalone file load, IPC isolation, native persistence, animated cursor, IME, motion settings, close flush and restart.",
  );
} finally {
  if (running && running.app.process().exitCode === null)
    await running.app.close();
}
