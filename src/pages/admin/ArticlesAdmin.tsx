import { useEffect, useMemo, useState } from "react";
import { createArticle, deleteArticle, updateArticle } from "../../api/admin";
import { getArticle, listArticles, reanalyzeArticle } from "../../api/articles";
import type { Article } from "../../../worker/src/db";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminToast, type ToastTone } from "../../components/admin/AdminToast";
import { EmptyState } from "../../components/admin/EmptyState";
import { ArticleEditorDrawer, type ArticleDraft } from "../../components/admin/ArticleEditorDrawer";
import { StatusBadge, type AdminStatus } from "../../components/admin/StatusBadge";

interface ArticleItem {
  id: number;
  title: string;
  publish_date: string;
  analysis_status: Article["analysis_status"];
}

type DrawerState = { mode: "create" | "edit"; id?: number; initialValue?: Partial<ArticleDraft> } | null;

export function ArticlesAdmin() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"all" | Article["analysis_status"]>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const groups = await listArticles();
      setArticles(groups.flatMap((group) => group.articles.map((article) => ({
        id: article.id,
        title: article.title,
        publish_date: group.date,
        analysis_status: article.analysis_status ?? "pending",
      }))));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章加载失败");
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => articles.filter((article) => {
    const matchesSearch = !search.trim() || article.title.toLowerCase().includes(search.trim().toLowerCase());
    const matchesDate = !date || article.publish_date === date;
    const matchesStatus = status === "all" || article.analysis_status === status;
    return matchesSearch && matchesDate && matchesStatus;
  }), [articles, date, search, status]);

  async function openEdit(id: number) {
    try {
      const article = await getArticle(id);
      setDrawer({ mode: "edit", id, initialValue: article });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "文章加载失败", tone: "error" });
    }
  }

  async function saveArticle(draft: ArticleDraft) {
    if (drawer?.mode === "edit" && drawer.id !== undefined) {
      await updateArticle(drawer.id, draft);
      setToast({ message: "文章已更新，如需 AI 分析请点击「重分析」", tone: "success" });
    } else {
      await createArticle(draft);
      setToast({ message: "文章已创建，如需 AI 分析请点击「重分析」", tone: "success" });
    }
    setDrawer(null);
    await load();
  }

  async function confirmDelete() {
    if (deleteId === null) return;
    try {
      await deleteArticle(deleteId);
      setDeleteId(null);
      setToast({ message: "文章已删除", tone: "success" });
      await load();
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "删除失败", tone: "error" });
    }
  }

  async function reanalyze(id: number) {
    try {
      await reanalyzeArticle(id);
      setToast({ message: "已重新加入 AI 分析队列", tone: "success" });
      await load();
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "重新分析失败", tone: "error" });
    }
  }

  const completed = articles.filter((article) => article.analysis_status === "completed").length;
  const pending = articles.filter((article) => article.analysis_status === "pending" || article.analysis_status === "processing").length;

  return (
    <>
      <AdminHeader
        eyebrow="CONTENT WORKSPACE"
        title="文章"
        description="发布阅读材料，统一查看 AI 分析状态。"
        action={<button type="button" className="btn btn--primary" onClick={() => setDrawer({ mode: "create" })}>＋ 新建文章</button>}
      />
      {error && <div className="alert alert--error">{error}</div>}
      <div className="admin-stat-grid">
        <div className="admin-stat"><span className="admin-stat__label">文章总数</span><strong className="admin-stat__value">{articles.length}</strong></div>
        <div className="admin-stat"><span className="admin-stat__label">分析完成</span><strong className="admin-stat__value">{completed}</strong></div>
        <div className="admin-stat"><span className="admin-stat__label">待处理</span><strong className="admin-stat__value">{pending}</strong></div>
      </div>
      <div className="admin-toolbar">
        <div className="admin-toolbar__filters">
          <input className="input" aria-label="搜索文章标题" placeholder="搜索文章标题…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <input className="input" aria-label="按日期筛选" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <select className="input" aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">全部状态</option>
            <option value="pending">等待分析</option>
            <option value="processing">分析中</option>
            <option value="completed">分析完成</option>
            <option value="failed">分析失败</option>
            <option value="unconfigured">待配置 AI</option>
          </select>
        </div>
        <span className="muted">显示 {filtered.length} 篇</span>
      </div>
      <div className="admin-panel">
        {filtered.length === 0 ? (
          <EmptyState title={articles.length === 0 ? "还没有文章" : "没有匹配文章"} description={articles.length === 0 ? "创建第一篇文章，开始构建你的阅读库。" : "尝试调整搜索或筛选条件。"} action={articles.length === 0 ? <button type="button" className="btn btn--primary" onClick={() => setDrawer({ mode: "create" })}>新建文章</button> : undefined} />
        ) : (
          <table className="admin-table">
            <thead><tr><th>文章</th><th>发布日期</th><th>AI 状态</th><th>操作</th></tr></thead>
            <tbody>{filtered.map((article) => (
              <tr key={article.id}>
                <td><span className="admin-table__title">{article.title}</span><span className="admin-table__meta">文章 #{article.id}</span></td>
                <td>{article.publish_date}</td>
                <td><StatusBadge status={article.analysis_status as AdminStatus} /></td>
                <td><div className="admin-table__actions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => void openEdit(article.id)}>编辑</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => void reanalyze(article.id)}>重分析</button><button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleteId(article.id)}>删除</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <ArticleEditorDrawer open={drawer !== null} mode={drawer?.mode ?? "create"} initialValue={drawer?.initialValue} onClose={() => setDrawer(null)} onSave={saveArticle} />
      <ConfirmDialog open={deleteId !== null} title="删除文章" description="删除后文章正文和分析结果都无法恢复。" confirmLabel="删除文章" onCancel={() => setDeleteId(null)} onConfirm={() => void confirmDelete()} />
      {toast && <AdminToast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
