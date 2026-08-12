import type { Annotation } from "../../worker/src/db";

export type AnnotationPosition = { from: number; to: number };

export type AnnotationInput = {
  from: number;
  to: number;
  selected_text: string;
  color: Annotation["color"];
  comment: string | null;
};

export function isValidAnnotationRange(from: number, to: number): boolean {
  return Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to > from;
}

export function filterRenderableAnnotations(annotations: Annotation[], documentSize: number): Annotation[] {
  return annotations.filter(
    (annotation) =>
      isValidAnnotationRange(annotation.from_position, annotation.to_position) &&
      annotation.to_position <= documentSize,
  );
}
