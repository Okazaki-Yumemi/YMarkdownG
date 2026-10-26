const { BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
let mathCSS;
async function getMathCSS() {
  if (!mathCSS)
    mathCSS = (async () => {
      const cssPath = require.resolve("katex/dist/katex.min.css");
      let css = await fs.readFile(cssPath, "utf8");
      const urls = [
        ...new Set(
          [...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map((match) => match[1]),
        ),
      ];
      for (const url of urls) {
        const bytes = await fs.readFile(path.join(path.dirname(cssPath), url));
        const ext = path.extname(url).slice(1);
        css = css.replaceAll(
          `url(${url})`,
          `url(data:font/${ext};base64,${bytes.toString("base64")})`,
        );
      }
      return css;
    })();
  return mathCSS;
}
const styles = `
@page { size: A4; margin: 18mm 16mm; }
body { color:#202634; background:white; font:11pt/1.75 system-ui,"Microsoft YaHei",sans-serif; overflow-wrap:anywhere; }
h1,h2,h3,h4 { line-height:1.35; break-after:avoid; }
h1 { font-size:25pt; border-bottom:1px solid #d8dee9; padding-bottom:10px; }
h2 { font-size:18pt; margin-top:28px; } h3 { font-size:14pt; }
p,li { orphans:3; widows:3; } a { color:#2563a7; } img { max-width:100%; max-height:230mm; object-fit:contain; }
pre { white-space:pre-wrap; background:#f3f5f8; border:1px solid #dce1e8; border-radius:4px; padding:12px; font-size:9pt; }
code { font-family:"Cascadia Code",Consolas,monospace; } :not(pre)>code { background:#f1f3f6; padding:2px 4px; }
blockquote { border-left:3px solid #7894b7; margin-left:0; padding-left:16px; color:#536277; }
table { border-collapse:collapse; width:100%; } th,td { border:1px solid #ccd3dd; padding:6px 9px; } th { background:#eef2f7; }
tr,img { break-inside:avoid; } thead { display:table-header-group; }
.code-header { color:#66788c; font-size:9pt; } button { display:none; }
.hljs-keyword,.hljs-selector-tag { color:#8c3b91; } .hljs-string,.hljs-attr { color:#2f704f; }
.hljs-number,.hljs-literal { color:#a35418; } .hljs-comment { color:#77818c; }
`;
async function writePDF(html, destination) {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  printWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  try {
    const mathStyle = await getMathCSS();
    const document = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: ymg-note:; font-src data:; style-src 'unsafe-inline';"><style>${mathStyle} ${styles}</style></head><body>${html}</body></html>`;
    await printWindow.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(document),
    );
    await printWindow.webContents.executeJavaScript(
      `Promise.race([Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; }))]), new Promise(resolve => setTimeout(resolve, 5000))])`,
    );
    const buffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
      generateDocumentOutline: true,
    });
    await fs.writeFile(destination, buffer);
  } finally {
    printWindow.destroy();
  }
}
module.exports = { writePDF };
