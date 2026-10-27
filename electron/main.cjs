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
const { DocumentStore, imageType } = require("./document.cjs");
const { writePDF } = require("./pdf.cjs");
if (process.env.YMG_USER_DATA)
  app.setPath("userData", path.resolve(process.env.YMG_USER_DATA));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "ymg-note",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
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
const document = new DocumentStore();
let win,
  dirty = false,
  waiting = false,
  closing = false;
const pendingFiles = new Map();
function launchFile(argv, directory = process.cwd()) {
  const file = argv.find(
    (arg) => !arg.startsWith("-") && /\.(md|markdown|mdown|txt)$/i.test(arg),
  );
  return file ? path.resolve(directory, file) : undefined;
}
let initialFile = launchFile(process.argv.slice(1));
function requestFile(file) {
  const token = randomUUID();
  pendingFiles.set(token, file);
  win?.webContents.send("document:open-request", token);
}
app.on("second-instance", (_event, argv, directory) => {
  const file = launchFile(argv, directory);
  if (file) requestFile(file);
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});
app.on("open-file", (event, file) => {
  event.preventDefault();
  if (!app.isReady() && !win) initialFile = file;
  else requestFile(file);
});
function authorized(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error("无效窗口请求");
}
function register(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    authorized(event);
    return handler(...args);
  });
}
register("document:current", () => document.data());
register("document:pending", () => [...pendingFiles.keys()]);
register("document:discard-request", (token) => pendingFiles.delete(token));
register("document:open-request", (token) => {
  const file = pendingFiles.get(token);
  pendingFiles.delete(token);
  return file ? document.open(file) : null;
});
register("document:new", () => document.create());
register("document:open", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "打开 Markdown",
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] },
    ],
  });
  return result.canceled ? null : document.open(result.filePaths[0]);
});
register("document:save", async (id, content, saveAs, expectedContent) => {
  document.check(id);
  let file;
  if (saveAs || !document.current.path) {
    const result = await dialog.showSaveDialog(win, {
      title: "保存 Markdown",
      defaultPath: document.current.path || "未命名.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled) return null;
    file = result.filePath;
  }
  return document.save(id, content, file, expectedContent);
});
register("document:confirm", async () => {
  const result = await dialog.showMessageBox(win, {
    type: "question",
    message: "保存对当前文档的更改？",
    buttons: ["保存", "不保存", "取消"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return ["save", "discard", "cancel"][result.response];
});
register("document:refresh", (id) => document.refresh(id));
register("document:reload", (id) => document.reload(id));
register("document:pdf", async (title, html) => {
  if (typeof title !== "string" || typeof html !== "string")
    throw new Error("无效文档内容");
  const result = await dialog.showSaveDialog(win, {
    title: "导出 PDF",
    defaultPath: `${title.replace(/[<>:"/\\|?*]/g, "_")}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled) return false;
  await writePDF(html, result.filePath);
  return true;
});
register("image:save", (id, bytes) => document.saveImage(id, bytes));
register("image:choose", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "插入图片",
    properties: ["openFile"],
    filters: [
      { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
    ],
  });
  if (result.canceled) return null;
  const bytes = await fs.readFile(result.filePaths[0]);
  imageType(bytes);
  return bytes;
});
register("background:choose", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "选择背景图片",
    properties: ["openFile"],
    filters: [
      { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
    ],
  });
  if (result.canceled) return null;
  const bytes = await fs.readFile(result.filePaths[0]);
  const { extension } = imageType(bytes);
  const directory = path.join(app.getPath("userData"), "backgrounds");
  await fs.mkdir(directory, { recursive: true });
  const name = `${randomUUID()}.${extension}`;
  await fs.writeFile(path.join(directory, name), bytes);
  return `ymg-asset://background/${name}`;
});
ipcMain.on("document:dirty", (event, value) => {
  authorized(event);
  dirty = !!value;
  win.setDocumentEdited(dirty);
});
ipcMain.on("document:closed", (event, ok) => {
  authorized(event);
  if (!waiting) return;
  waiting = false;
  if (ok) {
    closing = true;
    win.close();
  }
});
app.whenReady().then(async () => {
  if (!primaryInstance) return;
  if (initialFile) {
    try {
      await document.open(initialFile);
    } catch (error) {
      dialog.showErrorBox("无法打开文件", error.message);
    }
  }
  protocol.handle("ymg-note", async (request) => {
    try {
      const url = new URL(request.url);
      const result = await document.readImage(
        url.hostname,
        decodeURIComponent(url.pathname.slice(1)),
      );
      return new Response(result.bytes, {
        headers: {
          "Content-Type": result.mime,
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  protocol.handle("ymg-asset", (request) => {
    const url = new URL(request.url),
      name = url.pathname.slice(1);
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
  const command = (name) => win?.webContents.send("document:command", name);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      {
        label: "文件",
        submenu: [
          {
            label: "新建",
            accelerator: "CmdOrCtrl+N",
            click: () => command("new"),
          },
          {
            label: "打开…",
            accelerator: "CmdOrCtrl+O",
            click: () => command("open"),
          },
          {
            label: "保存",
            accelerator: "CmdOrCtrl+S",
            click: () => command("save"),
          },
          {
            label: "另存为…",
            accelerator: "CmdOrCtrl+Shift+S",
            click: () => command("saveAs"),
          },
          {
            label: "导出 PDF…",
            accelerator: "CmdOrCtrl+Shift+E",
            click: () => command("pdf"),
          },
          { type: "separator" },
          { role: "close" },
        ],
      },
      { role: "editMenu" },
      {
        label: "视图",
        submenu: [
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
  win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 560,
    minHeight: 420,
    backgroundColor: "#282c34",
    title: "YMarkdownG",
    icon: path.join(__dirname, "../public/icon-512.png"),
    autoHideMenuBar: true,
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
    if (!dirty || closing) return;
    event.preventDefault();
    if (!waiting) {
      waiting = true;
      win.webContents.send("document:flush");
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-prevent-unload", (event) => {
    if (closing) event.preventDefault();
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
    await win.loadURL(devURL);
  else await win.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
