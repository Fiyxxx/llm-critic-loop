# CLI Auto-Auth (Claude + OpenAI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the `critic` MCP server authenticate via a user's existing `claude` (Anthropic) or `codex` (OpenAI) CLI login instead of requiring a pasted API key, offered as a choice in the `init` wizard alongside the existing key-based flow.

**Architecture:** `CriticConfig` becomes a discriminated union (`mode: "http" | "cli"`). The existing OpenAI-compatible fetch path is untouched behavior-wise but refactored to share response-parsing/prompt-shaping helpers with two new CLI adapters (`claude`, `codex`), each spawning its provider's CLI synchronously via an injectable `RunCliCommand`, in a scratch temp directory, requesting schema-constrained JSON output. `critic-client.ts`'s `critique()` dispatches on `config.mode`. The `init` wizard detects installed CLIs, offers an auth-method choice only when detected, and ends with an optional real smoke-test call.

**Tech Stack:** TypeScript, Node `child_process.spawnSync`, Vitest, `@clack/prompts`.

**Spec:** `docs/superpowers/specs/2026-09-20-cli-auto-auth-design.md`

## Global Constraints

- Only `claude` (Anthropic) and `codex` (OpenAI) get CLI adapters. No other provider changes.
- Absence of `CRITIC_CLI` must preserve today's `http`-mode behavior byte-for-byte — no breaking change for existing installs.
- Never use `claude --bare` — it disables OAuth/keychain auth, defeating the feature.
- CLI subprocesses run with `cwd` set to a scratch temp dir, never the caller's project directory (avoids CLAUDE.md auto-discovery overhead).
- `--json-schema` (claude) is inline JSON; `--output-schema` (codex) is a file path — do not conflate the two.
- All new/changed public function signatures below are exact — later tasks depend on them verbatim.

---

### Task 1: Extract shared client types and helpers from `critic-client.ts`

Pure refactor, no behavior change — locks in the seams the CLI adapters will plug into later.

**Files:**
- Create: `src/client/types.ts`
- Create: `src/client/prompt-shaping.ts`
- Create: `src/client/parse-response.ts`
- Test: `tests/client/parse-response.test.ts`
- Modify: `src/client/critic-client.ts`

**Interfaces:**
- Produces: `CriticRequest`, `CriticResponse`, `CriticError` (from `./types.js`); `buildUserContent(request: CriticRequest): string` and `withStrictJsonInstruction(systemPrompt: string, strict: boolean): string` (from `./prompt-shaping.js`); `validateResponse(parsed: unknown): CriticResponse | null`, `parseResponse(raw: string): CriticResponse | null`, `snippet(content: string): string` (from `./parse-response.js`).

- [ ] **Step 1: Create `src/client/types.ts`**

```ts
import type { Issue } from "../core/types.js";

export interface CriticRequest {
  systemPrompt: string;
  artifact: string;
  context?: string;
}

export interface CriticResponse {
  issues: Issue[];
  summary: string;
}

export class CriticError extends Error {}
```

- [ ] **Step 2: Create `src/client/prompt-shaping.ts`**

```ts
import type { CriticRequest } from "./types.js";

export function buildUserContent(request: CriticRequest): string {
  return request.context
    ? `Context:\n${request.context}\n\nArtifact:\n${request.artifact}`
    : `Artifact:\n${request.artifact}`;
}

const STRICT_JSON_INSTRUCTION =
  '\n\nRespond with ONLY valid JSON matching this shape, no prose, no markdown fences: {"issues":[{"category":string,"severity":"minor"|"major"|"critical","description":string,"location"?:string}],"summary":string}';

export function withStrictJsonInstruction(systemPrompt: string, strict: boolean): string {
  return strict ? `${systemPrompt}${STRICT_JSON_INSTRUCTION}` : systemPrompt;
}
```

- [ ] **Step 3: Create `src/client/parse-response.ts`**

```ts
import type { Issue } from "../core/types.js";
import type { CriticResponse } from "./types.js";

const SEVERITIES: readonly string[] = ["minor", "major", "critical"];

function isValidIssue(value: unknown): value is Issue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  if (typeof issue.category !== "string" || issue.category.trim() === "") return false;
  if (typeof issue.severity !== "string" || !SEVERITIES.includes(issue.severity)) return false;
  if (typeof issue.description !== "string" || issue.description.trim() === "") return false;
  if (issue.location !== undefined && typeof issue.location !== "string") return false;
  return true;
}

function normalizeIssue(issue: Issue): Issue {
  return {
    category: issue.category,
    severity: issue.severity,
    description: issue.description,
    ...(issue.location !== undefined ? { location: issue.location } : {}),
  };
}

export function validateResponse(parsed: unknown): CriticResponse | null {
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { issues?: unknown }).issues) &&
    typeof (parsed as { summary?: unknown }).summary === "string" &&
    (parsed as { issues: unknown[] }).issues.every(isValidIssue)
  ) {
    const obj = parsed as { issues: Issue[]; summary: string };
    return {
      issues: obj.issues.map(normalizeIssue),
      summary: obj.summary,
    };
  }
  return null;
}

export function parseResponse(raw: string): CriticResponse | null {
  try {
    return validateResponse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const ERROR_SNIPPET_LENGTH = 200;

export function snippet(content: string): string {
  if (content === "") return "(empty)";
  return content.length > ERROR_SNIPPET_LENGTH
    ? `${content.slice(0, ERROR_SNIPPET_LENGTH)}...`
    : content;
}
```

- [ ] **Step 4: Write `tests/client/parse-response.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseResponse, snippet, validateResponse } from "../../src/client/parse-response.js";

describe("validateResponse", () => {
  it("returns null for a non-object", () => {
    expect(validateResponse("not an object")).toBeNull();
  });

  it("returns null when an issue is missing required fields", () => {
    expect(validateResponse({ issues: [{ issue: "x" }], summary: "s" })).toBeNull();
  });

  it("strips unknown fields from a valid issue", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d", extra: true }],
      summary: "s",
    });
    expect(result?.issues[0]).toEqual({ category: "bug", severity: "major", description: "d" });
  });
});

describe("parseResponse", () => {
  it("returns null on invalid JSON", () => {
    expect(parseResponse("not json")).toBeNull();
  });

  it("parses valid JSON matching the shape", () => {
    const result = parseResponse(JSON.stringify({ issues: [], summary: "ok" }));
    expect(result).toEqual({ issues: [], summary: "ok" });
  });
});

describe("snippet", () => {
  it("returns '(empty)' for an empty string", () => {
    expect(snippet("")).toBe("(empty)");
  });

  it("truncates content over 200 chars with a trailing ellipsis", () => {
    expect(snippet("x".repeat(5000))).toMatch(/^x{200}\.\.\.$/);
  });

  it("returns short content unchanged", () => {
    expect(snippet("short")).toBe("short");
  });
});
```

