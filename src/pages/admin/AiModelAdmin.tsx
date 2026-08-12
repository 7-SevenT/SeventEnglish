import { useEffect, useState } from "react";
import { fetchAiModels, getAiModelConfig, saveAiModelConfig, testAiModel, type AiModelPublicConfig } from "../../api/admin";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminToast, type ToastTone } from "../../components/admin/AdminToast";
import { StatusBadge } from "../../components/admin/StatusBadge";

export function AiModelAdmin() {
  const [config, setConfig] = useState<AiModelPublicConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<{ tone: ToastTone; message: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  async function load() {
    try {
      const next = await getAiModelConfig();
      setConfig(next);
      setBaseUrl(next?.base_url ?? "");
      setModel(next?.model ?? "");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 配置加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function refreshModels() {
    setLoadingModels(true);
    setError("");
    try {
      const next = await fetchAiModels({ base_url: baseUrl, ...(apiKey ? { api_key: apiKey } : {}) });
      setModels(next);
      setToast({ message: `已获取 ${next.length} 个模型`, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模型列表获取失败");
    } finally {
      setLoadingModels(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setConnection(null);
    try {
      const result = await testAiModel({ base_url: baseUrl, model, ...(apiKey ? { api_key: apiKey } : {}) });
      setConnection({ tone: result.modelListed ? "success" : "info", message: result.modelListed ? `连接成功：${result.model}（发现 ${result.modelCount} 个模型）` : `连接成功，但 ${result.model} 未出现在上游模型列表中` });
    } catch (cause) {
      setConnection({ tone: "error", message: cause instanceof Error ? cause.message : "连接测试失败" });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await saveAiModelConfig({ base_url: baseUrl, model, ...(apiKey ? { api_key: apiKey } : {}) });
      setConfig(next);
      setApiKey("");
      setToast({ message: "AI 模型配置已保存", tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminHeader eyebrow="AI WORKSPACE" title="AI模型" description="配置文章分析使用的 OpenAI 兼容服务，并从上游获取可用模型。" />
      {error && <div className="alert alert--error">{error}</div>}
      <section className="admin-ai-layout">
        <div className="admin-panel admin-ai-card">
          <div className="admin-ai-card__header"><div><h2>连接配置</h2><p>API Key 只在 Worker 内解密，页面始终以脱敏状态展示。</p></div>{config?.has_api_key ? <StatusBadge status="success" /> : <StatusBadge status="unconfigured" />}</div>
          {loading ? <p className="empty">加载配置中…</p> : <>
            <div className="admin-field"><label htmlFor="ai-base-url">Base URL</label><input id="ai-base-url" className="input" value={baseUrl} placeholder="https://api.example.com/v1" onChange={(event) => setBaseUrl(event.target.value)} /></div>
            <div className="admin-field"><label htmlFor="ai-api-key">API Key <span className="admin-field__hint">{config?.has_api_key ? "API Key 已配置" : "尚未配置"}</span></label><input id="ai-api-key" className="input" type="password" value={apiKey} placeholder={config?.has_api_key ? "留空以保留现有 Key" : "输入 API Key"} onChange={(event) => setApiKey(event.target.value)} /></div>
            <div className="admin-field"><label htmlFor="ai-model">模型</label><input id="ai-model" className="input" list="ai-model-options" value={model} placeholder="选择或输入模型名" onChange={(event) => setModel(event.target.value)} /><datalist id="ai-model-options">{models.map((item) => <option key={item} value={item} />)}</datalist>{models.length > 0 && <div className="admin-model-chips" aria-label="可用模型">{models.map((item) => <button type="button" className={`admin-model-chip${item === model ? " admin-model-chip--active" : ""}`} key={item} onClick={() => setModel(item)}>{item}</button>)}</div>}</div>
            <div className="admin-ai-actions"><button type="button" className="btn btn--ghost" onClick={() => void refreshModels()} disabled={loadingModels || !baseUrl}>{loadingModels ? "获取中…" : "刷新模型列表"}</button><button type="button" className="btn btn--ghost" onClick={() => void testConnection()} disabled={testing || !baseUrl || !model}>{testing ? "测试中…" : "测试连接"}</button><button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存配置"}</button></div>
          </>}
        </div>
        <aside className="admin-ai-help"><span className="admin-ai-help__mark">✦</span><h2>配置提示</h2><p>Base URL 使用 OpenAI 兼容服务的版本根路径，例如以 <code>/v1</code> 结尾。模型列表通过 <code>GET /models</code> 获取，文章分析使用 <code>/chat/completions</code>。</p><div className="admin-ai-help__status"><span>当前状态</span>{connection ? <span className={`admin-ai-help__connection admin-ai-help__connection--${connection.tone}`}>{connection.message}</span> : <span>{config?.updated_at ? `上次更新：${new Date(config.updated_at).toLocaleString()}` : "尚未保存配置"}</span>}</div></aside>
      </section>
      {connection && connection.tone === "error" && <div className="alert alert--error admin-ai-feedback">{connection.message}</div>}
      {toast && <AdminToast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
