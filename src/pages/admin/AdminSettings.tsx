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

export function AdminSettings() {
  const [status, setStatus] = useState<WebdavStatus | null>(null);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
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

  return (
    <>
      <AdminHeader eyebrow="SETTINGS" title="设置" description="配置 WebDAV 云端备份（兼容坚果云等 WebDAV 服务），备份/恢复按钮位于顶部导航栏。" />
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
      {toast && <AdminToast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
