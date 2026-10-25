import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export type MotionOptions = {
  enabled: boolean;
  duration: number;
  trail: boolean;
  feedback: number;
};
// Render decorations outside the editable DOM: cursor animation never changes document text or IME composition.
export function editorMotion(options: MotionOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      view: EditorView;
      layer: HTMLDivElement;
      caret: HTMLDivElement;
      svg: SVGSVGElement;
      polygon: SVGPolygonElement;
      target = { x: 0, y: 0, h: 20, w: 9 };
      point = { x: 0, y: 0 };
      tail = { x: 0, y: 0 };
      initialized = false;
      visible = false;
      frame = 0;
      previousTime = 0;
      destroyed = false;
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      constructor(view: EditorView) {
        this.view = view;
        this.layer = document.createElement("div");
        this.layer.className = "ymg-motion-layer";
        this.layer.setAttribute("aria-hidden", "true");
        this.svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        this.polygon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        );
        this.svg.append(this.polygon);
        this.layer.append(this.svg);
        this.caret = document.createElement("div");
        this.caret.className = "ymg-animated-caret";
        this.layer.append(this.caret);
        view.dom.append(this.layer);
        view.dom.classList.toggle("ymg-motion-enabled", options.enabled);
        view.scrollDOM.addEventListener("scroll", this.measure);
        window.addEventListener("resize", this.measure);
        this.measure();
      }
      measure = () => {
        if (this.destroyed) return;
        this.view.requestMeasure({
          key: this,
          read: (view) => {
            const selection = view.state.selection.main;
            const rect = view.coordsAtPos(selection.head);
            const bounds = view.dom.getBoundingClientRect();
            const next = view.coordsAtPos(
              Math.min(selection.head + 1, view.state.doc.length),
            );
            return rect
              ? {
                  x: rect.left - bounds.left,
                  y: rect.top - bounds.top,
                  h: rect.bottom - rect.top,
                  w:
                    next && Math.abs(next.top - rect.top) < 2
                      ? Math.max(7, Math.min(15, next.left - rect.left))
                      : 8,
                  visible: view.hasFocus && selection.empty,
                }
              : null;
          },
          write: (rect) => {
            if (!rect) {
              this.layer.hidden = true;
              return;
            }
            this.visible = rect.visible;
            this.layer.hidden = !this.visible;
            this.caret.hidden = !options.enabled;
            this.target = rect;
            if (!this.initialized || this.reduced.matches || !options.enabled) {
              this.point = { ...rect };
              this.tail = { ...rect };
              this.initialized = true;
            }
            this.start();
          },
        });
      };
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.focusChanged ||
          update.geometryChanged ||
          update.viewportChanged
        )
          this.measure();
        const typed = update.transactions.some(
          (t) => t.isUserEvent("input.type") || t.isUserEvent("delete"),
        );
        if (typed && options.feedback > 0 && !this.reduced.matches) {
          this.caret.getAnimations().forEach((a) => a.cancel());
          this.caret.animate(
            [
              {
                filter: "brightness(1.8)",
                boxShadow: `0 0 ${options.feedback / 4}px var(--accent)`,
              },
              { filter: "brightness(1)", boxShadow: "0 0 0 transparent" },
            ],
            { duration: 170, easing: "ease-out" },
          );
          const pulse = document.createElement("span");
          pulse.className = "ymg-type-pulse";
          pulse.style.left = `${this.target.x}px`;
          pulse.style.top = `${this.target.y + this.target.h / 2}px`;
          this.layer.append(pulse);
          const strength = options.feedback / 100;
          const animation = pulse.animate(
            [
              {
                transform: "translate(-50%,-50%) scale(.15)",
                opacity: strength * 0.7,
              },
              {
                transform: `translate(-50%,-50%) scale(${0.6 + strength})`,
                opacity: 0,
              },
            ],
            { duration: 240, easing: "ease-out" },
          );
          animation.onfinish = () => pulse.remove();
        }
      }
      start() {
        if (!this.frame) {
          this.previousTime = performance.now();
          this.frame = requestAnimationFrame(this.tick);
        }
      }
      tick = (time: number) => {
        this.frame = 0;
        if (this.destroyed) return;
        const dt = Math.min(40, time - this.previousTime);
        this.previousTime = time;
        const snap = this.reduced.matches || !options.enabled;
        const factor = snap
          ? 1
          : 1 - Math.exp(-dt / Math.max(12, options.duration / 3));
        this.point.x += (this.target.x - this.point.x) * factor;
        this.point.y += (this.target.y - this.point.y) * factor;
        const tailFactor = snap
          ? 1
          : 1 - Math.exp(-dt / Math.max(20, options.duration * 0.65));
        this.tail.x += (this.point.x - this.tail.x) * tailFactor;
        this.tail.y += (this.point.y - this.tail.y) * tailFactor;
        const { x, y } = this.point;
        const { h, w } = this.target;
        this.caret.style.transform = `translate3d(${x}px,${y}px,0)`;
        this.caret.style.width = `${w}px`;
        this.caret.style.height = `${h}px`;
        const distance = Math.hypot(
          this.point.x - this.tail.x,
          this.point.y - this.tail.y,
        );
        const showTrail =
          options.trail &&
          options.enabled &&
          !snap &&
          distance > 1.5 &&
          distance < 700 &&
          this.visible;
        this.polygon.style.opacity = showTrail
          ? String(Math.min(0.3, distance / 160))
          : "0";
        this.polygon.setAttribute(
          "points",
          `${this.tail.x},${this.tail.y} ${this.tail.x + w},${this.tail.y + h} ${x + w},${y + h} ${x},${y}`,
        );
        if (
          Math.hypot(this.target.x - x, this.target.y - y) > 0.1 ||
          distance > 0.3
        )
          this.frame = requestAnimationFrame(this.tick);
      };
      destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.frame);
        this.view.scrollDOM.removeEventListener("scroll", this.measure);
        window.removeEventListener("resize", this.measure);
        this.view.dom.classList.remove("ymg-motion-enabled");
        this.layer.remove();
      }
    },
  );
}
