# 开发说明

## 结构

- `src/main.tsx`：单文档状态、文件操作、编辑模式、图片插入。
- `src/EditorSettings.tsx` / `preferences.ts`：设置和本地偏好。
- `src/RichEditor.tsx`：Tiptap 所见即所得编辑器，按需加载。
- `src/rich-source.ts`：块源码编辑和未改动块的格式保留。
- `src/markdown.ts`：Markdown、代码高亮、KaTeX 和 HTML 清理。
- `src/editor-motion.ts` / `rich-motion.ts`：CodeMirror 与富文本光标动效。
- `src/editor.css`：界面和文档样式。
- `electron/document.cjs`：单个文件的读取、原子保存、冲突检查和图片访问。
- `electron/main.cjs` / `preload.cjs`：原生窗口、对话框和有限 IPC 接口。
- `electron/pdf.cjs`：PDF 导出。`vite.config.ts` 生成其样式，复用前端公式字体。

## 运行与验证

```sh
npm ci
npm run dev                  # 桌面开发窗口
npm run dev:web              # 仅用于界面开发
npm test                     # 文件保存与 Chromium 回归
npm run build
npm run test:desktop         # 真实 Electron 测试
node scripts/test-editor.mjs release/win-unpacked/YMarkdownG.exe
```

桌面测试使用 `.desktop-test/` 下的独立文件和用户配置，不修改用户文档，也不写入系统剪贴板。

## 文件行为

启动时打开空文档，也可以从命令行传入 Markdown 文件路径。`Ctrl/Cmd+O` 使用原生文件选择器。没有目录扫描、笔记索引或默认文档目录。

保存采用临时文件与替换，在替换前检查磁盘内容；检测到外部修改时拒绝覆盖。关闭和切换文件前处理未保存更改。当前不提供自动保存、云同步和内置更新。

相对图片从当前文档目录解析，不允许通过路径或符号链接越过该目录。粘贴图片创建同目录的独立文件。另存为到不同目录时，原有相对链接按新文件位置解析，图片不自动搬移。

## 打包

```sh
npm run package:win
npm run package:mac
npm run package:linux
```

运行时没有 npm 生产依赖。渲染代码由 Vite 编译，PDF 使用同一组公式字体。`scripts/audit-package.cjs` 检查运行文件、字体和档案体积，阻止重复打包 `node_modules`。Electron 运行时仍占完整发行包的主要体积。

推送 `v*` 标签触发四个平台构建和 GitHub Release 发布。发布脚本检查全部安装包并生成 SHA256SUMS，不再发布自动更新元数据。

## 兼容旧版

旧版笔记目录和 `.md`、图片文件不作修改；旧 `workspace.json` 不再读取。外观偏好继续使用 `ymg-prefs`，仅加载现有设置字段。

## 文件打开与启动测量

应用使用单实例锁。系统再次打开 Markdown 时通过请求队列交给现有窗口；队列沿用保存、取消和图片写入保护。macOS 的 `open-file` 事件也进入同一流程。

```sh
node scripts/benchmark-open.mjs release/win-unpacked/YMarkdownG.exe
```

基准使用约 7.5 KB 文档、三个新进程和独立配置目录，测量到所见即所得可编辑。一次本机 Windows 测量为 544 / 379 / 381 ms，中位数 381 ms；包含自动化连接开销，使用正常系统文件缓存和隐藏测试窗口。不是跨设备性能保证。

单文件便携 EXE 每次启动先解压运行时，不能用上述数值估计它的启动耗时。日常使用建议安装版；该基准应指向安装目录或解包目录中的 `YMarkdownG.exe`。
