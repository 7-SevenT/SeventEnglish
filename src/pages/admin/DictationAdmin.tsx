import { useEffect, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createBook, createUnit, deleteBook, deleteUnit, deleteWord, getDictationOverview, reorderUnits, updateWord, uploadWord } from "../../api/admin";
import { listUnits, listWords } from "../../api/listen";
import type { Unit, Word, WordBook, WordBookOverview } from "../../../worker/src/db";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AdminDrawer } from "../../components/admin/AdminDrawer";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminToast, type ToastTone } from "../../components/admin/AdminToast";
import { DictationImportDrawer } from "../../components/admin/DictationImportDrawer";
import { EmptyState } from "../../components/admin/EmptyState";
import { isSpeechSynthesisSupported, pickEnglishVoice } from "../../hooks/useSpeechSynthesis";
import { toEnglishSpokenText } from "../../lib/englishSpoken";

type SortableUnitRowProps = {
  unit: Unit;
  words: Word[] | undefined;
  onLoadWords: (unitId: number) => void;
  onImport: (unitId: number) => void;
  onDelete: (unit: Unit) => void;
  onDeleteWord: (word: Word) => void;
  onEditWord: (word: Word) => void;
  onPreviewTts: (word: string) => void;
};

function SortableUnitRow({ unit, words, onLoadWords, onImport, onDelete, onDeleteWord, onEditWord, onPreviewTts }: SortableUnitRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={`admin-unit-row${isDragging ? " admin-unit-row--dragging" : ""}`}>
      <div>
        <div className="admin-unit-row__name">
          <span className="admin-drag-handle" title="拖动排序" {...attributes} {...listeners}>⠿</span>
          <strong>{unit.name}</strong>
        </div>
        <span>{words ? `${words.length} 个词条` : "点击查看词条"}</span>
      </div>
      <div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onLoadWords(unit.id)}>查看</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onImport(unit.id)}>导入</button>
        <button type="button" className="btn btn--danger btn--sm" onClick={() => onDelete(unit)}>删除</button>
      </div>
      {words && <div className="admin-word-list">{words.length === 0 ? <span className="muted">暂无词条</span> : words.map((word) => (
        <div className="admin-word-row" key={word.id}>
          <span className="admin-word-row__main">
            <span>{word.word}</span>
            {word.audio_key ? <span className="tts-badge tts-badge--audio">音频</span> : <span className="tts-badge" title="无音频文件，听写时用浏览器语音合成朗读">TTS</span>}
          </span>
          <span className="admin-word-row__actions">
            {!word.audio_key && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPreviewTts(word.word)}>试听</button>}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEditWord(word)}>编辑</button>
            <button type="button" className="btn btn--danger btn--sm" onClick={() => onDeleteWord(word)}>删除</button>
          </span>
        </div>
      ))}</div>}
    </div>
  );
}

