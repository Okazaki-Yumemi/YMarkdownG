const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_SIZE = 5 * 1024 * 1024;
function safeName(value) {
  const name = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  return !name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(name)
    ? `笔记_${name || "未命名"}`
    : name;
}
class NativeStore {
  constructor(root) {
    this.root = path.resolve(root);
    this.records = new Map();
    this.queue = Promise.resolve();
  }
  async init() {
    this.root = await fs.realpath(this.root);
    return this;
  }
  async resolve(relative = "", create = false, internal = false) {
    if (typeof relative !== "string" || path.isAbsolute(relative))
      throw new Error("无效目录");
    const parts = relative.split("/").filter(Boolean);
    if (
      parts.some(
        (p) =>
          p === "." ||
          p === ".." ||
          /[<>:"\\|?*\x00-\x1f]/.test(p) ||
          (!internal && p.startsWith(".")) ||
          /[. ]$/.test(p),
      )
    )
      throw new Error("无效目录路径");
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      if (create)
        await fs.mkdir(current).catch((e) => {
          if (e.code !== "EEXIST") throw e;
        });
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("不支持符号链接或非目录路径");
      const resolved = await fs.realpath(current);
      const rel = path.relative(this.root, resolved);
      if (rel.startsWith("..") || path.isAbsolute(rel))
        throw new Error("路径超出笔记空间");
    }
    return current;
  }
  async file(relative) {
    const parts = relative.split("/");
    const name = parts.pop();
    const parent = await this.resolve(parts.join("/"));
    const target = path.join(parent, name);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("不支持符号链接或非普通文件");
    if (stat.size > MAX_SIZE) throw new Error(`文件超过 5 MB：${relative}`);
    return { target, stat, content: await fs.readFile(target, "utf8") };
  }
  async load() {
    const notes = [];
    const folders = [];
    this.records.clear();
    const walk = async (prefix, depth) => {
      if (depth > 24) throw new Error("笔记目录超过 24 层");
      const dir = await this.resolve(prefix);
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.isSymbolicLink()
        )
          continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          folders.push(relative);
          await walk(relative, depth + 1);
        } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
          if (notes.length >= 2000)
            throw new Error("笔记超过 2000 篇，请选择更小的空间");
          const { content, stat } = await this.file(relative);
          const id = randomUUID();
          notes.push({
            id,
            title:
              content.match(/^#\s+(.+)$/m)?.[1] ||
              entry.name.replace(/\.(md|markdown)$/i, ""),
            content,
            updated: stat.mtimeMs,
            starred: false,
            folder: prefix,
          });
          this.records.set(id, { path: relative, content });
        }
      }
    };
    await walk("", 0);
    return this.snapshot({ notes, folders });
  }
  snapshot(extra = {}) {
    return {
      paths: Object.fromEntries(
        [...this.records].map(([id, entry]) => [id, entry.path]),
      ),
      ...extra,
    };
  }
  async unchanged(entry) {
    const current = await this.file(entry.path);
    if (current.content !== entry.content)
      throw new Error(
        `检测到外部修改：${entry.path}。已暂停写入，请导出当前笔记后重新打开空间。`,
      );
    return current;
  }
  save(notes) {
    if (
      !Array.isArray(notes) ||
      notes.length > 2000 ||
      notes.some(
        (n) =>
          typeof n.id !== "string" ||
          typeof n.title !== "string" ||
          typeof n.folder !== "string" ||
          typeof n.content !== "string" ||
          Buffer.byteLength(n.content) > MAX_SIZE,
      ) ||
      new Set(notes.map((n) => n.id)).size !== notes.length
    )
      return Promise.reject(new Error("无效笔记数据，单篇上限 5 MB"));
    const task = this.queue.catch(() => {}).then(() => this.saveNow(notes));
    this.queue = task;
    return task;
  }
  async atomicWrite(target, content, beforeReplace) {
    const temp = path.join(path.dirname(target), `.ymg-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, content, { encoding: "utf8", flag: "wx" });
      if (beforeReplace) await beforeReplace();
      await fs.rename(temp, target);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  async saveNow(notes) {
    for (const note of notes) {
      const previous = this.records.get(note.id);
      const previousFolder = previous?.path.split("/").slice(0, -1).join("/");
      if (
        previous &&
        previous.content === note.content &&
        previousFolder === note.folder
      )
        continue;
      const old = previous ? await this.unchanged(previous) : undefined;
      const parent = await this.resolve(note.folder, true);
      const same = previous && previousFolder === note.folder;
      let name =
        previous?.path.split("/").pop() || `${safeName(note.title)}.md`;
      let target = path.join(parent, name);
      if (!same) {
        const base = name.replace(/\.(md|markdown)$/i, "");
        let suffix = 1;
        while (true) {
          try {
            const handle = await fs.open(target, "wx");
            await handle.close();
            break;
          } catch (e) {
            if (e.code !== "EEXIST") throw e;
            name = `${base} (${suffix++}).md`;
            target = path.join(parent, name);
          }
        }
      }
      await this.atomicWrite(
        target,
        note.content,
        same ? () => this.unchanged(previous) : undefined,
      );
      if (old && !same) {
        await this.unchanged(previous);
        await fs.unlink(old.target);
      }
      this.records.set(note.id, {
        path: note.folder ? `${note.folder}/${name}` : name,
        content: note.content,
      });
    }
    for (const [id, previous] of this.records) {
      if (notes.some((n) => n.id === id)) continue;
      const old = await this.unchanged(previous);
      const trash = await this.resolve(".ymarkdowng-trash", true, true);
      await fs.writeFile(
        path.join(
          trash,
          `${Date.now()}-${randomUUID().slice(0, 8)}-${path.basename(previous.path)}`,
        ),
        previous.content,
        { encoding: "utf8", flag: "wx" },
      );
      await this.unchanged(previous);
      await fs.unlink(old.target);
      this.records.delete(id);
    }
    return this.snapshot();
  }
  async createFolder(folder) {
    if (!folder) throw new Error("请输入目录名称");
    await this.resolve(folder, true);
  }
}
module.exports = { NativeStore };
