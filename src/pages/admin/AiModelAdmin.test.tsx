// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiModelAdmin } from "./AiModelAdmin";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  fetchModels: vi.fn(),
  testModel: vi.fn(),
}));

vi.mock("../../api/admin", () => ({
  getAiModelConfig: mocks.getConfig,
  saveAiModelConfig: mocks.saveConfig,
  fetchAiModels: mocks.fetchModels,
  testAiModel: mocks.testModel,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AiModelAdmin", () => {
  it("does not show the stored API key", async () => {
    mocks.getConfig.mockResolvedValue({ base_url: "https://provider.example/v1", model: "model-a", has_api_key: true, updated_at: "2026-08-12T00:00:00Z" });
    render(<AiModelAdmin />);
    expect(await screen.findByText("API Key 已配置")).toBeTruthy();
    expect(screen.queryByDisplayValue("secret")).toBeNull();
  });

  it("refreshes model choices and tests the selected model", async () => {
    mocks.getConfig.mockResolvedValue({ base_url: "https://provider.example/v1", model: "model-a", has_api_key: true, updated_at: null });
    mocks.fetchModels.mockResolvedValue(["model-a", "model-b"]);
    mocks.testModel.mockResolvedValue({ model: "model-b", modelCount: 2, modelListed: true });
    render(<AiModelAdmin />);
    await screen.findByDisplayValue("model-a");
    fireEvent.click(screen.getByRole("button", { name: "刷新模型列表" }));
    await waitFor(() => expect(screen.getByText("model-b")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "model-b" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByText(/连接成功/)).toBeTruthy());
  });
});
