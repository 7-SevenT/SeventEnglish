import { useEffect, useRef, useState } from "react";
import { saveArticleNote } from "../api/articles";

export function ArticleNotes({ articleId, initialContent }: { articleId: number; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setContent(initialContent), [initialContent]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function change(value: string) {
    setContent(value); setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => { try { await saveArticleNote(articleId, value); setStatus("saved"); } catch { setStatus("error"); } }, 500);
  }
  return <section className="notes-panel"><h2 className="section-title">我的笔记</h2><textarea className="textarea notes-textarea" value={content} onChange={(e) => change(e.target.value)} placeholder="记录这篇文章的想法、词汇或写作思路…" /><p className={`notes-status notes-status--${status}`}>{status === "saving" ? "正在保存…" : status === "saved" ? "已保存" : status === "error" ? "保存失败，请重试" : ""}</p></section>;
}
