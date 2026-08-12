import { describe, expect, it } from "vitest";
import type { Annotation } from "../../worker/src/db";
import { filterRenderableAnnotations, isValidAnnotationRange } from "./annotations";

const annotation = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: 1,
  article_id: 2,
  from_position: 2,
  to_position: 8,
  selected_text: "example",
  color: "yellow",
  comment: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...overrides,
});

describe("annotation ranges", () => {
  it("accepts only positive ordered integer positions", () => {
    expect(isValidAnnotationRange(2, 8)).toBe(true);
    expect(isValidAnnotationRange(8, 8)).toBe(false);
    expect(isValidAnnotationRange(8, 2)).toBe(false);
    expect(isValidAnnotationRange(1.5, 4)).toBe(false);
  });

  it("filters ranges outside the current ProseMirror document", () => {
    expect(
      filterRenderableAnnotations(
        [annotation(), annotation({ id: 2, from_position: 20, to_position: 30 })],
        12,
      ).map((item) => item.id),
    ).toEqual([1]);
  });
});
