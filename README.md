# YMarkdownG

可自定义背景、主题和排版的 Markdown 笔记编辑器。界面参考 Neovim，采用深蓝主题、细边框分屏、行号、等宽字体与状态栏。

目前是本地运行的 Web 应用，需要 Node.js 22.12+。选择磁盘笔记空间请使用桌面 Chrome 或 Edge，通过 localhost 打开。

图标采用折角文档与 `YMG` 字样，资源位于 `public/icon.svg`、`public/icon-512.png`、`public/icon-192.png` 和 `public/favicon.ico`，包含矢量、透明 PNG 与 Windows 多尺寸 ICO。

## 启动

```powershell
npm install
npm run dev
```

访问终端显示的本地地址，通常为 `http://127.0.0.1:5173`。

```powershell
npm run build    # TypeScript 检查与生产构建，输出到 dist/
npm run preview  # 预览生产构建
npm test         # Playwright 浏览器测试，需要本机安装 Chrome
```

## 笔记空间

点击左上角工作区按钮，选择「打开本地笔记目录」，授权文件夹读写权限。可打开空文件夹或已有 Markdown 目录。切换空间不会把示例笔记自动写入所选目录。

点击 EXPLORER 旁的 `+` 创建目录，支持 `学习笔记/前端/React` 这样的多级路径。新建笔记时选择目录和名称，编辑后约 500 ms 自动写入真实 `.md` 文件。右上角显示写入状态，失败时可以点击重试或导出备份。

```text
用户选择的笔记目录/
├── 学习笔记/
│   └── 前端/
│       └── React/
│           └── Hooks 学习.md
├── 日常随记/
│   └── 今日灵感.md
└── .ymarkdowng-trash/   # 删除的磁盘笔记备份
```

- 通过右上角「更多操作 → 移动笔记」调整笔记所在目录。
- 同名新文件自动添加数字后缀，不覆盖已有文件。
- 已有文件保留原文件名；修改 Markdown 一级标题会更新界面标题，不自动重命名磁盘文件。
- 检测到外部修改、移动或删除时暂停覆盖，提示先导出内存内容、再重新打开空间。当前不提供自动合并或文件监听。
- 删除磁盘笔记会先备份到 `.ymarkdowng-trash`，再删除原文件。恢复时用文件管理器将文件移回正常目录，并重新打开空间。
- 浏览器记住最近一次选择的目录，刷新后可从工作区菜单重新打开，必要时需要再次授权。
- 未选择磁盘目录时，笔记和空目录保存在当前浏览器的 localStorage；清理站点数据会删除浏览器空间，请导出重要笔记。
- 磁盘空间的收藏状态目前仅在本次打开期间保留；笔记正文始终是普通 Markdown。

## 编辑与渲染

- 源码、分屏和阅读三种视图，输入时即时渲染。
- 标题、引用、表格、任务列表、链接、图片与代码块。
- 编辑区代码语法高亮；预览区常用语言代码块高亮、行号、语言标签和复制按钮。未知语言按纯文本显示，代码仅展示，不执行。
- 全文搜索、收藏、标题大纲和快速打开。
- Markdown 文件导入与导出。
- 亮色/深色主题、预设与自选主题色、六种背景选项、背景图片上传、纸张不透明度和背景模糊。
- 正文字体、字号、行高、页面宽度与专注模式。
- HTML 经 DOMPurify 清理。

快捷键：

| 快捷键                 | 功能                   |
| ---------------------- | ---------------------- |
| Ctrl / Cmd + P         | 快速查找并打开笔记     |
| Ctrl / Cmd + S         | 导出当前 Markdown      |
| Ctrl / Cmd + B         | 插入粗体               |
| Ctrl / Cmd + I         | 插入斜体               |
| Ctrl / Cmd + Shift + F | 切换专注模式           |
| Esc                    | 退出专注模式或关闭弹窗 |

这里参考的是 Neovim 的界面风格，目前未实现 Vim 模态按键，也未实现 Typora 式原位富文本编辑；即时渲染采用源码与预览分屏。

## 当前边界

- 单个空间最多读取 2000 篇、24 层目录，单篇读取上限 5 MB；跳过隐藏目录和 `node_modules`。
- 背景图片支持 JPG、PNG、WebP、GIF，最大 3 MB，保存在浏览器中。
- 本地目录读写依赖 [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)，需要用户授权和安全上下文。
- 当前未打包 Windows 安装程序，无云同步、Git 自动同步、多人协作或插件系统。
- Markdown 中相对路径图片尚未映射到所选磁盘目录，可使用 HTTPS 图片地址。

## 技术与验证

React + TypeScript + Vite，CodeMirror 6 编辑，marked 渲染，highlight.js 高亮，DOMPurify 清理 HTML。

Playwright 使用 Chromium 验证编辑、代码高亮、导入导出、存储恢复、外观和窄屏布局。目录存储测试以浏览器真实 OPFS 文件句柄验证嵌套目录、文件内容、移动、回收目录、重名处理与冲突保护；系统文件夹选择器的授权交互需在本机手动完成。
