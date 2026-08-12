import { useState } from "react";
import { StatusBadge } from "./StatusBadge";

export type UploadItem = {
  id: string;
  file: File;
  word: string;
  status: "queued" | "uploading" | "success" | "failed";
  progress: number;
  error?: string;
};

type Props = {
  unitId: number;
  items: UploadItem[];
  uploadWord: (unitId: number, file: File, word?: string) => Promise<unknown>;
  onChange: (items: UploadItem[]) => void;
  onComplete: () => void;
};

export function UploadQueue({ unitId, items, uploadWord, onChange, onComplete }: Props) {
  const [queue, setQueue] = useState(items);
  const [busy, setBusy] = useState(false);

  function publish(next: UploadItem[]) {
    setQueue(next);
    onChange(next);
  }

  function updateItem(id: string, patch: Partial<UploadItem>, current: UploadItem[]): UploadItem[] {
    return current.map((item) => item.id === id ? { ...item, ...patch } : item);
  }

  async function run(ids: string[]) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    let current = queue;
    const pending = [...ids];
    const worker = async () => {
      while (pending.length > 0) {
        const id = pending.shift();
        if (!id) return;
        const item = current.find((candidate) => candidate.id === id);
        if (!item) continue;
        current = updateItem(id, { status: "uploading", progress: 8, error: undefined }, current);
        publish(current);
        try {
          await uploadWord(unitId, item.file, item.word.trim() || undefined);
          current = updateItem(id, { status: "success", progress: 100 }, current);
        } catch (cause) {
          current = updateItem(id, { status: "failed", progress: 0, error: cause instanceof Error ? cause.message : "上传失败" }, current);
        }
        publish(current);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()));
    setBusy(false);
    if (current.length > 0 && current.every((item) => item.status === "success")) onComplete();
  }

  function updateWord(id: string, word: string) {
    publish(queue.map((item) => item.id === id ? { ...item, word } : item));
  }

  const failedCount = queue.filter((item) => item.status === "failed").length;
  const queuedIds = queue.filter((item) => item.status === "queued").map((item) => item.id);
  const completeCount = queue.filter((item) => item.status === "success").length;

  return (
    <div className="admin-upload-queue">
      <div className="admin-upload-queue__summary"><span>{completeCount} / {queue.length} 已完成</span><span>{failedCount ? `${failedCount} 个失败` : busy ? "上传中…" : "准备就绪"}</span></div>
      <div className="admin-upload-queue__list">
        {queue.map((item) => (
          <div className="admin-upload-item" key={item.id}>
            <div className="admin-upload-item__name"><strong>{item.file.name}</strong><span>{item.file.size ? `${Math.ceil(item.file.size / 1024)} KB` : "音频"}</span></div>
            <input className="input admin-upload-item__word" aria-label={`${item.file.name} 的答案`} value={item.word} disabled={item.status === "success" || busy} onChange={(event) => updateWord(item.id, event.target.value)} />
            <StatusBadge status={item.status === "failed" ? "failed-upload" : item.status} />
            {item.status === "uploading" && <div className="admin-upload-item__progress" aria-label={`${item.file.name} 上传进度`}><i style={{ width: `${item.progress}%` }} /></div>}
            {item.status === "failed" && <span className="admin-upload-item__error">失败，可重试</span>}
          </div>
        ))}
      </div>
      <div className="admin-upload-queue__actions">
        {failedCount > 0 && <button type="button" className="btn btn--ghost" onClick={() => void run(queue.filter((item) => item.status === "failed").map((item) => item.id))} disabled={busy}>重试失败项</button>}
        <button type="button" className="btn btn--primary" onClick={() => void run(queuedIds)} disabled={busy || queuedIds.length === 0}>{busy ? "上传中…" : "开始上传"}</button>
      </div>
    </div>
  );
}
