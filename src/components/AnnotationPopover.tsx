import { useEffect, useState } from "react";
import type { Annotation } from "../../worker/src/db";

export type AnnotationPopoverProps = {
  annotation: Annotation;
  onEdit: (comment: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
};

const POPOVER_WIDTH = 280;
const EDGE = 12;
// 弹窗高度估算（引用区 + 操作区），用于下方空间不足时翻转到上方
const POPOVER_HEIGHT_ESTIMATE = 150;

function computePosition(rect: DOMRect): { top: number; left: number } {
  const left = Math.min(Math.max(rect.left + rect.width / 2 - POPOVER_WIDTH / 2, EDGE + POPOVER_WIDTH / 2), window.innerWidth - EDGE - POPOVER_WIDTH / 2);
  let top = rect.bottom + 8;
  if (top + POPOVER_HEIGHT_ESTIMATE > window.innerHeight - EDGE) top = Math.max(EDGE, rect.top - POPOVER_HEIGHT_ESTIMATE);
  return { top, left };
}

export function AnnotationPopover({ annotation, onEdit, onDelete, onClose }: AnnotationPopoverProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation.comment ?? "");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // 以正文中该标记（mark[data-annotation-id]）的实际位置为锚点弹出，替代固定在屏幕中央。
  useEffect(() => {
    const el = document.querySelector(`mark[data-annotation-id="${annotation.id}"]`);
    if (!(el instanceof HTMLElement)) return;
    setPosition(computePosition(el.getBoundingClientRect()));
  }, [annotation.id]);

  function save() {
    onEdit(draft.trim() || null);
    setEditing(false);
  }

  return (
    <div
      className="annotation-popover"
      role="dialog"
      aria-label="标记评论"
      style={position ? { top: position.top, left: position.left } : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className="annotation-popover__close" onClick={onClose} aria-label="关闭">×</button>
      {editing ? (
        <>
          <textarea autoFocus rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="评论内容" />
          <div className="annotation-popover__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={save}>保存</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>取消</button>
          </div>
        </>
      ) : (
        <>
          <p className="annotation-popover__quote">{annotation.comment ? `“${annotation.comment}”` : "荧光标记"}</p>
          <div className="annotation-popover__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>编辑评论</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDelete}>删除标记</button>
          </div>
        </>
      )}
    </div>
  );
}
