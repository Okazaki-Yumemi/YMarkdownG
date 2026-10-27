const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function imageType(bytes) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { extension: "png", mime: "image/png" };
  if (b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { extension: "jpg", mime: "image/jpeg" };
  if (/^GIF8[79]a$/.test(b.subarray(0, 6).toString()))
    return { extension: "gif", mime: "image/gif" };
  if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return { extension: "webp", mime: "image/webp" };
  throw new Error("请选择 PNG、JPEG、GIF 或 WebP 图片");
}
async function read(file) {
  if (!(await fs.stat(file)).isFile()) throw new Error("请选择 Markdown 文件");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      await fs.readFile(file),
    );
  } catch (error) {
    if (error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")
      throw new Error("文件不是有效的 UTF-8 文本，请转换编码后打开");
    throw error;
  }
}
class DocumentStore {
  constructor() {
    this.tail = Promise.resolve();
    this.current = this.blank();
  }
  blank() {
    return { id: randomUUID(), path: null, content: "" };
  }
  data() {
    const doc = this.current;
    return {
      ...doc,
      name: doc.path ? path.basename(doc.path) : "未命名.md",
      imageBase: doc.path
        ? `ymg-note://${doc.id}/${encodeURIComponent(path.basename(doc.path))}`
        : undefined,
    };
  }
  queue(task) {
    const result = this.tail.then(task);
    this.tail = result.catch(() => {});
    return result;
  }
  check(id) {
    if (id !== this.current.id) throw new Error("文档已切换，请重试");
    return this.current;
  }
  create() {
    return this.queue(() => {
      this.current = this.blank();
      return this.data();
    });
  }
  open(file) {
    return this.queue(async () => {
      const resolved = await fs.realpath(file);
      const content = await read(resolved);
      this.current = { id: randomUUID(), path: resolved, content };
      return this.data();
    });
  }
  save(id, content, destination, expectedContent) {
    return this.queue(async () => {
      const doc = this.check(id);
      if (typeof content !== "string") throw new Error("无效文档内容");
      const file = destination ? path.resolve(destination) : doc.path;
      if (!file) throw new Error("请先选择保存位置");
      const sameFile = doc.path && path.resolve(doc.path) === file;
      if (
        sameFile &&
        expectedContent !== undefined &&
        doc.content !== expectedContent
      )
        throw new Error("文件读取状态已变化，请重新加载或另存为");
      let expected = null;
      try {
        expected = await read(file);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (sameFile && expected !== doc.content)
        throw new Error(
          "文件已在外部修改或删除，请重新加载或另存为，避免覆盖外部内容",
        );
      const parent = await fs.realpath(path.dirname(file));
      const target = path.join(parent, path.basename(file));
      const temp = path.join(
        parent,
        `.${path.basename(file)}.${randomUUID()}.tmp`,
      );
      try {
        const mode = (await fs.stat(target).catch(() => null))?.mode;
        await fs.writeFile(temp, content, { flag: "wx", mode: mode || 0o600 });
        // Recheck after writing the temporary file, immediately before replacing.
        let actual = null;
        try {
          actual = await read(target);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (actual !== expected)
          throw new Error("保存过程中检测到外部修改，请另存为");
        await fs.rename(temp, target);
      } finally {
        await fs.unlink(temp).catch(() => {});
      }
      doc.path = target;
      doc.content = content;
      return this.data();
    });
  }
  refresh(id) {
    return this.queue(async () => {
      const doc = this.check(id);
      if (!doc.path) return { changed: false, missing: false };
      try {
        return {
          changed: (await read(doc.path)) !== doc.content,
          missing: false,
        };
      } catch (error) {
        if (error.code === "ENOENT") return { changed: true, missing: true };
        throw error;
      }
    });
  }
  reload(id) {
    return this.queue(async () => {
      const doc = this.check(id);
      doc.content = await read(doc.path);
      return this.data();
    });
  }
  saveImage(id, bytes) {
    return this.queue(async () => {
      const doc = this.check(id);
      if (!doc.path) throw new Error("请先保存 Markdown 文件，再插入图片");
      if (!(bytes instanceof Uint8Array)) throw new Error("无效图片内容");
      const { extension } = imageType(bytes);
      const name = `ymg-image-${randomUUID()}.${extension}`;
      await fs.writeFile(path.join(path.dirname(doc.path), name), bytes, {
        flag: "wx",
      });
      return name;
    });
  }
  async readImage(id, relative) {
    const doc = this.check(id);
    if (!doc.path) throw new Error("文档尚未保存");
    const root = await fs.realpath(path.dirname(doc.path));
    const file = await fs.realpath(path.resolve(root, relative));
    const inside = path.relative(root, file);
    if (
      inside === ".." ||
      inside.startsWith(`..${path.sep}`) ||
      path.isAbsolute(inside)
    )
      throw new Error("图片位于文档目录之外");
    const bytes = await fs.readFile(file);
    return { bytes, ...imageType(bytes) };
  }
}
module.exports = { DocumentStore, imageType };
