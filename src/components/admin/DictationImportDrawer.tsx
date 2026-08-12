import { useState } from "react";
import type { Unit, WordBook } from "../../../worker/src/db";
import { audioWordFromFilename, isSupportedAudioFile } from "../../lib/adminImport";
import { AdminDrawer } from "./AdminDrawer";
import { UploadQueue, type UploadItem } from "./UploadQueue";

type Props = {
  open: boolean;
  books: WordBook[];
  units: Unit[];
  bookId: number | null;
  unitId: number | null;
  onBookChange: (id: number | null) => void;
  onUnitChange: (id: number | null) => void;
  onClose: () => void;
  uploadWord: (unitId: number, file: File, word?: string) => Promise<unknown>;
  onUploaded: () => Promise<void> | void;
};

export function DictationImportDrawer({ open, books, units, bookId, unitId, onBookChange, onUnitChange, onClose, uploadWord, onUploaded }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState("");

  function selectFiles(files: File[]) {
    if (!unitId) {
      setError("请先选择单词书和单元");
      return;
    }
    const accepted = files.filter(isSupportedAudioFile);
    if (accepted.length !== files.length) setError("已跳过不支持的文件格式");
    if (accepted.length === 0) return;
    setItems(accepted.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      file,
      word: audioWordFromFilename(file.name),
      status: "queued",
      progress: 0,
    })));
  }

  return (
    <AdminDrawer open={open} title="导入听写音频" description="文件名会自动解析为答案，可在上传前逐条修正。" dirty={items.some((item) => item.status === "queued" || item.status === "failed")} onClose={onClose}>
      <div className="admin-import-steps"><span className="admin-import-step admin-import-step--active">1 选择位置</span><span>→</span><span className={unitId ? "admin-import-step admin-import-step--active" : "admin-import-step"}>2 导入音频</span></div>
      {error && <p className="alert alert--error">{error}</p>}
      <div className="admin-field">
        <label htmlFor="dictation-book">单词书</label>
        <select id="dictation-book" className="input" value={bookId ?? ""} onChange={(event) => onBookChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">选择单词书</option>
          {books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
        </select>
      </div>
      <div className="admin-field">
        <label htmlFor="dictation-unit">单元</label>
        <select id="dictation-unit" className="input" value={unitId ?? ""} onChange={(event) => onUnitChange(event.target.value ? Number(event.target.value) : null)} disabled={!bookId}>
          <option value="">选择单元</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </div>
      <label className="admin-file-drop" htmlFor="dictation-audio-files">
        <input id="dictation-audio-files" aria-label="导入音频文件" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac" multiple onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
        <span><strong>拖入多个音频文件</strong>支持 MP3 / WAV / M4A / OGG / AAC</span>
      </label>
      {items.length > 0 && unitId && <UploadQueue unitId={unitId} items={items} uploadWord={uploadWord} onChange={setItems} onComplete={() => void onUploaded()} />}
    </AdminDrawer>
  );
}
