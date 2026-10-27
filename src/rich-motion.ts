import { useEffect, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { MotionOptions } from "./editor-motion";
export function useRichMotion(
  editor: Editor | null,
  surface: RefObject<HTMLDivElement | null>,
  options: MotionOptions,
) {
  useEffect(() => {
    const root = surface.current;
    if (!editor || !root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const layer = document.createElement("div");
    layer.className = "ymg-motion-layer rich-motion-layer";
    layer.setAttribute("aria-hidden", "true");
    const caret = document.createElement("div");
    caret.className = "ymg-animated-caret";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("ymg-caret-trail");
    const polygon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon",
    );
    svg.append(polygon);
    layer.append(svg, caret);
    root.append(layer);
    let frame = 0,
      measureFrame = 0,
      last = 0,
      initialized = false,
      composing = false,
      feedbackRequested = false;
    let target = { x: 0, y: 0, h: 20, w: 8 },
      point = { x: 0, y: 0 },
      tail = { x: 0, y: 0 };
    const configure = () => {
      root.classList.toggle(
        "rich-motion-enabled",
        options.enabled && !reduced.matches,
      );
      if (!options.enabled || reduced.matches) {
        layer.hidden = true;
        caret.getAnimations().forEach((animation) => animation.cancel());
      }
    };
    configure();
    reduced.addEventListener("change", configure);
    const paintCaret = () => {
      caret.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
      caret.style.width = `${target.w}px`;
      caret.style.height = `${target.h}px`;
    };
    const tick = (time: number) => {
      frame = 0;
      const dt = Math.min(40, time - last);
      last = time;
      const snap = reduced.matches || !options.enabled;
      const factor = snap
        ? 1
        : 1 - Math.exp(-dt / Math.max(12, options.duration / 3));
      point.x += (target.x - point.x) * factor;
      point.y += (target.y - point.y) * factor;
      const f = snap
        ? 1
        : 1 - Math.exp(-dt / Math.max(20, options.duration * 0.65));
      tail.x += (point.x - tail.x) * f;
      tail.y += (point.y - tail.y) * f;
      paintCaret();
      const distance = Math.hypot(point.x - tail.x, point.y - tail.y);
      polygon.setAttribute(
        "points",
        `${tail.x},${tail.y} ${tail.x + target.w},${tail.y + target.h} ${point.x + target.w},${point.y + target.h} ${point.x},${point.y}`,
      );
      polygon.style.opacity =
        options.trail && !snap && distance > 1.5 && distance < 700
          ? String(Math.min(0.3, distance / 160))
          : "0";
      if (
        Math.hypot(target.x - point.x, target.y - point.y) > 0.1 ||
        distance > 0.3
      )
        frame = requestAnimationFrame(tick);
    };
    const measure = () => {
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const visible =
          editor.isFocused &&
          (composing || editor.state.selection.empty) &&
          options.enabled &&
          !reduced.matches;
        layer.hidden = !visible;
        if (!visible) {
          feedbackRequested = false;
          return;
        }
        try {
          // During IME preedit the browser selection can be ahead of the
          // ProseMirror document. Only read its geometry; never move it.
          const selection = window.getSelection();
          let rect: DOMRect | undefined;
          if (
            selection?.focusNode &&
            editor.view.dom.contains(selection.focusNode)
          ) {
            const range = document.createRange();
            range.setStart(selection.focusNode, selection.focusOffset);
            range.collapse(true);
            const candidate = range.getClientRects()[0];
            if (candidate?.height) rect = candidate;
          }
          const position =
            rect || editor.view.coordsAtPos(editor.state.selection.head);
          const bounds = root.getBoundingClientRect();
          target = {
            x: position.left - bounds.left,
            y: position.top - bounds.top,
            h: position.bottom - position.top,
            w: 8,
          };
          if (!initialized || composing) {
            point = { ...target };
            tail = { ...target };
            initialized = true;
            paintCaret();
          }
          if (composing) {
            cancelAnimationFrame(frame);
            frame = 0;
            polygon.style.opacity = "0";
          } else if (!frame) {
            last = performance.now();
            frame = requestAnimationFrame(tick);
          }
          if (feedbackRequested && options.feedback > 0) {
            caret.getAnimations().forEach((a) => a.cancel());
            caret.animate(
              [
                {
                  filter: "brightness(1.8)",
                  boxShadow: `0 0 ${options.feedback / 4}px var(--accent)`,
                },
                { filter: "brightness(1)", boxShadow: "0 0 0 transparent" },
              ],
              { duration: 170, easing: "ease-out" },
            );
          }
        } catch {
          layer.hidden = true;
        }
        feedbackRequested = false;
      });
    };
    const input = () => {
      // compositionupdate, native input and editor update may all describe the
      // same keystroke. Coalesce them into one pulse on the next paint.
      feedbackRequested = true;
      measure();
    };
    const compositionStart = () => {
      composing = true;
      root.classList.add("is-composing");
      layer.classList.add("is-composing");
      measure();
    };
    const compositionEnd = () => {
      composing = false;
      root.classList.remove("is-composing");
      layer.classList.remove("is-composing");
      measure();
    };
    const nativeInput = (event: Event) => {
      if (composing || (event as InputEvent).isComposing) input();
    };
    editor.on("selectionUpdate", measure);
    editor.on("focus", measure);
    editor.on("blur", measure);
    editor.on("update", input);
    editor.view.dom.addEventListener("compositionstart", compositionStart);
    editor.view.dom.addEventListener("compositionupdate", input);
    editor.view.dom.addEventListener("compositionend", compositionEnd);
    editor.view.dom.addEventListener("input", nativeInput);
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(measureFrame);
      editor.off("selectionUpdate", measure);
      editor.off("focus", measure);
      editor.off("blur", measure);
      editor.off("update", input);
      editor.view.dom.removeEventListener("compositionstart", compositionStart);
      editor.view.dom.removeEventListener("compositionupdate", input);
      editor.view.dom.removeEventListener("compositionend", compositionEnd);
      editor.view.dom.removeEventListener("input", nativeInput);
      window.removeEventListener("resize", measure);
      observer.disconnect();
      reduced.removeEventListener("change", configure);
      root.classList.remove("rich-motion-enabled", "is-composing");
      layer.remove();
    };
  }, [
    editor,
    surface,
    options.enabled,
    options.trail,
    options.duration,
    options.feedback,
  ]);
}
