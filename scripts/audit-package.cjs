const asar = require("@electron/asar");
const path = require("node:path");
const fs = require("node:fs/promises");

// Runs against the actual archive on every platform, before creating installers.
module.exports = async function auditPackage(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");
  const archive = path.join(resources, "app.asar");
  const files = asar
    .listPackage(archive)
    .map((file) => file.replace(/\\/g, "/").replace(/^\//, ""));
  const bundledOnly = [
    "react",
    "react-dom",
    "lucide-react",
    "@tiptap",
    "@codemirror",
    "@uiw",
    "lowlight",
    "highlight.js",
    "marked",
    "dompurify",
  ];
  for (const dependency of bundledOnly) {
    if (files.some((file) => file.startsWith(`node_modules/${dependency}/`)))
      throw new Error(`Renderer dependency was packaged twice: ${dependency}`);
  }
  for (const file of [
    "electron/main.cjs",
    "electron/preload.cjs",
    "electron/pdf.cjs",
    "node_modules/electron-updater/out/main.js",
    "node_modules/semver/index.js",
    "node_modules/katex/dist/katex.min.css",
    "node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2",
  ]) {
    if (!files.includes(file)) throw new Error(`Missing runtime file: ${file}`);
  }
  const bytes = (await fs.stat(archive)).size;
  if (bytes > 24 * 1024 * 1024)
    throw new Error(
      `Application archive exceeds 24 MiB budget: ${bytes} bytes`,
    );
  console.log(
    `Package audit passed: ${(bytes / 1024 / 1024).toFixed(2)} MiB application archive; renderer dependencies excluded, PDF fonts and updater present.`,
  );
};
