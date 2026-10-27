import { useState } from "react";
import { X } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import { Select } from "./Select";
import { themes, getTheme } from "./themes";
import { defaults, type Preferences } from "./preferences";

export function EditorSettings({
  value: p,
  onChange,
  onBackground,
  onClose,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
  onBackground: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("theme");
  const patch = (next: Partial<Preferences>) => onChange({ ...p, ...next });
  const range = (
    key: keyof Preferences,
    label: string,
    min: number,
    max: number,
    step = 1,
    unit = "",
  ) => (
    <label className="range-setting" key={key}>
      <span>
        {label}
        <output>
          {p[key]}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        value={Number(p[key])}
        min={min}
        max={max}
        step={step}
        onChange={(e) => patch({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  const toggle = (key: keyof Preferences, label: string) => (
    <label className="toggle-setting" key={key}>
      <span>{label}</span>
      <input
        type="checkbox"
        aria-label={label}
        checked={Boolean(p[key])}
        onChange={(e) => patch({ [key]: e.target.checked })}
      />
    </label>
  );
  return (
    <SettingsDialog onClose={onClose}>
      <header className="settings-heading">
        <h2>设置</h2>
        <button title="关闭设置" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <nav className="settings-tabs" aria-label="设置分类">
        {[
          ["theme", "主题"],
          ["background", "背景"],
          ["type", "排版"],
          ["motion", "动效"],
          ["layout", "布局"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {tab === "theme" && (
          <>
            <div className="theme-grid">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  aria-label={theme.name}
                  aria-pressed={getTheme(p.theme).id === theme.id}
                  className="theme-card"
                  onClick={() =>
                    patch({ theme: theme.id, accent: theme.accent })
                  }
                >
                  <code style={{ background: theme.bg, color: theme.text }}>
                    <span style={{ color: theme.keyword }}>const </span>n ={" "}
                    <span style={{ color: theme.number }}>42</span>;
                  </code>
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
            <label className="toggle-setting">
              主题色
              <input
                type="color"
                aria-label="主题色"
                value={p.accent}
                onChange={(e) => patch({ accent: e.target.value })}
              />
            </label>
          </>
        )}
        {tab === "background" && (
          <>
            <div className="background-actions">
              <button className="primary" onClick={onBackground}>
                选择背景图片
              </button>
              {p.image && (
                <button onClick={() => patch({ image: "" })}>移除背景</button>
              )}
            </div>
            {p.image && (
              <img className="background-sample" src={p.image} alt="当前背景" />
            )}
            {range("backgroundTransparency", "背景图片透明度", 0, 100, 1, "%")}
            <p className="settings-note">0% 显示原图，100% 完全透明。</p>
            {range("opacity", "编辑区不透明度", 0, 100, 1, "%")}
            {range("blur", "背景模糊", 0, 20, 1, "px")}
          </>
        )}
        {tab === "type" && (
          <>
            <label className="setting-label">正文字体</label>
            <Select
              aria-label="正文字体"
              value={p.font}
              onChange={(e) => patch({ font: e.target.value })}
            >
              <option value="sans">无衬线</option>
              <option value="serif">衬线</option>
              <option value="mono">等宽</option>
            </Select>
            {range("fontSize", "字号", 12, 28, 1, "px")}
            {range("lineHeight", "行高", 1.3, 2.5, 0.1)}
            {range("width", "页面宽度", 560, 1400, 20, "px")}
          </>
        )}
        {tab === "motion" && (
          <>
            {toggle("smoothCursor", "平滑光标")}
            {toggle("cursorTrail", "跳转拖影")}
            {range("cursorDuration", "光标动画时长", 40, 260, 10, "ms")}
            {range("typingFeedback", "打字反馈强度", 0, 100, 1, "%")}
          </>
        )}
        {tab === "layout" && (
          <>
            {toggle("showHeader", "显示顶部文件栏")}
            {toggle("showToolbar", "显示格式工具栏")}
            {toggle("showStatus", "显示底部状态栏")}
            {toggle("fullWidth", "使用全部编辑宽度")}
            {toggle("syncScroll", "同步源码与预览滚动")}
          </>
        )}
      </div>
      <footer className="settings-footer">
        <button onClick={() => onChange({ ...defaults })}>恢复默认设置</button>
        <small>YMarkdownG {__APP_VERSION__}</small>
      </footer>
    </SettingsDialog>
  );
}
