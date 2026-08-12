import { useEffect } from "react";
import type { ReactNode } from "react";

export type AdminDrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean;
  onClose: () => void;
};

export function AdminDrawer({ open, title, description, children, footer, dirty = false, onClose }: AdminDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  function requestClose() {
    if (dirty && !window.confirm("当前内容尚未保存，确认关闭吗？")) return;
    onClose();
  }

  if (!open) return null;
  return (
    <div className="admin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <aside className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-drawer-title">
        <header className="admin-drawer__header">
          <div>
            <h2 id="admin-drawer-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="admin-icon-button" aria-label="关闭" onClick={requestClose}>×</button>
        </header>
        <div className="admin-drawer__body">{children}</div>
        {footer && <footer className="admin-drawer__footer">{footer}</footer>}
      </aside>
    </div>
  );
}
