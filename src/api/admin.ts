import { apiFetch } from "./client";
import type { Article, WordBookOverview } from "../../worker/src/db";

export type AiModelPublicConfig = {
  base_url: string;
  model: string;
  has_api_key: boolean;
  updated_at: string | null;
};

export type AnalyzeServicePublicConfig = {
  configured: boolean;
  url: string | null;
  has_token: boolean;
  updated_at: string | null;
};

export function createArticle(data: {
  title: string;
  content: string;
  publish_date: string;
}) {
  return apiFetch<Article>("/articles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
export function reanalyzeArticle(id: number) {
  return apiFetch<Article>(`/admin/articles/${id}/analyze`, { method: "POST" });
}

export function updateArticle(
  id: number,
  data: Partial<{ title: string; content: string; publish_date: string }>
) {
  return apiFetch<Article>(`/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
export function deleteArticle(id: number) {
  return apiFetch<{ ok: boolean }>(`/articles/${id}`, { method: "DELETE" });
}
export function createBook(data: { name: string; description?: string }) {
  return apiFetch<{ ok: boolean }>("/books", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
export function deleteBook(id: number) {
  return apiFetch<{ ok: boolean }>(`/books/${id}`, { method: "DELETE" });
}
export function createUnit(
  bookId: number,
  data: { name: string; sort_order?: number }
) {
  return apiFetch<{ ok: boolean }>(`/books/${bookId}/units`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
export function deleteUnit(id: number) {
  return apiFetch<{ ok: boolean }>(`/units/${id}`, { method: "DELETE" });
}
export function uploadWord(unitId: number, file: File, word?: string) {
  const fd = new FormData();
  fd.append("unitId", String(unitId));
  fd.append("audio", file);
  if (word) fd.append("word", word);
  return apiFetch<{ ok: boolean; key: string }>("/words", {
    method: "POST",
    body: fd,
  });
}

export type BulkImportResult = {
  ok: boolean;
  created: number;
  skipped: number;
  duplicates?: string[];
  invalid?: string[];
};

export function bulkImportWords(unitId: number, items: { word: string; definition?: string }[]) {
  return apiFetch<BulkImportResult>(`/units/${unitId}/words/bulk`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}
export function deleteWord(id: number) {
  return apiFetch<{ ok: boolean }>(`/words/${id}`, { method: "DELETE" });
}

export function getAiModelConfig() {
  return apiFetch<AiModelPublicConfig | null>("/admin/ai-model");
}

export function saveAiModelConfig(data: { base_url: string; model: string; api_key?: string }) {
  return apiFetch<AiModelPublicConfig>("/admin/ai-model", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function fetchAiModels(data?: { base_url?: string; api_key?: string }) {
  return apiFetch<{ models: string[] }>("/admin/ai-model/models", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  }).then((result) => result.models);
}

export function testAiModel(data?: { base_url?: string; model?: string; api_key?: string }) {
  return apiFetch<{ model: string; modelCount: number; modelListed: boolean }>("/admin/ai-model/test", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export function getAnalyzeServiceConfig() {
  return apiFetch<AnalyzeServicePublicConfig>("/admin/analyze-service");
}

export function saveAnalyzeServiceConfig(data: { url?: string; token?: string }) {
  return apiFetch<AnalyzeServicePublicConfig>("/admin/analyze-service", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function clearAnalyzeServiceConfig() {
  return apiFetch<{ ok: boolean }>("/admin/analyze-service", { method: "DELETE" });
}

export function getDictationOverview() {
  return apiFetch<WordBookOverview[]>("/admin/dictation/overview");
}
