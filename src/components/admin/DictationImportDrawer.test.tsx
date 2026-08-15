// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DictationImportDrawer } from "./DictationImportDrawer";

vi.mock("../../api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/admin")>();
  return { ...actual, bulkImportWords: vi.fn() };
});
vi.mock("../../api/listen", () => ({
  listWords: vi.fn(async () => []),
}));

import { bulkImportWords } from "../../api/admin";

afterEach(cleanup);

const books = [{ id: 1, name: "Book", description: "", created_at: "2026-01-01" }];
const units = [{ id: 2, book_id: 1, name: "Unit 01", sort_order: 0, created_at: "2026-01-01" }];

function renderDrawer(overrides: Partial<Parameters<typeof DictationImportDrawer>[0]> = {}) {
  const props = {
    open: true,
    books,
    units,
    bookId: 1,
    unitId: 2,
    onBookChange: vi.fn(),
    onUnitChange: vi.fn(),
    onClose: vi.fn(),
    uploadWord: vi.fn(),
    onUploaded: vi.fn(),
    ...overrides,
  };
  return { ...render(<DictationImportDrawer {...props} />), props };
}

describe("DictationImportDrawer", () => {
  beforeEach(() => {
    vi.mocked(bulkImportWords).mockReset();
  });

  it("requires a unit before accepting an audio upload", () => {
    renderDrawer({ units: [], unitId: null, bookId: null });
    fireEvent.change(screen.getByLabelText("导入音频文件"), { target: { files: [new File(["x"], "word.mp3")] } });
    expect(screen.getByText("请先选择单词书和单元")).toBeTruthy();
    expect(screen.queryByText("word.mp3")).toBeNull();
  });

  it("parses audio filenames into editable answers", () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("导入音频文件"), { target: { files: [new File(["x"], "lesson-01.mp3")] } });
    expect(screen.getByDisplayValue("lesson-01")).toBeTruthy();
  });

  it("text tab parses pasted word list into a preview", async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("tab", { name: "文本导入" }));
    const textarea = await screen.findByLabelText("粘贴单词列表");
    fireEvent.change(textarea, { target: { value: "apple\t苹果\nbanana\n, 缺单词行\ncherry  樱桃" } });
    await waitFor(() => {
      expect(screen.getByText("apple")).toBeTruthy();
      expect(screen.getByText("cherry")).toBeTruthy();
    });
    // 4 个非空行：3 个可导入 + 1 个错误行（缺少单词）
    expect(document.querySelectorAll(".import-preview__row").length).toBe(4);
    expect(document.querySelectorAll(".import-preview__row--error").length).toBe(1);
    expect(screen.getAllByText("缺少单词").length).toBe(1);
    expect(screen.getAllByText("待导入").length).toBe(3);
  });

  it("text import calls bulkImportWords and notifies with summary", async () => {
    vi.mocked(bulkImportWords).mockResolvedValue({ ok: true, created: 3, skipped: 1, duplicates: ["banana"], invalid: [] });
    const { props } = renderDrawer();
    fireEvent.click(screen.getByRole("tab", { name: "文本导入" }));
    const textarea = await screen.findByLabelText("粘贴单词列表");
    fireEvent.change(textarea, { target: { value: "apple\t苹果\nbanana\ncherry\ndate" } });
    fireEvent.click(screen.getByRole("button", { name: "导入 4 个词条" }));
    await waitFor(() => {
      expect(bulkImportWords).toHaveBeenCalledWith(2, [
        { word: "apple", definition: "苹果" },
        { word: "banana", definition: "" },
        { word: "cherry", definition: "" },
        { word: "date", definition: "" },
      ]);
      expect(props.onUploaded).toHaveBeenCalledWith("文本导入完成：已导入 3 个词条，跳过 1 个（重复/无效）");
    });
  });

  it("disables text import button when no unit selected or no words", async () => {
    renderDrawer({ unitId: null });
    fireEvent.click(screen.getByRole("tab", { name: "文本导入" }));
    const textarea = await screen.findByLabelText("粘贴单词列表");
    const button = () => screen.getByRole("button", { name: /导入/ });
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "apple" } });
    expect((button() as HTMLButtonElement).disabled).toBe(true); // unitId 仍为 null
  });
});
