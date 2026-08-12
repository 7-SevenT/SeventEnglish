// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "./Nav";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ authenticated: true, logout: vi.fn() }),
}));

afterEach(cleanup);

describe("Nav", () => {
  it("shows learning navigation with icons outside admin routes", () => {
    render(<MemoryRouter initialEntries={["/read"]}><Nav /></MemoryRouter>);
    expect(screen.getByRole("img", { name: "SeventEnglish logo" }).getAttribute("src")).toBe("/brand-logo.png");

    // 桌面端顶部导航（图标 + 文字）
    const desktop = within(screen.getByRole("navigation", { name: "学习导航" }));
    for (const label of ["阅读", "听力", "统计", "管理"]) {
      expect(desktop.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("navigation", { name: "学习导航" }).querySelectorAll("svg").length).toBeGreaterThanOrEqual(4);

    // 移动端底部 Tab 导航（图标 + 文字）
    const mobile = within(screen.getByRole("navigation", { name: "移动导航" }));
    for (const label of ["阅读", "听力", "统计", "管理"]) {
      expect(mobile.getByText(label)).toBeTruthy();
    }

    // 导航栏操作区：云端备份 / 云端恢复 / 退出登录
    expect(screen.getByRole("button", { name: "云端备份" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "云端恢复" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(screen.queryByText("管理工作台")).toBeNull();
  });

  it("shows admin context instead of desktop learning links on admin routes", () => {
    render(<MemoryRouter initialEntries={["/admin/articles"]}><Nav /></MemoryRouter>);
    expect(screen.getByText("管理工作台")).toBeTruthy();
    expect(screen.getByRole("link", { name: /返回学习端/ })).toBeTruthy();
    // 桌面学习导航隐藏，移动端 Tab 仍保留（全局导航）
    expect(screen.queryByRole("navigation", { name: "学习导航" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "移动导航" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });
});
