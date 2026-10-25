export type StoredNote = {
  id: string;
  title: string;
  content: string;
  updated: number;
  starred: boolean;
  folder: string;
};
export type DirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemFileHandle | DirectoryHandle>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};
declare global {
  interface Window {
    showDirectoryPicker?: (options: {
      mode: "readwrite";
      id: string;
    }) => Promise<DirectoryHandle>;
  }
}
type RecordEntry = { path: string; content: string };
export function safeName(input: string): string {
  const value = input
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  return !value || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(value)
    ? `笔记_${value || "未命名"}`
    : value;
}
export function cleanFolder(input: string): string {
  const parts = input
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    !parts.length ||
    parts.some((p) => p === "." || p === ".." || p.startsWith("."))
  )
    throw new Error("目录名称不能包含 .、.. 或隐藏目录");
  return parts.map(safeName).join("/");
}
async function directory(root: DirectoryHandle, path: string, create = false) {
  let current = root;
  for (const part of path.split("/").filter(Boolean))
    current = (await current.getDirectoryHandle(part, {
      create,
    })) as DirectoryHandle;
  return current;
}
export class DiskWorkspace {
  readonly root: DirectoryHandle;
  private records = new Map<string, RecordEntry>();
  private queue: Promise<void> = Promise.resolve();
  constructor(root: DirectoryHandle) {
    this.root = root;
  }
  pathFor(id: string) {
    return this.records.get(id)?.path;
  }
  async load() {
    const notes: StoredNote[] = [];
    const folders: string[] = [];
    const walk = async (
      dir: DirectoryHandle,
      prefix: string,
      depth: number,
    ) => {
      if (depth > 24)
        throw new Error("目录层级超过 24 层，请选择更具体的笔记文件夹");
      for await (const entry of dir.values()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
          continue;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
          folders.push(path);
          await walk(entry as DirectoryHandle, path, depth + 1);
        } else if (/\.(md|markdown)$/i.test(entry.name)) {
          if (notes.length >= 2000)
            throw new Error("此空间超过 2000 篇笔记，请选择较小的目录");
          const file = await entry.getFile();
          if (file.size > 5 * 1024 * 1024)
            throw new Error(`文件过大：${path}，单篇笔记上限为 5 MB`);
          const content = await file.text();
          const id = crypto.randomUUID();
          notes.push({
            id,
            title:
              content.match(/^#\s+(.+)$/m)?.[1] ||
              entry.name.replace(/\.(md|markdown)$/i, ""),
            content,
            updated: file.lastModified,
            starred: false,
            folder: prefix,
          });
          this.records.set(id, { path, content });
        }
      }
    };
    await walk(this.root, "", 0);
    return { notes, folders };
  }
  async createFolder(path: string) {
    await directory(this.root, cleanFolder(path), true);
  }
  save(notes: StoredNote[]) {
    const task = this.queue.catch(() => {}).then(() => this.saveNow(notes));
    this.queue = task;
    return task;
  }
  async flush() {
    await this.queue;
  }
  private async assertUnchanged(record: RecordEntry) {
    const parts = record.path.split("/");
    const name = parts.pop()!;
    const parent = await directory(this.root, parts.join("/"));
    let file: File;
    try {
      file = await (await parent.getFileHandle(name)).getFile();
    } catch {
      throw new Error(
        `磁盘文件已移动或删除：${record.path}。请导出当前笔记，再重新打开空间。`,
      );
    }
    if ((await file.text()) !== record.content)
      throw new Error(
        `检测到外部修改：${record.path}。已暂停写入，请先导出当前笔记，再重新打开空间。`,
      );
    return { parent, name };
  }
  private async saveNow(notes: StoredNote[]) {
    for (const note of notes) {
      const previous = this.records.get(note.id);
      const currentFolder = previous?.path.split("/").slice(0, -1).join("/");
      if (
        previous &&
        previous.content === note.content &&
        currentFolder === note.folder
      )
        continue;
      // Existing files keep their filenames when headings change. Moving a note preserves its filename.
      const old = previous ? await this.assertUnchanged(previous) : undefined;
      const parent = await directory(this.root, note.folder, true);
      let filename =
        previous?.path.split("/").pop() || `${safeName(note.title)}.md`;
      const samePath = previous && currentFolder === note.folder;
      if (!samePath) {
        const base = filename.replace(/\.(md|markdown)$/i, "");
        let suffix = 1;
        while (true) {
          try {
            await parent.getFileHandle(filename);
            filename = `${base} (${suffix++}).md`;
          } catch (e) {
            if ((e as DOMException).name === "NotFoundError") break;
            throw e;
          }
        }
      }
      const handle = await parent.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(note.content);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
      const path = note.folder ? `${note.folder}/${filename}` : filename;
      this.records.set(note.id, { path, content: note.content });
      if (old && !samePath) await old.parent.removeEntry(old.name);
    }
    // Deletion is reversible: move managed Markdown files to a hidden trash folder.
    for (const [id, previous] of this.records) {
      if (notes.some((n) => n.id === id)) continue;
      const { parent, name } = await this.assertUnchanged(previous);
      const trash = await directory(this.root, ".ymarkdowng-trash", true);
      const handle = await trash.getFileHandle(
        `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name}`,
        { create: true },
      );
      const writable = await handle.createWritable();
      await writable.write(previous.content);
      await writable.close();
      await parent.removeEntry(name);
      this.records.delete(id);
    }
  }
}
async function bookmarkDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ymg-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function rememberWorkspace(handle: DirectoryHandle) {
  const db = await bookmarkDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "last");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function lastWorkspace(): Promise<DirectoryHandle | undefined> {
  const db = await bookmarkDB();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("handles").objectStore("handles").get("last");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