export function DictationAdmin() {
  const [books, setBooks] = useState<WordBookOverview[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [units, setUnits] = useState<Record<number, Unit[]>>({});
  const [words, setWords] = useState<Record<number, Word[]>>({});
  const [bookDrawer, setBookDrawer] = useState(false);
  const [unitDrawer, setUnitDrawer] = useState<number | null>(null);
  const [importState, setImportState] = useState<{ bookId: number | null; unitId: number | null } | null>(null);
  const [bookName, setBookName] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [unitName, setUnitName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "book" | "unit" | "word"; id: number; bookId?: number } | null>(null);
  const [editTarget, setEditTarget] = useState<Word | null>(null);
  const [editWordText, setEditWordText] = useState("");
  const [editDefinition, setEditDefinition] = useState("");
  const [savingWord, setSavingWord] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [error, setError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function loadBooks() {
    try {
      setBooks(await getDictationOverview());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "听写资源加载失败");
    }
  }

  useEffect(() => { void loadBooks(); }, []);

  async function loadUnits(bookId: number) {
    try {
      const next = await listUnits(bookId);
      setUnits((current) => ({ ...current, [bookId]: next }));
      return next;
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "单元加载失败", tone: "error" });
      return [];
    }
  }

  async function toggleBook(bookId: number) {
    if (expandedId === bookId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(bookId);
    if (!units[bookId]) await loadUnits(bookId);
  }

  async function loadWords(unitId: number) {
    try {
      const next = await listWords(unitId);
      setWords((current) => ({ ...current, [unitId]: next }));
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "单词加载失败", tone: "error" });
    }
  }

  async function saveBook() {
    if (!bookName.trim()) return setError("单词书名不能为空");
    try {
      await createBook({ name: bookName.trim(), description: bookDescription.trim() });
      setBookName("");
      setBookDescription("");
      setBookDrawer(false);
      setToast({ message: "单词书已创建", tone: "success" });
      await loadBooks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建单词书失败");
    }
  }

  async function saveUnit() {
    if (unitDrawer === null || !unitName.trim()) return setError("单元名不能为空");
    try {
      await createUnit(unitDrawer, { name: unitName.trim() });
      setUnitName("");
      setUnitDrawer(null);
      setToast({ message: "单元已创建", tone: "success" });
      await loadUnits(unitDrawer);
      await loadBooks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建单元失败");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "book") await deleteBook(deleteTarget.id);
      if (deleteTarget.type === "unit") await deleteUnit(deleteTarget.id);
      if (deleteTarget.type === "word") await deleteWord(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ message: "已删除", tone: "success" });
      await loadBooks();
      if (deleteTarget.bookId) await loadUnits(deleteTarget.bookId);
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "删除失败", tone: "error" });
    }
  }

  function openImport(bookId: number | null, unitId: number | null) {
    setImportState({ bookId, unitId });
    if (bookId !== null && !units[bookId]) void loadUnits(bookId);
  }

  function previewTts(word: string) {
    if (!isSpeechSynthesisSupported()) {
      setToast({ message: "当前浏览器不支持语音合成", tone: "error" });
      return;
    }
    window.speechSynthesis.cancel();
    // 朗读文本先做数字→英文单词预处理（与听写页一致），避免数字被中文朗读
    const utterance = new SpeechSynthesisUtterance(toEnglishSpokenText(word));
    const voice = pickEnglishVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    // 找不到英文语音时至少显式指定英文，避免落回默认（中文）语音朗读
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }

  async function handleDragEnd(event: DragEndEvent, bookId: number) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = units[bookId] ?? [];
    const oldIndex = list.findIndex((unit) => unit.id === active.id);
    const newIndex = list.findIndex((unit) => unit.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    setUnits((current) => ({ ...current, [bookId]: next }));
    try {
      await reorderUnits(bookId, next.map((unit) => unit.id));
      setToast({ message: "单元顺序已保存", tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "排序保存失败", tone: "error" });
      await loadUnits(bookId);
    }
  }

  function openWordEditor(word: Word) {
    setEditTarget(word);
    setEditWordText(word.word);
    setEditDefinition(word.definition ?? "");
  }

  async function saveWordEdit() {
    if (!editTarget) return;
    if (!editWordText.trim()) return setError("单词不能为空");
    setSavingWord(true);
    setError("");
    try {
      await updateWord(editTarget.id, { word: editWordText.trim(), definition: editDefinition.trim() });
      setToast({ message: "单词已更新", tone: "success" });
      setEditTarget(null);
      await loadWords(editTarget.unit_id);
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "保存失败", tone: "error" });
    } finally {
      setSavingWord(false);
    }
  }

  const importBook = importState?.bookId ?? null;
  const importUnits = importBook === null ? [] : units[importBook] ?? [];
  const bookOptions = books as WordBook[];

  return (
    <>
      <AdminHeader eyebrow="LISTENING WORKSPACE" title="听写" description="管理单词书、单元和音频词条，让批量导入更顺手。" action={<><button type="button" className="btn btn--ghost" onClick={() => setBookDrawer(true)}>＋ 新建单词书</button><button type="button" className="btn btn--primary" onClick={() => openImport(null, null)}>＋ 导入听写音频</button></>} />
      {error && <div className="alert alert--error">{error}</div>}
      {books.length === 0 ? <div className="admin-panel"><EmptyState title="还没有单词书" description="创建一本单词书，再开始批量导入听写音频。" action={<button type="button" className="btn btn--primary" onClick={() => setBookDrawer(true)}>新建单词书</button>} /></div> : <div className="admin-book-grid">{books.map((book) => (
        <section className={`admin-book-card${expandedId === book.id ? " admin-book-card--expanded" : ""}`} key={book.id}>
          <div className="admin-book-card__header"><div><h2>{book.name}</h2><p>{book.description || "暂无描述"}</p></div><button type="button" className="admin-icon-button" aria-label={`删除 ${book.name}`} onClick={() => setDeleteTarget({ type: "book", id: book.id })}>×</button></div>
          <div className="admin-book-card__stats"><span><b>{book.unit_count}</b> 单元</span><span><b>{book.word_count}</b> 音频词条</span></div>
          <div className="admin-book-card__actions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => void toggleBook(book.id)}>{expandedId === book.id ? "收起单元" : "查看单元"}</button><button type="button" className="btn btn--primary btn--sm" onClick={() => openImport(book.id, null)}>导入音频</button></div>
          {expandedId === book.id && <div className="admin-unit-list"><div className="admin-unit-list__header"><span>单元 <span className="admin-drag-hint">（拖住 ⠿ 可排序）</span></span><button type="button" className="btn btn--ghost btn--sm" onClick={() => setUnitDrawer(book.id)}>＋ 新增单元</button></div>{(units[book.id] ?? []).length === 0 ? <p className="empty">暂无单元</p> : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event, book.id)}>
              <SortableContext items={(units[book.id] ?? []).map((unit) => unit.id)} strategy={verticalListSortingStrategy}>
                {(units[book.id] ?? []).map((unit) => (
                  <SortableUnitRow
                    key={unit.id}
                    unit={unit}
                    words={words[unit.id]}
                    onLoadWords={(unitId) => void loadWords(unitId)}
                    onImport={(unitId) => openImport(book.id, unitId)}
                    onDelete={(target) => setDeleteTarget({ type: "unit", id: target.id, bookId: book.id })}
                    onDeleteWord={(word) => setDeleteTarget({ type: "word", id: word.id, bookId: book.id })}
                    onEditWord={openWordEditor}
                    onPreviewTts={previewTts}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}</div>}
        </section>
      ))}</div>}
      <AdminDrawer open={bookDrawer} title="新建单词书" onClose={() => setBookDrawer(false)} footer={<><button type="button" className="btn btn--ghost" onClick={() => setBookDrawer(false)}>取消</button><button type="button" className="btn btn--primary" onClick={() => void saveBook()}>创建单词书</button></>}><div className="admin-field"><label htmlFor="book-name">单词书名称</label><input id="book-name" className="input" value={bookName} onChange={(event) => setBookName(event.target.value)} /></div><div className="admin-field"><label htmlFor="book-description">描述 <span className="admin-field__hint">可选</span></label><textarea id="book-description" className="textarea" value={bookDescription} onChange={(event) => setBookDescription(event.target.value)} /></div></AdminDrawer>
      <AdminDrawer open={unitDrawer !== null} title="新增单元" onClose={() => setUnitDrawer(null)} footer={<><button type="button" className="btn btn--ghost" onClick={() => setUnitDrawer(null)}>取消</button><button type="button" className="btn btn--primary" onClick={() => void saveUnit()}>创建单元</button></>}><div className="admin-field"><label htmlFor="unit-name">单元名称</label><input id="unit-name" className="input" value={unitName} onChange={(event) => setUnitName(event.target.value)} /></div></AdminDrawer>
      <AdminDrawer open={editTarget !== null} title="编辑单词" onClose={() => setEditTarget(null)} footer={<><button type="button" className="btn btn--ghost" onClick={() => setEditTarget(null)}>取消</button><button type="button" className="btn btn--primary" disabled={savingWord} onClick={() => void saveWordEdit()}>{savingWord ? "保存中…" : "保存"}</button></>}>
        <div className="admin-field"><label htmlFor="word-text">单词</label><input id="word-text" className="input" value={editWordText} onChange={(event) => setEditWordText(event.target.value)} /></div>
        <div className="admin-field"><label htmlFor="word-definition">释义 <span className="admin-field__hint">可选</span></label><textarea id="word-definition" className="textarea" rows={3} value={editDefinition} onChange={(event) => setEditDefinition(event.target.value)} /></div>
        {editTarget?.audio_key ? <p className="muted">该词条有音频文件，编辑后音频保持不变。</p> : <p className="muted">该词条为 TTS 词条，编辑后仍使用浏览器语音合成朗读。</p>}
      </AdminDrawer>
      <DictationImportDrawer open={importState !== null} books={bookOptions} units={importUnits} bookId={importBook} unitId={importState?.unitId ?? null} onBookChange={(id) => { setImportState(() => ({ bookId: id, unitId: null })); if (id !== null && !units[id]) void loadUnits(id); }} onUnitChange={(id) => setImportState((current) => current ? { ...current, unitId: id } : current)} onClose={() => setImportState(null)} uploadWord={uploadWord} onUploaded={async (message) => { setToast({ message: message ?? "音频导入完成", tone: "success" }); await loadBooks(); if (importBook !== null) await loadUnits(importBook); }} />
      <ConfirmDialog open={deleteTarget !== null} title="确认删除" description="删除后相关资源将无法恢复，请确认继续。" confirmLabel="确认删除" onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
      {toast && <AdminToast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
