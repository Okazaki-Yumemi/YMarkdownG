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
  if (files.some((file) => file.startsWith("node_modules/")))
    throw new Error(
      "Unexpected runtime dependency: this editor ships bundled assets only",
    );
  for (const file of [
    "electron/main.cjs",
    "electron/preload.cjs",
    "electron/document.cjs",
    "electron/pdf.cjs",
    "dist/pdf-math.css",
  ])
    if (!files.includes(file)) throw new Error(`Missing runtime file: ${file}`);
  if (
    !files.some(
      (file) =>
        file.startsWith("dist/assets/KaTeX_Main-Regular-") &&
        file.endsWith(".woff2"),
    )
  )
    throw new Error("Missing PDF/renderer formula font");
  const bytes = (await fs.stat(archive)).size;
  if (bytes > 8 * 1024 * 1024)
    throw new Error(`Application archive exceeds 8 MiB budget: ${bytes} bytes`);
  console.log(
    `Package audit passed: ${(bytes / 1024 / 1024).toFixed(2)} MiB application archive; no runtime node_modules, shared PDF fonts present.`,
  );
};
