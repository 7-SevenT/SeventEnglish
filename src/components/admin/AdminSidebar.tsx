import { NavLink } from "react-router-dom";
import { FileText, GearSix, NotePencil, Sparkle, type Icon } from "@phosphor-icons/react";

const links: { to: string; label: string; icon: Icon }[] = [
  { to: "/admin/articles", label: "文章", icon: FileText },
  { to: "/admin/dictation", label: "听写", icon: NotePencil },
  { to: "/admin/ai-model", label: "AI模型", icon: Sparkle },
  { to: "/admin/settings", label: "设置", icon: GearSix },
];

export function AdminSidebar() {
  return (
    <aside className="admin-sidebar" aria-label="管理模块导航">
      <p className="admin-sidebar__eyebrow">管理模块</p>
      <nav className="admin-sidebar__nav">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => `admin-sidebar__link${isActive ? " admin-sidebar__link--active" : ""}`}>
            <span className="admin-sidebar__icon" aria-hidden="true">
              <link.icon size={18} weight="bold" />
            </span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
