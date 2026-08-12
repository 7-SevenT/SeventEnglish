// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/articles";
import { useArticleAnnotations } from "./useArticleAnnotations";
import type { Annotation } from "../../worker/src/db";

const saved: Annotation = {
  id: 4,
  article_id: 1,
  from_position: 2,
  to_position: 8,
  selected_text: "example",
  color: "yellow",
  comment: null,
  created_at: "",
  updated_at: "",
};

describe("useArticleAnnotations", () => {
  const initialAnnotations: Annotation[] = [];

  afterEach(() => vi.restoreAllMocks());

  it("does not loop when callers provide a new initial array", () => {
    const { result } = renderHook(() => useArticleAnnotations(1, []));
    expect(result.current.annotations).toEqual([]);
  });

  it("replaces an optimistic annotation with the server result", async () => {
    vi.spyOn(api, "createAnnotation").mockResolvedValue(saved);
    const { result } = renderHook(() => useArticleAnnotations(1, initialAnnotations));
    await act(async () => {
      await result.current.create({ from: 2, to: 8, selectedText: "example", comment: null });
    });
    expect(result.current.annotations).toEqual([saved]);
  });

  it("removes a failed optimistic annotation", async () => {
    vi.spyOn(api, "createAnnotation").mockRejectedValue(new Error("save failed"));
    const { result } = renderHook(() => useArticleAnnotations(1, initialAnnotations));
    await act(async () => {
      await expect(result.current.create({ from: 2, to: 8, selectedText: "example", comment: null })).rejects.toThrow("save failed");
    });
    expect(result.current.annotations).toEqual([]);
    expect(result.current.error).toBe("save failed");
  });
});
