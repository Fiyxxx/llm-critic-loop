import { describe, expect, it, vi } from "vitest";
import { runInit, type Prompter, type RunCommand } from "../../src/cli/init.js";
import type { ProviderPreset } from "../../src/cli/providers.js";

const OPENAI: ProviderPreset = {
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  models: ["gpt-5.6-terra", "gpt-6-astra"],
};

const CUSTOM: ProviderPreset = {
  id: "custom",
  name: "Custom",
  baseUrl: null,
  models: [],
};

function fakePrompter(overrides: Partial<Prompter> = {}): Prompter {
  return {
    selectProvider: vi.fn().mockResolvedValue(OPENAI),
    customBaseUrl: vi.fn().mockResolvedValue("https://should-not-be-called.test"),
    selectModel: vi.fn().mockResolvedValue("gpt-5.6-terra"),
    customModel: vi.fn().mockResolvedValue("should-not-be-called"),
    apiKey: vi.fn().mockResolvedValue("sk-test"),
    scope: vi.fn().mockResolvedValue("local"),
    ...overrides,
  };
}

const succeedingRunCommand: RunCommand = () => ({ status: 0, stdout: "Added", stderr: "" });

describe("runInit", () => {
  it("skips the custom-base-URL prompt when the chosen provider has a preset URL", async () => {
    const prompter = fakePrompter();

    const result = await runInit({ prompter, runCommand: succeedingRunCommand });

    expect(prompter.customBaseUrl).not.toHaveBeenCalled();
    expect(result.args).toContain("CRITIC_BASE_URL=https://api.openai.com/v1");
  });

  it("asks for a custom base URL when the provider has none", async () => {
    const prompter = fakePrompter({
      selectProvider: vi.fn().mockResolvedValue(CUSTOM),
      customBaseUrl: vi.fn().mockResolvedValue("https://my-proxy.example.com/v1"),
      customModel: vi.fn().mockResolvedValue("my-model"),
    });

    const result = await runInit({ prompter, runCommand: succeedingRunCommand });

    expect(prompter.customBaseUrl).toHaveBeenCalled();
    expect(prompter.selectModel).not.toHaveBeenCalled();
    expect(result.args).toContain("CRITIC_BASE_URL=https://my-proxy.example.com/v1");
    expect(result.args).toContain("CRITIC_MODEL=my-model");
  });

  it("falls back to a custom model prompt when 'Other' is selected from the curated list", async () => {
    const prompter = fakePrompter({
      selectModel: vi.fn().mockResolvedValue("Other (type your own)"),
      customModel: vi.fn().mockResolvedValue("gpt-5.6-mini-preview"),
    });

    const result = await runInit({ prompter, runCommand: succeedingRunCommand });

    expect(prompter.customModel).toHaveBeenCalled();
    expect(result.args).toContain("CRITIC_MODEL=gpt-5.6-mini-preview");
  });

  it("reports success and echoes stdout when claude mcp add exits zero", async () => {
    const prompter = fakePrompter();
    const runCommand: RunCommand = vi.fn().mockReturnValue({
      status: 0,
      stdout: "Added critic",
      stderr: "",
    });

    const result = await runInit({ prompter, runCommand });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.output).toContain("Added critic");
  });

  it("reports a failed run without pretending it succeeded when claude exits non-zero", async () => {
    const prompter = fakePrompter();
    const runCommand: RunCommand = vi.fn().mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "server already exists",
    });

    const result = await runInit({ prompter, runCommand });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.output).toContain("server already exists");
  });

  it("reports the claude CLI as unavailable rather than crashing when the binary is missing", async () => {
    const prompter = fakePrompter();
    const enoent = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    const runCommand: RunCommand = vi.fn().mockReturnValue({
      status: null,
      stdout: "",
      stderr: "",
      error: enoent,
    });

    const result = await runInit({ prompter, runCommand });

    expect(result.ran).toBe(false);
    expect(result.args.length).toBeGreaterThan(0);
  });
});
