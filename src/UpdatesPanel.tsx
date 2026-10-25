import { useEffect, useState } from "react";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
export type UpdateState = {
  status: string;
  currentVersion: string;
  version: string;
  percent: number;
  automatic: boolean;
  portable: boolean;
  platform: string;
  message: string;
};
export function UpdatesPanel() {
  const [state, setState] = useState<UpdateState>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!window.desktop) return;
    void window.desktop
      .updateState()
      .then(setState)
      .catch((error) => setError(error.message));
    return window.desktop.onUpdate(setState);
  }, []);
  const run = (task: Promise<unknown>) => {
    setError("");
    void task.catch((error) => setError(error.message));
  };
  if (!window.desktop)
    return <p className="motion-intro">更新管理在独立桌面版中提供。</p>;
  if (!state)
    return <p className="motion-intro">{error || "正在读取版本信息…"}</p>;
  return (
    <>
      <div className="update-version">
        <img src="./icon.svg" width="44" height="44" alt="YMG" />
        <span>
          YMarkdownG
          <small>
            v{state.currentVersion} ·{" "}
            {state.portable ? "手动更新" : "支持自动更新"}
          </small>
        </span>
      </div>
      <div className="motion-intro">
        {state.message ||
          (state.status === "checking"
            ? "正在检查 GitHub Releases…"
            : state.status === "available"
              ? `发现新版本 v${state.version}`
              : state.status === "downloading"
                ? `正在下载更新 ${state.percent}%`
                : state.status === "ready"
                  ? "更新已就绪，可保存笔记后重启"
                  : "从 GitHub Releases 检查稳定版本更新。")}
        {error && <p>{error}</p>}
      </div>
      <button
        className="update-action"
        disabled={["checking", "downloading", "ready"].includes(state.status)}
        onClick={() => run(window.desktop!.checkUpdates())}
      >
        <RefreshCw size={14} />
        检查更新
      </button>
      {state.status === "available" && (
        <button
          className="update-action primary"
          onClick={() => run(window.desktop!.downloadUpdate())}
        >
          <Download size={14} />
          {state.portable ? "打开新版下载页" : "下载更新"}
        </button>
      )}
      {state.status === "downloading" && (
        <progress aria-label="更新下载进度" max={100} value={state.percent} />
      )}
      {state.status === "ready" && (
        <button
          className="update-action primary"
          onClick={() => run(window.desktop!.installUpdate())}
        >
          <RotateCcw size={14} />
          保存并重启更新
        </button>
      )}
      {!state.portable && (
        <label className="toggle-setting">
          <span>
            自动下载更新<small>安装前仍会保存笔记并等待重启</small>
          </span>
          <input
            type="checkbox"
            aria-label="自动下载更新"
            checked={state.automatic}
            onChange={(event) =>
              run(
                window
                  .desktop!.automaticUpdates(event.target.checked)
                  .then(setState),
              )
            }
          />
        </label>
      )}
      <p className="background-help">
        启动后自动检查，每 6 小时检查一次。
        {state.portable
          ? "当前发行格式使用下载新版替换的更新方式。"
          : "下载校验通过后才会允许安装。"}
      </p>
    </>
  );
}
