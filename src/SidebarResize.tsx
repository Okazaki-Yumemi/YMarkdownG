export function SidebarResize({
  width,
  onChange,
}: {
  width: number;
  onChange: (value: number) => void;
}) {
  const clamp = (value: number) =>
    Math.round(Math.max(220, Math.min(600, window.innerWidth * 0.5, value)));
  return (
    <div
      className="sidebar-resize"
      role="separator"
      aria-label="调整侧栏宽度"
      aria-orientation="vertical"
      aria-valuemin={220}
      aria-valuemax={600}
      aria-valuenow={width}
      tabIndex={0}
      onDoubleClick={() => onChange(300)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(clamp(width + (e.key === "ArrowRight" ? 20 : -20)));
        }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        document.body.classList.add("resizing-sidebar");
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          onChange(clamp(e.clientX));
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.classList.remove("resizing-sidebar");
      }}
      onLostPointerCapture={() =>
        document.body.classList.remove("resizing-sidebar")
      }
    />
  );
}
