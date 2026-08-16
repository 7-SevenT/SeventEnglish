import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node as TiptapNode } from "@tiptap/core";
import type { Annotation, ParagraphAnalysis } from "../../worker/src/db";
import { AnnotationMark, AiHighlightMark } from "./AnnotationMark";
import { buildArticleDoc } from "../lib/articleDocument";

function textNode(tag: string, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderAnalysis(container: HTMLElement, analysis: ParagraphAnalysis | null) {
  if (!analysis) return;
  const details = document.createElement("details");
  details.className = "analysis-disclosure";
  const summary = document.createElement("summary");
  summary.textContent = "段落翻译 & 表达积累";
  details.appendChild(summary);
  const content = document.createElement("div");
  content.className = "analysis-content";

  const translation = document.createElement("section");
  translation.className = "analysis-section";
  translation.appendChild(textNode("h4", "段落翻译"));
  translation.appendChild(textNode("p", analysis.translation, "analysis-translation"));
  content.appendChild(translation);

  const vocabulary = document.createElement("section");
  vocabulary.className = "analysis-section";
  vocabulary.appendChild(textNode("h4", "最值得积累的英语表达"));
  if (analysis.expressions.length === 0) {
    vocabulary.appendChild(textNode("p", "本段暂无值得积累的表达。", "muted"));
  } else {
    const list = document.createElement("div");
    list.className = "analysis-highlight-list";
    for (const expression of analysis.expressions) {
      const item = document.createElement("div");
      item.className = "analysis-word";
      const main = document.createElement("div");
      main.className = "analysis-word__main";
      main.appendChild(textNode("strong", expression.text, "analysis-word__text"));
      main.appendChild(textNode("span", expression.meaning, "analysis-word__meaning"));
      item.appendChild(main);
      if (expression.usage) {
        const usageEl = document.createElement("div");
        usageEl.className = "analysis-word__usage";
        usageEl.appendChild(textNode("span", "Usage:", "analysis-word__label"));
        usageEl.appendChild(document.createTextNode(` ${expression.usage}`));
        item.appendChild(usageEl);
      }
      if (expression.example) {
        const exampleEl = document.createElement("div");
        exampleEl.className = "analysis-word__example";
        exampleEl.appendChild(textNode("span", "Example:", "analysis-word__label"));
        exampleEl.appendChild(document.createTextNode(` ${expression.example}`));
        item.appendChild(exampleEl);
      }
      list.appendChild(item);
    }
    vocabulary.appendChild(list);
  }
  content.appendChild(vocabulary);

  details.appendChild(content);
  container.appendChild(details);
}

const DocumentNode = TiptapNode.create({
  name: "doc",
  topNode: true,
  content: "block+",
});

const ParagraphNode = TiptapNode.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  addAttributes() {
    return {
      paragraphIndex: { default: 0 },
      analysis: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "div.article-paragraph" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { class: "article-paragraph", ...HTMLAttributes }, ["p", { class: "article-paragraph__text" }, 0]];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "article-paragraph";
      dom.dataset.paragraphIndex = String(node.attrs.paragraphIndex);
      const text = document.createElement("p");
      text.className = "article-paragraph__text";
      const analysis = document.createElement("div");
      analysis.className = "article-paragraph__analysis";
      renderAnalysis(analysis, node.attrs.analysis as ParagraphAnalysis | null);
      dom.appendChild(text);
      dom.appendChild(analysis);
      return { dom, contentDOM: text, ignoreMutation: (mutation) => mutation.type !== "selection" };
    };
  },
});

const TextNode = TiptapNode.create({
  name: "text",
  group: "inline",
});

const extensions = [DocumentNode, ParagraphNode, TextNode, AiHighlightMark, AnnotationMark];

export type ReadingSelection = {
  from: number;
  to: number;
  text: string;
  rect: DOMRect;
};

export type ReadingDocumentProps = {
  paragraphs: ParagraphAnalysis[];
  annotations: Annotation[];
  onSelectionChange: (selection: ReadingSelection | null) => void;
  onAnnotationClick?: (annotation: Annotation) => void;
  showAnalysis?: boolean;
};

export function ReadingDocument({ paragraphs, annotations, onSelectionChange, onAnnotationClick, showAnalysis = true }: ReadingDocumentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const content = useMemo(() => buildArticleDoc(paragraphs, annotations, showAnalysis), [paragraphs, annotations, showAnalysis]);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    onSelectionUpdate: ({ editor: current }) => {
      const { from, to } = current.state.selection;
      if (from === to || !rootRef.current?.contains(current.view.dom)) {
        onSelectionChange(null);
        return;
      }
      const start = current.view.coordsAtPos(from);
      const end = current.view.coordsAtPos(to);
      onSelectionChange({
        from,
        to,
        text: current.state.doc.textBetween(from, to, "\n"),
        rect: new DOMRect(start.left, start.top, Math.max(1, end.right - start.left), Math.max(1, end.bottom - start.top)),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);

  useEffect(() => {
    const close = () => onSelectionChange(null);
    document.addEventListener("scroll", close, true);
    return () => document.removeEventListener("scroll", close, true);
  }, [onSelectionChange]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-annotation-id]");
    if (!target || !onAnnotationClick) return;
    const annotation = annotations.find((item) => item.id === Number(target.dataset.annotationId));
    if (annotation) onAnnotationClick(annotation);
  }

  if (!editor) return <div className="reading-document" aria-busy="true" />;
  return (
    <div ref={rootRef} className="reading-document" onClick={handleClick}>
      <EditorContent editor={editor} />
    </div>
  );
}
