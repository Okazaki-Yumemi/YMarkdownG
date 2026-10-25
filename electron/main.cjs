const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  protocol,
  net,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "ymg-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const { NativeStore } = require("./native-store.cjs");
const { createUpdates } = require("./updater.cjs");
if (process.env.YMG_USER_DATA)
  app.setPath("userData", path.resolve(process.env.YMG_USER_DATA));
const stores = new Map();
let win;
let dirty = false;
let closing = false;
let waiting = false;
let updates;
let installPending = false;
const configPath = () => path.join(app.getPath("userData"), "workspace.json");
const authorized = (event) => {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error("无效窗口请求");
};
function register(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    authorized(event);
    return handler(...args);
  });
}
async function openRoot(root) {
  const store = await new NativeStore(root).init();
  const data = await store.load();
  const id = randomUUID();
  stores.set(id, store);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(
    configPath(),
    JSON.stringify({ root: store.root }),
    "utf8",
  );
  return { id, name: path.basename(store.root), root: store.root, ...data };
}
function getStore(id) {
  if (!stores.has(id)) throw new Error("笔记空间未打开");
  return stores.get(id);
}
register("workspace:restore", async () => {
  let root;
  try {
    root = JSON.parse(await fs.readFile(configPath(), "utf8")).root;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!root) {
    root = path.join(app.getPath("documents"), "YMarkdownG");
    await fs.mkdir(root, { recursive: true });
  }
  return openRoot(root);
});
register("workspace:open", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "选择笔记空间",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : openRoot(result.filePaths[0]);
});
register("workspace:save", (id, notes) => getStore(id).save(notes));
register("workspace:mkdir", (id, folder) => getStore(id).createFolder(folder));
register("workspace:move-folder", (id, from, to) =>
  getStore(id).moveFolder(from, to),
);
register("workspace:delete-folder", (id, folder) =>
  getStore(id).deleteFolder(folder),
);
register("background:choose", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "选择背景图片",
    properties: ["openFile"],
    filters: [
      { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ],
  });
  if (result.canceled) return null;
  const extension = path.extname(result.filePaths[0]).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension))
    throw new Error("请选择支持的图片格式");
  const dir = path.join(app.getPath("userData"), "backgrounds");
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomUUID()}${extension}`;
  await fs.copyFile(result.filePaths[0], path.join(dir, name));
  return `ymg-asset://background/${name}`;
});
register("workspace:reveal", (id) => shell.openPath(getStore(id).root));
register("updates:state", () => updates.snapshot());
register("updates:check", () => updates.check());
register("updates:download", () => updates.download());
register("updates:automatic", (value) => updates.setAutomatic(!!value));
register("updates:install", () => updates.requestInstall());
register("note:export", async (title, content) => {
  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    Buffer.byteLength(content) > 5 * 1024 * 1024
  )
    throw new Error("无效导出内容");
  const result = await dialog.showSaveDialog(win, {
    title: "导出 Markdown",
    defaultPath: `${title.replace(/[<>:"/\\|?*]/g, "_")}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, content, "utf8");
  return true;
});
ipcMain.on("document:dirty", (event, value) => {
  authorized(event);
  dirty = !!value;
});
ipcMain.on("document:flushed", async (event, ok, error) => {
  authorized(event);
  if (!waiting) return;
  waiting = false;
  if (ok) {
    dirty = false;
    closing = true;
    if (installPending) updates.install();
    else win.close();
  } else {
    installPending = false;
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      title: "笔记尚未保存",
      message: "保存失败，是否保留窗口继续编辑？",
      detail: String(error || "请先导出未保存的笔记。"),
      buttons: ["继续编辑", "放弃更改并退出"],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) {
      closing = true;
      win.close();
    }
  }
});
app.whenReady().then(() => {
  protocol.handle("ymg-asset", (request) => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (
      url.hostname !== "background" ||
      !/^[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/.test(name)
    )
      return new Response("Not found", { status: 404 });
    return net.fetch(
      pathToFileURL(path.join(app.getPath("userData"), "backgrounds", name))
        .href,
    );
  });
  Menu.setApplicationMenu(
    process.platform === "darwin"
      ? Menu.buildFromTemplate([
          { role: "appMenu" },
          { role: "editMenu" },
          { role: "viewMenu" },
          { role: "windowMenu" },
        ])
      : null,
  );
  win = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: "#1a1b26",
    title: "YMarkdownG",
    icon: path.join(__dirname, "../public/icon-512.png"),
    show: !process.env.YMG_TEST,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !process.env.YMG_TEST,
    },
  });
  win.on("close", (event) => {
    if (!updates) return;
    if (!dirty || closing) return;
    event.preventDefault();
    if (!waiting) {
      waiting = true;
      win.webContents.send("document:flush");
    }
  });
  updates = createUpdates(app, win, () => {
    if (waiting) return;
    installPending = true;
    waiting = true;
    dirty = true;
    win.webContents.send("document:flush");
  });
  win.webContents.on("will-prevent-unload", (event) => {
    if (closing) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler(
    (_contents, permission, callback) =>
      callback(permission === "clipboard-sanitized-write"),
  );
  const devURL = process.env.YMG_DEV_URL;
  if (devURL && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(devURL))
    void win.loadURL(devURL);
  else void win.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
