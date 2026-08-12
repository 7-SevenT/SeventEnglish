import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./components/RequireAuth";
import { Nav } from "./components/Nav";
import { Read } from "./pages/Read";
import { ArticleDetail } from "./pages/ArticleDetail";
import { Listen } from "./pages/Listen";
import { BookUnits } from "./pages/BookUnits";
import { Practice } from "./pages/Practice";
import { Stats } from "./pages/Stats";
import { Login } from "./pages/Login";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { ArticlesAdmin } from "./pages/admin/ArticlesAdmin";
import { DictationAdmin } from "./pages/admin/DictationAdmin";
import { AiModelAdmin } from "./pages/admin/AiModelAdmin";
import { AdminSettings } from "./pages/admin/AdminSettings";

// 登录页为独立全屏界面，不显示顶部导航栏
function AppNav() {
  const location = useLocation();
  if (location.pathname === "/login") return null;
  return <Nav />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppNav />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Navigate to="/read" replace />
              </RequireAuth>
            }
          />
          <Route path="/read" element={<RequireAuth><Read /></RequireAuth>} />
          <Route path="/read/:id" element={<RequireAuth><ArticleDetail /></RequireAuth>} />
          <Route path="/listen" element={<RequireAuth><Listen /></RequireAuth>} />
          <Route path="/listen/:bookId" element={<RequireAuth><BookUnits /></RequireAuth>} />
          <Route path="/listen/:bookId/:unitId" element={<RequireAuth><Practice /></RequireAuth>} />
          <Route path="/stats" element={<RequireAuth><Stats /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/admin/articles" replace />} />
            <Route path="articles" element={<ArticlesAdmin />} />
            <Route path="dictation" element={<DictationAdmin />} />
            <Route path="ai-model" element={<AiModelAdmin />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="books" element={<Navigate to="/admin/dictation" replace />} />
          </Route>
          <Route path="*" element={<LoginRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function LoginRedirect() {
  const { authenticated, loading } = useAuth();
  if (loading) return <p>加载中…</p>;
  return <Navigate to={authenticated ? "/read" : "/login"} replace />;
}
