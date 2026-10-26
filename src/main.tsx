import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import {
  DiskWorkspace,
  cleanFolder,
  lastWorkspace,
  rememberWorkspace,
  type DirectoryHandle,
} from "./storage";
import {
  BookOpen,
  Plus,
  Search,
  PanelLeft,
  Settings2,
  ChevronDown,
  ChevronRight,
  FileText,
  Star,
  Clock3,
  Trash2,
  FolderOpen,
  MoreHorizontal,
  Columns2,
  Code2,
  Eye,
  Maximize2,
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Code,
  ImagePlus,
  Check,
  Download,
  Upload,
  X,
  Moon,
  Sun,
  RotateCcw,
  Heading2,
  Palette,
  ArrowUpRight,
  Pin,
  CloudCheck,
} from "lucide-react";
import "./styles.css";
import "./neovim.css";
import "./editor-motion.css";
import { DesktopWorkspace, type Library } from "./desktop";
import { editorMotion } from "./editor-motion";
import { FolderContextMenu } from "./FolderContextMenu";
import "./folder-menu.css";
import { UpdatesPanel } from "./UpdatesPanel";

type Note = {
  id: string;
  title: string;
  content: string;
  updated: number;
  starred: boolean;
  folder: string;
};
type Preferences = {
  smoothCursor: boolean;
  cursorTrail: boolean;
  cursorDuration: number;
  typingFeedback: number;
  theme: string;
  accent: string;
  background: string;
  image: string;
  opacity: number;
  backgroundTransparency: number;
  blur: number;
  fontSize: number;
  lineHeight: number;
  width: number;
  font: string;
};
const defaults: Preferences = {
  smoothCursor: true,
  cursorTrail: true,
  cursorDuration: 120,
  typingFeedback: 45,
  theme: "dark",
  accent: "#7aa2f7",
  background: "paper",
  image: "",
  opacity: 92,
  backgroundTransparency: 0,
  blur: 0,
  fontSize: 15,
  lineHeight: 1.85,
  width: 960,
  font: "mono",
};
const escapeHTML = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang?.split(/\s/)[0] || "text";
      const result = hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : escapeHTML(text);
      return `<div class="code-block"><div class="code-header"><span>${escapeHTML(language)}</span><button type="button" class="copy-code" title="复制代码">复制代码</button></div><pre><code class="hljs language-${escapeHTML(language)}">${result
        .split("\n")
        .map(
          (line, i) =>
            `<span class="code-line"><span class="code-number" aria-hidden="true">${i + 1}</span><span>${line || " "}</span></span>`,
        )
        .join("")}</code></pre></div>`;
    },
  },
});
const welcome =
  '# 让思考，自由生长\n\n一个属于你的 Markdown 工作空间。\n\n**YMarkdownG** 把即时预览、本地文件和自由定制放在一起。像整理代码一样，整理你的知识。\n\n> 少一点干扰，多一点专注。\n\n## 代码，也是笔记的一部分\n\n```typescript\ninterface Notebook {\n  name: string;\n  path: string;\n}\n\nconst workspace: Notebook = {\n  name: "我的知识库",\n  path: "学习笔记/前端",\n};\n```\n\n## 你的目录，你的文件\n\n1. 点击左上角，选择本地笔记空间\n2. 在 EXPLORER 中创建多级目录\n3. 新建笔记，内容自动写入 `.md` 文件\n\n桌面版会自动打开上次使用的目录，首次启动使用文档文件夹下的 YMarkdownG。\n\n## 调整到你喜欢的样子\n\n- [x] 深色主题与等宽字体\n- [x] 代码高亮与即时预览\n- [ ] 上传一张自己的背景\n- [ ] 记录今天的第一个想法\n\n---\n\n`Ctrl + P` 快速打开 · `Ctrl + S` 保存 · `Ctrl + Shift + F` 专注模式\n';
