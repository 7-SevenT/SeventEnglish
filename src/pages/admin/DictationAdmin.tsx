import { useEffect, useState } from "react";
import { createBook, createUnit, deleteBook, deleteUnit, deleteWord, getDictationOverview, uploadWord } from "../../api/admin";
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
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [error, setError] = useState("");

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
          {expandedId === book.id && <div className="admin-unit-list"><div className="admin-unit-list__header"><span>单元</span><button type="button" className="btn btn--ghost btn--sm" onClick={() => setUnitDrawer(book.id)}>＋ 新增单元</button></div>{(units[book.id] ?? []).length === 0 ? <p className="empty">暂无单元</p> : (units[book.id] ?? []).map((unit) => <div className="admin-unit-row" key={unit.id}><div><strong>{unit.name}</strong><span>{words[unit.id] ? `${words[unit.id].length} 个词条` : "点击查看词条"}</span></div><div><button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadWords(unit.id)}>查看</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => openImport(book.id, unit.id)}>导入</button><button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleteTarget({ type: "unit", id: unit.id, bookId: book.id })}>删除</button></div>{words[unit.id] && <div className="admin-word-list">{words[unit.id].length === 0 ? <span className="muted">暂无词条</span> : words[unit.id].map((word) => <div className="admin-word-row" key={word.id}><span className="admin-word-row__main"><span>{word.word}</span>{word.audio_key ? <span className="tts-badge tts-badge--audio">音频</span> : <span className="tts-badge" title="无音频文件，听写时用浏览器语音合成朗读">TTS</span>}</span><span className="admin-word-row__actions">{!word.audio_key && <button type="button" className="btn btn--ghost btn--sm" onClick={() => previewTts(word.word)}>试听</button>}<button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleteTarget({ type: "word", id: word.id, bookId: book.id })}>删除</button></span></div>)}</div>}</div>)}</div>}
        </section>
      ))}</div>}
      <AdminDrawer open={bookDrawer} title="新建单词书" onClose={() => setBookDrawer(false)} footer={<><button type="button" className="btn btn--ghost" onClick={() => setBookDrawer(false)}>取消</button><button type="button" className="btn btn--primary" onClick={() => void saveBook()}>创建单词书</button></>}><div className="admin-field"><label htmlFor="book-name">单词书名称</label><input id="book-name" className="input" value={bookName} onChange={(event) => setBookName(event.target.value)} /></div><div className="admin-field"><label htmlFor="book-description">描述 <span className="admin-field__hint">可选</span></label><textarea id="book-description" className="textarea" value={bookDescription} onChange={(event) => setBookDescription(event.target.value)} /></div></AdminDrawer>
      <AdminDrawer open={unitDrawer !== null} title="新增单元" onClose={() => setUnitDrawer(null)} footer={<><button type="button" className="btn btn--ghost" onClick={() => setUnitDrawer(null)}>取消</button><button type="button" className="btn btn--primary" onClick={() => void saveUnit()}>创建单元</button></>}><div className="admin-field"><label htmlFor="unit-name">单元名称</label><input id="unit-name" className="input" value={unitName} onChange={(event) => setUnitName(event.target.value)} /></div></AdminDrawer>
      <DictationImportDrawer open={importState !== null} books={bookOptions} units={importUnits} bookId={importBook} unitId={importState?.unitId ?? null} onBookChange={(id) => { setImportState(() => ({ bookId: id, unitId: null })); if (id !== null && !units[id]) void loadUnits(id); }} onUnitChange={(id) => setImportState((current) => current ? { ...current, unitId: id } : current)} onClose={() => setImportState(null)} uploadWord={uploadWord} onUploaded={async (message) => { setToast({ message: message ?? "音频导入完成", tone: "success" }); await loadBooks(); if (importBook !== null) await loadUnits(importBook); }} />
      <ConfirmDialog open={deleteTarget !== null} title="确认删除" description="删除后相关资源将无法恢复，请确认继续。" confirmLabel="确认删除" onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
      {toast && <AdminToast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
