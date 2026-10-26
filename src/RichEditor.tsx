import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { mathToken, renderMath } from "./markdown";
import { SettingsDialog } from "./SettingsDialog";
import { useRichMotion } from "./rich-motion";
import type { MotionOptions } from "./editor-motion";
const lowlight = createLowlight(common);
export type RichEditorHandle = {
  insert: (before: string, after?: string) => void;
  focus: () => void;
};
export const RichEditor = forwardRef<
  RichEditorHandle,
  { value: string; onChange: (value: string) => void; motion: MotionOptions }
>(function RichEditor({ value, onChange, motion }, ref) {
  const surface = useRef<HTMLDivElement>(null),
    lastValue = useRef(value),
    callback = useRef(onChange);
  callback.current = onChange;
  const [formula, setFormula] = useState<{
    latex: string;
    block: boolean;
    pos?: number;
  } | null>(null);
  const extensions = useMemo(() => {
    const math = (block: boolean) =>
      Node.create({
        name: block ? "mathBlock" : "mathInline",
        group: block ? "block" : "inline",
        inline: !block,
        atom: true,
        selectable: true,
        addAttributes: () => ({ latex: { default: "" } }),
        parseHTML: () => [
          {
            tag: `${block ? "div" : "span"}[data-math-node="${block ? "block" : "inline"}"]`,
            getAttrs: (el) => ({
              latex: (el as HTMLElement).dataset.latex || "",
            }),
          },
        ],
        renderHTML: ({ node, HTMLAttributes }) => [
          block ? "div" : "span",
          mergeAttributes(HTMLAttributes, {
            "data-math-node": block ? "block" : "inline",
            "data-latex": node.attrs.latex,
          }),
          node.attrs.latex,
        ],
        markdownTokenName: block ? "mathBlock" : "mathInline",
        markdownTokenizer: {
          name: block ? "mathBlock" : "mathInline",
          level: block ? "block" : "inline",
          start: (src) =>
            block ? src.search(/(?:^|\n)(?:\$\$|\\\[)/) : src.search(/\$|\\\(/),
          tokenize: (src) => mathToken(src, block),
        },
        parseMarkdown: (token, h) =>
          h.createNode(block ? "mathBlock" : "mathInline", {
            latex: token.text,
          }),
        renderMarkdown: (node) =>
          block
            ? `$$\n${node.attrs?.latex || ""}\n$$`
            : `$${node.attrs?.latex || ""}$`,
        addInputRules() {
          if (block) return [];
          return [
            new InputRule({
              find: /(?<!\$)\$([^$\n]+)\$$/,
              handler: ({ state, range, match }) => {
                state.tr
                  .replaceWith(
                    range.from,
                    range.to,
                    this.type.create({ latex: match[1] }),
                  )
                  .scrollIntoView();
              },
            }),
          ];
        },
        addNodeView:
          () =>
          ({ node, getPos }) => {
            const dom = document.createElement(block ? "div" : "span");
            dom.className = block ? "rich-math math-block" : "rich-math";
            dom.contentEditable = "false";
            dom.innerHTML = renderMath(node.attrs.latex, block);
            dom.title = "双击编辑公式";
            dom.ondblclick = (event) => {
              event.preventDefault();
              const pos = getPos();
              if (typeof pos === "number")
                setFormula({ latex: node.attrs.latex, block, pos });
            };
            return { dom, ignoreMutation: () => true };
          },
      });
    const rawBlock = Node.create({
      name: "rawMarkdown",
      group: "block",
      atom: true,
      addAttributes: () => ({ raw: { default: "" } }),
      markdownTokenName: "html",
      parseMarkdown: (token, h) =>
        h.createNode(
          token.block === false ? "rawMarkdownInline" : "rawMarkdown",
          { raw: token.raw },
        ),
      renderMarkdown: (node) => node.attrs?.raw || "",
      parseHTML: () => [{ tag: "pre[data-raw-markdown]" }],
      renderHTML: ({ node }) => [
        "pre",
        { "data-raw-markdown": "true", class: "raw-markdown" },
        ["code", {}, node.attrs.raw],
      ],
    });
    const rawInline = Node.create({
      name: "rawMarkdownInline",
      inline: true,
      group: "inline",
      atom: true,
      addAttributes: () => ({ raw: { default: "" } }),
      renderMarkdown: (node) => node.attrs?.raw || "",
      parseHTML: () => [{ tag: "span[data-raw-markdown]" }],
      renderHTML: ({ node }) => [
        "span",
        { "data-raw-markdown": "true", class: "raw-markdown" },
        node.attrs.raw,
      ],
    });
    return [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, autolink: false },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: true }),
      rawBlock,
      rawInline,
      math(true),
      math(false),
      Markdown,
    ];
  }, []);
  const editor = useEditor({
    extensions,
    content: value,
    contentType: "markdown",
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "markdown-body rich-document",
        "aria-label": "所见即所得编辑区",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      lastValue.current = markdown;
      callback.current(markdown);
    },
  });
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);
  useRichMotion(editor, surface, motion);
  const inTable = useEditorState({
    editor,
    selector: ({ editor }) => editor?.isActive("table") || false,
  });
  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(),
      insert: (before, after = "") => {
        if (!editor) return;
        const selected = editor.state.doc.textBetween(
          editor.state.selection.from,
          editor.state.selection.to,
          "\n",
        );
        if (before === "**") editor.chain().focus().toggleBold().run();
        else if (before === "*") editor.chain().focus().toggleItalic().run();
        else if (before === "\n## ")
          editor.chain().focus().toggleHeading({ level: 2 }).run();
        else if (before === "\n> ")
          editor.chain().focus().toggleBlockquote().run();
        else if (before === "\n- ")
          editor.chain().focus().toggleBulletList().run();
        else if (before === "\n1. ")
          editor.chain().focus().toggleOrderedList().run();
        else if (before.startsWith("\n```"))
          editor
            .chain()
            .focus()
            .toggleCodeBlock({ language: "javascript" })
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContent(before + (selected || "文字") + after, {
              contentType: "markdown",
            })
            .run();
      },
    }),
    [editor],
  );
  return (
    <section className="rich-editor">
      <div className="rich-tools">
        <span>所见即所得</span>
        <button onClick={() => setFormula({ latex: "E = mc^2", block: true })}>
          插入公式
        </button>
        <button
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          插入表格
        </button>
        {inTable && (
          <>
            <button onClick={() => editor?.chain().focus().addRowAfter().run()}>
              增加一行
            </button>
            <button
              onClick={() => editor?.chain().focus().addColumnAfter().run()}
            >
              增加一列
            </button>
            <button onClick={() => editor?.chain().focus().deleteTable().run()}>
              删除表格
            </button>
          </>
        )}
      </div>
      <div className="rich-scroll">
        <div className="rich-surface" ref={surface}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {formula && (
        <SettingsDialog label="编辑公式" onClose={() => setFormula(null)}>
          <form
            className="math-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editor) return;
              const type = formula.block ? "mathBlock" : "mathInline";
              if (formula.pos !== undefined)
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(formula.pos)
                  .updateAttributes(type, { latex: formula.latex })
                  .run();
              else
                editor
                  .chain()
                  .focus()
                  .insertContent({ type, attrs: { latex: formula.latex } })
                  .run();
              setFormula(null);
            }}
          >
            <h2>编辑 LaTeX 公式</h2>
            <textarea
              autoFocus
              aria-label="LaTeX 公式"
              rows={5}
              value={formula.latex}
              onChange={(e) =>
                setFormula({ ...formula, latex: e.target.value })
              }
            />
            <div
              className="formula-preview"
              dangerouslySetInnerHTML={{
                __html: renderMath(formula.latex, formula.block),
              }}
            />
            <div>
              <button type="button" onClick={() => setFormula(null)}>
                取消
              </button>
              <button className="primary" type="submit">
                应用公式
              </button>
            </div>
          </form>
        </SettingsDialog>
      )}
    </section>
  );
});
