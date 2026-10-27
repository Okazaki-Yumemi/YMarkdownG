import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CodeMirror, {
  ExternalChange,
  Transaction,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import {
  FilePlus2,
  FolderOpen,
  Save,
  SaveAll,
  FileDown,
  Settings2,
  Bold,
  Italic,
  Link,
  Code,
  ImagePlus,
  Heading2,
} from "lucide-react";
import type { DocumentData, FileCommand } from "./desktop";
import type { RichEditorHandle } from "./RichEditor";
import { renderMarkdown } from "./markdown";
import { editorMotion } from "./editor-motion";
import { useScrollSync } from "./scroll-sync";
import { getTheme, themeVariables, sourceTheme } from "./themes";
import { loadPreferences } from "./preferences";
import { EditorSettings } from "./EditorSettings";
import "./editor.css";
import "./editor-motion.css";

type Mode = "rich" | "edit" | "split" | "preview";
const blank = (): DocumentData => ({
  id: crypto.randomUUID(),
  path: null,
  name: "未命名.md",
  content: "",
});
function App() {
  const [doc, setDoc] = useState<DocumentData>(blank);
  const current = useRef(doc),
    saved = useRef("");
  const [ready, setReady] = useState(!window.desktop);
  const [prefs, setPrefs] = useState(loadPreferences);
  const [settings, setSettings] = useState(false),
    [focus, setFocus] = useState(false);
  const [mode, setMode] = useState<Mode>(() => {
    const value = localStorage.getItem("ymg-editor-mode");
    return ["rich", "edit", "split", "preview"].includes(value || "")
      ? (value as Mode)
      : "rich";
  });
  const [RichEditor, setRichEditor] = useState<
    typeof import("./RichEditor").RichEditor | null
  >(null);
  const editor = useRef<ReactCodeMirrorRef>(null),
    rich = useRef<RichEditorHandle>(null);
  const preview = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null),
    backgroundInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const images = useRef(new Set<Promise<void>>());
  const [imageBusy, setImageBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [external, setExternal] = useState(false);
  const actions = useRef<(name: FileCommand) => void>(() => {});
  const closing = useRef<() => Promise<void>>(async () => {});
  const refresh = useRef<() => Promise<void>>(async () => {});
  const notify = (value: string) => setMessage(value);
  const update = (content: string) => {
    current.current = { ...current.current, content };
    setDoc(current.current);
    window.desktop?.setDirty(content !== saved.current);
  };
  const receive = (value: DocumentData) => {
    saved.current = value.content;
    current.current = value;
    setDoc(value);
    setExternal(false);
    window.desktop?.setDirty(false);
  };
  useEffect(() => {
    let active = true;
    if (window.desktop)
      void window.desktop
        .current()
        .then((value) => {
          if (active) receive(value);
        })
        .catch((error) => notify(error.message))
        .finally(() => {
          if (active) setReady(true);
        });
    else {
      const content = localStorage.getItem("ymg-document-draft") || "";
      receive({ ...blank(), content });
    }
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (mode !== "rich" || RichEditor) return;
    let active = true;
    void import("./RichEditor").then((module) => {
      if (active) setRichEditor(() => module.RichEditor);
    });
    return () => {
      active = false;
    };
  }, [mode, RichEditor]);
  useEffect(() => {
    localStorage.setItem("ymg-prefs", JSON.stringify(prefs));
  }, [prefs]);
  useEffect(() => {
    localStorage.setItem("ymg-editor-mode", mode);
  }, [mode]);
  useEffect(() => {
    document.title = `${doc.content !== saved.current ? "● " : ""}${doc.name} — YMarkdownG`;
    if (!window.desktop && ready)
      localStorage.setItem("ymg-document-draft", doc.content);
  }, [doc, ready]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const html = useMemo(
    () =>
      mode === "preview" || mode === "split"
        ? renderMarkdown(doc.content, doc.imageBase)
        : "",
    [mode, doc.content, doc.imageBase],
  );
  const extensions = useMemo(
    () => [
      markdown({ codeLanguages: languages }),
      EditorView.lineWrapping,
      sourceTheme(prefs.theme),
      editorMotion({
        enabled: prefs.smoothCursor,
        trail: prefs.cursorTrail,
        duration: prefs.cursorDuration,
        feedback: prefs.typingFeedback,
      }),
    ],
    [
      prefs.theme,
      prefs.smoothCursor,
      prefs.cursorTrail,
      prefs.cursorDuration,
      prefs.typingFeedback,
    ],
  );
  useScrollSync(editor, preview, prefs.syncScroll, mode, html, doc.id);
  async function exportPDF() {
    if (!window.desktop) {
      notify("导出 PDF 请使用桌面版");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      rich.current?.flush();
      await Promise.all([...images.current]);
      const value = current.current;
      if (
        await window.desktop.exportPDF(
          value.name.replace(/\.(md|markdown)$/i, ""),
          renderMarkdown(value.content, value.imageBase),
        )
      )
        notify("PDF 已导出");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function save(saveAs = false): Promise<boolean> {
    rich.current?.flush();
    const snapshot = current.current;
    if (!window.desktop) {
      const url = URL.createObjectURL(
        new Blob([snapshot.content], { type: "text/markdown;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = snapshot.name;
      a.click();
      URL.revokeObjectURL(url);
      saved.current = snapshot.content;
      setDoc({ ...current.current });
      return true;
    }
    try {
      const result = await window.desktop.save(
        snapshot.id,
        snapshot.content,
        saveAs,
        saved.current,
      );
      if (!result) return false;
      if (current.current.id === snapshot.id) {
        saved.current = snapshot.content;
        current.current = { ...result, content: current.current.content };
        setDoc(current.current);
        setExternal(false);
        window.desktop.setDirty(current.current.content !== saved.current);
      }
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    }
  }
  async function confirmChanges() {
    rich.current?.flush();
    if (current.current.content === saved.current) return true;
    const answer = window.desktop
      ? await window.desktop.confirmSave()
      : window.confirm("放弃尚未保存的更改？")
        ? "discard"
        : "cancel";
    if (answer === "cancel") return false;
    return answer === "save" ? save() : true;
  }
  async function command(name: FileCommand) {
    if (name === "pdf") {
      await exportPDF();
      return;
    }
    if (!ready || busyRef.current || images.current.size) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (name === "save" || name === "saveAs") {
        await save(name === "saveAs");
        return;
      }
      if (!(await confirmChanges())) return;
      if (name === "new")
        receive(window.desktop ? await window.desktop.create() : blank());
      else if (window.desktop) {
        const value = await window.desktop.open();
        if (value) receive(value);
      } else fileInput.current?.click();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  actions.current = (name) => {
    void command(name);
  };
  closing.current = async () => {
    if (busyRef.current) {
      window.desktop?.flushed(false);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await Promise.all([...images.current]);
      window.desktop?.flushed(await confirmChanges());
    } catch (error) {
      notify((error as Error).message);
      window.desktop?.flushed(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  refresh.current = async () => {
    if (
      !window.desktop ||
      busyRef.current ||
      !current.current.path ||
      images.current.size
    )
      return;
    const id = current.current.id,
      text = current.current.content;
    try {
      const result = await window.desktop.refresh(id);
      if (current.current.id !== id || !result.changed) return;
      if (
        !result.missing &&
        current.current.content === text &&
        text === saved.current &&
        !rich.current?.hasDraft()
      ) {
        const value = await window.desktop.reload(id);
        if (
          current.current.id === id &&
          current.current.content === text &&
          !rich.current?.hasDraft()
        )
          receive(value);
        else if (current.current.id === id) setExternal(true);
      } else setExternal(true);
    } catch (error) {
      notify((error as Error).message);
    }
  };
  useEffect(() => {
    const offFlush = window.desktop?.onFlush(() => {
      void closing.current();
    });
    const offCommand = window.desktop?.onCommand((name) =>
      actions.current(name),
    );
    const onFocus = () => {
      void refresh.current();
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      if (
        current.current.content !== saved.current ||
        rich.current?.hasDraft()
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      offFlush?.();
      offCommand?.();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") setFocus(false);
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === ",") {
        event.preventDefault();
        setSettings((value) => !value);
      }
      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setFocus((value) => !value);
      }
      if (key === "t" && event.shiftKey) {
        event.preventDefault();
        setPrefs((p) => ({ ...p, showToolbar: !p.showToolbar }));
      }
      const name =
        key === "s"
          ? event.shiftKey
            ? "saveAs"
            : "save"
          : key === "o"
            ? "open"
            : key === "n"
              ? "new"
              : key === "e" && event.shiftKey
                ? "pdf"
                : null;
      if (name) {
        event.preventDefault();
        actions.current(name);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function insert(before: string, after = "") {
    if (mode === "rich") {
      rich.current?.insert(before, after);
      return;
    }
    const view = editor.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: before + text + after },
      selection: {
        anchor: from + before.length,
        head: from + before.length + text.length,
      },
    });
    view.focus();
  }
  function replaceImage(token: string, src: string | null) {
    if (rich.current) {
      rich.current.resolveImage(token, src);
      return;
    }
    const view = editor.current?.view;
    const content = view?.state.doc.toString() ?? current.current.content;
    const from = content.indexOf(token);
    if (from < 0) return;
    if (view)
      view.dispatch({
        changes: { from, to: from + token.length, insert: src || "" },
      });
    else
      update(
        content.slice(0, from) +
          (src || "") +
          content.slice(from + token.length),
      );
  }
  function insertImage(data: Promise<Uint8Array>) {
    if (busyRef.current) return;
    const id = current.current.id;
    const task = (async () => {
      if (window.desktop && !current.current.path && !(await save())) return;
      if (current.current.id !== id) return;
      const bytes = await data;
      const token = `pending-image-${crypto.randomUUID()}`;
      if (rich.current) rich.current.insertImage(token);
      else insert(`![图片](${token})`);
      try {
        const src = window.desktop
          ? await window.desktop.saveImage(id, bytes)
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(
                new Blob([bytes as Uint8Array<ArrayBuffer>]),
              );
            });
        if (current.current.id === id) replaceImage(token, src);
      } catch (error) {
        if (current.current.id === id) replaceImage(token, null);
        throw error;
      }
    })().catch((error) => notify((error as Error).message));
    images.current.add(task);
    setImageBusy(true);
    void task.finally(() => {
      images.current.delete(task);
      setImageBusy(!!images.current.size);
    });
  }
  async function chooseImage() {
    if (window.desktop) {
      try {
        const bytes = await window.desktop.chooseImage();
        if (bytes) insertImage(Promise.resolve(bytes));
      } catch (error) {
        notify((error as Error).message);
      }
    } else imageInput.current?.click();
  }
  async function chooseBackground() {
    if (window.desktop) {
      try {
        const image = await window.desktop.chooseBackground();
        if (image) setPrefs((p) => ({ ...p, image }));
      } catch (error) {
        notify((error as Error).message);
      }
    } else backgroundInput.current?.click();
  }
  const dirty = doc.content !== saved.current;
  return (
    <div
      className={`app ${getTheme(prefs.theme).dark ? "dark" : "light"} ${focus ? "focus-mode" : ""}`}
      style={
        {
          ...themeVariables(prefs.theme),
          "--accent": prefs.accent,
          "--editor-size": `${prefs.fontSize}px`,
          "--line-height": prefs.lineHeight,
          "--page-width": `${prefs.width}px`,
          "--surface-opacity": prefs.opacity / 100,
        } as React.CSSProperties
      }
    >
      {prefs.showHeader && !focus && (
        <header className="topbar">
          <div className="file-actions">
            {[
              ["new", FilePlus2, "新建 Ctrl+N"],
              ["open", FolderOpen, "打开 Ctrl+O"],
              ["save", Save, "保存 Ctrl+S"],
              ["saveAs", SaveAll, "另存为 Ctrl+Shift+S"],
            ].map(([name, Icon, label]) => {
              const Component = Icon as typeof Save;
              return (
                <button
                  key={String(name)}
                  title={String(label)}
                  disabled={busy || imageBusy || !ready}
                  onClick={() => actions.current(name as FileCommand)}
                >
                  <Component size={17} />
                </button>
              );
            })}
          </div>
          <span className="document-title" title={doc.path || doc.name}>
            {dirty && <i aria-label="未保存">●</i>}
            {doc.name}
          </span>
          <button
            title="导出 PDF"
            disabled={busy || !ready}
            onClick={() => void exportPDF()}
          >
            <FileDown size={17} />
            PDF
          </button>
          <button title="设置" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
          </button>
        </header>
      )}
      {(!prefs.showHeader || focus) && (
        <button
          className="settings-launcher"
          title="设置"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={17} />
        </button>
      )}
      {prefs.showToolbar && !focus && (
        <div className="formatbar">
          <div className="format-actions">
            {[
              [Heading2, "二级标题", "\n## ", ""],
              [Bold, "加粗", "**", "**"],
              [Italic, "斜体", "*", "*"],
              [Link, "链接", "[", "](https://)"],
              [Code, "代码块", "\n```javascript\n", "\n```\n"],
            ].map(([Icon, label, before, after]) => {
              const Component = Icon as typeof Bold;
              return (
                <button
                  key={String(label)}
                  title={String(label)}
                  disabled={mode === "preview"}
                  onClick={() => insert(String(before), String(after))}
                >
                  <Component size={16} />
                </button>
              );
            })}
            <button
              title="插入图片"
              disabled={mode === "preview" || imageBusy || busy}
              onClick={() => void chooseImage()}
            >
              <ImagePlus size={16} />
            </button>
          </div>
          <nav className="mode-tabs" aria-label="编辑模式">
            {(
              [
                ["rich", "所见即所得"],
                ["edit", "源码"],
                ["split", "分屏"],
                ["preview", "阅读"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                title={label}
                aria-pressed={mode === id}
                onClick={() => {
                  rich.current?.flush();
                  setMode(id);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}
      {external && (
        <div className="external-banner" role="alert">
          <span>文件已在外部修改或删除。当前编辑内容已保留。</span>
          <button
            onClick={() =>
              void (async () => {
                if (!(await confirmChanges())) return;
                try {
                  if (window.desktop)
                    receive(await window.desktop.reload(current.current.id));
                } catch (error) {
                  notify((error as Error).message);
                }
              })()
            }
          >
            重新加载
          </button>
          <button onClick={() => actions.current("saveAs")}>另存为</button>
        </div>
      )}
      <main
        className={`canvas mode-${mode} font-${prefs.font}`}
        data-full-width={prefs.fullWidth}
        onPasteCapture={(event) => {
          if (mode === "rich") return;
          const file = Array.from(event.clipboardData.files).find((file) =>
            /^image\/(png|jpeg|gif|webp)$/.test(file.type),
          );
          if (file) {
            event.preventDefault();
            insertImage(
              file.arrayBuffer().then((value) => new Uint8Array(value)),
            );
          }
        }}
      >
        <div
          className="background-layer"
          style={{
            backgroundImage: prefs.image ? `url(${prefs.image})` : undefined,
            opacity: (100 - prefs.backgroundTransparency) / 100,
            filter: `blur(${prefs.blur}px)`,
          }}
        />
        <div className="document-shell">
          {!ready ? (
            <div role="status" className="loading">
              打开文档…
            </div>
          ) : (
            <div className="panes">
              {mode === "rich" &&
                (RichEditor ? (
                  <RichEditor
                    key={doc.id}
                    ref={rich}
                    value={doc.content}
                    onChange={update}
                    assetBase={doc.imageBase}
                    toolbar={prefs.showToolbar && !focus}
                    motion={{
                      enabled: prefs.smoothCursor,
                      trail: prefs.cursorTrail,
                      duration: prefs.cursorDuration,
                      feedback: prefs.typingFeedback,
                    }}
                    onImagePaste={(file) =>
                      insertImage(
                        file
                          .arrayBuffer()
                          .then((value) => new Uint8Array(value)),
                      )
                    }
                  />
                ) : (
                  <div role="status" className="loading">
                    加载编辑器…
                  </div>
                ))}
              {(mode === "edit" || mode === "split") && (
                <section className="source-pane">
                  <CodeMirror
                    key={doc.id}
                    ref={editor}
                    value={doc.content}
                    onChange={update}
                    theme="none"
                    onUpdate={(change) => {
                      // The wrapper can replay a queued value after typing ends.
                      // Ignore that stale echo, keeping the view on our latest
                      // document without generating another user edit.
                      if (
                        !change.docChanged ||
                        !change.transactions.some((tr) =>
                          tr.annotation(ExternalChange),
                        )
                      )
                        return;
                      const id = current.current.id;
                      queueMicrotask(() => {
                        const view = editor.current?.view;
                        if (view !== change.view || current.current.id !== id)
                          return;
                        const content = current.current.content;
                        if (view.state.doc.toString() !== content)
                          view.dispatch({
                            changes: {
                              from: 0,
                              to: view.state.doc.length,
                              insert: content,
                            },
                            annotations: [
                              ExternalChange.of(true),
                              Transaction.addToHistory.of(false),
                            ],
                          });
                      });
                    }}
                    extensions={extensions}
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: true,
                      highlightActiveLineGutter: true,
                    }}
                  />
                </section>
              )}
              {(mode === "preview" || mode === "split") && (
                <section className="preview-pane" ref={preview}>
                  <article
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: html }}
                    onDoubleClick={(event) => {
                      const line = Number(
                        (event.target as HTMLElement).closest<HTMLElement>(
                          ".md-source-block",
                        )?.dataset.sourceLine,
                      );
                      const view = editor.current?.view;
                      if (view && line) {
                        const from = view.state.doc.line(
                          Math.min(line, view.state.doc.lines),
                        ).from;
                        view.dispatch({
                          selection: { anchor: from },
                          effects: EditorView.scrollIntoView(from, {
                            y: "center",
                          }),
                        });
                        view.focus();
                      }
                    }}
                    onClick={(event) => {
                      const button = (event.target as HTMLElement).closest(
                        ".copy-code",
                      );
                      if (button) {
                        const lines = button
                          .closest(".code-block")
                          ?.querySelectorAll(".code-line");
                        void navigator.clipboard
                          .writeText(
                            Array.from(lines || [])
                              .map(
                                (line) =>
                                  line.lastElementChild?.textContent || "",
                              )
                              .join("\n"),
                          )
                          .then(() => notify("代码已复制"))
                          .catch(() => notify("无法访问剪贴板"));
                      }
                    }}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      </main>
      {prefs.showStatus && !focus && (
        <footer className="statusbar">
          <span>
            {imageBusy
              ? "写入图片…"
              : dirty
                ? "未保存"
                : doc.path
                  ? "已保存"
                  : "新文档"}
          </span>
          <span>
            {doc.content.replace(/\s/g, "").length.toLocaleString()} 字 · UTF-8
            · Markdown
          </span>
        </footer>
      )}
      {settings && (
        <EditorSettings
          value={prefs}
          onChange={setPrefs}
          onBackground={() => void chooseBackground()}
          onClose={() => setSettings(false)}
        />
      )}
      {message && (
        <div className="toast" role="status">
          {message}
          <button title="关闭提示" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      <input
        hidden
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file)
            void file
              .text()
              .then((content) =>
                receive({ ...blank(), name: file.name, content }),
              );
          event.target.value = "";
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file)
            insertImage(
              file.arrayBuffer().then((value) => new Uint8Array(value)),
            );
          event.target.value = "";
        }}
      />
      <input
        hidden
        ref={backgroundInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () =>
              setPrefs((p) => ({ ...p, image: String(reader.result) }));
            reader.readAsDataURL(file);
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
