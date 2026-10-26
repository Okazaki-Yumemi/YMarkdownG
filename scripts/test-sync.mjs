import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await fs.mkdir(".desktop-test",{recursive:true});
const run = await fs.mkdtemp(path.resolve(".desktop-test/sync-"));
const vault = path.join(run,"vault"), profile = path.join(run,"profile");
await fs.mkdir(vault); await fs.mkdir(profile);
await fs.writeFile(path.join(profile,"workspace.json"),JSON.stringify({root:vault}));
const file = path.join(vault,"笔记.md");
await fs.writeFile(file,"# 笔记\n\ninitial");
const env = {...process.env,YMG_USER_DATA:profile,YMG_TEST:"1"}; delete env.ELECTRON_RUN_AS_NODE; delete env.YMG_DEV_URL;
const app = await electron.launch({executablePath:require("electron"),args:["."],env});
try {
  const page = await app.firstWindow(); const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].show();});
  await page.waitForSelector(".desktop-loading",{state:"detached"});
  await fs.writeFile(file,"# 外部更新\n\nexternal first");
  await expect(page.locator(".markdown-body h1")).toHaveText("外部更新",{timeout:12000});
  await fs.writeFile(path.join(vault,"新增.md"),"# 新增文档");
  await expect(page.locator(".note-card")).toHaveCount(2,{timeout:12000});
  await fs.unlink(path.join(vault,"新增.md"));
  await expect(page.locator(".note-card")).toHaveCount(1,{timeout:12000});
  await fs.writeFile(file,"# 磁盘保留\n\nremote conflict");
  await page.locator(".cm-content").fill("# 本地保留\n\nlocal conflict");
  await page.getByTitle("刷新已收录文件夹",{exact:true}).click();
  await expect(page.locator(".sync-notice")).toContainText("冲突副本",{timeout:10000});
  await expect.poll(async()=> fs.readFile(file,"utf8")).toContain("remote conflict");
  await expect.poll(async()=> {
    try {return (await fs.readdir(path.join(vault,"冲突副本"))).length;}catch{return 0;}
  }).toBeGreaterThan(0);
  const copies = await fs.readdir(path.join(vault,"冲突副本"));
  const contents = await Promise.all(copies.map(f=>fs.readFile(path.join(vault,"冲突副本",f),"utf8")));
  expect(contents.some(c=>c.includes("local conflict"))).toBe(true);
  await page.getByRole("button",{name:"目录 冲突副本",exact:true}).click();
  await page.locator(".note-card").first().click({button:"right"});
  await page.getByRole("menuitem",{name:"重命名",exact:true}).click();
  await page.getByLabel("新笔记名称").fill("本地编辑已保留");
  await page.getByRole("button",{name:"确认重命名"}).click();
  await expect.poll(()=>fs.readFile(path.join(vault,"冲突副本/本地编辑已保留.md"),"utf8")).toContain("local conflict");
  expect(errors).toEqual([]);
  await page.screenshot({path:path.join(run,"sync.png")});
  console.log("External edit/add/delete, conflict copies and native context rename passed",run);
}finally{await app.close();}
