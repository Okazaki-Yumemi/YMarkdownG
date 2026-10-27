const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { DocumentStore } = require("../electron/document.cjs");
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ymg-document-"));
  t.after(() => {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith("ymg-document-")
    )
      throw new Error("Invalid test directory");
    return fs.rm(root, { recursive: true, force: true });
  });
  return { root, store: new DocumentStore() };
}
test("opens one selected file without scanning or changing its siblings", async (t) => {
  const { root, store } = await fixture(t);
  const file = path.join(root, "笔记.md");
  await fs.writeFile(file, "# 原文\r\n\r\n你好");
  await fs.writeFile(path.join(root, "other.md"), "untouched");
  const doc = await store.open(file);
  assert.equal(doc.content, "# 原文\r\n\r\n你好");
  await store.save(doc.id, "# 已修改");
  assert.equal(await fs.readFile(file, "utf8"), "# 已修改");
  assert.equal(
    await fs.readFile(path.join(root, "other.md"), "utf8"),
    "untouched",
  );
  assert.deepEqual(
    (await fs.readdir(root)).sort(),
    ["other.md", "笔记.md"].sort(),
  );
});
test("new documents stay in memory until a destination is chosen, then save as works", async (t) => {
  const { root, store } = await fixture(t);
  const doc = store.data();
  assert.equal(doc.path, null);
  assert.deepEqual(await fs.readdir(root), []);
  await assert.rejects(store.save(doc.id, "abc"), /保存位置/);
  const first = path.join(root, "first.md"),
    second = path.join(root, "second.md");
  await store.save(doc.id, "first", first);
  await store.save(doc.id, "second", second);
  assert.equal(await fs.readFile(first, "utf8"), "first");
  assert.equal(await fs.readFile(second, "utf8"), "second");
});
test("external edits and deletion prevent overwrite; explicit reload establishes a new baseline", async (t) => {
  const { root, store } = await fixture(t),
    file = path.join(root, "file.md");
  await fs.writeFile(file, "original");
  const doc = await store.open(file);
  await fs.writeFile(file, "external");
  assert.equal((await store.refresh(doc.id)).changed, true);
  await assert.rejects(store.save(doc.id, "local"), /外部修改/);
  assert.equal(await fs.readFile(file, "utf8"), "external");
  assert.equal((await store.reload(doc.id)).content, "external");
  await assert.rejects(
    store.save(doc.id, "stale", undefined, "original"),
    /读取状态/,
  );
  await store.save(doc.id, "after reload");
  await fs.unlink(file);
  assert.equal((await store.refresh(doc.id)).missing, true);
  await assert.rejects(store.save(doc.id, "resurrect"), /删除/);
});
test("switching documents rejects stale requests and invalid UTF-8 never replaces the active document", async (t) => {
  const { root, store } = await fixture(t),
    file = path.join(root, "good.md");
  await fs.writeFile(file, "good");
  const old = await store.open(file);
  const bad = path.join(root, "bad.md");
  await fs.writeFile(bad, Buffer.from([0xff, 0xfe, 0x81]));
  await assert.rejects(store.open(bad), /UTF-8/);
  assert.equal(store.data().id, old.id);
  await store.create();
  await assert.rejects(store.save(old.id, "wrong"), /切换/);
  assert.equal(await fs.readFile(file, "utf8"), "good");
});
test("queued saves keep the last content and leave no temporary files", async (t) => {
  const { root, store } = await fixture(t),
    file = path.join(root, "file.md");
  const doc = store.data();
  await store.save(doc.id, "initial", file);
  await Promise.all([
    store.save(doc.id, "one"),
    store.save(doc.id, "two"),
    store.save(doc.id, "three"),
  ]);
  assert.equal(await fs.readFile(file, "utf8"), "three");
  assert.deepEqual(await fs.readdir(root), ["file.md"]);
});
test("pasted images use the document directory and cannot load files outside it", async (t) => {
  const { root, store } = await fixture(t),
    file = path.join(root, "file.md");
  const bytes = await fs.readFile(path.resolve("public/icon-192.png"));
  const doc = store.data();
  await assert.rejects(store.saveImage(doc.id, bytes), /先保存/);
  await store.save(doc.id, "# 图片", file);
  const image = await store.saveImage(doc.id, bytes);
  assert.match(image, /^ymg-image-.*\.png$/);
  assert.equal((await store.readImage(doc.id, image)).mime, "image/png");
  await assert.rejects(
    store.saveImage(doc.id, Buffer.from("not image")),
    /图片/,
  );
  const nested = path.join(root, "nested");
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, "nested.md"), "nested");
  const next = await store.open(path.join(nested, "nested.md"));
  await assert.rejects(store.readImage(next.id, `../${image}`), /目录之外/);
});
