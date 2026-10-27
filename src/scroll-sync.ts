import { useEffect, type RefObject } from "react";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
export function useScrollSync(
  editor: RefObject<ReactCodeMirrorRef | null>,
  preview: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  mode: string,
  html: string,
  identity = "",
) {
  useEffect(() => {
    if (!enabled || mode !== "split") return;
    let initFrame = 0;
    let dispose: (() => void) | undefined;
    const attach = () => {
      const view = editor.current?.view,
        target = preview.current;
      if (!view || !target) {
        initFrame = requestAnimationFrame(attach);
        return;
      }
      const source = view.scrollDOM;
      let sourceExpected: number | null = null,
        previewExpected: number | null = null;
      let leader: "source" | "preview" = "source",
        frame = 0;
      function pairs() {
        const sourceMax = Math.max(
            0,
            source.scrollHeight - source.clientHeight,
          ),
          previewMax = Math.max(0, target!.scrollHeight - target!.clientHeight);
        const top = target!.getBoundingClientRect().top;
        const offset =
          view!.documentTop -
          source.getBoundingClientRect().top +
          source.scrollTop;
        const anchors = Array.from(
          target!.querySelectorAll<HTMLElement>(
            ".markdown-body > .md-source-block",
          ),
        ).map((el) => {
          const line = Math.max(
            1,
            Math.min(view!.state.doc.lines, Number(el.dataset.sourceLine) || 1),
          );
          return [
            Math.min(
              sourceMax,
              Math.max(
                0,
                view!.lineBlockAt(view!.state.doc.line(line).from).top + offset,
              ),
            ),
            Math.min(
              previewMax,
              Math.max(
                0,
                el.getBoundingClientRect().top - top + target!.scrollTop,
              ),
            ),
          ];
        });
        return {
          anchors: [
            [0, 0],
            ...anchors.filter(
              (pair) =>
                pair[0] > 0 &&
                pair[0] < sourceMax &&
                pair[1] > 0 &&
                pair[1] < previewMax,
            ),
            [sourceMax, previewMax],
          ],
          sourceMax,
          previewMax,
        };
      }
      function sync(from: "source" | "preview") {
        const { anchors, sourceMax, previewMax } = pairs();
        if (!sourceMax || !previewMax) return;
        const axis = from === "source" ? 0 : 1,
          other = 1 - axis;
        const current =
          from === "source" ? source.scrollTop : target!.scrollTop;
        const sorted = anchors
          .filter((a, i) => i === 0 || a[axis] > anchors[i - 1][axis])
          .sort((a, b) => a[axis] - b[axis]);
        let a = sorted[0],
          b = sorted.at(-1)!;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i][axis] >= current) {
            a = sorted[i - 1];
            b = sorted[i];
            break;
          }
        }
        const ratio = Math.max(
          0,
          Math.min(1, (current - a[axis]) / Math.max(1, b[axis] - a[axis])),
        );
        const value = a[other] + ratio * (b[other] - a[other]);
        if (from === "source") {
          previewExpected = value;
          target!.scrollTop = value;
        } else {
          sourceExpected = value;
          source.scrollTop = value;
        }
      }
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => sync(leader));
      };
      const onSource = () => {
        if (
          sourceExpected !== null &&
          Math.abs(source.scrollTop - sourceExpected) < 2
        ) {
          sourceExpected = null;
          return;
        }
        sourceExpected = null;
        leader = "source";
        schedule();
      };
      const onPreview = () => {
        if (
          previewExpected !== null &&
          Math.abs(target.scrollTop - previewExpected) < 2
        ) {
          previewExpected = null;
          return;
        }
        previewExpected = null;
        leader = "preview";
        schedule();
      };
      const sourceInput = () => {
        sourceExpected = null;
        leader = "source";
      };
      const previewInput = () => {
        previewExpected = null;
        leader = "preview";
      };
      source.addEventListener("scroll", onSource, { passive: true });
      target.addEventListener("scroll", onPreview, { passive: true });
      source.addEventListener("wheel", sourceInput, { passive: true });
      target.addEventListener("wheel", previewInput, { passive: true });
      const observer = new ResizeObserver(schedule);
      observer.observe(source);
      observer.observe(target);
      const article = target.querySelector("article");
      if (article) observer.observe(article);
      target.addEventListener("load", schedule, true);
      dispose = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        source.removeEventListener("scroll", onSource);
        target.removeEventListener("scroll", onPreview);
        source.removeEventListener("wheel", sourceInput);
        target.removeEventListener("wheel", previewInput);
        target.removeEventListener("load", schedule, true);
      };
    };
    attach();
    return () => {
      cancelAnimationFrame(initFrame);
      dispose?.();
    };
  }, [editor, preview, enabled, mode, html, identity]);
}
