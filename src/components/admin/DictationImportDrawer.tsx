import { useEffect, useMemo, useState } from "react";
import type { Unit, WordBook } from "../../../worker/src/db";
import { audioWordFromFilename, isSupportedAudioFile } from "../../lib/adminImport";
import { normalizeWord, parseWordListText } from "../../lib/textImport";
import { bulkImportWords } from "../../api/admin";
import { listWords } from "../../api/listen";
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
  onUploaded: (message?: string) => Promise<void> | void;
};

type ImportTab = "audio" | "text";

interface PreviewRow {
  line: number;
  word: string;
  definition: string;
  status: "ok" | "duplicate" | "error";
  message?: string;
}

export function DictationImportDrawer({ open, books, units, bookId, unitId, onBookChange, onUnitChange, onClose, uploadWord, onUploaded }: Props) {
  const [tab, setTab] = useState<ImportTab>("audio");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [existingWords, setExistingWords] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  // 文本页签下加载单元已有词条，用于重复标记（仅提示，去重以后端为准）
  useEffect(() => {
    if (tab !== "text" || !unitId) return;
    let cancelled = false;
    setExistingWords(new Set());
    listWords(unitId)
      .then((words) => {
        if (!cancelled) setExistingWords(new Set(words.map((w) => normalizeWord(w.word))));
      })
      .catch(() => {
        // 加载失败不阻塞导入；后端仍会去重
      });
    return () => {
      cancelled = true;
    };
  }, [tab, unitId]);

  const parse = useMemo(() => parseWordListText(text), [text]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    const itemsByLine = new Map(parse.items.map((i) => [i.line, i]));
    const errorsByLine = new Map(parse.errors.map((e) => [e.line, e]));
    return text
      .replace(/\r/g, "")
      .split("\n")
      .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
      .filter((row) => row.raw.length > 0)
      .map((row) => {
        const err = errorsByLine.get(row.line);
        if (err) {
          return { line: row.line, word: row.raw, definition: "", status: "error" as const, message: err.message };
        }
        const item = itemsByLine.get(row.line);
        if (!item) return { line: row.line, word: row.raw, definition: "", status: "error" as const, message: "无法解析" };
        const dup = existingWords.has(normalizeWord(item.word));
        return {
          line: item.line,
          word: item.word,
          definition: item.definition,
          status: dup ? "duplicate" : "ok",
          message: dup ? "单元内已存在，导入时跳过" : undefined,
        };
      });
  }, [text, parse, existingWords]);

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

  async function doTextImport() {
    if (!unitId || parse.items.length === 0) return;
    setImporting(true);
    setImportMessage("");
    try {
      const res = await bulkImportWords(unitId, parse.items.map((i) => ({ word: i.word, definition: i.definition })));
      const summary = [`已导入 ${res.created} 个词条`];
      if (res.skipped > 0) summary.push(`跳过 ${res.skipped} 个（重复/无效）`);
      const message = summary.join("，");
      setImportMessage(message);
      setText("");
      setExistingWords(new Set());
      await onUploaded(`文本导入完成：${message}`);
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "导入失败，请稍后重试");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AdminDrawer open={open} title="导入听写词条" description="音频导入自动从文件名解析答案；文本导入直接粘贴整单元单词。" dirty={items.some((item) => item.status === "queued" || item.status === "failed")} onClose={onClose}>
      <div className="admin-import-steps"><span className="admin-import-step admin-import-step--active">1 选择位置</span><span>→</span><span className={unitId ? "admin-import-step admin-import-step--active" : "admin-import-step"}>{tab === "text" ? "2 粘贴单词" : "2 导入音频"}</span></div>
      <div className="import-tabs" role="tablist" aria-label="导入方式">
        <button type="button" role="tab" aria-selected={tab === "audio"} className={`import-tab${tab === "audio" ? " import-tab--active" : ""}`} onClick={() => { setTab("audio"); setImportMessage(""); }}>音频导入</button>
        <button type="button" role="tab" aria-selected={tab === "text"} className={`import-tab${tab === "text" ? " import-tab--active" : ""}`} onClick={() => { setTab("text"); setImportMessage(""); }}>文本导入</button>
      </div>
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

      {tab === "audio" && (
        <>
          <label className="admin-file-drop" htmlFor="dictation-audio-files">
            <input id="dictation-audio-files" aria-label="导入音频文件" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac" multiple onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
            <span><strong>拖入多个音频文件</strong>支持 MP3 / WAV / M4A / OGG / AAC</span>
          </label>
          {items.length > 0 && unitId && <UploadQueue unitId={unitId} items={items} uploadWord={uploadWord} onChange={setItems} onComplete={() => void onUploaded()} />}
        </>
      )}

      {tab === "text" && (
        <div className="import-text">
          <textarea
            className="textarea import-text__area"
            aria-label="粘贴单词列表"
            placeholder={"每行一个单词，Tab 或逗号后跟释义（可选）：\napple\t苹果\nbanana\t香蕉\ncherry"}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
          />
          <p className="import-text__hint">每行一个单词；Tab、逗号或两个以上空格分隔释义（可选）。纯单词列表同样支持。</p>
          {previewRows.length > 0 && (
            <div className="import-preview">
              <div className="import-preview__head"><span>行</span><span>单词</span><span>释义</span><span>状态</span></div>
              {previewRows.map((row) => (
                <div key={row.line} className={`import-preview__row${row.status === "error" ? " import-preview__row--error" : ""}${row.status === "duplicate" ? " import-preview__row--duplicate" : ""}`}>
                  <span>{row.line}</span>
                  <span>{row.word}</span>
                  <span>{row.definition || "—"}</span>
                  <span>{row.status === "ok" ? "待导入" : (row.message ?? "")}</span>
                </div>
              ))}
            </div>
          )}
          {importMessage && <p className={`alert ${importMessage.startsWith("文本导入完成") ? "alert--success" : "alert--error"}`}>{importMessage}</p>}
          <div className="admin-drawer-actions">
            <button type="button" className="btn btn--primary" disabled={!unitId || parse.items.length === 0 || importing} onClick={() => void doTextImport()}>
              {importing ? "导入中..." : `导入 ${parse.items.length} 个词条`}
            </button>
          </div>
        </div>
      )}
    </AdminDrawer>
  );
}
