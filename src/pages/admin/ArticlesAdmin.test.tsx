// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ArticlesAdmin } from "./ArticlesAdmin";

const mocks = vi.hoisted(() => ({
  listArticles: vi.fn(),
  getArticle: vi.fn(),
  reanalyzeArticle: vi.fn(),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  deleteArticle: vi.fn(),
}));
vi.mock("../../api/articles", () => ({ listArticles: mocks.listArticles, getArticle: mocks.getArticle, reanalyzeArticle: mocks.reanalyzeArticle }));
vi.mock("../../api/admin", () => ({ createArticle: mocks.createArticle, updateArticle: mocks.updateArticle, deleteArticle: mocks.deleteArticle }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ArticlesAdmin", () => {
  it("renders article status and opens the create drawer", async () => {
    mocks.listArticles.mockResolvedValue([{ date: "2026-08-12", articles: [{ id: 1, title: "Why sleep", analysis_status: "completed" }] }]);
    render(<ArticlesAdmin />);
    expect(await screen.findByText("Why sleep")).toBeTruthy();
    expect(screen.getAllByText("分析完成").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: /新建文章/ }));
    expect(screen.getByRole("dialog", { name: "新建文章" })).toBeTruthy();
  });
});
