import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FileText,
  FolderPlus,
  Pencil,
  FolderInput,
  Trash2,
} from "lucide-react";

export function FolderContextMenu({
  folder,
  x,
  y,
  onClose,
  onChild,
  onNote,
  onRename,
  onMove,
  onDelete,
}: {
  folder: string;
  x: number;
  y: number;
  onClose: (restoreFocus?: boolean) => void;
  onChild: () => void;
  onNote: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const el = menu.current!;
    setPosition({
      x: Math.max(8, Math.min(x, innerWidth - el.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, innerHeight - el.offsetHeight - 8)),
    });
    el.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) onClose(false);
    };
    const dismiss = () => onClose(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("contextmenu", outside, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("contextmenu", outside, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [onClose]);
  return (
    <div
      ref={menu}
      className="folder-context-menu"
      role="menu"
      aria-label="目录操作"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
          return;
        }
        const buttons = Array.from(
          menu.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]"),
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <div className="folder-menu-path" title={folder}>
        {folder}
      </div>
      <button type="button" role="menuitem" onClick={onChild}>
        <FolderPlus size={15} />
        新建子目录<span>↳</span>
      </button>
      <button type="button" role="menuitem" onClick={onNote}>
        <FileText size={15} />
        在此新建笔记<span>＋</span>
      </button>
      <div className="context-separator" />
      <button type="button" role="menuitem" onClick={onRename}>
        <Pencil size={15} />
        重命名
      </button>
      <button type="button" role="menuitem" onClick={onMove}>
        <FolderInput size={15} />
        移动目录
      </button>
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={onDelete}
      >
        <Trash2 size={15} />
        删除目录
      </button>
    </div>
  );
}
