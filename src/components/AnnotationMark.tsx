import { Mark } from "@tiptap/core";
import type { Annotation } from "../../worker/src/db";

export const AnnotationMark = Mark.create({
  name: "annotation",
  addAttributes() {
    return {
      annotationId: { default: null },
      color: { default: "yellow" satisfies Annotation["color"] },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-annotation-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", { "data-annotation-id": HTMLAttributes.annotationId, "data-color": HTMLAttributes.color, class: `annotation-mark annotation-mark--${HTMLAttributes.color}` }, 0];
  },
});

export const AiHighlightMark = Mark.create({
  name: "aiHighlight",
  parseHTML() {
    return [{ tag: "strong.article-highlight" }];
  },
  renderHTML() {
    return ["strong", { class: "article-highlight" }, 0];
  },
});
