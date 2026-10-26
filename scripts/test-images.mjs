import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await fs.mkdir(".desktop-test", { recursive: true });
const run = await fs.mkdtemp(path.resolve(".desktop-test/images-")),
  vault = path.join(run, "vault"),
  profile = path.join(run, "profile");
await fs.mkdir(path.join(vault, "图片笔记"), { recursive: true });
await fs.mkdir(profile);
await fs.writeFile(
  path.join(profile, "workspace.json"),
  JSON.stringify({ root: vault }),
);
const file = path.join(vault, "图片笔记/图片测试.md");
await fs.writeFile(file, "# 图片测试\n\n在此插入图片。\n");
const bytes = await fs.readFile("public/icon-192.png");
const picked = path.join(run, "picked.png");
await fs.writeFile(picked, bytes);
const env = { ...process.env, YMG_USER_DATA: profile, YMG_TEST: "1" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.YMG_DEV_URL;
async function launch() {
  const app = await electron.launch({
    executablePath: process.argv[2] || require("electron"),
    args: process.argv[2] ? [] : ["."],
    env,
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.show();
    w.focus();
  });
  await page.waitForSelector(".desktop-loading", { state: "detached" });
  return { app, page };
}
let running = await launch();
try {
  let { app, page } = running;
  await page.evaluate(() => {
    window.__imagePasteLog = [];
    document.addEventListener(
      "paste",
      (event) =>
        window.__imagePasteLog.push({
          target: event.target.tagName + ":" + event.target.className,
          path: event
            .composedPath()
            .slice(0, 5)
            .map((el) => el.tagName + ":" + el.className),
          types: [...event.clipboardData.types],
          files: [...event.clipboardData.files].map((file) => file.type),
        }),
      true,
    );
  });
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("IMAGE ERROR", e.message);
  });
  const systemClipboard = await app.evaluate(
    async ({ clipboard, ClipboardItem }, base64) => {
      const previous = await clipboard.read();
      // Some Windows clipboard formats cannot be round-tripped through Electron.
      // Leave those untouched and exercise the same paste handler with an event.
      if (previous.some((item) => !item.types.length)) return false;
      globalThis.__ymgClipboardBackup = await Promise.all(
        previous.map(
          async (item) =>
            new ClipboardItem(
              Object.fromEntries(
                await Promise.all(
                  item.types.map(async (type) => [
                    type,
                    await item.getType(type),
                  ]),
                ),
              ),
            ),
        ),
      );
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([Buffer.from(base64, "base64")], {
            type: "image/png",
          }),
        }),
      ]);
      return true;
    },
    bytes.toString("base64"),
  );
  if (systemClipboard)
    expect(
      await app.evaluate(async ({ clipboard }) => clipboard.has("image/png")),
    ).toBe(true);
  const pasteImage = async () => {
    if (systemClipboard) return page.keyboard.press("Control+v");
    await page.evaluate((base64) => {
      const data = new DataTransfer();
      data.items.add(
        new File(
          [Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))],
          "pasted.png",
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
    }, bytes.toString("base64"));
  };
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await pasteImage();
  await expect.poll(() => fs.readFile(file, "utf8")).toContain("ymg-image-");
  await expect
    .poll(() =>
      page
        .locator(".markdown-body img")
        .evaluateAll(
          (images) => images.filter((img) => img.naturalWidth > 0).length,
        ),
    )
    .toBe(1);
  const source = await fs.readFile(file, "utf8");
  expect(source).not.toContain("data:image");
  expect(source).not.toContain("ymg-note:");
  await page.getByTitle("所见即所得", { exact: true }).click();
  await page.locator(".tiptap p").filter({ hasText: "在此插入图片" }).click();
  await page.keyboard.press("Control+End");
  await pasteImage();
  await expect
    .poll(() =>
      page
        .locator(".tiptap img")
        .evaluateAll(
          (images) => images.filter((img) => img.naturalWidth > 0).length,
        ),
    )
    .toBe(2);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, picked);
  await page.getByTitle("插入图片", { exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".tiptap img")
        .evaluateAll(
          (images) => images.filter((img) => img.naturalWidth > 0).length,
        ),
    )
    .toBe(3);
  await expect
    .poll(
      async () =>
        (await fs.readdir(path.join(vault, "图片笔记"))).filter((file) =>
          file.endsWith(".png"),
        ).length,
    )
    .toBe(3);
  const pdf = path.join(run, "with-images.pdf");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, pdf);
  await page.getByTitle("一键导出 PDF", { exact: true }).click();
  await expect(page.getByTitle("一键导出 PDF", { exact: true })).toBeEnabled({
    timeout: 15000,
  });
  expect((await fs.readFile(pdf)).subarray(0, 5).toString()).toBe("%PDF-");
  await page.keyboard.press("Control+s");
  await app.evaluate(async ({ clipboard }) => {
    const backup = globalThis.__ymgClipboardBackup;
    if (backup) {
      if (backup.length) await clipboard.write(backup);
      else clipboard.clear();
      delete globalThis.__ymgClipboardBackup;
    }
  });
  await app.close();
  running = await launch();
  ({ app, page } = running);
  await expect
    .poll(() =>
      page
        .locator(".tiptap img")
        .evaluateAll(
          (images) => images.filter((img) => img.naturalWidth > 0).length,
        ),
    )
    .toBe(3);
  expect(errors).toEqual([]);
  console.log(
    "Clipboard paste, image picker, same-directory files, relative paths, rich preview, PDF and restart passed:",
    run,
  );
} catch (error) {
  console.log(
    "Image paste diagnostics",
    JSON.stringify(
      await running.page.evaluate(() => ({
        events: window.__imagePasteLog,
        focus: document.activeElement.className,
        ready: document.querySelector(".tiptap")?.dataset.imagePasteReady,
        images: [...document.querySelectorAll(".tiptap img")].map((img) => ({
          src: img.getAttribute("src"),
          w: img.naturalWidth,
        })),
        notices: [...document.querySelectorAll(".toast")].map(
          (el) => el.textContent,
        ),
      })),
    ),
  );
  throw error;
} finally {
  await running.app
    .evaluate(async ({ clipboard }) => {
      const backup = globalThis.__ymgClipboardBackup;
      if (backup) {
        if (backup.length) await clipboard.write(backup);
        else clipboard.clear();
        delete globalThis.__ymgClipboardBackup;
      }
    })
    .catch(() => {});
  await running.app.close();
}
