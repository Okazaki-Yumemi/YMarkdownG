import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export function Select({
  value,
  onChange,
  children,
  "aria-label": label,
  disabled = false,
}: {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  "aria-label": string;
  disabled?: boolean;
}) {
  const options = Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value: string;
        children: ReactNode;
        disabled?: boolean;
      }>(child)
    )
      return [];
    return [
      {
        value: String(child.props.value),
        label: child.props.children,
        disabled: child.props.disabled,
      },
    ];
  });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 180,
    maxHeight: 240,
  });
  const button = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null);
  const id = useId();
  const search = useRef("");
  const searchTime = useRef(0);
  const selected = options.findIndex((option) => option.value === value);
  useLayoutEffect(() => {
    if (!open) return;
    const rect = button.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 180), innerWidth - 16);
    const below = innerHeight - rect.bottom - 12,
      above = rect.top - 12;
    const height = Math.min(280, Math.max(below, above));
    const goUp =
      below < Math.min(options.length * 34 + 8, 220) && above > below;
    setPosition({
      left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
      top: goUp
        ? Math.max(8, rect.top - Math.min(options.length * 34 + 8, height) - 4)
        : rect.bottom + 4,
      width,
      maxHeight: Math.max(70, goUp ? above : below),
    });
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (
        !button.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const close = () => setOpen(false);
    const scroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [open]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange({ target: { value: option.value } });
    setOpen(false);
    button.current?.focus();
  }
  function step(direction: number) {
    let index = active;
    for (let i = 0; i < options.length; i++) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) break;
    }
    setActive(index);
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="custom-select"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        data-value={value}
        disabled={disabled}
        onClick={() => {
          setActive(Math.max(0, selected));
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (event.key === "Tab") {
            setOpen(false);
            return;
          }
          if (
            ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setActive(Math.max(0, selected));
            } else if (event.key === "Enter" || event.key === " ")
              choose(active);
            else if (event.key === "Home") setActive(0);
            else if (event.key === "End") setActive(options.length - 1);
            else step(event.key === "ArrowDown" ? 1 : -1);
          } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey
          ) {
            search.current =
              performance.now() - searchTime.current > 700
                ? event.key
                : search.current + event.key;
            searchTime.current = performance.now();
            const index = options.findIndex(
              (option) =>
                !option.disabled &&
                String(option.label)
                  .toLowerCase()
                  .startsWith(search.current.toLowerCase()),
            );
            if (index >= 0) {
              setOpen(true);
              setActive(index);
            }
          }
        }}
      >
        <span>{options[selected]?.label || "请选择"}</span>
        <ChevronDown size={13} />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className="select-popover"
            style={position}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <button
                type="button"
                tabIndex={-1}
                role="option"
                id={`${id}-${index}`}
                key={option.value}
                data-index={index}
                data-value={option.value}
                aria-selected={value === option.value}
                disabled={option.disabled}
                className={active === index ? "highlighted" : ""}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {value === option.value && <Check size={14} />}
              </button>
            ))}
          </div>,
          document.querySelector(".app") || document.body,
        )}
    </>
  );
}
