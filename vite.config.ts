import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "pdf-math-assets",
      enforce: "post",
      generateBundle(_options, bundle) {
        // Reuse the renderer's WOFF2 files; PDF needs no second KaTeX runtime.
        let css = readFileSync(
          new URL("./node_modules/katex/dist/katex.min.css", import.meta.url),
          "utf8",
        );
        css = css.replace(
          /,\s*url\([^)]+\)\s*format\("(?:woff|truetype)"\)/g,
          "",
        );
        css = css.replace(/url\(fonts\/([^)]*)\)/g, (_match, name: string) => {
          const prefix = `assets/${name.replace(/\.woff2$/, "")}-`;
          const asset = Object.values(bundle).find(
            (entry) =>
              entry.fileName.startsWith(prefix) &&
              entry.fileName.endsWith(".woff2"),
          );
          if (!asset) {
            // Vite inlines tiny fonts instead of emitting separate assets.
            const bytes = readFileSync(
              new URL(
                `./node_modules/katex/dist/fonts/${name}`,
                import.meta.url,
              ),
            );
            if (bytes.length > 4096)
              throw new Error(`Missing PDF font: ${name}`);
            return `url(data:font/woff2;base64,${bytes.toString("base64")})`;
          }
          return `url(${asset.fileName})`;
        });
        this.emitFile({ type: "asset", fileName: "pdf-math.css", source: css });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8"),
      ).version,
    ),
  },
  server: { host: "127.0.0.1" },
});
