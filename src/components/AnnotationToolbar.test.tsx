// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnnotationToolbar } from "./AnnotationToolbar";

const selection = { from: 2, to: 8, text: "example", rect: new DOMRect(20, 30, 40, 10) };

describe("AnnotationToolbar", () => {
  it("renders actions only for a non-empty selection", () => {
    const onHighlight = vi.fn();
    const onComment = vi.fn();
    const onCancel = vi.fn();
    render(<AnnotationToolbar selection={selection} onHighlight={onHighlight} onComment={onComment} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "荧光" }));
    fireEvent.click(screen.getByRole("button", { name: "评论" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onHighlight).toHaveBeenCalledOnce();
    expect(onComment).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not render for an empty selection", () => {
    const { container } = render(<AnnotationToolbar selection={null} onHighlight={vi.fn()} onComment={vi.fn()} onCancel={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
