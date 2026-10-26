const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { NativeStore } = require("../electron/native-store.cjs");
async function fixture() {
  const base = path.resolve(".desktop-test");
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(path.join(base, "native-"));
  return { dir, store: await new NativeStore(dir).init() };
}
const note = (id, content = "# 测试\n\n中文正文", folder = "知识库/前端") => ({
  id,
  title: "测试",
  content,
  folder,
  updated: Date.now(),
  starred: false,
});
test("directory rename, move and recycle preserve whole subtrees and tracked paths", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await store.save([note("a")]);
  await store.createFolder("目标");
  await fs.writeFile(
    path.join(dir, "知识库", "attachment.bin"),
    Buffer.from([1, 2, 3]),
  );
  await assert.rejects(
    store.moveFolder("知识库", "知识库/前端/循环"),
    /子目录/,
  );
  await assert.rejects(store.moveFolder("知识库", "目标"), /同名/);
  await store.moveFolder("知识库", "整理");
  await store.save([note("a", "改名后编辑", "整理/前端")]);
  await store.moveFolder("整理", "目标/整理");
  assert.equal(
    await fs.readFile(path.join(dir, "目标/整理/前端/测试.md"), "utf8"),
    "改名后编辑",
  );
  assert.equal(store.snapshot().paths.a, "目标/整理/前端/测试.md");
  await store.deleteFolder("目标/整理");
  assert.equal(store.snapshot().paths.a, undefined);
  const entries = await fs.readdir(path.join(dir, ".ymarkdowng-trash"));
  const recovered = path.join(dir, ".ymarkdowng-trash", entries[0]);
  assert.equal(
    await fs.readFile(path.join(recovered, "前端/测试.md"), "utf8"),
    "改名后编辑",
  );
  assert.deepEqual(
    await fs.readFile(path.join(recovered, "attachment.bin")),
    Buffer.from([1, 2, 3]),
  );
  await assert.rejects(store.deleteFolder(""), /根目录/);
});
test("native save creates nested Markdown files, avoids collisions and persists after reopening", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await store.createFolder("知识库/空目录");
  await store.save([note("a"), note("b", "# 第二篇")]);
  assert.equal(
    await fs.readFile(path.join(dir, "知识库/前端/测试.md"), "utf8"),
    "# 测试\n\n中文正文",
  );
  assert.equal(
    await fs.readFile(path.join(dir, "知识库/前端/测试 (1).md"), "utf8"),
    "# 第二篇",
  );
  const data = await (await new NativeStore(dir).init()).load();
  assert.equal(data.notes.length, 2);
  assert.ok(data.folders.includes("知识库/空目录"));
});
test("native saves are serialized, move preserves content and deletion retains a recoverable copy", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await Promise.all([
    store.save([note("a", "first")]),
    store.save([note("a", "latest")]),
  ]);
  await store.save([note("a", "latest", "已整理")]);
  assert.equal(
    await fs.readFile(path.join(dir, "已整理/测试.md"), "utf8"),
    "latest",
  );
  await assert.rejects(fs.access(path.join(dir, "知识库/前端/测试.md")));
  await store.save([]);
  const trash = path.join(dir, ".ymarkdowng-trash");
  const files = await fs.readdir(trash);
  assert.equal(files.length, 1);
  assert.equal(await fs.readFile(path.join(trash, files[0]), "utf8"), "latest");
});
test("external edits and traversal cannot overwrite files outside the workspace", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await store.save([note("a")]);
  const file = path.join(dir, "知识库/前端/测试.md");
  await fs.writeFile(file, "EXTERNAL");
  await assert.rejects(store.save([note("a", "INTERNAL")]), /检测到外部修改/);
  assert.equal(await fs.readFile(file, "utf8"), "EXTERNAL");
  await assert.rejects(store.createFolder("../escape"), /无效目录/);
  await assert.rejects(store.createFolder("a/../../escape"), /无效目录/);
  await assert.rejects(store.createFolder("C:/escape"), /无效目录/);
  await assert.rejects(
    store.save([note("a", "x".repeat(5 * 1024 * 1024 + 1))]),
    /上限/,
  );
});
test("symlink/junction directories are not followed", async () => {
  const { dir, store } = await fixture();
  const outside = await fixture();
  await fs.symlink(
    outside.dir,
    path.join(dir, "link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.deepEqual((await store.load()).folders, []);
  await assert.rejects(store.createFolder("link/escape"), /符号链接/);
  await assert.rejects(fs.access(path.join(outside.dir, "escape")));
});

test("note rename changes filename and rejects collisions", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await store.save([note("a"), note("b")]);
  await store.renameNote("a", "重命名");
  assert.equal(store.snapshot().paths.a, "知识库/前端/重命名.md");
  assert.equal(
    await fs.readFile(path.join(dir, store.snapshot().paths.a), "utf8"),
    note("a").content,
  );
  await assert.rejects(store.renameNote("a", "测试 (1)"), /EEXIST/);
  await assert.rejects(store.renameNote("a", "../escape"), /有效文件名/);
});

test("refresh merges external edits, additions and removals without changing stable IDs", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await store.save([note("a"), note("b", "unchanged")]);
  await fs.writeFile(
    path.join(dir, store.snapshot().paths.a),
    "# 外部标题\n外部内容",
  );
  await fs.unlink(path.join(dir, store.snapshot().paths.b));
  await fs.writeFile(path.join(dir, "新增.md"), "新增文件");
  const data = await store.refresh([note("a"), note("b", "unchanged")]);
  assert.equal(
    data.notes.find((n) => n.id === "a").content,
    "# 外部标题\n外部内容",
  );
  assert.equal(
    data.notes.some((n) => n.id === "b"),
    false,
  );
  assert.equal(data.notes.length, 2);
  await store.save(data.notes);
  assert.equal((await store.refresh(data.notes)).notices.length, 0);
});
test("simultaneous edits and external deletion preserve local conflict copies", async () => {
  const { dir, store } = await fixture();
  await store.load();
  await store.save([note("a")]);
  await fs.writeFile(path.join(dir, store.snapshot().paths.a), "remote");
  let data = await store.refresh([note("a", "local")]);
  assert.equal(data.notes.find((n) => n.id === "a").content, "remote");
  const copy = data.notes.find((n) => n.id !== "a");
  assert.equal(copy.content, "local");
  assert.equal(copy.folder, "冲突副本");
  await store.save(data.notes);
  assert.equal(
    await fs.readFile(path.join(dir, store.snapshot().paths[copy.id]), "utf8"),
    "local",
  );
  await fs.unlink(path.join(dir, store.snapshot().paths.a));
  data = await store.refresh(
    data.notes.map((n) =>
      n.id === "a" ? { ...n, content: "local after deletion" } : n,
    ),
  );
  await store.save(data.notes);
  assert.ok(data.notes.some((n) => n.content === "local after deletion"));
  assert.ok(!data.notes.some((n) => n.id === "a"));
});
