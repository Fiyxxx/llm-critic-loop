import { describe, expect, it, vi } from "vitest";
import { runClaudeCli } from "../../../src/client/cli-adapters/claude.js";
import type { RunCliCommand } from "../../../src/client/cli-run.js";
import type { CriticRequest } from "../../../src/client/types.js";

const request: CriticRequest = { systemPrompt: "You are a critic.", artifact: "const x = 1" };

describe("runClaudeCli", () => {
  it("parses structured_output when present", () => {
    const envelope = JSON.stringify({
      structured_output: { issues: [], summary: "Looks good." },
      result: '{"issues":[],"summary":"Looks good."}',
    });
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 0, stdout: envelope, stderr: "" });

    const outcome = runClaudeCli(request, undefined, false, "/tmp/scratch", 120_000, runCommand);

    expect(outcome.parsed).toEqual({ issues: [], summary: "Looks good." });
  });

  it("falls back to parsing the result string when structured_output is absent", () => {
    const envelope = JSON.stringify({ result: '{"issues":[],"summary":"ok"}' });
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 0, stdout: envelope, stderr: "" });

    const outcome = runClaudeCli(request, undefined, false, "/tmp/scratch", 120_000, runCommand);

    expect(outcome.parsed).toEqual({ issues: [], summary: "ok" });
  });

  it("reports notFound when claude isn't on PATH", () => {
    const enoent = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: null, stdout: "", stderr: "", error: enoent });

    const outcome = runClaudeCli(request, undefined, false, "/tmp/scratch", 120_000, runCommand);

    expect(outcome.notFound).toBe(true);
  });

  it("reports exitError on a non-zero exit", () => {
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 1, stdout: "", stderr: "auth error" });

    const outcome = runClaudeCli(request, undefined, false, "/tmp/scratch", 120_000, runCommand);

    expect(outcome.exitError).toContain("auth error");
  });

  it("reports a useful exitError on a spawnSync timeout, not a bare trailing colon", () => {
    const etimedout = Object.assign(new Error("spawn claude ETIMEDOUT"), { code: "ETIMEDOUT" });
    const runCommand: RunCliCommand = vi
      .fn()
      .mockReturnValue({ status: null, stdout: "", stderr: "", error: etimedout });

    const outcome = runClaudeCli(request, undefined, false, "/tmp/scratch", 120_000, runCommand);

    expect(outcome.notFound).toBeFalsy();
    expect(outcome.exitError).toBeDefined();
    expect(outcome.exitError).not.toBe("claude exited null: ");
    expect(outcome.exitError).toContain("timed out");
  });

  it("returns parsed:null on malformed stdout", () => {
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 0, stdout: "not json", stderr: "" });

    const outcome = runClaudeCli(request, undefined, false, "/tmp/scratch", 120_000, runCommand);

    expect(outcome.parsed).toBeNull();
  });

  it("passes --model when a model is given, and cwd/timeout through to runCommand", () => {
    const runCommand: RunCliCommand = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: JSON.stringify({ structured_output: { issues: [], summary: "ok" } }), stderr: "" });

    runClaudeCli(request, "claude-opus-5", false, "/tmp/scratch", 120_000, runCommand);

    const call = (runCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("claude");
    expect(call[1]).toContain("--model");
    expect(call[1]).toContain("claude-opus-5");
    expect(call[2]).toBe(120_000);
    expect(call[3]).toBe("/tmp/scratch");
  });

  it("appends the strict JSON instruction to the system prompt on retry", () => {
    const runCommand: RunCliCommand = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: JSON.stringify({ structured_output: { issues: [], summary: "ok" } }), stderr: "" });

    runClaudeCli(request, undefined, true, "/tmp/scratch", 120_000, runCommand);

    const call = (runCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    const systemPromptIndex = call[1].indexOf("--system-prompt") + 1;
    expect(call[1][systemPromptIndex]).toContain("Respond with ONLY valid JSON");
  });
});
