// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UploadQueue, type UploadItem } from "./UploadQueue";

afterEach(cleanup);

function items(): UploadItem[] {
  return [
    { id: "a", file: new File(["a"], "a.mp3"), word: "a", status: "queued", progress: 0 },
    { id: "b", file: new File(["b"], "b.mp3"), word: "b", status: "queued", progress: 0 },
  ];
}

describe("UploadQueue", () => {
  it("uploads files with independent success and failure states", async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({ ok: true, key: "1/a.mp3" })
      .mockRejectedValueOnce(new Error("network"));
    const onChange = vi.fn();
    render(<UploadQueue unitId={1} items={items()} uploadWord={upload} onChange={onChange} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "开始上传" }));

    await waitFor(() => expect(screen.getByText("上传成功")).toBeTruthy());
    expect(screen.getByText("失败，可重试")).toBeTruthy();
    expect(onChange).toHaveBeenCalled();
  });

  it("retries only failed files", async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, key: "1/a.mp3" });
    render(<UploadQueue unitId={1} items={[items()[0]]} uploadWord={upload} onChange={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "开始上传" }));
    await waitFor(() => expect(screen.getByText("失败，可重试")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "重试失败项" }));
    await waitFor(() => expect(screen.getByText("上传成功")).toBeTruthy());
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
