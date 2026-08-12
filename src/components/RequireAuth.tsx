import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p>加载中…</p>;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
