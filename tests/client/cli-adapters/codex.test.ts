import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCodexCli } from "../../../src/client/cli-adapters/codex.js";
import type { RunCliCommand } from "../../../src/client/cli-run.js";
import type { CriticRequest } from "../../../src/client/types.js";

const request: CriticRequest = { systemPrompt: "You are a critic.", artifact: "const x = 1" };

let scratchDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "codex-adapter-test-"));
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

function writingRunCommand(body: unknown, status = 0): RunCliCommand {
  return vi.fn().mockImplementation((_cmd, _args, _timeoutMs, cwd: string) => {
    writeFileSync(join(cwd, "output.json"), JSON.stringify(body));
    return { status, stdout: "", stderr: "" };
  });
}

describe("runCodexCli", () => {
  it("parses the output file on success", () => {
    const runCommand = writingRunCommand({ issues: [], summary: "Looks good." });

    const outcome = runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    expect(outcome.parsed).toEqual({ issues: [], summary: "Looks good." });
  });

  it("writes the schema file before invoking codex", () => {
    const runCommand: RunCliCommand = vi.fn().mockImplementation((_cmd, _args, _timeoutMs, cwd: string) => {
      writeFileSync(join(cwd, "output.json"), JSON.stringify({ issues: [], summary: "ok" }));
      return { status: 0, stdout: "", stderr: "" };
    });

    runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    const call = (runCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    const schemaFlagIndex = call[1].indexOf("--output-schema");
    expect(call[1][schemaFlagIndex + 1]).toBe(join(scratchDir, "schema.json"));
  });

  it("reports notFound when codex isn't on PATH", () => {
    const enoent = Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" });
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: null, stdout: "", stderr: "", error: enoent });

    const outcome = runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    expect(outcome.notFound).toBe(true);
  });

  it("reports exitError on a non-zero exit", () => {
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 1, stdout: "", stderr: "not logged in" });

    const outcome = runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    expect(outcome.exitError).toContain("not logged in");
  });

  it("reports a useful exitError on a spawnSync timeout, not a bare trailing colon", () => {
    const etimedout = Object.assign(new Error("spawn codex ETIMEDOUT"), { code: "ETIMEDOUT" });
    const runCommand: RunCliCommand = vi
      .fn()
      .mockReturnValue({ status: null, stdout: "", stderr: "", error: etimedout });

    const outcome = runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    expect(outcome.notFound).toBeFalsy();
    expect(outcome.exitError).toBeDefined();
    expect(outcome.exitError).not.toBe("codex exited null: ");
    expect(outcome.exitError).toContain("timed out");
  });

  it("does not read a stale output.json left over from a previous retry attempt", () => {
    writeFileSync(join(scratchDir, "output.json"), JSON.stringify({ issues: [], summary: "stale from attempt 1" }));
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });

    const outcome = runCodexCli(request, undefined, true, scratchDir, 120_000, runCommand);

    expect(outcome.exitError).toBeDefined();
    expect(outcome.parsed).toBeNull();
  });

  it("reports exitError when codex exits 0 but never writes the output file", () => {
    const runCommand: RunCliCommand = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });

    const outcome = runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    expect(outcome.exitError).toBeDefined();
  });

  it("returns parsed:null when the output file contains malformed JSON", () => {
    const runCommand: RunCliCommand = vi.fn().mockImplementation((_cmd, _args, _timeoutMs, cwd: string) => {
      writeFileSync(join(cwd, "output.json"), "not json");
      return { status: 0, stdout: "", stderr: "" };
    });

    const outcome = runCodexCli(request, undefined, false, scratchDir, 120_000, runCommand);

    expect(outcome.parsed).toBeNull();
  });

  it("passes --model and --skip-git-repo-check", () => {
    const runCommand = writingRunCommand({ issues: [], summary: "ok" });

    runCodexCli(request, "gpt-6-astra", false, scratchDir, 120_000, runCommand);

    const call = (runCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toContain("--model");
    expect(call[1]).toContain("gpt-6-astra");
    expect(call[1]).toContain("--skip-git-repo-check");
  });
});
