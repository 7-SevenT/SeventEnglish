import { NavLink, useLocation } from "react-router-dom";
import { BookOpen, ChartBar, Headphones, SignOut, SquaresFour, type Icon } from "@phosphor-icons/react";
import { useAuth } from "../auth/AuthContext";
import { WebdavBackup } from "./WebdavBackup";

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/read", label: "阅读", icon: BookOpen },
  { to: "/listen", label: "听力", icon: Headphones },
  { to: "/stats", label: "统计", icon: ChartBar },
  { to: "/admin/articles", label: "管理", icon: SquaresFour },
];

export function Nav() {
  const { authenticated, logout } = useAuth();
  const location = useLocation();
  const isAdminMode = location.pathname.startsWith("/admin");

  return (
    <>
      <header className={`nav ${isAdminMode ? "nav--admin" : "nav--learning"}`}>
        <div className="nav-inner">
          {/* 左侧：品牌 + 页面导航（与右侧操作区分离） */}
          <div className="nav-identity">
            <NavLink to="/read" className="nav-brand">
              <img className="nav-brand__logo" src="/brand-logo.png" alt="SeventEnglish logo" />
              <span className="nav-brand__name">Sevent<span>English</span></span>
            </NavLink>
            {authenticated && (isAdminMode ? (
              <>
                <span className="nav-admin-context">管理工作台</span>
                <NavLink className="nav-admin-return" to="/read">← 返回学习端</NavLink>
              </>
            ) : (
              <nav className="nav-links" aria-label="学习导航">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={16} weight={isActive ? "bold" : "regular"} aria-hidden="true" />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            ))}
          </div>

          {/* 右侧：云端备份 / 退出登录 */}
          {authenticated && (
            <div className="nav-actions">
              <WebdavBackup iconOnly />
              <button
                onClick={() => void logout()}
                title="退出登录"
                aria-label="退出登录"
                className="nav-icon-btn"
              >
                <SignOut size={20} />
              </button>
            </div>
          )}
        </div>
      </header>

      {authenticated && (
        <nav className="nav-tabs" aria-label="移动导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => "nav-tab" + (isActive ? " nav-tab--active" : "")}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} weight={isActive ? "bold" : "regular"} aria-hidden="true" />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
