// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DictationAdmin } from "./DictationAdmin";

const mocks = vi.hoisted(() => ({ getOverview: vi.fn(), listUnits: vi.fn(), listWords: vi.fn() }));
const { getOverview, listUnits, listWords } = mocks;

vi.mock("../../api/admin", () => ({
  getDictationOverview: mocks.getOverview,
  createBook: vi.fn(),
  deleteBook: vi.fn(),
  createUnit: vi.fn(),
  deleteUnit: vi.fn(),
  deleteWord: vi.fn(),
  uploadWord: vi.fn(),
}));
vi.mock("../../api/listen", () => ({ listUnits: mocks.listUnits, listWords: mocks.listWords }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("DictationAdmin", () => {
  it("renders book overview and opens the import drawer", async () => {
    getOverview.mockResolvedValue([{ id: 1, name: "Core Book", description: "Daily", created_at: "2026-01-01", unit_count: 1, word_count: 12 }]);
    listUnits.mockResolvedValue([{ id: 2, book_id: 1, name: "Unit 01", sort_order: 0, created_at: "2026-01-01" }]);
    listWords.mockResolvedValue([]);
    render(<DictationAdmin />);
    expect(await screen.findByText("Core Book")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /导入听写音频/ }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "导入听写音频" })).toBeTruthy());
  });
});
