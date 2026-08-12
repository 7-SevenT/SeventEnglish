import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, LockSimple } from "@phosphor-icons/react";
import { useAuth } from "../auth/AuthContext";
import { UnauthorizedError } from "../api/client";

export function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/read";

  return (
    <div className="login-screen">
      {/* 背景装饰光斑 */}
      <div className="login-screen__glow" aria-hidden="true" />
      <div className="login-screen__inner">
        <div className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo">
              <img src="/brand-logo.png" alt="SeventEnglish logo" />
            </div>
            <h1>Sevent<span>English</span></h1>
            <p>个人英语阅读与听力练习</p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setLoading(true);
              try {
                await login(password);
                navigate(from, { replace: true });
              } catch (err) {
                if (err instanceof UnauthorizedError || (err instanceof Error && err.message === "unauthorized")) {
                  // 401 未授权（登录场景下通常为密码错误）：给用户友好提示
                  setError("密码错误，请重试");
                } else {
                  setError(err instanceof Error ? err.message : "登录失败");
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="login-card__field">
              <LockSimple size={18} className="login-card__icon" aria-hidden="true" />
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="访问密码"
                autoFocus
              />
            </div>
            {error && <p className="alert alert--error login-card__error" role="alert">{error}</p>}
            <button className="btn btn--primary login-card__submit" type="submit" disabled={loading || !password}>
              {loading ? "登录中..." : "登录"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>
        <p className="login-screen__note">数据仅保存在你的 Cloudflare D1 数据库中</p>
      </div>
    </div>
  );
}
