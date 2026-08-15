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

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function stubSpeech() {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  vi.stubGlobal("SpeechSynthesisUtterance", class { text: string; lang = ""; constructor(t: string) { this.text = t; } });
  return { speak, cancel };
}

describe("DictationAdmin", () => {
  it("renders book overview and opens the import drawer", async () => {
    getOverview.mockResolvedValue([{ id: 1, name: "Core Book", description: "Daily", created_at: "2026-01-01", unit_count: 1, word_count: 12 }]);
    listUnits.mockResolvedValue([{ id: 2, book_id: 1, name: "Unit 01", sort_order: 0, created_at: "2026-01-01" }]);
    listWords.mockResolvedValue([]);
    render(<DictationAdmin />);
    expect(await screen.findByText("Core Book")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /导入听写音频/ }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "导入听写词条" })).toBeTruthy());
  });

  it("shows source badges and lets TTS words be previewed", async () => {
    getOverview.mockResolvedValue([{ id: 1, name: "Core Book", description: "Daily", created_at: "2026-01-01", unit_count: 1, word_count: 2 }]);
    listUnits.mockResolvedValue([{ id: 2, book_id: 1, name: "Unit 01", sort_order: 0, created_at: "2026-01-01" }]);
    listWords.mockResolvedValue([
      { id: 1, unit_id: 2, word: "apple", audio_key: "2/1.mp3", definition: "", sort_order: 0 },
      { id: 2, unit_id: 2, word: "banana", audio_key: "", definition: "香蕉", sort_order: 1 },
    ]);
    const { speak, cancel } = stubSpeech();
    render(<DictationAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "查看单元" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "查看" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    await waitFor(() => {
      expect(screen.getByText("apple")).toBeTruthy();
      expect(screen.getByText("banana")).toBeTruthy();
    });
    expect(screen.getByText("音频")).toBeTruthy();
    const ttsBadge = screen.getByText("TTS");
    expect(ttsBadge).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "试听" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as { text: string; lang: string };
    expect(utterance.text).toBe("banana");
    expect(utterance.lang).toBe("en-US");
  });
});
