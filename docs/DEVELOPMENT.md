# YMarkdownG Desktop

独立桌面 Markdown 笔记软件，使用 Electron 运行，不需要打开浏览器或启动本地服务。界面参考 Neovim，保留即时预览、代码高亮与自定义背景。

## 直接使用

Windows x64 便携版：运行 `release/YMarkdownG-0.2.1-Windows-x64.exe`，无需安装 Node.js。也可以运行解包目录中的 `release/win-unpacked/YMarkdownG.exe`，解包目录的其他文件须一起保留。

首次启动自动创建并打开系统“文档”目录下的 `YMarkdownG` 文件夹。点击左上角笔记空间按钮，可通过系统对话框选择其他本地文件夹，之后启动会恢复该空间。工作区菜单可以在文件管理器中打开当前目录。

## 编辑和动效

- Markdown 源码、分屏即时预览和阅读模式。
- 代码块语法高亮、语言标记、行号和复制按钮；代码仅展示，不执行。
- 标题大纲、全文搜索、收藏、Markdown 导入和系统另存为导出。
- Neovim 风格块状光标，平滑跟随点击、方向键和跨行跳转，带短暂拖影。
- 打字时提供光标亮度和轻微扩散光晕反馈，不人为延迟输入、不抖动整个页面。
- 「外观 → 动效」可开关平滑光标、拖影，调整动画时长和反馈强度；强度设为 0 可关闭反馈。
- 遵循系统“减少动态效果”设置；动画独立于文档 DOM，不改写文字或接管输入法。
- 自定义主题、主题色、背景图片、图片透明度、编辑区不透明度、背景模糊、字体、字号、行高和页面宽度。背景面板的「上传背景图片」支持选择本地图片，透明度即时生效并随重启恢复。

| 快捷键                 | 功能               |
| ---------------------- | ------------------ |
| Ctrl / Cmd + P         | 快速打开笔记       |
| Ctrl / Cmd + S         | 立即保存到磁盘     |
| Ctrl / Cmd + B / I     | 粗体 / 斜体        |
| Ctrl / Cmd + Shift + F | 专注模式           |
| Esc                    | 退出专注或关闭弹窗 |

## 磁盘笔记空间

通过 EXPLORER 旁的 `+` 创建目录，支持 `学习笔记/前端/React` 这样的多级路径。新建笔记时选择名称和目录，编辑后约 500 ms 自动写入 `.md` 文件。退出时立即补写尚未保存的内容；写入失败会保留窗口并提示处理。

```text
用户选择的笔记目录/
├── 学习笔记/
│   └── 前端/
│       └── React/
│           └── Hooks 学习.md
├── 日常随记/
│   └── 今日灵感.md
└── .ymarkdowng-trash/   # 删除笔记的恢复副本
```

- 同名新文件添加数字后缀，「更多操作 → 移动笔记」调整目录。
- 临时文件加替换的写入方式；写入前核对原内容，外部冲突时暂停覆盖。
- 删除先保存副本到 `.ymarkdowng-trash`。恢复时从文件管理器移回正常目录，然后重新打开空间。
- 已有文件保留文件名，修改一级标题不会自动重命名磁盘文件。
- 仅访问已打开空间，不跟随其中的符号链接或目录联接。
- 外观设置与最近工作区保存在 Electron 用户数据目录。

## 开发与构建

需要 Node.js 22.12+。默认开发入口打开独立桌面窗口：

```powershell
npm install
npm run dev
```

```powershell
npm start                  # 构建后运行桌面程序，无需 Vite 服务
npm run package:win        # Windows x64 便携 exe
npm run package:installer  # 可选 Windows 安装程序
npm run build              # TypeScript 检查和界面构建
npm test                   # 原生磁盘测试 + Chromium 回归测试
npm run test:desktop       # 真实 Electron 测试（需要先 build）
node scripts/test-desktop.mjs release/win-unpacked/YMarkdownG.exe
node scripts/test-portable.mjs # 最终单文件 EXE 的启动、写入与背景验证
```

首次安装依赖需要下载 Electron 二进制。如果官方源不可达，可仅为当前终端设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，再运行 `node node_modules/electron/install.js`；下载使用 Electron 包内校验值验证。

打包组件下载超时时，可为当前终端设置 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 后重新打包，组件仍按内置校验值验证。

`npm run dev:web` 仅保留作界面开发和回归测试使用，桌面发行版从本地资源加载。构建产物位于 `release/`，不提交二进制到 Git。

## 实现与图标

图标为折角文档与 `YMG` 字样：`public/icon.svg`、`public/icon-512.png`、`public/icon-192.png`、`public/favicon.ico`。

Electron 主进程负责原生对话框与磁盘操作，隔离的 preload 提供有限接口。渲染进程关闭 Node 集成并启用沙箱；Markdown HTML 经 DOMPurify 清理。界面使用 React、TypeScript、CodeMirror 6、marked、highlight.js，光标动画基于 ViewPlugin 和 requestAnimationFrame。

## 当前边界

- 参考 Neovim 视觉风格，尚未实现 Vim 模态操作；即时渲染采用分屏，尚未实现 Typora 式原位编辑。
- Windows x64 已进行本机运行验证；macOS 双架构和 Linux x64 在对应 GitHub 原生环境构建。发行包暂未签名，macOS 未公证。
- 单个空间最多读取 2000 篇、24 层目录，单篇笔记上限 5 MB。跳过隐藏目录和 `node_modules`。
- 背景图片支持 JPG、PNG、WebP、GIF，不设固定体积限制。
- 暂无文件监听、外部修改合并、云同步或插件系统。磁盘空间收藏目前仅在本次打开期间保留。
- Markdown 相对路径图片尚未映射到磁盘目录，可使用 HTTPS 图片地址。

测试覆盖文件创建、并发保存、移动、回收、重名、外部冲突和路径约束；桌面测试覆盖本地页面加载、接口隔离、光标实际移动、中文 IME、动效设置、退出补写及重启恢复。

## 目录与更新

右键目录可新建子目录、在此创建笔记、重命名、移动和删除。目录和笔记均可拖至目标目录或根目录。删除整个目录会连同附属文件移入回收目录。

背景图片通过原生对话框选取，并复制到用户数据目录的 backgrounds 文件夹，设置只保存资源 URI，不受 localStorage 容量限制。

软件启动后和每 6 小时检查 GitHub Releases。Windows NSIS 安装版和 Linux AppImage 可自动下载更新，用户选择保存并重启后安装；macOS 未签名版及 Windows 便携版使用下载替换方式。跨版本安装尚未完成端到端实测。

macOS 构建命令：npm run package:mac -- --arm64 或 --x64。Linux：npm run package:linux。
