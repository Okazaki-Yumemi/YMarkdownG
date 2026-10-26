import { test, expect } from "@playwright/test";

test("folder context menus inherit parents and support keyboard dismissal", async ({
  page,
}) => {
  await page.goto("/");
  const parent = page.getByRole("button", {
    name: "目录 开始使用",
    exact: true,
  });
  await parent.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "目录操作" })).toBeVisible();
  await page.getByRole("menuitem", { name: "新建子目录" }).click();
  await expect(page.locator(".folder-parent")).toContainText("开始使用/");
  await page.getByLabel("目录路径").fill("学习/Markdown");
  await page.getByRole("button", { name: "创建目录", exact: true }).click();
  const child = page.getByRole("button", {
    name: "目录 开始使用/学习/Markdown",
    exact: true,
  });
  await expect(child).toBeVisible();
  await child.click({ button: "right" });
  await page.getByRole("menuitem", { name: "在此新建笔记" }).click();
  await expect(page.getByLabel("笔记存储目录")).toHaveValue(
    "开始使用/学习/Markdown",
  );
  await page.getByLabel("笔记名称").fill("下级目录中的笔记");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await expect(page.locator(".markdown-body h1")).toHaveText(
    "下级目录中的笔记",
  );
  await child.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "在此新建笔记" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(child).toBeFocused();
  await parent.click({ button: "right" });
  await page.getByLabel("搜索笔记").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTitle("新建目录", { exact: true }).click();
  await expect(page.locator(".folder-parent")).toHaveCount(0);
  await expect(page.getByLabel("目录路径")).toHaveValue("");
});

test("live Markdown, highlighted code, persistence, export and sanitization", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".app")).toHaveClass(/dark/);
  await expect(page.locator(".code-block .hljs-keyword").first()).toBeVisible();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await page.getByLabel("笔记名称").fill("验证笔记");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page
    .locator(".cm-content")
    .fill(
      '# 测试标题\n\n**实时加粗**\n\n```python\ndef greet(name):\n    return "Hello " + name\n```\n\n<img src=x onerror="window.hacked=true"><script>window.hacked=true</script>',
    );
  await expect(page.locator(".markdown-body h1")).toHaveText("测试标题");
  await expect(page.locator(".markdown-body strong")).toHaveText("实时加粗");
  await expect(page.locator(".code-header")).toContainText("python");
  await expect(page.locator(".hljs-keyword").first()).toHaveText("def");
  expect(await page.evaluate(() => (window as any).hacked)).toBeUndefined();
  expect(await page.locator(".markdown-body").innerHTML()).not.toContain(
    "onerror=",
  );
  await page.reload();
  await expect(page.locator(".markdown-body h1")).toHaveText("测试标题");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await download).suggestedFilename()).toBe("测试标题.md");
  await page.keyboard.press("Control+p");
  await page.getByLabel("快速查找笔记").fill("语法指南");
  await page.locator(".command-results button").click();
  await expect(page.locator(".markdown-body h1")).toHaveText(
    "Markdown 语法指南",
  );
  expect(errors).toEqual([]);
});

test("appearance settings survive reload and focus mode exits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "暮色山野", exact: true }).click();
  await page.getByRole("button", { name: "排版", exact: true }).click();
  await page.getByLabel("字号", { exact: true }).fill("20");
  await page.getByLabel("正文字体").selectOption("sans");
  await page.reload();
  await expect(page.locator(".canvas")).toHaveClass(/bg-lavender/);
  await expect(page.locator(".document-shell")).toHaveClass(/font-sans/);
  await expect(page.locator(".app")).toHaveAttribute(
    "style",
    /--editor-size: 20px/,
  );
  await page.keyboard.press("Control+Shift+f");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("directory workspace creates nested folders and actual Markdown files", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle("test-vault", {
        create: true,
      });
      Object.defineProperty(folder, "requestPermission", {
        value: async () => "granted",
      });
      return folder;
    };
  });
  await page.goto("/");
  await page.locator(".workspace").click();
  await page
    .getByRole("button", { name: "打开本地笔记目录", exact: true })
    .click();
  await expect(page.locator(".workspace")).toContainText("test-vault");
  await page.getByTitle("新建目录", { exact: true }).click();
  await page.getByLabel("目录路径").fill("学习/前端");
  await page.getByRole("button", { name: "创建目录", exact: true }).click();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await page.getByLabel("笔记名称").fill("React 学习");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.locator(".cm-content").fill("# React 学习\n\n保存到真实目录");
  await expect(page.getByTitle("保存状态", { exact: true })).toContainText(
    "已保存到磁盘",
  );
  const content = await page.evaluate(async () => {
    let root = await navigator.storage.getDirectory();
    for (const path of ["test-vault", "学习", "前端"])
      root = await root.getDirectoryHandle(path);
    return (await (await root.getFileHandle("React 学习.md")).getFile()).text();
  });
  expect(content).toBe("# React 学习\n\n保存到真实目录");
  await page.getByTitle("更多操作").click();
  await page.getByRole("button", { name: "移动笔记", exact: true }).click();
  await page.getByLabel("笔记存储目录").selectOption("");
  await page.getByRole("button", { name: "确认移动", exact: true }).click();
  await expect(page.getByTitle("保存状态", { exact: true })).toContainText(
    "已保存到磁盘",
  );
  expect(
    await page.evaluate(async () => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("test-vault");
      return (
        await (await root.getFileHandle("React 学习.md")).getFile()
      ).text();
    }),
  ).toContain("保存到真实目录");
  await page.getByTitle("更多操作").click();
  await page.getByRole("button", { name: "删除当前笔记" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByTitle("保存状态", { exact: true })).toContainText(
    "已保存到磁盘",
  );
  const trash = await page.evaluate(async () => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("test-vault");
    const trash = await root.getDirectoryHandle(".ymarkdowng-trash");
    const files = [];
    for await (const entry of (trash as any).values())
      files.push(await (await entry.getFile()).text());
    return files;
  });
  expect(trash).toEqual(["# React 学习\n\n保存到真实目录"]);
});

