import { apiFetch } from "./client";
import type { Article, Annotation, ArticleNote } from "../../worker/src/db";

export interface ArticleGroup {
  date: string;
  articles: { id: number; title: string; subtitle?: string | null; analysis_status?: Article["analysis_status"] }[];
}

export async function listArticles(): Promise<ArticleGroup[]> {
  return apiFetch<ArticleGroup[]>("/articles");
}
export interface ArticleDetail extends Article {
  annotations: Annotation[];
  note: ArticleNote | null;
}

export async function getArticle(id: number): Promise<ArticleDetail> {
  return apiFetch<ArticleDetail>(`/articles/${id}`);
}

export async function reanalyzeArticle(id: number): Promise<ArticleDetail> {
  return apiFetch<ArticleDetail>(`/admin/articles/${id}/analyze`, { method: "POST" });
}

export function createAnnotation(articleId: number, data: {
  from_position: number;
  to_position: number;
  selected_text: string;
  color: Annotation["color"];
  comment?: string | null;
}) {
  return apiFetch<Annotation>(`/articles/${articleId}/annotations`, { method: "POST", body: JSON.stringify(data) });
}

export function updateAnnotation(id: number, data: Partial<Omit<Annotation, "id" | "article_id" | "created_at" | "updated_at">>) {
  return apiFetch<Annotation>(`/annotations/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteAnnotation(id: number) {
  return apiFetch<{ ok: boolean }>(`/annotations/${id}`, { method: "DELETE" });
}

export function getArticleNote(articleId: number) {
  return apiFetch<{ note: ArticleNote | null }>(`/articles/${articleId}/notes`);
}

export function saveArticleNote(articleId: number, content: string) {
  return apiFetch<{ note: ArticleNote | null }>(`/articles/${articleId}/notes`, {
    method: "PUT", body: JSON.stringify({ content }),
  });
}
