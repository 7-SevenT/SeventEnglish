import { Outlet } from "react-router-dom";
import { AdminSidebar } from "../../components/admin/AdminSidebar";

export function AdminLayout() {
  return (
    <div className="admin-shell">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-content"><Outlet /></div>
      </main>
    </div>
  );
}
