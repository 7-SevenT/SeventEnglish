import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="admin-empty-state">
      <div className="admin-empty-state__mark" aria-hidden="true">✦</div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="admin-empty-state__action">{action}</div>}
    </div>
  );
}