const seeds: Note[] = [
  {
    id: "welcome",
    title: "让思考，自由生长",
    content: welcome,
    updated: Date.now(),
    starred: true,
    folder: "开始使用",
  },
  {
    id: "guide",
    title: "Markdown 语法指南",
    content:
      '# Markdown 语法指南\n\n## 基础排版\n\n使用 **粗体**、*斜体*、~~删除线~~ 和 `行内代码`。\n\n## 代码块\n\n```javascript\nconst inspiration = "从这里开始";\nconsole.log(inspiration);\n```\n\n## 表格\n\n| 功能 | 支持 |\n| --- | --- |\n| 即时渲染 | ✓ |\n| 任务列表 | ✓ |\n| 自定义背景 | ✓ |\n\n## 链接\n\n[Markdown 指南](https://www.markdownguide.org)\n',
    updated: Date.now() - 3600000,
    starred: false,
    folder: "开始使用",
  },
  {
    id: "ideas",
    title: "一些有趣的想法",
    content:
      "# 一些有趣的想法\n\n> 好的想法，需要一点留白。\n\n## 灵感收集\n\n- 在下雨天写一首短诗\n- 整理今年读过的书\n- 设计一个自己的数字花园\n",
    updated: Date.now() - 86400000,
    starred: true,
    folder: "日常随记",
  },
  {
    id: "reading",
    title: "阅读，是另一种旅行",
    content:
      "# 阅读，是另一种旅行\n\n## 本周阅读\n\n给自己一杯茶的时间，翻开一本书。\n\n- [ ] 记下一个喜欢的句子\n- [ ] 写一段自己的感想\n",
    updated: Date.now() - 172800000,
    starred: false,
    folder: "日常随记",
  },
];
function read<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}
function App() {
  const [notes, setNotes] = useState<Note[]>(() => {
    if (window.desktop) return [];
    const value = read<Note[]>("ymg-notes", seeds);
    return Array.isArray(value) &&
      value.every(
        (n) => typeof n.content === "string" && typeof n.id === "string",
      )
      ? value
      : seeds;
  });
  const [prefs, setPrefs] = useState<Preferences>(() => ({
    ...defaults,
    ...read("ymg-prefs", defaults),
  }));
  const [activeId, setActiveId] = useState(() => read("ymg-active", "welcome"));
  const [mode, setMode] = useState<"split" | "edit" | "preview">("split");
  const [filter, setFilter] = useState("all");
  const [documentView, setDocumentView] = useState(() =>
    read("ymg-document-view", "list"),
  );
  const [documentSort, setDocumentSort] = useState(() =>
    read("ymg-document-sort", "updated"),
  );
  useEffect(() => {
    localStorage.setItem("ymg-document-view", JSON.stringify(documentView));
    localStorage.setItem("ymg-document-sort", JSON.stringify(documentSort));
  }, [documentView, documentSort]);
  const [query, setQuery] = useState("");
  const [appearance, setAppearance] = useState(() => innerWidth > 960);
  const [sidebar, setSidebar] = useState(() => innerWidth > 650);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState("background");
  const [toast, setToast] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [workspace, setWorkspace] = useState<
    DiskWorkspace | DesktopWorkspace | null
  >(null);
  const [desktopLoading, setDesktopLoading] = useState(!!window.desktop);
  const restorePromise = useRef<
    ReturnType<NonNullable<typeof window.desktop>["restore"]> | undefined
  >(undefined);
  const [previousWorkspace, setPreviousWorkspace] = useState<DirectoryHandle>();
  const [diskStatus, setDiskStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [diskError, setDiskError] = useState("");
  const [folders, setFolders] = useState<string[]>(() =>
    window.desktop ? [] : read("ymg-folders", ["开始使用", "日常随记"]),
  );
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >(() => read("ymg-collapsed-folders", {}));
  const treeKey =
    workspace instanceof DesktopWorkspace
      ? workspace.fullPath
      : workspace?.root.name || "browser";
  const folderKey = (f: string) => `${treeKey}:${f}`;
  const treeFolders = Array.from(
    new Set(
      [...folders, ...notes.map((n) => n.folder)].flatMap((f) =>
        f.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/")),
      ),
    ),
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  useEffect(() => {
    localStorage.setItem(
      "ymg-collapsed-folders",
      JSON.stringify(collapsedFolders),
    );
  }, [collapsedFolders]);
  useEffect(() => {
    if (["all", "recent", "starred"].includes(filter)) return;
    setCollapsedFolders((previous) => {
      const next = { ...previous };
      const parts = filter.split("/");
      parts
        .slice(0, -1)
        .forEach(
          (_, i) =>
            delete next[`${treeKey}:${parts.slice(0, i + 1).join("/")}`],
        );
      return next;
    });
  }, [filter, treeKey]);
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderParent, setFolderParent] = useState("");
  const [noteMenu, setNoteMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [renameNoteId, setRenameNoteId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [folderMenu, setFolderMenu] = useState<{
    folder: string;
    x: number;
    y: number;
  } | null>(null);
  const folderTrigger = useRef<HTMLButtonElement | null>(null);
  const [folderOperation, setFolderOperation] = useState<{
    type: "rename" | "move" | "delete";
    folder: string;
  } | null>(null);
  const [operationName, setOperationName] = useState("");
  const [operationParent, setOperationParent] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const refreshTask = useRef<Promise<void> | null>(null);
  const switchingWorkspace = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const structureTask = useRef<Promise<boolean> | null>(null);
  const dragEntry = useRef<{ kind: "folder" | "note"; id: string } | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [targetFolder, setTargetFolder] = useState("");
  const [moveDialog, setMoveDialog] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const diskTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const diskVersion = useRef(0);
  const editor = useRef<ReactCodeMirrorRef>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const note = notes.find((n) => n.id === activeId) || notes[0];
  useEffect(() => {
    if (workspace instanceof DesktopWorkspace && note) {
      const file = workspace.pathFor(note.id);
      if (file) {
        try {
          localStorage.setItem(
            `ymg-active:${workspace.fullPath}`,
            JSON.stringify(file),
          );
        } catch {}
      }
    }
  }, [note?.id, workspace, diskStatus]);
  const patch = (values: Partial<Preferences>) =>
    setPrefs((p) => ({ ...p, ...values }));
  const notify = (message: string) => setToast(message);
  const editorExtensions = useMemo(
    () => [
      markdown({ codeLanguages: languages }),
      editorMotion({
        enabled: prefs.smoothCursor,
        trail: prefs.cursorTrail,
        duration: prefs.cursorDuration,
        feedback: prefs.typingFeedback,
      }),
    ],
    [
      prefs.smoothCursor,
      prefs.cursorTrail,
      prefs.cursorDuration,
      prefs.typingFeedback,
    ],
  );
  useEffect(() => {
    if (!window.desktop) return;
    let cancelled = false;
    void window.desktop
      .libraries()
      .then(setLibraries)
      .catch(() => {});
    restorePromise.current ??= window.desktop.restore();
    void restorePromise.current
      .then((data) => {
        if (cancelled) return;
        setWorkspace(new DesktopWorkspace(data));
        void window
          .desktop!.libraries()
          .then(setLibraries)
          .catch(() => {});
        setNotes(data.notes);
        setFolders(data.folders);
        setActiveId(
          data.notes.find(
            (n) =>
              data.paths[n.id] === read<string>(`ymg-active:${data.root}`, ""),
          )?.id ||
            data.notes[0]?.id ||
            "",
        );
      })
      .catch((error) => {
        if (!cancelled)
          notify(
            `无法恢复笔记空间：${error.message}，请从左上角选择其他目录。`,
          );
      })
      .finally(() => {
        if (!cancelled) setDesktopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!window.desktop) return;
    return window.desktop.onFlush(() => {
      clearTimeout(diskTimer.current);
      void (async () => {
        try {
          await refreshTask.current;
          await structureTask.current;
          if (workspace) await workspace.save(notesRef.current);
          window.desktop!.flushed(true);
        } catch (error) {
          window.desktop!.flushed(false, (error as Error).message);
        }
      })();
    });
  }, [workspace]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3200);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (workspace || window.desktop) return;
    try {
      localStorage.setItem("ymg-notes", JSON.stringify(notes));
      localStorage.setItem("ymg-folders", JSON.stringify(folders));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [notes, folders, workspace]);
  useEffect(() => {
    if (window.desktop) return;
    void lastWorkspace()
      .then(setPreviousWorkspace)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!workspace) return;
    const version = ++diskVersion.current;
    setDiskStatus("saving");
    window.desktop?.setDirty(true);
    diskTimer.current = setTimeout(() => {
      void (async () => {
        await refreshTask.current;
        await structureTask.current;
        if (workspaceRef.current === workspace)
          await workspace.save(notesRef.current);
      })()
        .then(() => {
          if (diskVersion.current === version) {
            setDiskStatus("saved");
            setDiskError("");
            window.desktop?.setDirty(false);
          }
        })
        .catch((error) => {
          if (diskVersion.current === version) {
            setDiskStatus("error");
            setDiskError(String(error.message || error));
            notify("磁盘保存失败，编辑内容仍在内存中，请导出备份。");
          }
        });
    }, 500);
    return () => clearTimeout(diskTimer.current);
  }, [notes, workspace]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!window.desktop && workspace && diskStatus !== "saved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [workspace, diskStatus]);
  function refreshWorkspace(manual = false): Promise<void> {
    if (
      !(workspace instanceof DesktopWorkspace) ||
      folderBusy ||
      renameBusy ||
      switchingWorkspace.current
    )
      return Promise.resolve();
    if (refreshTask.current) return refreshTask.current;
    const task = (async () => {
      const captured = notesRef.current;
      clearTimeout(diskTimer.current);
      ++diskVersion.current;
      try {
        const result = await workspace.refresh(captured);
        if (workspaceRef.current !== workspace) return;
        const latest = notesRef.current;
        const merged = [...result.notes];
        const notices = [...result.notices];
        // Preserve keystrokes entered while IPC was reading the disk.
        if (latest !== captured) {
          const before = new Map(captured.map((n) => [n.id, n]));
          for (const current of latest) {
            const previous = before.get(current.id);
            if (
              previous &&
              JSON.stringify(previous) === JSON.stringify(current)
            )
              continue;
            const index = merged.findIndex((n) => n.id === current.id);
            if (
              index >= 0 &&
              previous &&
              merged[index].content === previous.content &&
              merged[index].folder === previous.folder
            )
              merged[index] = current;
            else if (!previous && index < 0) merged.push(current);
            else if (
              previous &&
              (current.content !== previous.content ||
                current.folder !== previous.folder)
            ) {
              merged.push({
                ...current,
                id: crypto.randomUUID(),
                title: `${current.title}（同步期间的本地副本）`,
                folder: "冲突副本",
              });
              notices.push("同步期间的编辑已保存在“冲突副本”目录");
            }
          }
          // A deletion made during the scan is applied only if the disk version stayed unchanged.
          for (const previous of captured) {
            if (latest.some((n) => n.id === previous.id)) continue;
            const index = merged.findIndex(
              (n) => n.id === previous.id && n.content === previous.content,
            );
            if (index >= 0) merged.splice(index, 1);
          }
        }
        const changed = JSON.stringify(merged) !== JSON.stringify(latest);
        if (changed) {
          notesRef.current = merged;
          setNotes(merged);
        }
        const nextFolders = [
          ...new Set([
            ...result.folders,
            ...merged.map((n) => n.folder).filter(Boolean),
          ]),
        ].sort();
        setFolders((previous) =>
          JSON.stringify([...previous].sort()) === JSON.stringify(nextFolders)
            ? previous
            : nextFolders,
        );
        if (notices.length) setSyncMessage(notices.join("；"));
        await workspace.save(merged);
        if (
          notesRef.current === merged ||
          (!changed && notesRef.current === latest)
        ) {
          setDiskStatus("saved");
          setDiskError("");
          window.desktop?.setDirty(false);
        }
        setSyncError("");
        if (manual) notify("已刷新文件夹");
      } catch (error) {
        setSyncError(`文件夹同步失败：${(error as Error).message}`);
        if (manual) notify((error as Error).message);
      }
    })();
    refreshTask.current = task;
    void task.finally(() => {
      if (refreshTask.current === task) refreshTask.current = null;
    });
    return task;
  }
  useEffect(() => {
    if (!(workspace instanceof DesktopWorkspace)) return;
    const refresh = () => {
      void refreshWorkspace();
    };
    const timer = setInterval(refresh, 3000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [workspace, folderBusy, renameBusy]);
  async function openWorkspace(reconnect = false, libraryId?: string) {
    if (window.desktop) {
      if (switchingWorkspace.current) return;
      const refresh = refreshWorkspace();
      switchingWorkspace.current = true;
      try {
        await refresh;
        if (workspace) {
          clearTimeout(diskTimer.current);
          await workspace.save(notesRef.current);
        }
        const data = libraryId
          ? await window.desktop.openLibrary(libraryId)
          : await window.desktop.open();
        if (!data) return;
        setLibraries(await window.desktop.libraries());
        setSyncError("");
        setSyncMessage("");
        setWorkspace(new DesktopWorkspace(data));
        setNotes(data.notes);
        setFolders(data.folders);
        setActiveId(
          data.notes.find(
            (n) =>
              data.paths[n.id] === read<string>(`ymg-active:${data.root}`, ""),
          )?.id ||
            data.notes[0]?.id ||
            "",
        );
        setFilter("all");
        setQuery("");
        setWorkspaceMenu(false);
        notify(`已打开 ${data.root}`);
      } catch (error) {
        notify(`打开失败：${(error as Error).message}`);
      } finally {
        switchingWorkspace.current = false;
      }
      return;
    }
    if (!window.showDirectoryPicker)
      return notify("选择磁盘空间需要使用 Chrome 或 Edge 打开本地地址。");
    try {
      // The picker must run directly in the user gesture, before awaiting a save.
      const handle =
        reconnect && previousWorkspace
          ? previousWorkspace
          : await window.showDirectoryPicker({
              mode: "readwrite",
              id: "ymarkdowng-notes",
            });
      if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted")
        return notify("未获得文件夹读写权限");
      if (workspace) {
        clearTimeout(diskTimer.current);
        await workspace.save(notesRef.current);
      }
      const next = new DiskWorkspace(handle);
      const data = await next.load();
      setWorkspace(next);
      setNotes(data.notes);
      setFolders(data.folders);
      setActiveId(data.notes[0]?.id || "");
      setFilter("all");
      setQuery("");
      setWorkspaceMenu(false);
      setPreviousWorkspace(handle);
      void rememberWorkspace(handle).catch(() =>
        notify("此浏览器未能记住目录，下次请重新选择。"),
      );
      notify(`已打开 ${handle.name} · ${data.notes.length} 篇笔记`);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError")
        notify(`打开失败：${(error as Error).message}`);
    }
  }
  async function browserWorkspace() {
    try {
      if (workspace) {
        clearTimeout(diskTimer.current);
        await workspace.save(notesRef.current);
      }
      setWorkspace(null);
      setNotes(read("ymg-notes", seeds));
      setFolders(read("ymg-folders", ["开始使用", "日常随记"]));
      setFilter("all");
      setQuery("");
      setWorkspaceMenu(false);
    } catch (e) {
      notify(`当前空间尚未保存：${(e as Error).message}`);
    }
  }
  async function createFolder() {
    if (window.desktop && !workspace) {
      void openWorkspace();
      return;
    }
    try {
      const child = cleanFolder(folderName);
      const folder = folderParent ? `${folderParent}/${child}` : child;
      if (workspace) await workspace.createFolder(folder);
      const parts = folder.split("/");
      setFolders((fs) => [
        ...new Set([
          ...fs,
          ...parts.map((_, i) => parts.slice(0, i + 1).join("/")),
        ]),
      ]);
      setFilter(folder);
      setFolderDialog(false);
      setFolderName("");
      setFolderParent("");
      notify(`已创建目录 ${folder}`);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function openFolderDialog(parent = "") {
    setFolderParent(parent);
    setFolderName("");
    setFolderMenu(null);
    setFolderDialog(true);
  }
  function openFolderOperation(
    type: "rename" | "move" | "delete",
    folder: string,
  ) {
    setFolderMenu(null);
    setOperationName(folder.split("/").pop()!);
    setOperationParent(folder.split("/").slice(0, -1).join("/"));
    setFolderOperation({ type, folder });
  }
  function changeFolder(from: string, to?: string) {
    const task = performFolderChange(from, to);
    structureTask.current = task;
    return task;
  }
  async function performFolderChange(from: string, to?: string) {
    if (folderBusy) return false;
    try {
      setFolderBusy(true);
      await refreshTask.current;
      clearTimeout(diskTimer.current);
      ++diskVersion.current;
      if (workspace) await workspace.save(notesRef.current);
      setDiskStatus("saved");
      window.desktop?.setDirty(true);
      if (to === from) {
        setFolderOperation(null);
        return true;
      }
      if (to && to.toLowerCase().startsWith(`${from.toLowerCase()}/`))
        throw new Error("不能将目录移入自身或子目录");
      if (to && folders.includes(to)) throw new Error("目标位置已有同名目录");
      if (workspace instanceof DesktopWorkspace) {
        if (to) await workspace.moveFolder(from, to);
        else await workspace.deleteFolder(from);
      } else if (workspace)
        throw new Error("目录重命名、移动与回收请使用桌面版");
      const inside = (value: string) =>
        value === from || value.startsWith(`${from}/`);
      setFolders((fs) =>
        to
          ? fs.map((f) => (inside(f) ? to + f.slice(from.length) : f))
          : fs.filter((f) => !inside(f)),
      );
      const nextNotes = to
        ? notesRef.current.map((n) =>
            inside(n.folder)
              ? { ...n, folder: to + n.folder.slice(from.length) }
              : n,
          )
        : notesRef.current.filter((n) => !inside(n.folder));
      notesRef.current = nextNotes;
      setNotes(nextNotes);
      setFilter(to || "all");
      setFolderOperation(null);
      setDiskStatus("saved");
      setDiskError("");
      window.desktop?.setDirty(false);
      notify(
        to ? "目录已更新" : workspace ? "目录已移入回收目录" : "目录已删除",
      );
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    } finally {
      setFolderBusy(false);
    }
  }
  function startDrag(
    event: React.DragEvent,
    kind: "folder" | "note",
    id: string,
  ) {
    dragEntry.current = { kind, id };
    event.dataTransfer.setData(
      "application/x-ymg-entry",
      JSON.stringify({ kind, id }),
    );
    event.dataTransfer.effectAllowed = "move";
    setFolderMenu(null);
  }
  function validDrop(parent: string) {
    const entry = dragEntry.current;
    if (!entry || folderBusy) return false;
    if (entry.kind === "folder")
      return (
        parent !== entry.id &&
        !parent.toLowerCase().startsWith(`${entry.id.toLowerCase()}/`) &&
        parent !== entry.id.split("/").slice(0, -1).join("/")
      );
    return notes.find((n) => n.id === entry.id)?.folder !== parent;
  }
  function dragOver(event: React.DragEvent, parent: string) {
    if (validDrop(parent)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(parent);
    }
  }
  function dropInto(event: React.DragEvent, parent: string) {
    event.preventDefault();
    event.stopPropagation();
    const entry = dragEntry.current;
    const valid = validDrop(parent);
    dragEntry.current = null;
    setDropTarget(null);
    if (!entry || !valid) return;
    if (entry.kind === "folder")
      void changeFolder(
        entry.id,
        [parent, entry.id.split("/").pop()].filter(Boolean).join("/"),
      );
    else {
      setNotes((ns) =>
        ns.map((n) =>
          n.id === entry.id ? { ...n, folder: parent, updated: Date.now() } : n,
        ),
      );
      setFilter(parent || "all");
    }
  }
  useEffect(() => {
    try {
      localStorage.setItem("ymg-prefs", JSON.stringify(prefs));
    } catch {
      notify("外观设置未能保存：存储空间不足，请换一张较小的背景图片。");
    }
  }, [prefs]);
  useEffect(() => {
    try {
      localStorage.setItem("ymg-active", JSON.stringify(activeId));
    } catch {
      /* Saving content reports storage errors separately. */
    }
  }, [activeId]);
  const update = (content: string) =>
    setNotes((ns) =>
      ns.map((n) =>
        n.id === note?.id
          ? {
              ...n,
              content,
              title: content.match(/^#\s+(.+)$/m)?.[1] || "未命名笔记",
              updated: Date.now(),
            }
          : n,
      ),
    );
  function createNote() {
    if (window.desktop && !workspace) {
      void openWorkspace();
      return;
    }
    setNewTitle("");
    setTargetFolder(
      ["all", "recent", "starred"].includes(filter)
        ? workspace
          ? ""
          : "日常随记"
        : filter,
    );
    setNoteDialog(true);
  }
  function confirmNewNote() {
    const title = newTitle.trim() || "未命名笔记";
    const n = {
      id: crypto.randomUUID(),
      title,
      content: `# ${title}\n\n`,
      updated: Date.now(),
      starred: false,
      folder: targetFolder,
    };
    setNotes((ns) => [n, ...ns]);
    setActiveId(n.id);
    setQuery("");
    setFilter(targetFolder || "all");
    setNoteDialog(false);
    requestAnimationFrame(() => {
      if (!document.querySelector("[role=menu], .modal-backdrop"))
        editor.current?.view?.focus();
    });
  }
  async function renameDocument() {
    if (!renameNoteId || renameBusy) return;
    const title = renameTitle.trim();
    if (!title || /[<>:"/\\|?*]/.test(title)) return notify("请输入有效文件名");
    setRenameBusy(true);
    await refreshTask.current;
    clearTimeout(diskTimer.current);
    ++diskVersion.current;
    try {
      if (workspace) await workspace.save(notesRef.current);
      if (workspace instanceof DesktopWorkspace)
        await workspace.renameNote(renameNoteId, title);
      else if (workspace) throw new Error("磁盘文件重命名请使用桌面版");
      const next = notesRef.current.map((n) =>
        n.id === renameNoteId
          ? {
              ...n,
              title,
              content: n.content.match(/^#\s+.+$/m)
                ? n.content.replace(/^#\s+.+$/m, () => `# ${title}`)
                : n.content,
              updated: Date.now(),
            }
          : n,
      );
      notesRef.current = next;
      setNotes(next);
      setRenameNoteId(null);
      notify("笔记已重命名");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setRenameBusy(false);
    }
  }
  async function exportPDF() {
    if (!note || pdfBusy) return;
    if (!window.desktop) return notify("导出 PDF 请使用桌面版");
    setPdfBusy(true);
    try {
      if (await window.desktop.exportPDF(note.title, html))
        notify("PDF 已导出");
    } catch (error) {
      notify(`PDF 导出失败：${(error as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  }
  function exportNote() {
    if (!note) return;
    if (window.desktop) {
      void window.desktop
        .exportNote(note.title, note.content)
        .then((saved) => {
          if (saved) notify("笔记已导出");
        })
        .catch((error) => notify(`导出失败：${error.message}`));
      return;
    }
    const url = URL.createObjectURL(
      new Blob([note.content], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.title.replace(/[<>:"/\\|?*]/g, "_")}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("笔记已导出为 Markdown");
  }
  function insert(before: string, after = "") {
    if (!note) return;
    setMode((m) => (m === "preview" ? "split" : m));
    const view = editor.current?.view;
    if (view) {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: before + selected + after },
        selection: {
          anchor: from + before.length,
          head: from + before.length + selected.length,
        },
      });
      view.focus();
    } else update(note.content + "\n" + before + after);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (window.desktop && workspace) {
            clearTimeout(diskTimer.current);
            const version = ++diskVersion.current;
            setDiskStatus("saving");
            window.desktop.setDirty(true);
            void (async () => {
              await refreshTask.current;
              await structureTask.current;
              if (workspaceRef.current === workspace)
                await workspace.save(notesRef.current);
            })()
              .then(() => {
                if (diskVersion.current === version) {
                  setDiskStatus("saved");
                  setDiskError("");
                  window.desktop!.setDirty(false);
                  notify("已保存到磁盘");
                }
              })
              .catch((error) => {
                setDiskStatus("error");
                setDiskError(error.message);
                notify(error.message);
              });
          } else exportNote();
        }
        if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          insert("**", "**");
        }
        if (e.key.toLowerCase() === "i") {
          e.preventDefault();
          insert("*", "*");
        }
        if (e.key.toLowerCase() === "f" && e.shiftKey) {
          e.preventDefault();
          setFocus((f) => !f);
        }
      }
      if (e.key === "Escape") {
        setFocus(false);
        setMenu(false);
        setPendingDelete(false);
        setFolderDialog(false);
        setNoteDialog(false);
        setMoveDialog(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function importNotes(files: FileList | null) {
    if (!files) return;
    try {
      const incoming = await Promise.all(
        Array.from(files).map(async (file) => {
          const content = await file.text();
          return {
            id: crypto.randomUUID(),
            title:
              content.match(/^#\s+(.+)$/m)?.[1] ||
              file.name.replace(/\.(md|markdown|txt)$/i, ""),
            content,
            updated: Date.now(),
            starred: false,
            folder: "导入笔记",
          };
        }),
      );
      setNotes((ns) => [...incoming, ...ns]);
      if (incoming[0]) setActiveId(incoming[0].id);
      setFilter("all");
      setQuery("");
      notify(`已导入 ${incoming.length} 篇笔记`);
    } catch {
      notify("读取文件失败，请重新选择。");
    }
  }
  function uploadBackground(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    )
      return notify("请选择 JPG、PNG、WebP 或 GIF 图片");
    const reader = new FileReader();
    reader.onload = () =>
      patch({ image: String(reader.result), background: "custom" });
    reader.onerror = () => notify("图片读取失败");
    reader.readAsDataURL(file);
  }
  function selectBackground() {
    if (window.desktop)
      void window.desktop
        .chooseBackground()
        .then((image) => {
          if (image) patch({ image, background: "custom" });
        })
        .catch((error) => notify(`背景读取失败：${error.message}`));
    else imageRef.current?.click();
  }
  const html = useMemo(
    () =>
      DOMPurify.sanitize(
        marked.parse(note?.content || "", {
          gfm: true,
          breaks: true,
        }) as string,
      ),
    [note?.content],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandOpen((open) => !open);
        setCommandQuery("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const visible = notes
    .filter(
      (n) =>
        (filter === "all" ||
          filter === "recent" ||
          (filter === "starred"
            ? n.starred
            : n.folder === filter || n.folder.startsWith(`${filter}/`))) &&
        `${n.title} ${n.content}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      documentSort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : documentSort === "folder"
          ? a.folder.localeCompare(b.folder, "zh-CN") ||
            a.title.localeCompare(b.title, "zh-CN")
          : b.updated - a.updated,
    );
  const headings = (note?.content || "")
    .split("\n")
    .map((line, index) => ({ match: line.match(/^(#{1,3})\s+(.+)$/), index }))
    .filter((x) => x.match);
  const wordCount = (note?.content || "")
    .replace(/[#*`>\[\]()-]/g, "")
    .replace(/\s/g, "").length;
  const tools = [
    { icon: Heading2, title: "二级标题", before: "\n## " },
    { icon: Bold, title: "加粗 Ctrl+B", before: "**", after: "**" },
    { icon: Italic, title: "斜体 Ctrl+I", before: "*", after: "*" },
    { icon: Quote, title: "引用", before: "\n> " },
    { icon: List, title: "无序列表", before: "\n- " },
    { icon: ListOrdered, title: "有序列表", before: "\n1. " },
    { icon: Link, title: "链接", before: "[", after: "](https://example.com)" },
    {
      icon: Code,
      title: "代码块",
      before: "\n```javascript\n",
      after: "\n```\n",
    },
    { icon: ImagePlus, title: "图片语法", before: "![图片说明](", after: ")" },
  ];
  return (
    <div
      className={`app ${prefs.theme} ${focus ? "focus-mode" : ""}`}
      style={
        {
          "--accent": prefs.accent,
          "--editor-size": `${prefs.fontSize}px`,
          "--line-height": prefs.lineHeight,
          "--page-width": `${prefs.width}px`,
          "--paper-opacity": prefs.opacity / 100,
        } as React.CSSProperties
      }
    >
      <input
        ref={importRef}
        type="file"
        accept=".md,.markdown,.txt"
        multiple
        hidden
        onChange={(e) => {
          void importNotes(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          uploadBackground(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {sidebar && !focus && (
        <aside className="sidebar">
          <button
            className="mobile-sidebar-close"
            title="关闭侧栏"
            onClick={() => setSidebar(false)}
          >
            <X size={15} />
          </button>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setFilter("all");
            }}
          >
            <span className="brand-symbol">
              <img src="./icon.svg" alt="YMG 文档图标" width="32" height="32" />
            </span>
            <span>
              YMarkdown<span className="brand-g">G</span>
              <small>YOUR SECOND BRAIN</small>
            </span>
          </a>
          <div className="workspace-wrap">
            <button
              className="workspace"
              onClick={() => setWorkspaceMenu(!workspaceMenu)}
            >
              <span className="workspace-avatar">Y</span>
              <span>
                {workspace?.root.name ||
                  (window.desktop ? "选择笔记空间" : "浏览器笔记空间")}
                <small>
                  {workspace ? "磁盘目录 · 自动保存" : "点击选择本地文件夹"}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
            {workspaceMenu && (
              <div className="workspace-dropdown dropdown">
                {window.desktop && (
                  <>
                    <p>已收录文件夹 · 原位置管理</p>
                    {libraries.map((library) => (
                      <div className="library-entry" key={library.id}>
                        <button
                          title={library.root}
                          className={
                            workspace instanceof DesktopWorkspace &&
                            workspace.fullPath === library.root
                              ? "selected"
                              : ""
                          }
                          onClick={() => void openWorkspace(false, library.id)}
                        >
                          <FolderOpen size={14} />
                          <span>
                            {library.name}
                            <small>{library.root}</small>
                          </span>
                        </button>
                        {!(
                          workspace instanceof DesktopWorkspace &&
                          workspace.fullPath === library.root
                        ) && (
                          <button
                            title={`移除收录 ${library.name}`}
                            onClick={() => {
                              void window
                                .desktop!.forgetLibrary(library.id)
                                .then(setLibraries)
                                .catch((e) => notify(e.message));
                            }}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="context-separator" />
                  </>
                )}

                <button onClick={() => void openWorkspace()}>
                  <FolderOpen size={15} />
                  {window.desktop ? "收录文件夹…" : "打开本地笔记目录"}
                </button>
                {previousWorkspace && (
                  <button onClick={() => void openWorkspace(true)}>
                    <RotateCcw size={15} />
                    重新打开 {previousWorkspace.name}
                  </button>
                )}
                {!window.desktop && (
                  <button onClick={() => void browserWorkspace()}>
                    <BookOpen size={15} />
                    浏览器笔记空间
                  </button>
                )}
                {window.desktop && workspace instanceof DesktopWorkspace && (
                  <button
                    onClick={() => void window.desktop!.reveal(workspace.id)}
                  >
                    <FolderOpen size={15} />
                    在文件管理器中打开
                  </button>
                )}
                <p>收录后直接读写原文件夹；移除收录不会删除文件。</p>
              </div>
            )}
          </div>
          <div className="search">
            <Search size={15} />
            <input
              aria-label="搜索笔记"
              placeholder="搜索笔记…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌕</kbd>
          </div>
          <nav>
            {[
              {
                id: "all",
                icon: FileText,
                label: "全部笔记",
                count: notes.length,
              },
              { id: "recent", icon: Clock3, label: "最近编辑", count: null },
              {
                id: "starred",
                icon: Star,
                label: "我的收藏",
                count: notes.filter((n) => n.starred).length,
              },
            ].map((item) => (
              <button
                key={item.id}
                className={filter === item.id ? "selected" : ""}
                onClick={() => setFilter(item.id)}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.count !== null && <em>{item.count}</em>}
              </button>
            ))}
          </nav>
          <div className="section-label">
            EXPLORER / 目录
            {workspace instanceof DesktopWorkspace && (
              <button
                title="刷新已收录文件夹"
                onClick={() => void refreshWorkspace(true)}
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button title="新建目录" onClick={() => openFolderDialog()}>
              <Plus size={15} />
            </button>
          </div>
          <div className="folders">
            <button
              className={`root-drop ${dropTarget === "" ? "drop-target" : ""}`}
              aria-label="笔记空间根目录"
              onClick={() => setFilter("all")}
              onDragOver={(e) => dragOver(e, "")}
              onDrop={(e) => dropInto(e, "")}
              onDragLeave={() => setDropTarget(null)}
            >
              <FolderOpen size={16} />
              <span>/ 根目录</span>
            </button>
            {treeFolders
              .filter(
                (f) =>
                  !f
                    .split("/")
                    .slice(0, -1)
                    .some(
                      (_, i, parts) =>
                        collapsedFolders[
                          folderKey(parts.slice(0, i + 1).join("/"))
                        ],
                    ),
              )
              .map((f) => (
                <div
                  className="tree-row"
                  key={f}
                  style={{ paddingLeft: (f.split("/").length - 1) * 14 }}
                >
                  <button
                    className="tree-toggle"
                    aria-label={`${collapsedFolders[folderKey(f)] ? "展开" : "折叠"}目录 ${f}`}
                    aria-expanded={!collapsedFolders[folderKey(f)]}
                    disabled={
                      !treeFolders.some((child) => child.startsWith(`${f}/`))
                    }
                    onClick={() =>
                      setCollapsedFolders((previous) => ({
                        ...previous,
                        [folderKey(f)]: !previous[folderKey(f)],
                      }))
                    }
                  >
                    {collapsedFolders[folderKey(f)] ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  <button
                    aria-label={`目录 ${f}`}
                    className={`tree-folder ${filter === f ? "selected" : ""} ${dropTarget === f ? "drop-target" : ""}`}
                    draggable={!folderBusy}
                    onDragStart={(e) => startDrag(e, "folder", f)}
                    onDragEnd={() => {
                      dragEntry.current = null;
                      setDropTarget(null);
                    }}
                    onDragOver={(e) => dragOver(e, f)}
                    onDrop={(e) => dropInto(e, f)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setDropTarget(null);
                    }}
                    onClick={() => setFilter(f)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      folderTrigger.current = event.currentTarget;
                      setFilter(f);
                      setFolderMenu({
                        folder: f,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ContextMenu" ||
                        (event.shiftKey && event.key === "F10")
                      ) {
                        event.preventDefault();
                        folderTrigger.current = event.currentTarget;
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        setFilter(f);
                        setFolderMenu({
                          folder: f,
                          x: rect.left + 20,
                          y: rect.bottom,
                        });
                      }
                    }}
                  >
                    <FolderOpen size={16} />
                    <span title={f}>{f.split("/").pop()}</span>
                    <small>
                      {
                        notes.filter(
                          (n) => n.folder === f || n.folder.startsWith(`${f}/`),
                        ).length
                      }
                    </small>
                  </button>
                </div>
              ))}
          </div>
          <div className="section-label note-label">
            {filter === "starred" ? "收藏的笔记" : "我的笔记"}
            <span>{visible.length}</span>
          </div>
          {(syncMessage || syncError) && (
            <div className="sync-notice" role="status">
              <p>{syncError || syncMessage}</p>
              <button
                onClick={() => {
                  setSyncMessage("");
                  if (syncError) void refreshWorkspace(true);
                }}
              >
                {syncError ? "重试" : "知道了"}
              </button>
            </div>
          )}
          <div className="library-controls">
            <select
              aria-label="文档排序"
              value={documentSort}
              onChange={(e) => setDocumentSort(e.target.value)}
            >
              <option value="updated">最近修改</option>
              <option value="title">标题 A–Z</option>
              <option value="folder">所在目录</option>
            </select>
            <select
              aria-label="文档视图"
              value={documentView}
              onChange={(e) => setDocumentView(e.target.value)}
            >
              <option value="list">文档列表</option>
              <option value="cards">摘要卡片</option>
            </select>
          </div>
          <div
            className={`note-list ${documentView === "list" ? "document-list" : ""}`}
          >
            {visible.map((n) => (
              <button
                title={`${workspace?.pathFor(n.id) || [n.folder, n.title + ".md"].filter(Boolean).join("/")} · ${new Date(n.updated).toLocaleString("zh-CN")}`}
                className={`note-card ${note?.id === n.id ? "active" : ""}`}
                draggable={!folderBusy}
                onDragStart={(e) => startDrag(e, "note", n.id)}
                onDragEnd={() => {
                  dragEntry.current = null;
                  setDropTarget(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveId(n.id);
                  setFolderMenu(null);
                  folderTrigger.current = e.currentTarget;
                  setNoteMenu({ id: n.id, x: e.clientX, y: e.clientY });
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "ContextMenu" ||
                    (e.shiftKey && e.key === "F10")
                  ) {
                    e.preventDefault();
                    setActiveId(n.id);
                    folderTrigger.current = e.currentTarget;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setNoteMenu({
                      id: n.id,
                      x: rect.left + 20,
                      y: rect.bottom,
                    });
                  }
                }}
                key={n.id}
                onClick={() => setActiveId(n.id)}
              >
                <div>
                  <FileText size={15} />
                  <strong>{n.title}</strong>
                  {n.starred && <Pin size={12} />}
                </div>
                <p>
                  {n.content
                    .split("\n")
                    .filter((l) => l.trim() && !l.startsWith("#"))[0]
                    ?.replace(/[*`>]/g, "") || "开始记录你的想法…"}
                </p>
                <small>
                  {new Date(n.updated).toLocaleDateString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                  })}
                  <span>{n.folder}</span>
                </small>
              </button>
            ))}
            {!visible.length && <p className="empty-search">没有找到笔记</p>}
          </div>
          <button
            className="new-note"
            aria-label="新建笔记"
            onClick={createNote}
          >
            <Plus size={17} />
            新建笔记<span>＋</span>
          </button>
          <div className="sidebar-footer">
            <span className="local-dot" />
            {workspace ? "文件直接保存在本地目录" : "数据保存在当前浏览器"}
            <button
              title="导入 Markdown"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={15} />
            </button>
          </div>
        </aside>
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button title="切换侧栏" onClick={() => setSidebar(!sidebar)}>
              <PanelLeft size={19} />
            </button>
            <span className="crumb-folder">
              {workspace?.root.name || "workspace"}/{note?.folder || ""}
            </span>
            <span className="slash">/</span>
            <strong>
              {note
                ? workspace?.pathFor(note.id)?.split("/").pop() ||
                  `${note.title}.md`
                : "[No Name]"}
            </strong>
          </div>
          <div className="header-actions">
            <button
              className={`saved ${saveError || diskStatus === "error" ? "error" : ""}`}
              title={diskError || "保存状态"}
              onClick={() => {
                if (workspace) {
                  setNotes((ns) => [...ns]);
                }
              }}
            >
              <CloudCheck size={15} />
              {workspace
                ? diskStatus === "saved"
                  ? "已保存到磁盘"
                  : diskStatus === "saving"
                    ? "正在写入…"
                    : "写入失败，点击重试"
                : saveError
                  ? "保存失败，请导出备份"
                  : "已自动保存"}
            </button>
            <button
              title="收藏笔记"
              className={note?.starred ? "is-starred" : ""}
              onClick={() =>
                setNotes((ns) =>
                  ns.map((n) =>
                    n.id === note?.id ? { ...n, starred: !n.starred } : n,
                  ),
                )
              }
            >
              <Star size={18} fill={note?.starred ? "currentColor" : "none"} />
            </button>
            <button
              title="外观设置"
              className={appearance ? "pressed" : ""}
              onClick={() => {
                setAppearance(!appearance);
                setFocus(false);
              }}
            >
              <Settings2 size={18} />
            </button>
            <button
              title="一键导出 PDF"
              disabled={pdfBusy || !note}
              onClick={() => void exportPDF()}
            >
              <Download size={16} />
              <span>{pdfBusy ? "导出中…" : "PDF"}</span>
            </button>
            <div className="menu-wrap">
              <button title="更多操作" onClick={() => setMenu(!menu)}>
                <MoreHorizontal size={20} />
              </button>
              {menu && (
                <div className="dropdown">
                  <button
                    onClick={() => {
                      exportNote();
                      setMenu(false);
                    }}
                  >
                    <Download size={15} />
                    导出 Markdown
                  </button>
                  <button
                    onClick={() => {
                      importRef.current?.click();
                      setMenu(false);
                    }}
                  >
                    <Upload size={15} />
                    导入笔记
                  </button>
                  <button
                    onClick={() => {
                      setTargetFolder(note?.folder || "");
                      setMoveDialog(true);
                      setMenu(false);
                    }}
                  >
                    <FolderOpen size={15} />
                    移动笔记
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setPendingDelete(true);
                      setMenu(false);
                    }}
                  >
                    <Trash2 size={15} />
                    删除当前笔记
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="editor-toolbar">
          <div className="format-tools">
            <span className="buffer-dot" />
            {tools.map((t) => (
              <button
                key={t.title}
                title={t.title}
                aria-label={t.title}
                onClick={() => insert(t.before, t.after)}
              >
                <t.icon size={17} />
              </button>
            ))}
          </div>
          <div className="view-tools">
            <div className="segmented">
              {(
                [
                  { id: "edit", icon: Code2, label: "源码" },
                  { id: "split", icon: Columns2, label: "分屏" },
                  { id: "preview", icon: Eye, label: "阅读" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  title={m.label}
                  className={mode === m.id ? "active" : ""}
                  onClick={() => setMode(m.id)}
                >
                  <m.icon size={15} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
            <button
              title="专注模式 Ctrl+Shift+F"
              className={focus ? "pressed" : ""}
              onClick={() => setFocus(!focus)}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
        <div className="work-area">
          <div className={`canvas bg-${prefs.background}`}>
            <div
              className="background-layer"
              style={{
                backgroundImage:
                  prefs.background === "custom" && prefs.image
                    ? `url(${prefs.image})`
                    : undefined,
                filter: `blur(${prefs.blur}px)`,
                opacity: (100 - prefs.backgroundTransparency) / 100,
              }}
            />
            <div className={`document-shell mode-${mode} font-${prefs.font}`}>
              {note ? (
                <>
                  <div className="document-meta">
                    <span>
                      <span className="live-dot" />
                      {mode === "preview" ? "阅读模式" : "即时渲染已开启"}
                    </span>
                    <span>MARKDOWN</span>
                  </div>
                  <div className="panes">
                    {mode !== "preview" && (
                      <section className="source-pane">
                        <div className="pane-label">
                          <Code2 size={13} />
                          MARKDOWN<span>编辑</span>
                        </div>
                        <CodeMirror
                          key={note.id}
                          ref={editor}
                          value={note.content}
                          theme={prefs.theme === "dark" ? "dark" : "light"}
                          extensions={editorExtensions}
                          basicSetup={{
                            lineNumbers: true,
                            foldGutter: true,
                            highlightActiveLine: true,
                            highlightActiveLineGutter: true,
                          }}
                          onChange={update}
                          onUpdate={(v) => {
                            if (v.docChanged) return;
                            if (
                              v.view.scrollDOM.scrollHeight >
                                v.view.scrollDOM.clientHeight &&
                              preview.current
                            ) {
                              const fraction =
                                v.view.scrollDOM.scrollTop /
                                (v.view.scrollDOM.scrollHeight -
                                  v.view.scrollDOM.clientHeight);
                              preview.current.scrollTop =
                                fraction *
                                (preview.current.scrollHeight -
                                  preview.current.clientHeight);
                            }
                          }}
                        />
                      </section>
                    )}
                    {mode !== "edit" && (
                      <section className="preview-pane" ref={preview}>
                        <div className="pane-label">
                          <Eye size={13} />
                          LIVE PREVIEW
                          <span className="preview-dot" />
                        </div>
                        <article
                          className="markdown-body"
                          dangerouslySetInnerHTML={{ __html: html }}
                          onClick={(e) => {
                            const copy = (e.target as HTMLElement).closest(
                              ".copy-code",
                            );
                            if (copy) {
                              const code = copy
                                .closest(".code-block")
                                ?.querySelector("code");
                              const text = code
                                ? Array.from(
                                    code.querySelectorAll(".code-line"),
                                  )
                                    .map(
                                      (line) =>
                                        line.lastElementChild?.textContent ||
                                        "",
                                    )
                                    .join("\n")
                                : "";
                              void navigator.clipboard
                                .writeText(text)
                                .then(() => notify("代码已复制"))
                                .catch(() =>
                                  notify("复制失败，请手动选择代码"),
                                );
                              return;
                            }
                            const a = (e.target as HTMLElement).closest("a");
                            if (a) {
                              e.preventDefault();
                              if (
                                a.href.startsWith("https:") ||
                                a.href.startsWith("http:")
                              )
                                window.open(
                                  a.href,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                            }
                          }}
                        />
                      </section>
                    )}
                  </div>
                  <div className="document-end">
                    <span />
                    让想法在这里生长
                    <span />
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <BookOpen size={40} />
                  <h2>新的灵感，从这里开始</h2>
                  <button className="primary" onClick={createNote}>
                    <Plus size={16} />
                    创建第一篇笔记
                  </button>
                </div>
              )}
            </div>
            <div className="canvas-hint">
              <span>✦</span> 你的文字，值得一个舒适的空间
            </div>
          </div>
          {appearance && !focus && (
            <aside className="appearance">
              <div className="appearance-heading">
                <span>
                  <Palette size={17} />
                  外观
                </span>
                <button
                  title="关闭外观面板"
                  onClick={() => setAppearance(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <p className="panel-description">创造属于你的写作氛围</p>
              <div className="settings-tabs">
                {[
                  { id: "background", name: "背景" },
                  { id: "type", name: "排版" },
                  { id: "outline", name: "大纲" },
                  { id: "motion", name: "动效" },
                  ...(window.desktop ? [{ id: "updates", name: "更新" }] : []),
                ].map((t) => (
                  <button
                    key={t.id}
                    className={tab === t.id ? "active" : ""}
                    onClick={() => setTab(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="settings-body">
                {tab === "updates" && <UpdatesPanel />}
                {tab === "motion" && (
                  <>
                    <div className="motion-intro">
                      光标随你的思路平滑移动。跳转带有短暂拖影，输入时给出轻微光晕反馈。
                    </div>
                    <label className="toggle-setting">
                      <span>
                        平滑光标<small>关闭后使用原生光标</small>
                      </span>
                      <input
                        aria-label="平滑光标"
                        type="checkbox"
                        checked={prefs.smoothCursor}
                        onChange={(e) =>
                          patch({ smoothCursor: e.target.checked })
                        }
                      />
                    </label>
                    <label className="toggle-setting">
                      <span>
                        跳转拖影<small>跨行、点击和方向键移动</small>
                      </span>
                      <input
                        aria-label="跳转拖影"
                        type="checkbox"
                        checked={prefs.cursorTrail}
                        onChange={(e) =>
                          patch({ cursorTrail: e.target.checked })
                        }
                      />
                    </label>
                    <Range
                      label="光标动画时长"
                      value={prefs.cursorDuration}
                      min={40}
                      max={260}
                      step={10}
                      unit="ms"
                      onChange={(value) => patch({ cursorDuration: value })}
                    />
                    <Range
                      label="打字反馈强度"
                      value={prefs.typingFeedback}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(value) => patch({ typingFeedback: value })}
                    />
                    <div className="motion-demo">
                      <span>▌</span> keep your thoughts flowing
                      <p>
                        设为 0
                        可关闭打字反馈。遵循系统“减少动态效果”设置，输入不加入人工延迟。
                      </p>
                    </div>
                  </>
                )}
                {tab === "background" && (
                  <>
                    <label className="setting-label">界面主题</label>
                    <div className="theme-options">
                      <button
                        className={prefs.theme === "light" ? "active" : ""}
                        onClick={() => patch({ theme: "light" })}
                      >
                        <span className="theme-preview light-preview">
                          <i />
                          <b />
                          <b />
                        </span>
                        <span>
                          <Sun size={13} />
                          浅色{prefs.theme === "light" && <Check size={13} />}
                        </span>
                      </button>
                      <button
                        className={prefs.theme === "dark" ? "active" : ""}
                        onClick={() => patch({ theme: "dark" })}
                      >
                        <span className="theme-preview dark-preview">
                          <i />
                          <b />
                          <b />
                        </span>
                        <span>
                          <Moon size={13} />
                          深色{prefs.theme === "dark" && <Check size={13} />}
                        </span>
                      </button>
                    </div>
                    <label className="setting-label">主题色</label>
                    <div className="accent-options">
                      {[
                        "#7aa2f7",
                        "#9ece6a",
                        "#bb9af7",
                        "#ff9e64",
                        "#e0af68",
                        "#7dcfff",
                      ].map((color) => (
                        <button
                          key={color}
                          title={`主题色 ${color}`}
                          className={prefs.accent === color ? "active" : ""}
                          style={{ background: color }}
                          onClick={() => patch({ accent: color })}
                        >
                          {prefs.accent === color && <Check size={14} />}
                        </button>
                      ))}
                      <label title="自选主题色" className="custom-color">
                        <Plus size={15} />
                        <input
                          type="color"
                          aria-label="自选主题色"
                          value={prefs.accent}
                          onChange={(e) => patch({ accent: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="setting-label with-secondary">
                      写作背景<small>随心切换</small>
                    </div>
                    <div className="background-options">
                      {[
                        { id: "paper", name: "纯净纸白" },
                        { id: "sage", name: "林间晨雾" },
                        { id: "sand", name: "日落沙丘" },
                        { id: "lavender", name: "暮色山野" },
                        { id: "grid", name: "灵感网格" },
                        { id: "custom", name: "自定义" },
                      ].map((bg) => (
                        <button
                          key={bg.id}
                          className={`background-option ${prefs.background === bg.id ? "active" : ""}`}
                          onClick={() =>
                            bg.id === "custom" && !prefs.image
                              ? selectBackground()
                              : patch({ background: bg.id })
                          }
                        >
                          <span
                            className={`bg-swatch bg-${bg.id}`}
                            style={
                              bg.id === "custom" && prefs.image
                                ? {
                                    backgroundImage: `url(${prefs.image})`,
                                    backgroundSize: "cover",
                                  }
                                : {}
                            }
                          >
                            {bg.id === "custom" && !prefs.image && (
                              <ImagePlus size={20} />
                            )}{" "}
                            {prefs.background === bg.id && (
                              <span className="swatch-check">
                                <Check size={11} />
                              </span>
                            )}
                          </span>
                          <span>{bg.name}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="upload-background"
                      onClick={selectBackground}
                    >
                      <Upload size={14} />
                      上传背景图片<small>JPG / PNG</small>
                    </button>
                    <Range
                      label="背景图片透明度"
                      value={prefs.backgroundTransparency}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => patch({ backgroundTransparency: v })}
                    />
                    <p className="background-help">
                      0% 显示原图，100% 完全透明。图片无固定体积限制。
                    </p>
                    <Range
                      label="编辑区不透明度"
                      value={prefs.opacity}
                      min={30}
                      max={100}
                      unit="%"
                      onChange={(v) => patch({ opacity: v })}
                    />
                    <Range
                      label="背景模糊"
                      value={prefs.blur}
                      min={0}
                      max={20}
                      unit="px"
                      onChange={(v) => patch({ blur: v })}
                    />
                    <div className="tip">
                      <span>✧</span>
                      <p>
                        调低编辑区不透明度，可让背景透过正文。
                        <br />
                        图片与透明度设置会自动保存。
                      </p>
                    </div>
                  </>
                )}
                {tab === "type" && (
                  <>
                    <label className="setting-label">正文字体</label>
                    <select
                      aria-label="正文字体"
                      value={prefs.font}
                      onChange={(e) => patch({ font: e.target.value })}
                    >
                      <option value="serif">宋体 · 文艺书写</option>
                      <option value="sans">黑体 · 清晰简洁</option>
                      <option value="mono">等宽 · 专注代码</option>
                    </select>
                    <Range
                      label="字号"
                      value={prefs.fontSize}
                      min={12}
                      max={24}
                      unit="px"
                      onChange={(v) => patch({ fontSize: v })}
                    />
                    <Range
                      label="行高"
                      value={prefs.lineHeight}
                      min={1.3}
                      max={2.5}
                      step={0.1}
                      onChange={(v) => patch({ lineHeight: v })}
                    />
                    <Range
                      label="页面宽度"
                      value={prefs.width}
                      min={560}
                      max={1400}
                      step={20}
                      unit="px"
                      onChange={(v) => patch({ width: v })}
                    />
                    <div className="type-sample">
                      文字是思想的足迹。<small>The quiet art of writing.</small>
                    </div>
                  </>
                )}
                {tab === "outline" && (
                  <div className="outline">
                    {headings.map((h) => (
                      <button
                        key={h.index}
                        style={{
                          paddingLeft: (h.match![1].length - 1) * 12 + 8,
                        }}
                        onClick={() => {
                          if (mode === "edit") setMode("split");
                          setTimeout(() => {
                            const elements =
                              preview.current?.querySelectorAll("h1,h2,h3");
                            const index = headings.indexOf(h);
                            elements?.[index]?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }, 50);
                        }}
                      >
                        {h.match![2]}
                      </button>
                    ))}
                    {!headings.length && <p>使用 # 标题构建笔记大纲</p>}
                  </div>
                )}
              </div>
              <button
                className="reset-settings"
                onClick={() => {
                  setPrefs(defaults);
                  notify("已恢复默认外观");
                }}
              >
                <RotateCcw size={13} />
                恢复默认设置
              </button>
            </aside>
          )}
        </div>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />{" "}
            {focus ? "FOCUS · Esc 退出" : "MARKDOWN"}
            <span className="status-branch">
              ⑂ {workspace?.root.name || "local"}
            </span>
          </span>
          <div>
            <button
              title="快速打开 Ctrl+P"
              onClick={() => {
                setCommandOpen(true);
                setCommandQuery("");
              }}
            >
              ⌘ P 快速打开
            </button>
            <span>{wordCount.toLocaleString()} 字</span>
            <i />
            <span>UTF-8</span>
            <i />
            <span>Markdown</span>
            <button title="导出 Markdown" onClick={exportNote}>
              <Download size={13} />
            </button>
          </div>
        </footer>
      </main>
      {(noteDialog || moveDialog) && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              if (moveDialog) {
                setNotes((ns) =>
                  ns.map((n) =>
                    n.id === note?.id
                      ? { ...n, folder: targetFolder, updated: Date.now() }
                      : n,
                  ),
                );
                setMoveDialog(false);
                setFilter(targetFolder || "all");
              } else confirmNewNote();
            }}
          >
            <FileText size={25} />
            <h2>{moveDialog ? "移动笔记" : "新建笔记"}</h2>
            {noteDialog && (
              <>
                <p>笔记名称</p>
                <input
                  autoFocus
                  aria-label="笔记名称"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="给这篇笔记起个名字"
                  maxLength={100}
                  required
                />
              </>
            )}
            <p>存储目录</p>
            <select
              aria-label="笔记存储目录"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
            >
              <option value="">/ 根目录</option>
              {Array.from(new Set([...folders, ...notes.map((n) => n.folder)]))
                .filter(Boolean)
                .sort()
                .map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
            </select>
            <div>
              <button
                type="button"
                onClick={() => {
                  setNoteDialog(false);
                  setMoveDialog(false);
                }}
              >
                取消
              </button>
              <button className="primary" type="submit">
                {moveDialog ? "确认移动" : "创建笔记"}
              </button>
            </div>
          </form>
        </div>
      )}
      {renameNoteId && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void renameDocument();
            }}
          >
            <h2>重命名笔记</h2>
            <p>同时更改文件名与正文的一级标题。</p>
            <input
              autoFocus
              required
              aria-label="新笔记名称"
              maxLength={100}
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
            />
            <div>
              <button
                type="button"
                disabled={renameBusy}
                onClick={() => setRenameNoteId(null)}
              >
                取消
              </button>
              <button className="primary" disabled={renameBusy} type="submit">
                确认重命名
              </button>
            </div>
          </form>
        </div>
      )}
      {noteMenu && (
        <FolderContextMenu
          kind="note"
          folder={notes.find((n) => n.id === noteMenu.id)?.title || "笔记"}
          x={noteMenu.x}
          y={noteMenu.y}
          onClose={(restore) => {
            setNoteMenu(null);
            if (restore) folderTrigger.current?.focus();
          }}
          onChild={() => {}}
          onNote={() => {}}
          onRename={() => {
            setRenameNoteId(noteMenu.id);
            setRenameTitle(
              notes.find((n) => n.id === noteMenu.id)?.title || "",
            );
            setNoteMenu(null);
          }}
          onMove={() => {
            setTargetFolder(
              notes.find((n) => n.id === noteMenu.id)?.folder || "",
            );
            setMoveDialog(true);
            setNoteMenu(null);
          }}
          onDelete={() => {
            setPendingDelete(true);
            setNoteMenu(null);
          }}
        />
      )}
      {folderMenu && (
        <FolderContextMenu
          {...folderMenu}
          onClose={(restoreFocus = false) => {
            setFolderMenu(null);
            if (restoreFocus) folderTrigger.current?.focus();
          }}
          onChild={() => openFolderDialog(folderMenu.folder)}
          onNote={() => {
            setNewTitle("");
            setTargetFolder(folderMenu.folder);
            setFolderMenu(null);
            setNoteDialog(true);
          }}
          onRename={() => openFolderOperation("rename", folderMenu.folder)}
          onMove={() => openFolderOperation("move", folderMenu.folder)}
          onDelete={() => openFolderOperation("delete", folderMenu.folder)}
        />
      )}
      {folderDialog && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void createFolder();
            }}
          >
            <FolderOpen size={25} />
            <h2>{folderParent ? "新建子目录" : "创建笔记目录"}</h2>
            {folderParent ? (
              <>
                <p className="folder-parent">
                  <small>父目录</small>
                  {folderParent}/
                </p>
                <p>只需输入子目录名称，路径会自动补全。</p>
              </>
            ) : (
              <p>支持多级目录，例如：学习笔记/前端/React</p>
            )}
            <input
              autoFocus
              aria-label="目录路径"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={folderParent ? "例如：阅读笔记" : "输入目录路径"}
              required
            />
            <div>
              <button type="button" onClick={() => setFolderDialog(false)}>
                取消
              </button>
              <button type="submit" className="primary">
                创建目录
              </button>
            </div>
          </form>
        </div>
      )}
      {folderOperation && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              if (folderOperation.type === "delete")
                void changeFolder(folderOperation.folder);
              else {
                try {
                  const name =
                    folderOperation.type === "rename"
                      ? cleanFolder(operationName)
                      : folderOperation.folder.split("/").pop()!;
                  if (name.includes("/"))
                    throw new Error("目录名称不能包含路径分隔符");
                  const parent =
                    folderOperation.type === "rename"
                      ? folderOperation.folder.split("/").slice(0, -1).join("/")
                      : operationParent;
                  void changeFolder(
                    folderOperation.folder,
                    [parent, name].filter(Boolean).join("/"),
                  );
                } catch (error) {
                  notify((error as Error).message);
                }
              }
            }}
          >
            <FolderOpen size={25} />
            <h2>
              {folderOperation.type === "rename"
                ? "重命名目录"
                : folderOperation.type === "move"
                  ? "移动目录"
                  : "删除目录"}
            </h2>
            <p className="folder-parent">
              <small>当前目录</small>
              {folderOperation.folder}
            </p>
            {folderOperation.type === "rename" && (
              <input
                autoFocus
                required
                aria-label="新目录名称"
                value={operationName}
                onChange={(e) => setOperationName(e.target.value)}
              />
            )}
            {folderOperation.type === "move" && (
              <>
                <p>目标父目录</p>
                <select
                  aria-label="目标父目录"
                  value={operationParent}
                  onChange={(e) => setOperationParent(e.target.value)}
                >
                  <option value="">/ 根目录</option>
                  {folders
                    .filter(
                      (f) =>
                        f !== folderOperation.folder &&
                        !f.startsWith(`${folderOperation.folder}/`),
                    )
                    .map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                </select>
              </>
            )}
            {folderOperation.type === "delete" && (
              <p>
                该目录及所有子目录和文件将移入笔记空间的
                .ymarkdowng-trash，可从文件管理器中恢复。
              </p>
            )}
            <div>
              <button
                type="button"
                disabled={folderBusy}
                onClick={() => setFolderOperation(null)}
              >
                取消
              </button>
              <button
                disabled={folderBusy}
                className={
                  folderOperation.type === "delete"
                    ? "danger-button"
                    : "primary"
                }
                type="submit"
              >
                {folderBusy
                  ? "处理中…"
                  : folderOperation.type === "delete"
                    ? "移入回收目录"
                    : "确认"}
              </button>
            </div>
          </form>
        </div>
      )}
      {commandOpen && (
        <div className="modal-backdrop" onClick={() => setCommandOpen(false)}>
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="快速打开"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-title">
              Find Files <span>Ctrl + P</span>
            </div>
            <div className="command-input">
              <Search size={17} />
              <input
                autoFocus
                aria-label="快速查找笔记"
                placeholder="输入笔记名称…"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCommandOpen(false);
                }}
              />
              <button onClick={() => setCommandOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="command-results">
              {notes
                .filter((n) =>
                  `${n.folder}/${n.title}`
                    .toLowerCase()
                    .includes(commandQuery.toLowerCase()),
                )
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setActiveId(n.id);
                      setCommandOpen(false);
                    }}
                  >
                    <FileText size={15} />
                    <span>
                      {n.folder ? `${n.folder}/` : ""}
                      {n.title}.md
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
            </div>
            <div className="command-footer">
              点击打开笔记 <span>esc 关闭</span>
            </div>
          </div>
        </div>
      )}
      {desktopLoading && (
        <div className="desktop-loading">
          <img src="./icon.svg" width="56" height="56" alt="YMG" />
          <span>正在打开本地笔记空间…</span>
          <small>YMarkdownG Desktop</small>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {pendingDelete && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="删除笔记"
            className="modal"
          >
            <Trash2 size={25} />
            <h2>删除这篇笔记？</h2>
            <p>
              「{note?.title}」
              {workspace
                ? "会移入笔记目录下的 .ymarkdowng-trash 文件夹。"
                : "删除后无法恢复，可以先导出一份备份。"}
            </p>
            <div>
              <button onClick={() => setPendingDelete(false)}>取消</button>
              <button
                className="danger-button"
                onClick={() => {
                  setNotes((ns) => ns.filter((n) => n.id !== note?.id));
                  setPendingDelete(false);
                  notify("笔记已删除");
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-setting">
      <span>
        {label}
        <small>
          {value}
          {unit}
        </small>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
