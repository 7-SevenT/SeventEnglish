import { useCallback, useEffect, useRef, useState } from "react";
import { createAnnotation, deleteAnnotation, updateAnnotation } from "../api/articles";
import type { Annotation } from "../../worker/src/db";

export type CreateArticleAnnotationInput = {
  from: number;
  to: number;
  selectedText: string;
  comment: string | null;
};

export function useArticleAnnotations(articleId: number, initialAnnotations: Annotation[]) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const mounted = useRef(true);
  const initialSignature = JSON.stringify(initialAnnotations.map((annotation) => [
    annotation.id, annotation.from_position, annotation.to_position, annotation.selected_text,
    annotation.color, annotation.comment, annotation.updated_at,
  ]));

  useEffect(() => {
    mounted.current = true;
    setAnnotations(initialAnnotations);
    return () => { mounted.current = false; };
  }, [articleId, initialSignature]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setPending((value) => value + 1);
    setError("");
    try {
      return await operation();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "操作失败");
      throw cause;
    } finally {
      if (mounted.current) setPending((value) => Math.max(0, value - 1));
    }
  }, []);

  const create = useCallback(async ({ from, to, selectedText, comment }: CreateArticleAnnotationInput) => {
    const optimistic: Annotation = {
      id: -Date.now(), article_id: articleId, from_position: from, to_position: to,
      selected_text: selectedText, color: "yellow", comment,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setAnnotations((current) => [...current, optimistic]);
    try {
      const saved = await run(() => createAnnotation(articleId, {
        from_position: from, to_position: to, selected_text: selectedText, color: "yellow", comment,
      }));
      if (mounted.current) setAnnotations((current) => current.map((item) => item.id === optimistic.id ? saved : item));
      return saved;
    } catch (cause) {
      if (mounted.current) setAnnotations((current) => current.filter((item) => item.id !== optimistic.id));
      throw cause;
    }
  }, [articleId, run]);

  const updateComment = useCallback(async (annotationId: number, comment: string | null) => {
    const updated = await run(() => updateAnnotation(annotationId, { comment }));
    if (mounted.current) setAnnotations((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }, [run]);

  const remove = useCallback(async (annotationId: number) => {
    await run(() => deleteAnnotation(annotationId));
    if (mounted.current) setAnnotations((current) => current.filter((item) => item.id !== annotationId));
  }, [run]);

  return { annotations, create, updateComment, remove, error, pending: pending > 0 };
}
