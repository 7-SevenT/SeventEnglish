import type { ReactNode } from "react";

export function AdminHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="admin-header">
      <div>
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="admin-header__description">{description}</p>}
      </div>
      {action && <div className="admin-header__actions">{action}</div>}
    </header>
  );
}
