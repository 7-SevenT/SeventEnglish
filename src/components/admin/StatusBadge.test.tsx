// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

afterEach(cleanup);

describe("StatusBadge", () => {
  it.each([
    ["completed", "分析完成"],
    ["processing", "分析中"],
    ["failed", "分析失败"],
    ["unconfigured", "待配置 AI"],
    ["success", "上传成功"],
    ["failed-upload", "上传失败"],
  ] as const)("renders readable text for %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
