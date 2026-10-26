import type { Editor } from "@tiptap/core";
import type { Node as DocumentNode } from "@tiptap/pm/model";

type Block = { node: DocumentNode; raw: string };

/** Reuse the exact source of unchanged top-level blocks. Never guess a mapping. */
export class RichSource {
  private blocks: Block[] = [];
  private source = "";
  private document?: DocumentNode;
  private eol = "\n";
  private keys = new WeakMap<DocumentNode, string>();
  private original = new Map<string, string[]>();

  private key(node: DocumentNode) {
    let key = this.keys.get(node);
    if (key === undefined) {
      key = JSON.stringify(node.toJSON());
      this.keys.set(node, key);
    }
    return key;
  }

  reset(editor: Editor, source: string) {
    this.source = source;
    this.document = editor.state.doc;
    this.eol = source.includes("\r\n") ? "\r\n" : "\n";
    this.blocks = [];
    this.original.clear();
    const manager = editor.markdown!;
    const tokens = manager.instance.lexer(source);
    let pending = "";
    const blocks: Block[] = [];
    try {
      for (const token of tokens) {
        if (token.type === "space") {
          if (blocks.length) blocks[blocks.length - 1].raw += token.raw;
          else pending += token.raw;
          continue;
        }
        const parsed = editor.schema.nodeFromJSON(
          manager.parse(token.raw.replace(/\n+$/, "")),
        );
        if (parsed.childCount !== 1) return;
        blocks.push({ node: parsed.firstChild!, raw: pending + token.raw });
        pending = "";
      }
      // Tiptap represents a final newline as an editable empty paragraph.
      while (blocks.length < editor.state.doc.childCount) {
        const node = editor.state.doc.child(blocks.length);
        if (node.type.name !== "paragraph" || node.content.size) return;
        blocks.push({ node, raw: "" });
      }
      if (
        blocks.length === editor.state.doc.childCount &&
        blocks.every((block, i) => block.node.eq(editor.state.doc.child(i))) &&
        blocks.map((block) => block.raw).join("") ===
          source.replace(/\r\n/g, "\n")
      )
        this.blocks = blocks.map((block, i) => ({
          ...block,
          node: editor.state.doc.child(i),
          raw: block.raw.replace(/\n/g, this.eol),
        }));
      for (const block of this.blocks) {
        const key = this.key(block.node);
        const queue = this.original.get(key) || [];
        queue.push(block.raw);
        this.original.set(key, queue);
      }
    } catch {
      // Unsupported token layouts use the normal serializer; retain no unsafe map.
    }
  }

  block(editor: Editor, index: number) {
    const node = editor.state.doc.child(index);
    const saved = this.blocks[index];
    return saved?.node.eq(node)
      ? saved.raw.replace(/(?:\r?\n)+$/, "")
      : editor.markdown!.serialize({ type: "doc", content: [node.toJSON()] });
  }

  replace(editor: Editor, index: number, text: string) {
    this.serialize(editor);
    if (this.blocks.length !== editor.state.doc.childCount) {
      this.blocks = [];
      editor.state.doc.forEach((node) =>
        this.blocks.push({
          node,
          raw:
            editor.markdown!.serialize({
              type: "doc",
              content: [node.toJSON()],
            }) +
            this.eol +
            this.eol,
        }),
      );
    }
    const blocks = this.blocks.map((block) => block.raw);
    const trailing = blocks[index]?.match(/(?:\r?\n)+$/)?.[0] || "";
    if (!text.trim()) blocks.splice(index, 1);
    else blocks[index] = text.replace(/\r?\n/g, this.eol) + trailing;
    return blocks.join("");
  }

  serialize(editor: Editor) {
    const doc = editor.state.doc;
    if (this.document?.eq(doc)) return this.source;
    const available = new Map<string, Block[]>();
    for (const block of this.blocks) {
      const key = this.key(block.node);
      const queue = available.get(key) || [];
      queue.push(block);
      available.set(key, queue);
    }
    const occurrences = new Map<string, number>();
    const blocks: Block[] = [];
    doc.forEach((node) => {
      const key = this.key(node);
      const occurrence = occurrences.get(key) || 0;
      occurrences.set(key, occurrence + 1);
      const saved = available.get(key)?.shift();
      blocks.push({
        node,
        raw:
          saved?.raw ??
          this.original.get(key)?.[occurrence] ??
          editor
            .markdown!.serialize({ type: "doc", content: [node.toJSON()] })
            .replace(/\r?\n/g, this.eol),
      });
    });
    const separator = this.eol + this.eol;
    this.source = blocks
      .map((block, i) => {
        if (
          i < blocks.length - 1 &&
          blocks[i + 1].raw &&
          !block.raw.endsWith(separator)
        ) {
          // Keep any existing whitespace, adding only the missing separator.
          block.raw += block.raw.endsWith(this.eol) ? this.eol : separator;
        }
        return block.raw;
      })
      .join("");
    this.blocks = blocks;
    this.document = doc;
    return this.source;
  }
}
