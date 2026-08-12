import { useState } from "react";
import type { Annotation } from "../../worker/src/db";

export type AnnotationPopoverProps = {
  annotation: Annotation;
  onEdit: (comment: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function AnnotationPopover({ annotation, onEdit, onDelete, onClose }: AnnotationPopoverProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation.comment ?? "");

  function save() {
    onEdit(draft.trim() || null);
    setEditing(false);
  }

  return (
    <div className="annotation-popover" role="dialog" aria-label="标记评论" onClick={(event) => event.stopPropagation()}>
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
