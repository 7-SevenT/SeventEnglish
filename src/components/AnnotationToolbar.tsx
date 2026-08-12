import type { ReadingSelection } from "./ReadingDocument";

export type AnnotationToolbarProps = {
  selection: ReadingSelection | null;
  onHighlight: () => void;
  onComment: () => void;
  onCancel: () => void;
};

export function AnnotationToolbar({ selection, onHighlight, onComment, onCancel }: AnnotationToolbarProps) {
  if (!selection) return null;
  const toolbarWidth = 220;
  const edge = 12;
  const center = selection.rect.left + selection.rect.width / 2;
  const left = Math.min(Math.max(center, edge + toolbarWidth / 2), window.innerWidth - edge - toolbarWidth / 2);
  const preferredTop = selection.rect.top - 48;
  const top = preferredTop >= edge ? preferredTop : selection.rect.bottom + 8;
  return (
    <div className="annotation-toolbar" style={{ top, left }} role="toolbar" aria-label="文字标注工具">
      <button type="button" className="annotation-tool annotation-tool--highlight" onClick={onHighlight}><span aria-hidden="true">▰</span> 荧光</button>
      <button type="button" className="annotation-tool" onClick={onComment}><span aria-hidden="true">◌</span> 评论</button>
      <button type="button" className="annotation-tool annotation-tool--close" onClick={onCancel} aria-label="关闭">×</button>
    </div>
  );
}
