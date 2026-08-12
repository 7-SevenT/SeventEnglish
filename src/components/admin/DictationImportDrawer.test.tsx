// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DictationImportDrawer } from "./DictationImportDrawer";

afterEach(cleanup);

const books = [{ id: 1, name: "Book", description: "", created_at: "2026-01-01" }];
const units = [{ id: 2, book_id: 1, name: "Unit 01", sort_order: 0, created_at: "2026-01-01" }];

describe("DictationImportDrawer", () => {
  it("requires a unit before accepting an upload", () => {
    render(<DictationImportDrawer open books={books} units={[]} bookId={null} unitId={null} onBookChange={vi.fn()} onUnitChange={vi.fn()} onClose={vi.fn()} uploadWord={vi.fn()} onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("导入音频文件"), { target: { files: [new File(["x"], "word.mp3")] } });
    expect(screen.getByText("请先选择单词书和单元")).toBeTruthy();
    expect(screen.queryByText("word.mp3")).toBeNull();
  });

  it("parses filenames into editable answers", () => {
    render(<DictationImportDrawer open books={books} units={units} bookId={1} unitId={2} onBookChange={vi.fn()} onUnitChange={vi.fn()} onClose={vi.fn()} uploadWord={vi.fn()} onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("导入音频文件"), { target: { files: [new File(["x"], "lesson-01.mp3")] } });
    expect(screen.getByDisplayValue("lesson-01")).toBeTruthy();
  });
});