test("storage prevents collisions, detects external edits and reloads nested files", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/storage.ts";
    const { DiskWorkspace, cleanFolder } = await import(
      /* @vite-ignore */ modulePath
    );
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("storage-test", { create: true });
    const disk = new DiskWorkspace(root);
    await disk.load();
    await disk.createFolder("笔记/代码");
    const a = {
      id: "a",
      title: "同名",
      content: "# first",
      updated: 1,
      starred: false,
      folder: "笔记/代码",
    };
    const b = { ...a, id: "b", content: "# second" };
    await disk.save([a, b]);
    const dir = await (
      await root.getDirectoryHandle("笔记")
    ).getDirectoryHandle("代码");
    const first = await dir.getFileHandle("同名.md");
    const second = await dir.getFileHandle("同名 (1).md");
    const loaded = await new DiskWorkspace(root).load();
    const writer = await first.createWritable();
    await writer.write("external");
    await writer.close();
    let conflict = "";
    try {
      await disk.save([{ ...a, content: "internal" }, b]);
    } catch (e) {
      conflict = (e as Error).message;
    }
    let rejectedPath = false;
    try {
      cleanFolder("../escape");
    } catch {
      rejectedPath = true;
    }
    return {
      second: await (await second.getFile()).text(),
      loaded: loaded.notes.length,
      folders: loaded.folders,
      conflict,
      preserved: await (await first.getFile()).text(),
      rejectedPath,
    };
  });
  expect(result.second).toBe("# second");
  expect(result.loaded).toBe(2);
  expect(result.folders).toContain("笔记/代码");
  expect(result.conflict).toContain("检测到外部修改");
  expect(result.preserved).toBe("external");
  expect(result.rejectedPath).toBe(true);
});

test("responsive layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".appearance")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".markdown-body h1")).toBeVisible();
});

test("imports Markdown, copies code and persists uploaded backgrounds", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "snippet.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# 导入代码\n\n```javascript\nconst answer = 42;\nconsole.log(answer);\n```",
      ),
    });
  await expect(page.locator(".markdown-body h1")).toHaveText("导入代码");
  await page.getByRole("button", { name: "复制代码", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"),
      ),
    )
    .toBe("const answer = 42;\nconsole.log(answer);");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "background.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.locator(".canvas")).toHaveClass(/bg-custom/);
  await expect(page.locator(".background-layer")).toHaveAttribute(
    "style",
    /data:image\/png/,
  );
  await page.reload();
  await expect(page.locator(".canvas")).toHaveClass(/bg-custom/);
  await expect(page.locator(".markdown-body h1")).toHaveText("导入代码");
});

test("note context menu renames the selected document and exposes move and delete", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator(".note-card").first();
  await card.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "笔记操作" })).toBeVisible();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await page.getByLabel("新笔记名称").fill("重新整理的笔记");
  await page.getByRole("button", { name: "确认重命名" }).click();
  await expect(page.locator(".markdown-body h1")).toHaveText("重新整理的笔记");
  await card.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "移动笔记" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "删除笔记" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
});

test("explorer collapses nested directories and remembers disclosure state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTitle("新建目录", { exact: true }).click();
  await page.getByLabel("目录路径").fill("研究/资料/书籍");
  await page.getByRole("button", { name: "创建目录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "目录 研究/资料/书籍", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "折叠目录 研究", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "目录 研究/资料", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "展开目录 研究", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "展开目录 研究", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "目录 研究/资料/书籍", exact: true }),
  ).toBeVisible();
});
