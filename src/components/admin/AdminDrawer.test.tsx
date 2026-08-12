// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminDrawer } from "./AdminDrawer";

afterEach(cleanup);

describe("AdminDrawer", () => {
  it("does not render while closed", () => {
    render(<AdminDrawer open={false} title="New article" onClose={vi.fn()}>Content</AdminDrawer>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a dialog and closes with Escape", () => {
    const onClose = vi.fn();
    render(<AdminDrawer open title="New article" onClose={onClose}>Content</AdminDrawer>);
    expect(screen.getByRole("dialog", { name: "New article" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("asks for confirmation before closing dirty content", () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminDrawer open dirty title="New article" onClose={onClose}>Content</AdminDrawer>);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
