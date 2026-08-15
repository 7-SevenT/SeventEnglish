import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminToast, type ToastTone } from "../../components/admin/AdminToast";

interface WebdavStatus {
  configured: boolean;
  url: string | null;
  username: string | null;
  has_password: boolean;
}

interface AnalyzeServiceStatus {
  configured: boolean;
  url: string | null;
  has_token: boolean;
  updated_at: string | null;
}

export function AdminSettings() {
  // ---- WebDAV ----
  const [status, setStatus] = useState<WebdavStatus | null>(null);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // ---- AI 分析服务 ----
  const [service, setService] = useState<AnalyzeServiceStatus | null>(null);
  const [serviceUrl, setServiceUrl] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceClearing, setServiceClearing] = useState(false);

  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  async function load() {
    try {
      const next = await apiFetch<WebdavStatus>("/admin/webdav");
      setStatus(next);
      setUrl(next.url ?? "");
      setUsername(next.username ?? "");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "WebDAV 配置加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    async function loadService() {
      try {
        const next = await apiFetch<AnalyzeServiceStatus>("/admin/analyze-service");
        setService(next);
        setServiceUrl(next.url ?? "");
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "分析服务配置加载失败");
      } finally {
        setServiceLoading(false);
      }
    }
    void loadService();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await apiFetch<WebdavStatus>("/admin/webdav", {
        method: "PUT",
        body: JSON.stringify({ url, username, ...(password ? { password } : {}) }),
      });
      setStatus(next);
      setPassword("");
      setToast({ message: "WebDAV 配置已保存", tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "WebDAV 配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearConfig() {
    setClearing(true);
    setError("");
    try {
      await apiFetch("/admin/webdav", { method: "DELETE" });
      setStatus({ configured: false, url: null, username: null, has_password: false });
      setUrl("");
      setUsername("");
      setPassword("");
      setToast({ message: "WebDAV 配置已清除", tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清除失败");
    } finally {
      setClearing(false);
    }
  }

  async function saveService() {
    setServiceSaving(true);
    setError("");
    try {
      const next = await apiFetch<AnalyzeServiceStatus>("/admin/analyze-service", {
        method: "PUT",
        body: JSON.stringify({ url: serviceUrl, ...(serviceToken ? { token: serviceToken } : {}) }),
      });
      setService(next);
      setServiceToken("");
      setToast({ message: "AI 分析服务配置已保存", tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分析服务配置保存失败");
    } finally {
      setServiceSaving(false);
    }
  }

  async function clearService() {
    setServiceClearing(true);
    setError("");
    try {
      await apiFetch("/admin/analyze-service", { method: "DELETE" });
      setService({ configured: false, url: null, has_token: false, updated_at: null });
      setServiceUrl("");
      setServiceToken("");
      setToast({ message: "AI 分析服务配置已清除", tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清除失败");
    } finally {
      setServiceClearing(false);
    }
  }

  return (
    <>
      <AdminHeader eyebrow="SETTINGS" title="设置" description="配置 WebDAV 云端备份与 AI 文章分析代理服务，备份/恢复按钮位于顶部导航栏。" />
      {error && <div className="alert alert--error">{error}</div>}

      <section className="admin-panel admin-ai-card admin-settings-panel">
        <div className="admin-ai-card__header">
          <div>
            <h2>WebDAV 备份</h2>
            <p>密码使用 ENCRYPTION_KEY 加密存储，页面始终以脱敏状态展示。</p>
          </div>
          <span className={`admin-status ${status?.configured ? "admin-status--success" : "admin-status--unconfigured"}`}>
            {status?.configured ? "已配置" : "未配置"}
          </span>
        </div>
        {loading ? (
          <p className="empty">加载配置中…</p>
        ) : (
          <>
            <div className="admin-field">
              <label htmlFor="webdav-url">WebDAV URL</label>
              <input id="webdav-url" className="input" value={url} placeholder="如 https://dav.jianguoyun.com/dav/" onChange={(event) => setUrl(event.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor="webdav-username">用户名</label>
              <input id="webdav-username" className="input" value={username} autoComplete="off" onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor="webdav-password">密码 <span className="admin-field__hint">{status?.has_password ? "已配置，留空保留" : "尚未配置"}</span></label>
              <input id="webdav-password" className="input" type="password" value={password} autoComplete="new-password" placeholder={status?.has_password ? "留空以保留现有密码" : "输入 WebDAV 密码"} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="admin-ai-actions">
              <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存配置"}</button>
              {status?.configured && (
                <button type="button" className="btn btn--ghost" onClick={() => void clearConfig()} disabled={clearing}>{clearing ? "清除中…" : "清除配置"}</button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="admin-panel admin-ai-card admin-settings-panel">
        <div className="admin-ai-card__header">
          <div>
            <h2>AI 分析服务</h2>
            <p>文章 AI 分析由 Vercel 代理服务执行（Workers 免费计划 CPU 限制无法直接跑分析）。Token 需与 Vercel 环境变量 <code>ANALYZE_TOKEN</code> 一致，加密存储。</p>
          </div>
          <span className={`admin-status ${service?.configured ? "admin-status--success" : "admin-status--unconfigured"}`}>
            {service?.configured ? "已配置" : "未配置"}
          </span>
        </div>
        {serviceLoading ? (
          <p className="empty">加载配置中…</p>
        ) : (
          <>
            <div className="admin-field">
              <label htmlFor="analyze-service-url">Vercel 服务地址</label>
              <input id="analyze-service-url" className="input" value={serviceUrl} placeholder="如 https://sevent-english-proxy.vercel.app" onChange={(event) => setServiceUrl(event.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor="analyze-service-token">访问 Token <span className="admin-field__hint">{service?.has_token ? "已配置，留空保留" : "尚未配置"}</span></label>
              <input id="analyze-service-token" className="input" type="password" value={serviceToken} autoComplete="new-password" placeholder={service?.has_token ? "留空以保留现有 Token" : "输入与 Vercel ANALYZE_TOKEN 一致的 Token"} onChange={(event) => setServiceToken(event.target.value)} />
            </div>
            <div className="admin-ai-actions">
              <button type="button" className="btn btn--primary" onClick={() => void saveService()} disabled={serviceSaving}>{serviceSaving ? "保存中…" : "保存配置"}</button>
              {service?.configured && (
                <button type="button" className="btn btn--ghost" onClick={() => void clearService()} disabled={serviceClearing}>{serviceClearing ? "清除中…" : "清除配置"}</button>
              )}
            </div>
          </>
        )}
      </section>

      {toast && <AdminToast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
