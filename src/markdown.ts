import { Marked, type TokensList } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import "katex/dist/katex.min.css";
export const escapeHTML = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function renderMath(latex: string, displayMode = false) {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxExpand: 1000,
    maxSize: 10,
  });
}
export function mathToken(src: string, block: boolean) {
  const delimiters = block
    ? [
        ["$$", "$$"],
        ["\\[", "\\]"],
      ]
    : [
        ["\\(", "\\)"],
        ["$", "$"],
      ];
  for (const [open, close] of delimiters) {
    if (!src.startsWith(open)) continue;
    if (open === "$" && (src.startsWith("$$") || /\s/.test(src[1] || "")))
      continue;
    let end = src.indexOf(close, open.length);
    while (end >= 0) {
      let slashes = 0;
      for (let i = end - 1; i >= 0 && src[i] === "\\"; i--) slashes++;
      if (slashes % 2 === 0) break;
      end = src.indexOf(close, end + close.length);
    }
    if (end < 0) continue;
    const latex = src.slice(open.length, end);
    if (
      !latex.trim() ||
      (!block && (latex.includes("\n") || /\s$/.test(latex)))
    )
      continue;
    const raw = src.slice(0, end + close.length);
    return {
      type: block ? "mathBlock" : "mathInline",
      raw,
      text: latex.trim(),
    };
  }
  return undefined;
}
const parser = new Marked({ gfm: true, breaks: true });
parser.use({
  extensions: [
    {
      name: "mathBlock",
      level: "block",
      start: (src) => src.search(/(?:^|\n)(?:\$\$|\\\[)/),
      tokenizer: (src) => mathToken(src, true),
      renderer: (token) =>
        `<div class="math-block">${renderMath(token.text, true)}</div>`,
    },
    {
      name: "mathInline",
      level: "inline",
      start: (src) => src.search(/\$|\\\(/),
      tokenizer: (src) => mathToken(src, false),
      renderer: (token) => renderMath(token.text),
    },
  ],
  renderer: {
    code({ text, lang }) {
      const language = lang?.split(/\s/)[0] || "text";
      const result = hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : escapeHTML(text);
      return `<div class="code-block"><div class="code-header"><span>${escapeHTML(language)}</span><button type="button" class="copy-code" title="复制代码">复制代码</button></div><pre><code class="hljs language-${escapeHTML(language)}">${result
        .split("\n")
        .map(
          (line, i) =>
            `<span class="code-line"><span class="code-number" aria-hidden="true">${i + 1}</span><span>${line || " "}</span></span>`,
        )
        .join("")}</code></pre></div>`;
    },
  },
});
export function renderMarkdown(content: string) {
  const tokens = parser.lexer(content.replace(/\r\n?/g, "\n"));
  let line = 1;
  const html = tokens
    .map((token) => {
      const start = line;
      line += (token.raw.match(/\n/g) || []).length;
      if (token.type === "space" || token.type === "def") return "";
      const group = [token] as TokensList;
      group.links = tokens.links;
      return `<div class="md-source-block" data-source-line="${start}" data-source-end="${line}" title="源码第 ${start} 行">${parser.parser(group)}</div>`;
    })
    .join("");
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-source-line", "data-source-end"],
  });
}
