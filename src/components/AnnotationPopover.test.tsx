// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../worker/src/db";
import { AnnotationPopover } from "./AnnotationPopover";

const annotation: Annotation = {
  id: 9, article_id: 1, from_position: 1, to_position: 7, selected_text: "Learn ", color: "yellow", comment: "key", created_at: "", updated_at: "",
};

describe("AnnotationPopover", () => {
  it("edits and deletes a marked comment", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<AnnotationPopover annotation={annotation} onEdit={onEdit} onDelete={onDelete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑评论" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "updated" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "删除标记" }));
    expect(onEdit).toHaveBeenCalledWith("updated");
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
