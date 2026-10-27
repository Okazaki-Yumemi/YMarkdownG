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
import { mathToken, renderMath, imageURL } from "./markdown";
import { SettingsDialog } from "./SettingsDialog";
import { useRichMotion } from "./rich-motion";
import type { MotionOptions } from "./editor-motion";
import { RichSource } from "./rich-source";
import { richSyntax } from "./rich-syntax";
const lowlight = createLowlight(common);
export type RichEditorHandle = {
  flush: () => string | undefined;
  hasDraft: () => boolean;
  insert: (before: string, after?: string) => void;
  focus: () => void;
  insertImage: (src: string) => void;
  resolveImage: (token: string, src: string | null) => void;
};
export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    motion: MotionOptions;
    toolbar: boolean;
    assetBase?: string;
    onImagePaste: (file: File) => void;
  }
>(function RichEditor(
  { value, onChange, motion, toolbar, assetBase, onImagePaste },
  ref,
) {
  const imagePasteRef = useRef(onImagePaste);
  imagePasteRef.current = onImagePaste;
  const baseRef = useRef(assetBase);
  baseRef.current = assetBase;
  const surface = useRef<HTMLDivElement>(null),
    lastValue = useRef(value),
    callback = useRef(onChange);
  callback.current = onChange;
  const source = useRef(new RichSource());
  const openSource = useRef<() => void>(() => {});
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const sourcePanel = useRef<HTMLDivElement>(null);
  const [sourceHeight, setSourceHeight] = useState(180);
  const [blockSource, setBlockSource] = useState<{
    index: number;
    from: number;
    text: string;
    top: number;
    height: number;
  } | null>(null);
  const draftRef = useRef(blockSource);
  draftRef.current = blockSource;
  const flushSource = useRef<() => string | undefined>(() => undefined);
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
    const localImage = Image.extend({
      addNodeView:
        () =>
        ({ node }) => {
          const dom = document.createElement("img");
          const update = (next: typeof node) => {
            if (next.type.name !== "image") return false;
            dom.src = imageURL(next.attrs.src || "", baseRef.current);
            dom.alt = next.attrs.alt || "图片";
            dom.dataset.markdownSrc = next.attrs.src || "";
            return true;
          };
          update(node);
          return { dom, update };
        },
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
      localImage.configure({ allowBase64: true, inline: true }),
      rawBlock,
      rawInline,
      math(true),
      math(false),
      Markdown,
      richSyntax(() => openSource.current()),
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
      handleKeyDown: (_view, event) => {
        if (event.altKey && event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          openSource.current();
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor }) => source.current.reset(editor, lastValue.current),
    onUpdate: ({ editor }) => {
      const markdown = source.current.serialize(editor);
      lastValue.current = markdown;
      callback.current(markdown);
    },
  });
  openSource.current = () => {
    if (!editor || blockSource) return;
    // A keydown may arrive before the browser's asynchronous selectionchange.
    const selection = window.getSelection();
    if (
      selection?.anchorNode &&
      selection.focusNode &&
      editor.view.dom.contains(selection.anchorNode) &&
      editor.view.dom.contains(selection.focusNode)
    ) {
      const from = editor.view.posAtDOM(
        selection.anchorNode,
        selection.anchorOffset,
      );
      const to = editor.view.posAtDOM(
        selection.focusNode,
        selection.focusOffset,
      );
      editor.commands.setTextSelection({ from, to });
    }
    const { $from } = editor.state.selection;
    const index = $from.index(0);
    if (index >= editor.state.doc.childCount) return;
    let from = 0;
    for (let i = 0; i < index; i++) from += editor.state.doc.child(i).nodeSize;
    const dom = editor.view.nodeDOM(from) as HTMLElement | null;
    if (!dom || !surface.current) return;
    const bounds = dom.getBoundingClientRect();
    setBlockSource({
      index,
      from,
      text: source.current.block(editor, index),
      top: bounds.top - surface.current.getBoundingClientRect().top,
      height: bounds.height,
    });
  };
  const applySource = (focus = true) => {
    if (!editor || !blockSource) return;
    const markdown = source.current.replace(
      editor,
      blockSource.index,
      blockSource.text,
    );
    setBlockSource(null);
    editor.commands.setContent(markdown, {
      contentType: "markdown",
      emitUpdate: false,
    });
    source.current.reset(editor, markdown);
    lastValue.current = markdown;
    callback.current(markdown);
    editor.commands.setTextSelection(
      Math.min(blockSource.from + 1, editor.state.doc.content.size),
    );
    if (focus) editor.view.focus();
    return markdown;
  };
  flushSource.current = () => applySource(false);
  useEffect(() => {
    if (!blockSource) return;
    sourceInput.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".block-source-editor"))
        applySource(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [blockSource]);
  useEffect(() => {
    if (!blockSource || !sourcePanel.current) return;
    const observer = new ResizeObserver(() => {
      if (sourcePanel.current)
        setSourceHeight(sourcePanel.current.offsetHeight + 12);
    });
    observer.observe(sourcePanel.current);
    return () => observer.disconnect();
  }, [!!blockSource]);
  useEffect(() => {
    if (blockSource) sourcePanel.current?.scrollIntoView({ block: "nearest" });
  }, [sourceHeight, !!blockSource]);
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    const selection = editor.state.selection;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
    source.current.reset(editor, value);
    setBlockSource(null);
    editor.commands.setTextSelection({
      from: Math.min(selection.from, editor.state.doc.content.size),
      to: Math.min(selection.to, editor.state.doc.content.size),
    });
  }, [editor, value]);
  useEffect(() => {
    editor?.view.dom
      .querySelectorAll<HTMLImageElement>("img[data-markdown-src]")
      .forEach(
        (img) => (img.src = imageURL(img.dataset.markdownSrc || "", assetBase)),
      );
  }, [editor, assetBase]);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((file) =>
        /^image\/(png|jpeg|gif|webp)$/.test(file.type),
      );
      if (!file) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      imagePasteRef.current(file);
    };
    dom.addEventListener("paste", paste, true);
    return () => dom.removeEventListener("paste", paste, true);
  }, [editor]);
  useRichMotion(editor, surface, motion);
  const inTable = useEditorState({
    editor,
    selector: ({ editor }) => editor?.isActive("table") || false,
  });
  useImperativeHandle(
    ref,
    () => ({
      flush: () => flushSource.current(),
      hasDraft: () => !!draftRef.current,
      focus: () => editor?.commands.focus(),
      insertImage: (src) => {
        if (editor)
          editor
            .chain()
            .focus()
            .setTextSelection(editor.state.selection.to)
            .insertContent({ type: "image", attrs: { src, alt: "图片" } })
            .run();
      },
      resolveImage: (token, src) => {
        if (!editor) return;
        const tr = editor.state.tr;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "image" && node.attrs.src === token) {
            if (src) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src });
            else tr.delete(pos, pos + node.nodeSize);
          }
        });
        if (tr.docChanged) editor.view.dispatch(tr);
      },
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
      <div className={`rich-tools ${!toolbar ? "toolbar-hidden" : ""}`}>
        <button
          title="编辑当前块 Markdown（Alt+Enter）"
          onClick={() => openSource.current()}
        >
          当前块源码
        </button>
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
          {blockSource && (
            <div
              ref={sourcePanel}
              className="block-source-editor"
              style={{
                top: blockSource.top,
                minHeight: Math.min(
                  blockSource.height,
                  window.innerHeight * 0.55,
                ),
              }}
            >
              <style>{`.rich-document > :nth-child(${blockSource.index + 1}) { visibility: hidden; min-height: ${sourceHeight}px; }`}</style>
              <textarea
                ref={sourceInput}
                aria-label="当前块 Markdown"
                spellCheck={false}
                value={blockSource.text}
                style={{
                  minHeight: 100,
                  height: Math.min(
                    Math.max(100, blockSource.height),
                    window.innerHeight * 0.45,
                  ),
                }}
                onChange={(event) => {
                  setBlockSource({ ...blockSource, text: event.target.value });
                  window.desktop?.setDirty(true);
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setBlockSource(null);
                    editor?.view.focus();
                  } else if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    applySource();
                  } else if (event.key === "Tab") {
                    event.preventDefault();
                    const input = event.currentTarget;
                    const start = input.selectionStart,
                      end = input.selectionEnd;
                    setBlockSource({
                      ...blockSource,
                      text:
                        blockSource.text.slice(0, start) +
                        "  " +
                        blockSource.text.slice(end),
                    });
                    requestAnimationFrame(() =>
                      input.setSelectionRange(start + 2, start + 2),
                    );
                  }
                }}
              />
              <div>
                <span>Markdown · Ctrl/⌘+Enter 应用 · Esc 取消</span>
                <button
                  onClick={() => {
                    setBlockSource(null);
                    editor?.commands.focus();
                  }}
                >
                  取消
                </button>
                <button onClick={() => applySource()}>应用</button>
              </div>
            </div>
          )}
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
