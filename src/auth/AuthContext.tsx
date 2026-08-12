import { createContext, useContext, useEffect, useCallback, useState, useRef } from "react";
import type { ReactNode } from "react";
import { login as apiLogin, logout as apiLogout, me } from "../api/auth";
import { onUnauthorized } from "../api/client";

interface AuthState {
  authenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // 用 ref 保存实时 authenticated，供事件处理器读取，避免闭包读到陈旧值。
  const authenticatedRef = useRef(false);
  useEffect(() => {
    authenticatedRef.current = authenticated;
  }, [authenticated]);

  const refresh = useCallback(async () => {
    try {
      const r = await me();
      setAuthenticated(r.authenticated);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 会话过期机制（设计 §七：401 时跳转登录页）：
  // 任意受保护数据请求返回 401 都会触发 onUnauthorized。
  // 仅当当前已有会话（authenticated===true）时才视为“会话失效”并登出；
  // 否则（如 POST /api/login 自身 401、首次加载 /api/me 401）忽略，不打断登录流程。
  // 登出后 authenticated=false，RequireAuth 渲染时自然 <Navigate to="/login">。
  useEffect(() => {
    const off = onUnauthorized(() => {
      if (!authenticatedRef.current) return;
      setAuthenticated(false);
      // 顺手清理已失效的会话 cookie（fire-and-forget；logout 属白名单，不会回环触发 401）。
      void apiLogout().catch(() => {});
    });
    return off;
  }, []);

  const login = useCallback(async (password: string) => {
    await apiLogin(password);
    setAuthenticated(true);
  }, []);
  const logout = useCallback(async () => {
    await apiLogout();
    setAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
