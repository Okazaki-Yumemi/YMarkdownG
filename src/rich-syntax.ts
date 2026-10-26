import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Syntax hints are decorations: they never enter the saved document or clipboard. */
export function richSyntax(edit: () => void) {
  return Extension.create({
    name: "activeMarkdownSyntax",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations(state) {
              const { $from, empty } = state.selection;
              if (!empty || !$from.depth) return DecorationSet.empty;
              const decorations: Decoration[] = [];
              const marker = (position: number, text: string, side: number) => {
                decorations.push(
                  Decoration.widget(
                    position,
                    () => {
                      const span = document.createElement("span");
                      span.className = "rich-syntax";
                      span.dataset.syntax = text;
                      span.contentEditable = "false";
                      span.setAttribute("aria-hidden", "true");
                      span.title = "点击编辑当前块 Markdown（Alt+Enter）";
                      span.onmousedown = (event) => {
                        event.preventDefault();
                        edit();
                      };
                      return span;
                    },
                    {
                      side,
                      key: `${position}:${side}:${text}`,
                      ignoreSelection: true,
                    },
                  ),
                );
              };
              const parent = $from.parent;
              if (parent.type.name === "heading")
                marker($from.start(), "#".repeat(parent.attrs.level) + " ", -1);
              let offset = $from.start();
              parent.forEach((node) => {
                const end = offset + node.nodeSize;
                if (node.isText && $from.pos >= offset && $from.pos <= end) {
                  const symbols: Record<string, string> = {
                    bold: "**",
                    italic: "*",
                    strike: "~~",
                    code: "`",
                  };
                  const marks = node.marks
                    .map((mark) => symbols[mark.type.name] || "")
                    .join("");
                  if (marks) {
                    marker(offset, marks, -1);
                    marker(end, [...marks].reverse().join(""), 1);
                  }
                }
                offset = end;
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}