- [ ] **Step 5: Run the new tests, verify they pass**

Run: `npx vitest run tests/client/parse-response.test.ts`
Expected: all pass.

- [ ] **Step 6: Refactor `src/client/critic-client.ts` to use the extracted modules**

Replace the top of the file (everything above `export async function critique`) with:

```ts
import type { Issue } from "../core/types.js";
import { buildUserContent, withStrictJsonInstruction } from "./prompt-shaping.js";
import { parseResponse, snippet } from "./parse-response.js";
import { CriticError } from "./types.js";
import type { CriticRequest, CriticResponse } from "./types.js";

export { CriticError } from "./types.js";
export type { CriticRequest, CriticResponse } from "./types.js";

export interface CriticClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

type FetchLike = typeof fetch;

/**
 * CRITIC_BASE_URL is arbitrary user config, so a hanging endpoint is a real
 * failure mode. Without this, the request rides the HTTP stack's multi-minute
 * default instead of the tool's own error handling. Deliberately hardcoded —
 * the spec's BYOC config surface is exactly the three CRITIC_* vars.
 */
const REQUEST_TIMEOUT_MS = 60_000;

function buildMessages(request: CriticRequest, strict: boolean) {
  const systemPrompt = withStrictJsonInstruction(request.systemPrompt, strict);
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserContent(request) },
  ];
}
```

