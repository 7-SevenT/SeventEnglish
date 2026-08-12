// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";

afterEach(cleanup);

describe("AdminSidebar", () => {
  it("contains only the four admin modules", () => {
    render(<MemoryRouter initialEntries={["/admin/dictation"]}><AdminSidebar /></MemoryRouter>);
    expect(screen.getByText("文章")).toBeTruthy();
    expect(screen.getByText("听写")).toBeTruthy();
    expect(screen.getByText("AI模型")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.getByText("管理模块")).toBeTruthy();
    expect(screen.queryByText("SeventEnglish")).toBeNull();
    expect(screen.queryByText("返回学习端")).toBeNull();
  });

  it("marks the current admin route as active", () => {
    render(<MemoryRouter initialEntries={["/admin/ai-model"]}><AdminSidebar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /AI模型/ }).getAttribute("aria-current")).toBe("page");
  });
});
