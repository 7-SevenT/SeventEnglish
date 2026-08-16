import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getArticle, reanalyzeArticle, type ArticleDetail as ArticleDetailData } from "../api/articles";
import { ReadingDocument, type ReadingSelection } from "../components/ReadingDocument";
import { AnnotationToolbar } from "../components/AnnotationToolbar";
import { AnnotationPopover } from "../components/AnnotationPopover";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useArticleAnnotations } from "../hooks/useArticleAnnotations";
import { ArticleNotes } from "../components/ArticleNotes";
import { splitParagraphs } from "../../worker/src/articleAnalysis";

const statusText = {
  pending: "等待 AI 分析",
  processing: "AI 正在分析文章…",
  completed: "分析已完成",
  failed: "分析失败",
  unconfigured: "待配置 AI",
} as const;

export function ArticleDetail() {
  const { id } = useParams();
  const [article, setArticle] = useState<ArticleDetailData | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [selection, setSelection] = useState<ReadingSelection | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [activeAnnotationId, setActiveAnnotationId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const annotationState = useArticleAnnotations(article?.id ?? 0, article?.annotations ?? []);

  useEffect(() => {
    if (!id) return;
    setError("");
    getArticle(Number(id))
      .then(setArticle)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [id]);

  useEffect(() => {
    if (!article || article.analysis_status !== "processing") return;
    const timer = window.setInterval(() => {
      getArticle(article.id).then(setArticle).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [article?.id, article?.analysis_status]);

  function commentPosition(rect: DOMRect) {
    const width = 260;
    const edge = 12;
    const left = Math.min(Math.max(rect.left + rect.width / 2, edge + width / 2), window.innerWidth - edge - width / 2);
    const top = rect.bottom + 56 + 150 < window.innerHeight ? rect.bottom + 56 : Math.max(edge, rect.top - 150);
    return { top, left };
  }

  function clearSelection() {
    setSelection(null);
    setCommenting(false);
    setCommentDraft("");
    window.getSelection()?.removeAllRanges();
  }

  async function saveSelection(comment: string | null) {
    if (!article || !selection) return;
    try {
      await annotationState.create({ from: selection.from, to: selection.to, selectedText: selection.text, comment });
      clearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存标记失败");
    }
  }

  async function handleEditComment(comment: string | null) {
    if (activeAnnotationId === null) return;
    try {
      await annotationState.updateComment(activeAnnotationId, comment);
      setActiveAnnotationId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "编辑评论失败"); }
  }

  function requestDeleteAnnotation() {
    if (activeAnnotationId !== null) setDeleteDialogOpen(true);
  }

  async function confirmDeleteAnnotation() {
    if (activeAnnotationId === null) return;
    try {
      await annotationState.remove(activeAnnotationId);
      setActiveAnnotationId(null);
      setDeleteDialogOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "删除标记失败"); }
  }

  async function handleReanalyze() {
    if (!article || retrying) return;
    setRetrying(true);
    setError("");
    try {
      setArticle({ ...article, analysis_status: "processing", analysis_error: null });
      setArticle(await reanalyzeArticle(article.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新分析失败");
    } finally {
      setRetrying(false);
    }
  }

  if (error)
    return <div className="container container--read"><p className="alert alert--error">{error}</p></div>;
  if (!article)
    return <div className="container container--read"><p className="empty">加载中…</p></div>;

  const originalParagraphs = splitParagraphs(article.content);
  const paragraphs = article.analysis_json?.paragraphs ?? originalParagraphs.map((original, index) => ({ index, original, translation: "", expressions: [] }));
  const hasAnalysis = article.analysis_status === "completed" && Boolean(article.analysis_json?.paragraphs.length);
  const activeAnnotation = annotationState.annotations.find((item) => item.id === activeAnnotationId) ?? null;

  return (
    <div className="container container--wide article-detail">
      <Link className="back-link" to="/read">← 返回时间线</Link>
      <h1 className="page-title">{article.title}</h1>
      {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
      <p className="article-date">{article.publish_date}</p>
      <div className="article-layout">
        <main className="article-reading" aria-label="文章正文">
          <div className="analysis-status" data-status={article.analysis_status}>
            <span>{statusText[article.analysis_status]}</span>
            {(article.analysis_status === "failed" || article.analysis_status === "completed") && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={handleReanalyze} disabled={retrying}>
                {retrying ? "重新分析中…" : "重新分析"}
              </button>
            )}
          </div>
          <ReadingDocument
            paragraphs={paragraphs}
            annotations={annotationState.annotations}
            onSelectionChange={setSelection}
            onAnnotationClick={(annotation) => { setActiveAnnotationId(annotation.id); clearSelection(); }}
            showAnalysis={hasAnalysis}
          />
          <AnnotationToolbar
            selection={selection}
            onHighlight={() => void saveSelection(null)}
            onComment={() => setCommenting(true)}
            onCancel={clearSelection}
          />
          {selection && commenting && (
            <div className="comment-compose" style={commentPosition(selection.rect)}>
              <textarea autoFocus value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="写下你的评论…" rows={2} />
              <div>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveSelection(commentDraft.trim() || null)}>保存评论</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCommenting(false)}>取消</button>
              </div>
            </div>
          )}
          {activeAnnotation && <AnnotationPopover annotation={activeAnnotation} onEdit={(comment) => void handleEditComment(comment)} onDelete={requestDeleteAnnotation} onClose={() => setActiveAnnotationId(null)} />}
          <ConfirmDialog open={deleteDialogOpen} title="删除这条标记？" description="评论和荧光标记都会被永久删除。" onConfirm={() => void confirmDeleteAnnotation()} onCancel={() => setDeleteDialogOpen(false)} />

          {article.analysis_status === "failed" && <p className="alert alert--error">{article.analysis_error ?? "分析失败，当前显示原文。"}</p>}
        </main>
        <aside className="article-notes" aria-label="文章笔记">
          <ArticleNotes articleId={article.id} initialContent={article.note?.content ?? ""} />
        </aside>
      </div>
    </div>
  );
}