Delete the now-duplicated `SEVERITIES`, `isValidIssue`, `normalizeIssue`, `parseResponse`, `ERROR_SNIPPET_LENGTH`, `snippet` definitions that used to live in this file (they're imported now). Leave `export async function critique(...)` and its body untouched for this step — only imports and the deleted/added helper definitions change.

- [ ] **Step 7: Run the full existing client test suite, verify no regressions**

Run: `npx vitest run tests/client/critic-client.test.ts`
Expected: all pass, unchanged from before the refactor.

- [ ] **Step 8: Commit**

```bash
git add src/client/types.ts src/client/prompt-shaping.ts src/client/parse-response.ts src/client/critic-client.ts tests/client/parse-response.test.ts
git commit -m "refactor: extract shared client types and response parsing"
```

---

### Task 2: Add the `CriticConfig` union and `CRITIC_CLI` support to config loading

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/server/config.ts`
- Modify: `tests/server/config.test.ts`
- Modify: `tests/client/critic-client.test.ts` (fixture only)
- Modify: `tests/server/handler.test.ts` (fixture only)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CriticConfig` (from `../core/types.js`), re-exported as `CriticEnvConfig` from `src/server/config.ts` and as `CriticClientConfig` from `src/client/critic-client.ts` (Task 7 wires the latter).

- [ ] **Step 1: Add `CriticConfig` to `src/core/types.ts`**

Append to the end of the file:

```ts
export type CriticConfig =
  | { mode: "http"; baseUrl: string; apiKey: string; model: string }
  | { mode: "cli"; cli: "claude" | "codex"; model?: string };
```

- [ ] **Step 2: Write the failing test for `CRITIC_CLI` handling**

Replace `tests/server/config.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { ConfigError, loadCriticConfig } from "../../src/server/config.js";

describe("loadCriticConfig", () => {
  it("returns http-mode config when all three env vars are set", () => {
    const env = {
      CRITIC_BASE_URL: "https://example.test/v1",
      CRITIC_API_KEY: "secret",
      CRITIC_MODEL: "test-model",
    };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "http",
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "test-model",
    });
  });

  it("throws ConfigError listing every missing http-mode var", () => {
    const env = { CRITIC_MODEL: "test-model" };
    expect(() => loadCriticConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
    try {
      loadCriticConfig(env as NodeJS.ProcessEnv);
    } catch (error) {
      expect((error as Error).message).toContain("CRITIC_BASE_URL");
      expect((error as Error).message).toContain("CRITIC_API_KEY");
      expect((error as Error).message).not.toContain("CRITIC_MODEL");
    }
  });

  it("returns cli-mode config when CRITIC_CLI is claude, with a model", () => {
    const env = { CRITIC_CLI: "claude", CRITIC_MODEL: "claude-opus-5" };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "cli",
      cli: "claude",
      model: "claude-opus-5",
    });
  });

  it("returns cli-mode config when CRITIC_CLI is codex, with no model set", () => {
    const env = { CRITIC_CLI: "codex" };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "cli",
      cli: "codex",
    });
  });

  it("throws ConfigError when CRITIC_CLI is set to an unknown value", () => {
    const env = { CRITIC_CLI: "gemini" };
    expect(() => loadCriticConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it("ignores CRITIC_BASE_URL/CRITIC_API_KEY when CRITIC_CLI is set", () => {
    const env = { CRITIC_CLI: "claude", CRITIC_BASE_URL: "should-be-ignored" };
    const config = loadCriticConfig(env as NodeJS.ProcessEnv);
    expect(config).not.toHaveProperty("baseUrl");
  });
});
```

- [ ] **Step 3: Run the tests, verify the new ones fail**

Run: `npx vitest run tests/server/config.test.ts`
Expected: FAIL — `loadCriticConfig` doesn't know about `CRITIC_CLI` yet, and the http-mode test now expects a `mode` field that isn't returned yet.

- [ ] **Step 4: Rewrite `src/server/config.ts`**

```ts
import type { CriticConfig } from "../core/types.js";

export type CriticEnvConfig = CriticConfig;

export class ConfigError extends Error {}

const KNOWN_CLIS = ["claude", "codex"] as const;
type KnownCli = (typeof KNOWN_CLIS)[number];

function isKnownCli(value: string): value is KnownCli {
  return (KNOWN_CLIS as readonly string[]).includes(value);
}

export function loadCriticConfig(env: NodeJS.ProcessEnv = process.env): CriticEnvConfig {
  const cli = env.CRITIC_CLI;
  if (cli !== undefined) {
    if (!isKnownCli(cli)) {
      throw new ConfigError(`CRITIC_CLI must be one of: ${KNOWN_CLIS.join(", ")} (got "${cli}")`);
    }
    return {
      mode: "cli",
      cli,
      ...(env.CRITIC_MODEL ? { model: env.CRITIC_MODEL } : {}),
    };
  }

  const baseUrl = env.CRITIC_BASE_URL;
  const apiKey = env.CRITIC_API_KEY;
  const model = env.CRITIC_MODEL;

  const missing: string[] = [];
  if (!baseUrl) missing.push("CRITIC_BASE_URL");
  if (!apiKey) missing.push("CRITIC_API_KEY");
  if (!model) missing.push("CRITIC_MODEL");

  if (missing.length > 0) {
    throw new ConfigError(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  return { mode: "http", baseUrl: baseUrl as string, apiKey: apiKey as string, model: model as string };
}
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `npx vitest run tests/server/config.test.ts`
Expected: all pass.

- [ ] **Step 6: Fix the fixtures broken by the new `mode` field**

In `tests/client/critic-client.test.ts`, change:

```ts
const config = { baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };
```

to:

```ts
const config = { mode: "http" as const, baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };
```

In `tests/server/handler.test.ts`, change:

```ts
const criticConfig = { baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };
```

to:

```ts
const criticConfig = { mode: "http" as const, baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };
```

- [ ] **Step 7: Run the full suite, verify no regressions**

Run: `npx vitest run`
Expected: all pass (Task 1's refactor plus this task's changes both green).

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/server/config.ts tests/server/config.test.ts tests/client/critic-client.test.ts tests/server/handler.test.ts
git commit -m "feat: support CRITIC_CLI as an alternative to CRITIC_BASE_URL/API_KEY"
```

---

### Task 3: Shared CLI-spawn wrapper and the issue JSON schema

**Files:**
- Create: `src/client/cli-run.ts`
- Create: `src/client/cli-adapters/schema.ts`

**Interfaces:**
- Produces: `RunCliCommand` type, `CliRunResult` interface, `defaultRunCliCommand` (from `./cli-run.js`); `ISSUE_JSON_SCHEMA` (from `./cli-adapters/schema.js`). Tasks 4–6 consume these directly.

- [ ] **Step 1: Create `src/client/cli-run.ts`**

```ts
import { spawnSync } from "node:child_process";

export interface CliRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export type RunCliCommand = (
  cmd: string,
  args: string[],
  timeoutMs: number,
  cwd: string,
) => CliRunResult;

export const defaultRunCliCommand: RunCliCommand = (cmd, args, timeoutMs, cwd) => {
  const result = spawnSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs, cwd });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
};
```

- [ ] **Step 2: Create `src/client/cli-adapters/schema.ts`**

```ts
export const ISSUE_JSON_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          severity: { type: "string", enum: ["minor", "major", "critical"] },
          description: { type: "string" },
          location: { type: "string" },
        },
        required: ["category", "severity", "description"],
      },
    },
    summary: { type: "string" },
  },
  required: ["issues", "summary"],
} as const;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (these two files have no tests of their own — `defaultRunCliCommand` is exercised indirectly through the adapters in Tasks 4–5, matching the existing `defaultRunCommand` in `src/cli/init.ts`, which also has no direct unit test).

- [ ] **Step 4: Commit**

```bash
git add src/client/cli-run.ts src/client/cli-adapters/schema.ts
git commit -m "feat: add CLI spawn wrapper and shared issue JSON schema"
```

---

### Task 4: Claude CLI adapter

**Files:**
- Create: `src/client/cli-adapters/claude.ts`
- Test: `tests/client/cli-adapters/claude.test.ts`

**Interfaces:**
- Consumes: `RunCliCommand`, `CliRunResult` (`../cli-run.js`); `ISSUE_JSON_SCHEMA` (`./schema.js`); `buildUserContent`, `withStrictJsonInstruction` (`../prompt-shaping.js`); `validateResponse`, `parseResponse` (`../parse-response.js`); `CriticRequest` (`../types.js`).
- Produces: `CliAdapterOutcome` interface, `runClaudeCli(request, model, strict, cwd, timeoutMs, runCommand): CliAdapterOutcome`. Task 6 consumes this exact signature.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run tests/client/cli-adapters/claude.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `src/client/cli-adapters/claude.ts`**

```ts
import { buildUserContent, withStrictJsonInstruction } from "../prompt-shaping.js";
import { parseResponse, validateResponse } from "../parse-response.js";
import { ISSUE_JSON_SCHEMA } from "./schema.js";
import type { RunCliCommand } from "../cli-run.js";
import type { CriticRequest } from "../types.js";

export interface CliAdapterOutcome {
  raw: string;
  parsed: import("../types.js").CriticResponse | null;
  notFound?: boolean;
  exitError?: string;
}

interface ClaudeResultEnvelope {
  structured_output?: unknown;
  result?: string;
}

export function runClaudeCli(
  request: CriticRequest,
  model: string | undefined,
  strict: boolean,
  cwd: string,
  timeoutMs: number,
  runCommand: RunCliCommand,
): CliAdapterOutcome {
  const args = [
    "-p",
    buildUserContent(request),
    "--system-prompt",
    withStrictJsonInstruction(request.systemPrompt, strict),
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(ISSUE_JSON_SCHEMA),
    "--allowedTools",
    "",
    "--strict-mcp-config",
  ];
  if (model) args.push("--model", model);

  const result = runCommand("claude", args, timeoutMs, cwd);

  if (result.error?.code === "ENOENT") {
    return { raw: "", parsed: null, notFound: true };
  }
  if (result.status !== 0) {
    return {
      raw: result.stdout,
      parsed: null,
      exitError: `claude exited ${result.status}: ${result.stderr || result.stdout}`,
    };
  }

  let envelope: ClaudeResultEnvelope;
  try {
    envelope = JSON.parse(result.stdout) as ClaudeResultEnvelope;
  } catch {
    return { raw: result.stdout, parsed: null };
  }

  if (envelope.structured_output !== undefined) {
    return { raw: result.stdout, parsed: validateResponse(envelope.structured_output) };
  }
  if (typeof envelope.result === "string") {
    return { raw: result.stdout, parsed: parseResponse(envelope.result) };
  }
  return { raw: result.stdout, parsed: null };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run tests/client/cli-adapters/claude.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/cli-adapters/claude.ts tests/client/cli-adapters/claude.test.ts
git commit -m "feat: add claude CLI adapter for the critic client"
```

---

### Task 5: Codex CLI adapter

**Files:**
- Create: `src/client/cli-adapters/codex.ts`
- Test: `tests/client/cli-adapters/codex.test.ts`

**Interfaces:**
- Consumes: same as Task 4, plus Node's `node:fs` (`writeFileSync`, `readFileSync`) and `node:path` (`join`).
- Produces: `runCodexCli(request, model, strict, cwd, timeoutMs, runCommand): CliAdapterOutcome` (same `CliAdapterOutcome` shape as Task 4, imported from `./claude.js`). Writes `schema.json` and reads `output.json` inside the given `cwd` — these exact filenames are load-bearing for the tests below and for Task 6's scratch-dir cleanup.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run tests/client/cli-adapters/codex.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `src/client/cli-adapters/codex.ts`**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildUserContent, withStrictJsonInstruction } from "../prompt-shaping.js";
import { parseResponse } from "../parse-response.js";
import { ISSUE_JSON_SCHEMA } from "./schema.js";
import type { CliAdapterOutcome } from "./claude.js";
import type { RunCliCommand } from "../cli-run.js";
import type { CriticRequest } from "../types.js";

export function runCodexCli(
  request: CriticRequest,
  model: string | undefined,
  strict: boolean,
  cwd: string,
  timeoutMs: number,
  runCommand: RunCliCommand,
): CliAdapterOutcome {
  const schemaPath = join(cwd, "schema.json");
  const outputPath = join(cwd, "output.json");
  writeFileSync(schemaPath, JSON.stringify(ISSUE_JSON_SCHEMA));

  const prompt = [
    withStrictJsonInstruction(request.systemPrompt, strict),
    "",
    buildUserContent(request),
    "",
    "Answer directly. Do not use tools, run shell commands, or write files.",
  ].join("\n");

  const args = [
    "exec",
    prompt,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
  ];
  if (model) args.push("--model", model);

  const result = runCommand("codex", args, timeoutMs, cwd);

  if (result.error?.code === "ENOENT") {
    return { raw: "", parsed: null, notFound: true };
  }
  if (result.status !== 0) {
    return {
      raw: result.stdout,
      parsed: null,
      exitError: `codex exited ${result.status}: ${result.stderr || result.stdout}`,
    };
  }

  let fileContents: string;
  try {
    fileContents = readFileSync(outputPath, "utf-8");
  } catch {
    return { raw: "", parsed: null, exitError: "codex exited successfully but did not write an output file" };
  }

  return { raw: fileContents, parsed: parseResponse(fileContents) };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run tests/client/cli-adapters/codex.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/cli-adapters/codex.ts tests/client/cli-adapters/codex.test.ts
git commit -m "feat: add codex CLI adapter for the critic client"
```

---

### Task 6: CLI dispatcher with retry, timeout, and scratch-dir lifecycle

**Files:**
- Create: `src/client/cli-critique.ts`
- Test: `tests/client/cli-critique.test.ts`

**Interfaces:**
- Consumes: `runClaudeCli` (`./cli-adapters/claude.js`), `runCodexCli` (`./cli-adapters/codex.js`), `RunCliCommand`, `defaultRunCliCommand` (`./cli-run.js`), `CriticError`, `CriticRequest`, `CriticResponse` (`./types.js`), `snippet` (`./parse-response.js`).
- Produces: `CliCriticConfig` type (`{ mode: "cli"; cli: "claude" | "codex"; model?: string }`), `cliCritique(config: CliCriticConfig, request: CriticRequest, runCommand?: RunCliCommand): Promise<CriticResponse>`. Task 7 consumes this exact signature.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run tests/client/cli-critique.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `src/client/cli-critique.ts`**

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRunCliCommand, type RunCliCommand } from "./cli-run.js";
import { runClaudeCli } from "./cli-adapters/claude.js";
import { runCodexCli } from "./cli-adapters/codex.js";
import { snippet } from "./parse-response.js";
import { CriticError } from "./types.js";
import type { CriticRequest, CriticResponse } from "./types.js";

export interface CliCriticConfig {
  mode: "cli";
  cli: "claude" | "codex";
  model?: string;
}

const CLI_TIMEOUT_MS = 120_000;

export async function cliCritique(
  config: CliCriticConfig,
  request: CriticRequest,
  runCommand: RunCliCommand = defaultRunCliCommand,
): Promise<CriticResponse> {
  const scratchDir = mkdtempSync(join(tmpdir(), "llm-critic-loop-"));
  const adapter = config.cli === "claude" ? runClaudeCli : runCodexCli;

  try {
    let lastRaw = "";
    for (const strict of [false, true]) {
      const outcome = adapter(request, config.model, strict, scratchDir, CLI_TIMEOUT_MS, runCommand);

      if (outcome.notFound) {
        throw new CriticError(
          `Critic request failed: "${config.cli}" was not found on PATH. Install it and make sure you're logged in, or switch back to an API key.`,
        );
      }
      if (outcome.exitError) {
        throw new CriticError(`Critic request failed: ${outcome.exitError}`);
      }

      lastRaw = outcome.raw;
      if (outcome.parsed) return outcome.parsed;
    }

    throw new CriticError(
      `Critic returned non-conforming output after retry. Last response content: ${snippet(lastRaw)}`,
    );
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run tests/client/cli-critique.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/cli-critique.ts tests/client/cli-critique.test.ts
git commit -m "feat: add CLI critique dispatcher with retry and scratch-dir lifecycle"
```

---

### Task 7: Wire `critique()` to dispatch on `config.mode`

**Files:**
- Modify: `src/client/critic-client.ts`
- Modify: `tests/client/critic-client.test.ts`

**Interfaces:**
- Consumes: `cliCritique`, `CliCriticConfig` (`./cli-critique.js`); `CriticConfig` (`../core/types.js`).
- Produces: `CriticClientConfig = CriticConfig` (exported type alias, replacing the old standalone interface); `critique(config, request, fetchImpl?, runCliCommand?): Promise<CriticResponse>` — still assignable to `(config: CriticClientConfig, request: CriticRequest) => Promise<CriticResponse>`, so `src/server/handler.ts`'s `HandlerDeps` needs no change.

- [ ] **Step 1: Write the failing dispatch test**

Add to `tests/client/critic-client.test.ts` (new imports plus a new `describe` block — keep every existing test in the file as-is, from Task 2's fixture fix onward):

```ts
import type { CliCriticConfig } from "../../src/client/cli-critique.js";
import type { RunCliCommand } from "../../src/client/cli-run.js";
```

```ts
describe("critique dispatch", () => {
  it("dispatches to the CLI backend when config.mode is 'cli', without touching fetch", async () => {
    const cliConfig: CliCriticConfig = { mode: "cli", cli: "claude" };
    const runCliCommand: RunCliCommand = vi.fn().mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ structured_output: { issues: [], summary: "cli ok" } }),
      stderr: "",
    });
    const fetchImpl = vi.fn();

    const result = await critique(cliConfig, request, fetchImpl as unknown as typeof fetch, runCliCommand);

    expect(result.summary).toBe("cli ok");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests, verify the new one fails**

Run: `npx vitest run tests/client/critic-client.test.ts`
Expected: FAIL — `critique` doesn't accept a 4th argument or dispatch on `mode` yet.

- [ ] **Step 3: Update `src/client/critic-client.ts`**

Change the `CriticClientConfig` declaration and the `critique` export. Replace:

```ts
export interface CriticClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

with:

```ts
import type { CriticConfig } from "../core/types.js";
import { cliCritique } from "./cli-critique.js";
import { defaultRunCliCommand, type RunCliCommand } from "./cli-run.js";

export type CriticClientConfig = CriticConfig;
```

Rename the existing `export async function critique(...)` to `httpCritique`, keeping its body and internal logic completely unchanged, but narrow its config parameter type to the http shape only:

```ts
async function httpCritique(
  config: { baseUrl: string; apiKey: string; model: string },
  request: CriticRequest,
  fetchImpl: FetchLike = fetch,
): Promise<CriticResponse> {
  // ...unchanged body...
}
```

Add the new public dispatcher at the end of the file:

```ts
export async function critique(
  config: CriticClientConfig,
  request: CriticRequest,
  fetchImpl: FetchLike = fetch,
  runCliCommand: RunCliCommand = defaultRunCliCommand,
): Promise<CriticResponse> {
  if (config.mode === "cli") {
    return cliCritique(config, request, runCliCommand);
  }
  return httpCritique(config, request, fetchImpl);
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run tests/client/critic-client.test.ts`
Expected: all pass, including every pre-existing test (they all use `mode: "http"` configs from Task 2 and never pass a 4th argument, so they're unaffected).

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass. (This confirms `src/server/handler.ts` still compiles against the new `CriticClientConfig` with zero changes to that file.)

- [ ] **Step 6: Commit**

```bash
git add src/client/critic-client.ts tests/client/critic-client.test.ts
git commit -m "feat: dispatch critique() to the CLI backend when config.mode is cli"
```

---

### Task 8: Mark which providers have a CLI adapter

**Files:**
- Modify: `src/cli/providers.ts`
- Modify: `tests/cli/providers.test.ts`

**Interfaces:**
- Produces: `ProviderPreset.cliAdapter?: "claude" | "codex"`. Task 9 reads this field.

- [ ] **Step 1: Write the failing test**

Add to `tests/cli/providers.test.ts`:

```ts
it("marks anthropic and openai with their CLI adapter, and leaves other providers unmarked", () => {
  const anthropic = PROVIDERS.find((p) => p.id === "anthropic");
  const openai = PROVIDERS.find((p) => p.id === "openai");
  const gemini = PROVIDERS.find((p) => p.id === "gemini");

  expect(anthropic?.cliAdapter).toBe("claude");
  expect(openai?.cliAdapter).toBe("codex");
  expect(gemini?.cliAdapter).toBeUndefined();
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/cli/providers.test.ts`
Expected: FAIL — `cliAdapter` doesn't exist on `ProviderPreset` yet.

- [ ] **Step 3: Update `src/cli/providers.ts`**

Add the field to the interface:

```ts
export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string | null;
  models: string[];
  cliAdapter?: "claude" | "codex";
}
```

Set it on the `openai` and `anthropic` entries only:

```ts
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
    cliAdapter: "codex",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude, via its OpenAI-compatible endpoint)",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
    cliAdapter: "claude",
  },
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run tests/cli/providers.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/providers.ts tests/cli/providers.test.ts
git commit -m "feat: mark anthropic and openai provider presets with their CLI adapter"
```

---

### Task 9: Init wizard — CLI detection, auth-method question, `CRITIC_CLI` command variant

**Files:**
- Modify: `src/cli/init.ts`
- Modify: `tests/cli/build-add-command.test.ts`
- Modify: `tests/cli/run-init.test.ts`

**Interfaces:**
- Consumes: `ProviderPreset.cliAdapter` (Task 8).
- Produces: `BuildAddCommandParams` (discriminated union), `buildAddCommand(params): string[]`, `Prompter.authMethod(cli: "claude" | "codex"): Promise<"cli" | "key">`. Task 10 extends `Prompter`, `runInit`, and `InitResult` further — land this task first so those additions build on a working auth-method branch.

- [ ] **Step 1: Write the failing `buildAddCommand` tests**

Replace `tests/cli/build-add-command.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildAddCommand } from "../../src/cli/init.js";

describe("buildAddCommand", () => {
  it("builds the full claude mcp add argv for http auth in the documented order", () => {
    const args = buildAddCommand({
      authMode: "http",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      scope: "local",
    });

    expect(args).toEqual([
      "mcp",
      "add",
      "critic",
      "-e",
      "CRITIC_BASE_URL=https://api.openai.com/v1",
      "-e",
      "CRITIC_API_KEY=sk-test",
      "-e",
      "CRITIC_MODEL=gpt-5.6-terra",
      "-s",
      "local",
      "--",
      "npx",
      "-y",
      "llm-critic-loop",
    ]);
  });

  it("passes through the user scope instead of local when requested", () => {
    const args = buildAddCommand({
      authMode: "http",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      scope: "user",
    });

    expect(args).toContain("-s");
    expect(args[args.indexOf("-s") + 1]).toBe("user");
  });

  it("builds CRITIC_CLI argv for cli auth, with a model", () => {
    const args = buildAddCommand({ authMode: "cli", cli: "claude", model: "claude-opus-5", scope: "local" });

    expect(args).toEqual([
      "mcp",
      "add",
      "critic",
      "-e",
      "CRITIC_CLI=claude",
      "-e",
      "CRITIC_MODEL=claude-opus-5",
      "-s",
      "local",
      "--",
      "npx",
      "-y",
      "llm-critic-loop",
    ]);
  });

  it("omits CRITIC_MODEL for cli auth when no model is given", () => {
    const args = buildAddCommand({ authMode: "cli", cli: "codex", scope: "user" });

    expect(args).not.toContain("CRITIC_MODEL");
    expect(args).toContain("CRITIC_CLI=codex");
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run tests/cli/build-add-command.test.ts`
Expected: FAIL — `buildAddCommand` doesn't accept `authMode` yet.

- [ ] **Step 3: Update `BuildAddCommandParams` and `buildAddCommand` in `src/cli/init.ts`**

Replace:

```ts
export interface BuildAddCommandParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  scope: Scope;
}

export function buildAddCommand(params: BuildAddCommandParams): string[] {
  return [
    "mcp",
    "add",
    "critic",
    "-e",
    `CRITIC_BASE_URL=${params.baseUrl}`,
    "-e",
    `CRITIC_API_KEY=${params.apiKey}`,
    "-e",
    `CRITIC_MODEL=${params.model}`,
    "-s",
    params.scope,
    "--",
    "npx",
    "-y",
    "llm-critic-loop",
  ];
}
```

with:

```ts
export type BuildAddCommandParams =
  | { authMode: "http"; baseUrl: string; apiKey: string; model: string; scope: Scope }
  | { authMode: "cli"; cli: "claude" | "codex"; model?: string; scope: Scope };

export function buildAddCommand(params: BuildAddCommandParams): string[] {
  const envArgs =
    params.authMode === "cli"
      ? [
          "-e",
          `CRITIC_CLI=${params.cli}`,
          ...(params.model ? ["-e", `CRITIC_MODEL=${params.model}`] : []),
        ]
      : [
          "-e",
          `CRITIC_BASE_URL=${params.baseUrl}`,
          "-e",
          `CRITIC_API_KEY=${params.apiKey}`,
          "-e",
          `CRITIC_MODEL=${params.model}`,
        ];

  return ["mcp", "add", "critic", ...envArgs, "-s", params.scope, "--", "npx", "-y", "llm-critic-loop"];
}
```

- [ ] **Step 4: Run the `buildAddCommand` tests, verify they pass**

Run: `npx vitest run tests/cli/build-add-command.test.ts`
Expected: all pass.

- [ ] **Step 5: Add `authMethod` to the `Prompter` interface and its default implementation**

In the `Prompter` interface, add:

```ts
  authMethod(cli: "claude" | "codex"): Promise<"cli" | "key">;
```

In `getDefaultPrompter()`'s returned object, add:

```ts
    async authMethod(cli) {
      const choice = unwrap(
        await clack.select({
          message: `Use your existing ${cli} login, or enter an API key?`,
          options: [
            { value: "cli", label: `Use my ${cli} login` },
            { value: "key", label: "Enter an API key" },
          ],
        }),
      );
      return choice as "cli" | "key";
    },
```

- [ ] **Step 6: Add CLI detection and rewrite `runInit`'s middle section**

Add a helper above `runInit`:

```ts
function cliIsAvailable(cli: string, runCommand: RunCommand): boolean {
  const result = runCommand(cli, ["--version"]);
  return result.error?.code !== "ENOENT";
}
```

Replace the body of `runInit` from `const apiKey = await prompter.apiKey();` through `const args = buildAddCommand({ baseUrl, apiKey, model, scope });` with:

```ts
  const cliAvailable = provider.cliAdapter !== undefined && cliIsAvailable(provider.cliAdapter, runCommand);
  const authMethod = cliAvailable ? await prompter.authMethod(provider.cliAdapter as "claude" | "codex") : "key";
  const scope = await prompter.scope();

  const addParams: BuildAddCommandParams =
    authMethod === "cli"
      ? { authMode: "cli", cli: provider.cliAdapter as "claude" | "codex", model, scope }
      : { authMode: "http", baseUrl, apiKey: await prompter.apiKey(), model, scope };

  // Idempotent upsert: `claude mcp add` refuses if the name already exists,
  // so rerunning init to change settings would otherwise just fail with
  // "already exists". Remove any prior entry at this scope first; a failure
  // here (typically "nothing to remove") is expected and harmless.
  runCommand("claude", ["mcp", "remove", "critic", "-s", scope]);

  const args = buildAddCommand(addParams);
```

Leave everything below this (the `runCommand("claude", args)` call and the return statement) untouched for this task.

- [ ] **Step 7: Write the failing `run-init` tests for the new branch**

Add to `tests/cli/run-init.test.ts`. First, extend `fakePrompter` (in the existing file) with the new method:

```ts
    authMethod: vi.fn().mockResolvedValue("key"),
```

(add this line inside the object literal in `fakePrompter`, alongside the existing `apiKey`, `scope`, etc.)

Then add:

```ts
const ANTHROPIC: ProviderPreset = {
  id: "anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  models: ["claude-opus-5"],
  cliAdapter: "claude",
};

describe("runInit CLI auth", () => {
  it("does not ask about auth method when the provider has no CLI adapter", async () => {
    const prompter = fakePrompter();

    await runInit({ prompter, runCommand: succeedingRunCommand });

    expect(prompter.authMethod).not.toHaveBeenCalled();
  });

  it("does not ask about auth method when the CLI adapter isn't installed", async () => {
    const prompter = fakePrompter({ selectProvider: vi.fn().mockResolvedValue(ANTHROPIC) });
    const runCommand: RunCommand = vi
      .fn()
      .mockImplementation((cmd: string, args: string[]) =>
        args[0] === "--version"
          ? { status: null, stdout: "", stderr: "", error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) }
          : { status: 0, stdout: "Added", stderr: "" },
      );

    await runInit({ prompter, runCommand });

    expect(prompter.authMethod).not.toHaveBeenCalled();
  });

  it("asks about auth method and skips the API key prompt when the CLI is chosen", async () => {
    const prompter = fakePrompter({
      selectProvider: vi.fn().mockResolvedValue(ANTHROPIC),
      selectModel: vi.fn().mockResolvedValue("claude-opus-5"),
      authMethod: vi.fn().mockResolvedValue("cli"),
    });
    const runCommand: RunCommand = vi
      .fn()
      .mockImplementation((cmd: string, args: string[]) =>
        args[0] === "--version" ? { status: 0, stdout: "1.0.0", stderr: "" } : { status: 0, stdout: "Added", stderr: "" },
      );

    const result = await runInit({ prompter, runCommand });

    expect(prompter.authMethod).toHaveBeenCalledWith("claude");
    expect(prompter.apiKey).not.toHaveBeenCalled();
    expect(result.args).toContain("CRITIC_CLI=claude");
    expect(result.args).not.toContain("CRITIC_BASE_URL");
  });

  it("still asks for an API key when the CLI is available but the user picks 'key'", async () => {
    const prompter = fakePrompter({
      selectProvider: vi.fn().mockResolvedValue(ANTHROPIC),
      selectModel: vi.fn().mockResolvedValue("claude-opus-5"),
      authMethod: vi.fn().mockResolvedValue("key"),
    });
    const runCommand: RunCommand = vi
      .fn()
      .mockImplementation((cmd: string, args: string[]) =>
        args[0] === "--version" ? { status: 0, stdout: "1.0.0", stderr: "" } : { status: 0, stdout: "Added", stderr: "" },
      );

    const result = await runInit({ prompter, runCommand });

    expect(prompter.apiKey).toHaveBeenCalled();
    expect(result.args).toContain("CRITIC_BASE_URL=https://api.anthropic.com/v1");
  });
});
```

Add `import type { RunCommand } from "../../src/cli/init.js";` and `import type { ProviderPreset } from "../../src/cli/providers.js";` to the top of the file if not already present (`ProviderPreset` is already imported; add `RunCommand` alongside the existing `Prompter` type import).

- [ ] **Step 8: Run the full `run-init` suite**

Run: `npx vitest run tests/cli/run-init.test.ts`
Expected: all pass — both the pre-existing tests (OpenAI's fixture has no `cliAdapter`, so `cliIsAvailable` is never called for it, and `authMethod` is never asked) and the four new ones added in Step 7, since the `runInit` implementation from Steps 5–6 already landed before this test run.

- [ ] **Step 9: Run the full suite and type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all pass.

- [ ] **Step 10: Commit**

```bash
git add src/cli/init.ts tests/cli/build-add-command.test.ts tests/cli/run-init.test.ts
git commit -m "feat: offer CLI-login auth in the init wizard for anthropic/openai"
```

---

### Task 10: Smoke test after setup

**Files:**
- Modify: `src/cli/init.ts`
- Modify: `tests/cli/run-init.test.ts`
- Modify: `tests/cli/format-init-result.test.ts`

**Interfaces:**
- Consumes: `critique`, `CriticClientConfig`, `CriticRequest`, `CriticResponse`, `CriticError` (`../client/critic-client.js`).
- Produces: `Prompter.confirmSmokeTest(): Promise<boolean>`; `InitDeps.criticFn?`; `InitResult.smokeTest?: { ok: boolean; message: string }`; `formatInitResult` renders it.

- [ ] **Step 1: Add imports and the smoke-test request constant to `src/cli/init.ts`**

Add near the top of the file:

```ts
import {
  CriticError,
  critique as defaultCritique,
  type CriticClientConfig,
  type CriticRequest,
  type CriticResponse,
} from "../client/critic-client.js";

const SMOKE_TEST_REQUEST: CriticRequest = {
  systemPrompt: "You are a terse code critic. Reply with an empty issues array and a one-sentence summary.",
  artifact: "const x = 1;",
};
```

- [ ] **Step 2: Add `confirmSmokeTest` to `Prompter` and its default implementation**

In the `Prompter` interface:

```ts
  confirmSmokeTest(): Promise<boolean>;
```

In `getDefaultPrompter()`'s returned object:

```ts
    async confirmSmokeTest() {
      return unwrap(await clack.confirm({ message: "Test the connection now?", initialValue: true }));
    },
```

- [ ] **Step 3: Add `criticFn` to `InitDeps`, `smokeTest` to `InitResult`, and a `runSmokeTest` helper**

```ts
export interface InitDeps {
  prompter?: Prompter;
  runCommand?: RunCommand;
  criticFn?: (config: CriticClientConfig, request: CriticRequest) => Promise<CriticResponse>;
}

export interface InitResult {
  args: string[];
  ran: boolean;
  succeeded?: boolean;
  output?: string;
  smokeTest?: { ok: boolean; message: string };
}

function configFromAddParams(params: BuildAddCommandParams): CriticClientConfig {
  return params.authMode === "cli"
    ? { mode: "cli", cli: params.cli, model: params.model }
    : { mode: "http", baseUrl: params.baseUrl, apiKey: params.apiKey, model: params.model };
}

async function runSmokeTest(
  addParams: BuildAddCommandParams,
  criticFn: (config: CriticClientConfig, request: CriticRequest) => Promise<CriticResponse>,
): Promise<{ ok: boolean; message: string }> {
  try {
    await criticFn(configFromAddParams(addParams), SMOKE_TEST_REQUEST);
    return { ok: true, message: "Connection test succeeded." };
  } catch (error) {
    const message = error instanceof CriticError ? error.message : String(error);
    return { ok: false, message: `Connection test failed: ${message}` };
  }
}
```

- [ ] **Step 4: Wire the smoke-test prompt into `runInit`**

Replace the tail of `runInit` — from `const result = runCommand("claude", args);` through the final `return { ... }` — with:

```ts
  const result = runCommand("claude", args);
  if (result.error?.code === "ENOENT") {
    return { args, ran: false };
  }

  const succeeded = result.status === 0;
  let smokeTest: { ok: boolean; message: string } | undefined;
  if (succeeded && (await prompter.confirmSmokeTest())) {
    const criticFn = deps.criticFn ?? defaultCritique;
    smokeTest = await runSmokeTest(addParams, criticFn);
  }

  return {
    args,
    ran: true,
    succeeded,
    output: `${result.stdout}${result.stderr}`,
    smokeTest,
  };
```

- [ ] **Step 5: Update `formatInitResult` to render the smoke-test result**

Replace the `succeeded` branch:

```ts
  if (result.succeeded) {
    return [
      result.output ?? "",
      "",
      "critic is configured. Restart your MCP client to use it.",
    ].join("\n");
  }
```

with:

```ts
  if (result.succeeded) {
    const lines = [result.output ?? "", "", "critic is configured. Restart your MCP client to use it."];
    if (result.smokeTest) {
      lines.push("", result.smokeTest.message);
    }
    return lines.join("\n");
  }
```

- [ ] **Step 6: Write the failing tests**

Add to `tests/cli/run-init.test.ts` (extend `fakePrompter` with `confirmSmokeTest: vi.fn().mockResolvedValue(false)` so existing tests are unaffected by default):

```ts
    confirmSmokeTest: vi.fn().mockResolvedValue(false),
```

(add this line inside `fakePrompter`'s object literal)

```ts
describe("runInit smoke test", () => {
  it("does not run a smoke test when the user declines", async () => {
    const prompter = fakePrompter({ confirmSmokeTest: vi.fn().mockResolvedValue(false) });
    const criticFn = vi.fn();

    const result = await runInit({ prompter, runCommand: succeedingRunCommand, criticFn });

    expect(criticFn).not.toHaveBeenCalled();
    expect(result.smokeTest).toBeUndefined();
  });

  it("runs a smoke test and reports success when the user accepts", async () => {
    const prompter = fakePrompter({ confirmSmokeTest: vi.fn().mockResolvedValue(true) });
    const criticFn = vi.fn().mockResolvedValue({ issues: [], summary: "ok" });

    const result = await runInit({ prompter, runCommand: succeedingRunCommand, criticFn });

    expect(criticFn).toHaveBeenCalledTimes(1);
    expect(result.smokeTest).toEqual({ ok: true, message: "Connection test succeeded." });
  });

  it("reports smoke-test failure without failing the overall init result", async () => {
    const prompter = fakePrompter({ confirmSmokeTest: vi.fn().mockResolvedValue(true) });
    const criticFn = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await runInit({ prompter, runCommand: succeedingRunCommand, criticFn });

    expect(result.succeeded).toBe(true);
    expect(result.smokeTest?.ok).toBe(false);
    expect(result.smokeTest?.message).toContain("boom");
  });

  it("never runs a smoke test when the add command itself failed", async () => {
    const prompter = fakePrompter({ confirmSmokeTest: vi.fn().mockResolvedValue(true) });
    const criticFn = vi.fn();
    const runCommand: RunCommand = vi.fn().mockReturnValue({ status: 1, stdout: "", stderr: "already exists" });

    const result = await runInit({ prompter, runCommand, criticFn });

    expect(prompter.confirmSmokeTest).not.toHaveBeenCalled();
    expect(criticFn).not.toHaveBeenCalled();
    expect(result.smokeTest).toBeUndefined();
  });
});
```

Add to `tests/cli/format-init-result.test.ts`:

```ts
it("includes the smoke test message on success when present", () => {
  const message = formatInitResult({
    args: ["mcp", "add", "critic"],
    ran: true,
    succeeded: true,
    output: "Added critic",
    smokeTest: { ok: true, message: "Connection test succeeded." },
  });

  expect(message).toContain("Connection test succeeded.");
});

it("omits any smoke test section when none was run", () => {
  const message = formatInitResult({
    args: ["mcp", "add", "critic"],
    ran: true,
    succeeded: true,
    output: "Added critic",
  });

  expect(message).not.toContain("Connection test");
});
```

- [ ] **Step 7: Run the tests, verify the new ones fail then pass after the Step 1–5 edits**

Run: `npx vitest run tests/cli/run-init.test.ts tests/cli/format-init-result.test.ts`
Expected: all pass (the implementation in Steps 1–5 above should already make them green — if you're executing steps in strict order, run this once after Step 5 is in place, not before).

- [ ] **Step 8: Run the full suite and type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all pass.

- [ ] **Step 9: Commit**

```bash
git add src/cli/init.ts tests/cli/run-init.test.ts tests/cli/format-init-result.test.ts
git commit -m "feat: offer an optional real connection smoke test at the end of init"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a `CRITIC_CLI` section to the README**

In `README.md`, immediately after the existing paragraph that ends `...a compatibility proxy in front of another provider.` (the one explaining `CRITIC_BASE_URL`), insert:

```markdown
### Using your existing `claude` or `codex` login instead of a key

If you already have [Claude Code](https://claude.com/claude-code) or
[Codex CLI](https://github.com/openai/codex) installed and logged in
(subscription or API key, either works), you can skip `CRITIC_BASE_URL`/
`CRITIC_API_KEY` entirely and point critic at the CLI instead:

```bash
claude mcp add critic -e CRITIC_CLI=claude -e CRITIC_MODEL=claude-opus-5 \
  -- npx -y llm-critic-loop
```

```bash
claude mcp add critic -e CRITIC_CLI=codex -- npx -y llm-critic-loop
```

`CRITIC_CLI` accepts `claude` or `codex`. `CRITIC_MODEL` is optional in this
mode — omit it to use that CLI's own configured default model. The `init`
wizard offers this automatically when it detects the relevant CLI on your
`PATH`.
```

- [ ] **Step 2: Update the "all three `CRITIC_*` variables are required" paragraph**

Find the paragraph starting `All three \`CRITIC_*\` variables are **required**.` and replace it with:

```markdown
All three `CRITIC_BASE_URL`/`CRITIC_API_KEY`/`CRITIC_MODEL` variables are
**required** unless `CRITIC_CLI` is set, in which case those three are
ignored and only `CRITIC_CLI` (`claude` or `codex`) is required —
`CRITIC_MODEL` stays optional in that mode. If a required variable for
whichever mode you're in is missing or empty, the server exits non-zero at
startup with an explicit error naming the variable, rather than starting up
and failing on the first tool call. That is deliberate — a misconfigured
critic should be obvious immediately, not surface later as a mysterious
`verdict: "error"`.
```

- [ ] **Step 3: Read the file back and sanity-check formatting**

Read `README.md` and confirm the new sections render as intended (matching heading levels, no broken code fences) and sit in a sensible place relative to the surrounding manual-setup content.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document CRITIC_CLI as an alternative to CRITIC_BASE_URL/API_KEY"
```

---

## Final verification

- [ ] Run `npx tsc --noEmit && npx vitest run --coverage && npm run lint` and confirm everything is clean.
