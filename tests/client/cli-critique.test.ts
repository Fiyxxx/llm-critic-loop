import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { cliCritique, type CliCriticConfig } from "../../src/client/cli-critique.js";
import { CriticError } from "../../src/client/types.js";
import type { RunCliCommand } from "../../src/client/cli-run.js";

const request = { systemPrompt: "You are a critic.", artifact: "const x = 1" };
const claudeConfig: CliCriticConfig = { mode: "cli", cli: "claude" };

function claudeEnvelope(body: unknown) {
  return JSON.stringify({ structured_output: body });
}

describe("cliCritique", () => {
  it("returns parsed issues and summary on a well-formed response", async () => {
    const runCommand: RunCliCommand = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: claudeEnvelope({ issues: [], summary: "Looks good." }), stderr: "" });

    const result = await cliCritique(claudeConfig, request, runCommand);

    expect(result.summary).toBe("Looks good.");
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("retries once with a stricter prompt when the first response is malformed, then succeeds", async () => {
    const runCommand: RunCliCommand = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "not json", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: claudeEnvelope({ issues: [], summary: "ok" }), stderr: "" });

    const result = await cliCritique(claudeConfig, request, runCommand);

    expect(result.summary).toBe("ok");
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("throws CriticError with a snippet when both attempts return malformed output", async () => {
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 0, stdout: "still not json", stderr: "" });

    await expect(cliCritique(claudeConfig, request, runCommand)).rejects.toThrow(CriticError);
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("throws CriticError naming the CLI when it's not found on PATH", async () => {
    const enoent = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: null, stdout: "", stderr: "", error: enoent });

    await expect(cliCritique(claudeConfig, request, runCommand)).rejects.toThrow(/claude.*PATH/i);
  });

  it("throws CriticError immediately on a non-zero exit, without retrying", async () => {
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 1, stdout: "", stderr: "auth error" });

    await expect(cliCritique(claudeConfig, request, runCommand)).rejects.toThrow(CriticError);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("dispatches to the codex adapter when config.cli is codex", async () => {
    const runCommand: RunCliCommand = vi.fn().mockImplementation((cmd) => {
      expect(cmd).toBe("codex");
      return { status: 1, stdout: "", stderr: "boom" };
    });

    await expect(
      cliCritique({ mode: "cli", cli: "codex" }, request, runCommand),
    ).rejects.toThrow(CriticError);
  });

  it("creates a scratch cwd for the call and removes it afterward", async () => {
    let capturedCwd = "";
    const runCommand: RunCliCommand = vi.fn().mockImplementation((_cmd, _args, _timeoutMs, cwd: string) => {
      capturedCwd = cwd;
      expect(existsSync(cwd)).toBe(true);
      return { status: 0, stdout: claudeEnvelope({ issues: [], summary: "ok" }), stderr: "" };
    });

    await cliCritique(claudeConfig, request, runCommand);

    expect(existsSync(capturedCwd)).toBe(false);
  });
});
