// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ArticleEditorDrawer } from "./ArticleEditorDrawer";

afterEach(cleanup);

describe("ArticleEditorDrawer", () => {
  it("defaults publish date to today for a new article", () => {
    render(<ArticleEditorDrawer open mode="create" onClose={vi.fn()} onSave={vi.fn()} />);
    expect((screen.getByLabelText("发布日期") as HTMLInputElement).value).toBe(new Date().toISOString().slice(0, 10));
  });

  it("imports a Markdown file into the content field", async () => {
    render(<ArticleEditorDrawer open mode="create" onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("导入 Markdown 或 TXT"), {
      target: { files: [new File(["# Body"], "body.md", { type: "text/markdown" })] },
    });
    expect((await screen.findByLabelText(/正文/ ) as HTMLTextAreaElement).value).toBe("# Body");
  });

  it("shows inline validation and does not save incomplete data", () => {
    const save = vi.fn();
    render(<ArticleEditorDrawer open mode="create" onClose={vi.fn()} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "保存并开始 AI 分析" }));
    expect(screen.getByText("标题不能为空")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});
