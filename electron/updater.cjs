const { autoUpdater } = require("electron-updater");
const { net, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const semver = require("semver");
const RELEASE_URL =
  "https://github.com/Okazaki-Yumemi/YMarkdownG/releases/latest";

function createUpdates(app, win, install) {
  const portable =
    !!process.env.PORTABLE_EXECUTABLE_DIR ||
    !app.isPackaged ||
    process.platform === "darwin" ||
    (process.platform === "linux" && !process.env.APPIMAGE);
  const config = path.join(app.getPath("userData"), "updates.json");
  let state = {
    status: "idle",
    currentVersion: app.getVersion(),
    version: "",
    percent: 0,
    automatic: true,
    portable,
    platform: process.platform,
    message: "",
  };
  const publish = (patch) => {
    state = { ...state, ...patch };
    if (!win.isDestroyed()) win.webContents.send("updates:state", state);
    return state;
  };
  const fail = (error) =>
    publish({ status: "error", message: error.message || String(error) });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("checking-for-update", () =>
    publish({ status: "checking", message: "" }),
  );
  autoUpdater.on("update-not-available", () =>
    publish({ status: "latest", message: "当前已是最新版本" }),
  );
  autoUpdater.on("update-available", (info) => {
    publish({ status: "available", version: info.version, message: "" });
    if (state.automatic) void download();
  });
  autoUpdater.on("download-progress", (progress) =>
    publish({ status: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    publish({
      status: "ready",
      version: info.version,
      percent: 100,
      message: "更新已下载，重启前会保存所有笔记",
    }),
  );
  autoUpdater.on("error", fail);
  async function check() {
    if (["checking", "downloading", "ready"].includes(state.status))
      return state;
    publish({ status: "checking", message: "" });
    try {
      if (!portable) {
        await autoUpdater.checkForUpdates();
        return state;
      }
      const response = await net.fetch(
        "https://api.github.com/repos/Okazaki-Yumemi/YMarkdownG/releases/latest",
        {
          headers: {
            "User-Agent": `YMarkdownG/${app.getVersion()}`,
            Accept: "application/vnd.github+json",
          },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new Error(
          `GitHub 更新检查失败（${response.status}），请稍后重试`,
        );
      const release = await response.json();
      const version = semver.valid(String(release.tag_name).replace(/^v/, ""));
      if (!version) throw new Error("发布版本号格式无效");
      return publish({
        status: semver.gt(version, app.getVersion()) ? "available" : "latest",
        version,
        message: semver.gt(version, app.getVersion())
          ? "发现更新，可打开下载页获取适合当前系统的版本"
          : "当前已是最新版本",
      });
    } catch (error) {
      return fail(error);
    }
  }
  async function download() {
    if (portable) {
      await shell.openExternal(RELEASE_URL);
      return state;
    }
    if (state.status !== "available" && state.status !== "error") return state;
    try {
      publish({ status: "downloading", percent: 0, message: "" });
      await autoUpdater.downloadUpdate();
    } catch (error) {
      fail(error);
    }
    return state;
  }
  const ready = fs
    .readFile(config, "utf8")
    .then((text) => {
      const value = JSON.parse(text);
      publish({ automatic: !!value.automatic });
    })
    .catch(() => {});
  let timer;
  if (app.isPackaged && !process.env.YMG_TEST) {
    timer = setTimeout(() => void ready.then(check), 15000);
    timer.unref();
    const interval = setInterval(() => void check(), 6 * 60 * 60 * 1000);
    interval.unref();
  }
  return {
    snapshot: async () => {
      await ready;
      return state;
    },
    check,
    download,
    setAutomatic: async (automatic) => {
      publish({ automatic: !!automatic });
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      await fs.writeFile(config, JSON.stringify({ automatic: !!automatic }));
      if (automatic && state.status === "available" && !portable)
        void download();
      return state;
    },
    requestInstall: () => {
      if (portable || state.status !== "ready")
        throw new Error("尚无可安装的更新");
      install();
    },
    install: () => {
      if (!portable && state.status === "ready")
        autoUpdater.quitAndInstall(false, true);
    },
  };
}
module.exports = { createUpdates };
