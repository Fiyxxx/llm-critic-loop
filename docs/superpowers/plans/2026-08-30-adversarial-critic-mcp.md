# adversarial-critic-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stateless MCP server exposing one tool, `adversarial_critique`, that gives an independent fresh-session adversarial critique of a code or docs artifact with built-in convergence logic (approve / minor-only / stale-loop / round-cap), so any MCP host's own agent can drive a create-critique-revise loop without the host needing to implement convergence itself.

**Architecture:** Two-layer split — `src/core` (pure, I/O-free: types, fuzzy dedup, convergence state machine, history blob codec) and `src/server`/`src/client`/`src/prompts` (MCP wiring, BYOC critic HTTP client, per-mode system prompts). `core` has zero MCP or network dependency so it stays fully unit-testable and reusable outside MCP later.

**Tech Stack:** TypeScript (Node, ES2022/NodeNext), `@modelcontextprotocol/sdk`, `zod`, `vitest`. No mocking library — HTTP and critic-fn dependencies are injected as plain function parameters, mocked in tests with `vi.fn()`.

**Spec:** `docs/superpowers/specs/2026-08-30-adversarial-critic-mcp-design.md`

## Global Constraints

- Node ES2022 target, `module`/`moduleResolution`: `NodeNext`, strict TypeScript.
- BYOC critic config read once at server startup from `CRITIC_BASE_URL`, `CRITIC_API_KEY`, `CRITIC_MODEL` — missing any of these fails startup loudly (per spec's "Configuration (BYOC)" and "Error handling" sections).
- Domain errors (critic call failure, malformed critic output) return `isError: true` in the MCP tool result — never `throw` inside the tool handler for these, per spec's Packaging section and the MCP best-practices reference memory.
- Convergence rule evaluation order is fixed: (1) zero issues → approved, (2) all-minor & round≥2 → issues_found/done, (3) all-stale → stale/done, (4) round≥maxRounds → cap_reached/done, (5) else issues_found/not done. Do not reorder — later tasks depend on this exact precedence.
- Package name: `adversarial-critic-mcp`. License: MIT.

---

## File Structure

```
adversarial-critic-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── LICENSE
├── README.md
├── src/
│   ├── core/
│   │   ├── types.ts        # Issue, Verdict, ConvergenceConfig, HistoryState, ConvergenceResult
│   │   ├── history.ts      # encodeHistory / decodeHistory
│   │   ├── dedup.ts        # wordOverlap / isDuplicate
│   │   └── convergence.ts  # evaluateConvergence
│   ├── client/
│   │   └── critic-client.ts  # critique(), CriticError, CriticClientConfig, CriticRequest, CriticResponse
│   ├── prompts/
│   │   ├── code.ts
│   │   ├── docs.ts
│   │   └── index.ts        # getPromptForMode
│   └── server/
│       ├── config.ts       # loadCriticConfig, ConfigError
│       ├── tool-schema.ts  # AdversarialCritiqueInputSchema, AdversarialCritiqueInput
│       ├── handler.ts      # handleAdversarialCritique (testable orchestration)
│       └── index.ts        # MCP server entrypoint (thin wiring, not unit-tested)
└── tests/
    ├── core/
    │   ├── history.test.ts
    │   ├── dedup.test.ts
    │   └── convergence.test.ts
    ├── client/
    │   └── critic-client.test.ts
    ├── prompts/
    │   └── prompts.test.ts
    └── server/
        ├── config.test.ts
        ├── tool-schema.test.ts
        └── handler.test.ts
```

---

### Task 1: Project scaffold + core types & history codec

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/core/types.ts`
- Create: `src/core/history.ts`
- Test: `tests/core/history.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `Severity`, `Issue`, `Verdict`, `ConvergenceConfig`, `DEFAULT_CONVERGENCE_CONFIG`, `HistoryState`, `ConvergenceResult` (all from `src/core/types.ts`); `encodeHistory(state: HistoryState): string`, `decodeHistory(blob: string | undefined): HistoryState` (from `src/core/history.ts`) — every later task that touches history uses these two functions and these exact type names.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "adversarial-critic-mcp",
  "version": "0.1.0",
  "description": "MCP server: independent, fresh-session adversarial critique of code or docs artifacts, with built-in convergence.",
  "license": "MIT",
  "author": "adversarial-critic-mcp contributors",
  "homepage": "https://github.com/YOUR_ORG/adversarial-critic-mcp",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_ORG/adversarial-critic-mcp.git"
  },
  "mcpName": "io.github.YOUR_ORG/adversarial-critic-mcp",
  "type": "module",
  "bin": {
    "adversarial-critic-mcp": "dist/server/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc && shx chmod +x dist/server/index.js",
    "prepare": "npm run build",
    "test": "vitest run",
    "watch": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "shx": "^0.4.0",
    "typescript": "^5.8.0",
    "vitest": "^4.1.8"
  }
}
```

Note: `YOUR_ORG` in `homepage`/`repository`/`mcpName` is a real placeholder to swap for the actual GitHub org/user at publish time — not a plan placeholder, it's genuinely unknown until the repo is created on GitHub.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.log
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 6: Create src/core/types.ts**

```typescript
export type Severity = "minor" | "major" | "critical";

export interface Issue {
  category: string;
  severity: Severity;
  description: string;
  location?: string;
}

export type Verdict =
  | "approved"
  | "issues_found"
  | "stale"
  | "cap_reached"
  | "error";

export interface ConvergenceConfig {
  maxRounds: number;
  staleThreshold: number;
}

export const DEFAULT_CONVERGENCE_CONFIG: ConvergenceConfig = {
  maxRounds: 10,
  staleThreshold: 0.8,
};

export interface HistoryState {
  round: number;
  issueDigests: string[];
}

export interface ConvergenceResult {
  verdict: Verdict;
  done: boolean;
}
```

- [ ] **Step 7: Write the failing test for history codec**

```typescript
// tests/core/history.test.ts
import { describe, expect, it } from "vitest";
import { decodeHistory, encodeHistory } from "../../src/core/history.js";
import type { HistoryState } from "../../src/core/types.js";

describe("history codec", () => {
  it("round-trips a non-empty state", () => {
    const state: HistoryState = { round: 3, issueDigests: ["missing null check", "sql injection risk"] };
    const blob = encodeHistory(state);
    expect(decodeHistory(blob)).toEqual(state);
  });

  it("decodes undefined as empty history", () => {
    expect(decodeHistory(undefined)).toEqual({ round: 0, issueDigests: [] });
  });

  it("decodes garbage input as empty history without throwing", () => {
    expect(decodeHistory("not-valid-base64-json")).toEqual({ round: 0, issueDigests: [] });
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run tests/core/history.test.ts`
Expected: FAIL — `src/core/history.ts` does not exist yet.

- [ ] **Step 9: Implement src/core/history.ts**

```typescript
import type { HistoryState } from "./types.js";

const EMPTY_HISTORY: HistoryState = { round: 0, issueDigests: [] };

export function encodeHistory(state: HistoryState): string {
  return Buffer.from(JSON.stringify(state), "utf-8").toString("base64");
}

export function decodeHistory(blob: string | undefined): HistoryState {
  if (!blob) return { ...EMPTY_HISTORY };
  try {
    const parsed = JSON.parse(Buffer.from(blob, "base64").toString("utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.round === "number" &&
      Array.isArray(parsed.issueDigests)
    ) {
      return parsed as HistoryState;
    }
  } catch {
    // fall through to default below
  }
  return { ...EMPTY_HISTORY };
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/core/history.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/core/types.ts src/core/history.ts tests/core/history.test.ts package-lock.json
git commit -m "chore: scaffold project, add core types and history codec"
```

---

### Task 2: Fuzzy dedup matcher

**Files:**
- Create: `src/core/dedup.ts`
- Test: `tests/core/dedup.test.ts`

**Interfaces:**
- Consumes: nothing new (plain strings/numbers only)
- Produces: `wordOverlap(a: string, b: string): number`, `isDuplicate(description: string, priorDigests: string[], threshold: number): boolean` — `evaluateConvergence` (Task 3) calls `isDuplicate` directly.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/dedup.test.ts
import { describe, expect, it } from "vitest";
import { isDuplicate, wordOverlap } from "../../src/core/dedup.js";

describe("wordOverlap", () => {
  it("returns 1 for identical text", () => {
    expect(wordOverlap("missing null check on input", "missing null check on input")).toBe(1);
  });

  it("returns 0 for completely disjoint text", () => {
    expect(wordOverlap("missing null check", "typo in readme heading")).toBe(0);
  });

  it("returns a high fraction for reworded near-duplicates", () => {
    const a = "missing null check on the user supplied input value";
    const b = "missing null check on the user supplied input argument";
    expect(wordOverlap(a, b)).toBeGreaterThanOrEqual(0.8);
  });

  it("returns 0 when either string is empty", () => {
    expect(wordOverlap("", "some text")).toBe(0);
    expect(wordOverlap("some text", "")).toBe(0);
  });
});

describe("isDuplicate", () => {
  it("is true when overlap with any prior digest meets the threshold", () => {
    const priors = ["typo in heading", "missing null check on input"];
    expect(isDuplicate("missing null check on input", priors, 0.8)).toBe(true);
  });

  it("is false when no prior digest meets the threshold", () => {
    const priors = ["typo in heading"];
    expect(isDuplicate("missing null check on input", priors, 0.8)).toBe(false);
  });

  it("is false against an empty prior list", () => {
    expect(isDuplicate("missing null check on input", [], 0.8)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/dedup.test.ts`
Expected: FAIL — `src/core/dedup.ts` does not exist yet.

- [ ] **Step 3: Implement src/core/dedup.ts**

```typescript
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * Overlap coefficient: |A ∩ B| / min(|A|, |B|). Chosen over Jaccard so a
 * short, reworded restatement of a longer issue still scores as near-1 —
 * duplicates aren't always the same length.
 */
export function wordOverlap(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

export function isDuplicate(
  description: string,
  priorDigests: string[],
  threshold: number
): boolean {
  return priorDigests.some((digest) => wordOverlap(description, digest) >= threshold);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/dedup.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/dedup.ts tests/core/dedup.test.ts
git commit -m "feat: add fuzzy word-overlap dedup matcher"
```

---

### Task 3: Convergence state machine

**Files:**
- Create: `src/core/convergence.ts`
- Test: `tests/core/convergence.test.ts`

**Interfaces:**
- Consumes: `Issue`, `ConvergenceConfig`, `HistoryState`, `ConvergenceResult` from `src/core/types.ts` (Task 1); `isDuplicate` from `src/core/dedup.ts` (Task 2)
- Produces: `evaluateConvergence(issues: Issue[], round: number, history: HistoryState, config: ConvergenceConfig): ConvergenceResult` — this exact signature is called directly by `handleAdversarialCritique` in Task 8.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/convergence.test.ts
import { describe, expect, it } from "vitest";
import { evaluateConvergence } from "../../src/core/convergence.js";
import type { HistoryState, Issue } from "../../src/core/types.js";

const config = { maxRounds: 10, staleThreshold: 0.8 };
const emptyHistory: HistoryState = { round: 0, issueDigests: [] };

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    category: "bug",
    severity: "major",
    description: "off by one error in the loop bound",
    ...overrides,
  };
}

describe("evaluateConvergence", () => {
  it("approves when there are zero issues", () => {
    expect(evaluateConvergence([], 1, emptyHistory, config)).toEqual({
      verdict: "approved",
      done: true,
    });
  });

  it("does not accept minor-only issues on round 1", () => {
    const result = evaluateConvergence([issue({ severity: "minor" })], 1, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });

  it("accepts minor-only issues from round 2 onward", () => {
    const result = evaluateConvergence([issue({ severity: "minor" })], 2, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: true });
  });

  it("marks stale when every issue duplicates history", () => {
    const history: HistoryState = { round: 2, issueDigests: ["off by one error in the loop bound"] };
    const result = evaluateConvergence([issue()], 3, history, config);
    expect(result).toEqual({ verdict: "stale", done: true });
  });

  it("does not mark stale when at least one issue is genuinely new", () => {
    const history: HistoryState = { round: 2, issueDigests: ["off by one error in the loop bound"] };
    const issues = [issue(), issue({ description: "race condition on the shared counter" })];
    const result = evaluateConvergence(issues, 3, history, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });

  it("caps at maxRounds with real unresolved issues", () => {
    const result = evaluateConvergence([issue()], 10, emptyHistory, config);
    expect(result).toEqual({ verdict: "cap_reached", done: true });
  });

  it("returns issues_found/not done for a normal in-progress round", () => {
    const result = evaluateConvergence([issue()], 1, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/convergence.test.ts`
Expected: FAIL — `src/core/convergence.ts` does not exist yet.

- [ ] **Step 3: Implement src/core/convergence.ts**

```typescript
import { isDuplicate } from "./dedup.js";
import type { ConvergenceConfig, ConvergenceResult, HistoryState, Issue } from "./types.js";

/**
 * Rule order is fixed and intentional — see spec's Convergence rules section:
 * 1. no issues -> approved
 * 2. all minor, round >= 2 -> accept as-is
 * 3. every issue is a near-duplicate of one already in history -> stale
 * 4. round hit the cap -> cap_reached
 * 5. otherwise -> keep going
 */
export function evaluateConvergence(
  issues: Issue[],
  round: number,
  history: HistoryState,
  config: ConvergenceConfig
): ConvergenceResult {
  if (issues.length === 0) {
    return { verdict: "approved", done: true };
  }

  const allMinor = issues.every((issue) => issue.severity === "minor");
  if (allMinor && round >= 2) {
    return { verdict: "issues_found", done: true };
  }

  const allStale = issues.every((issue) =>
    isDuplicate(issue.description, history.issueDigests, config.staleThreshold)
  );
  if (allStale) {
    return { verdict: "stale", done: true };
  }

  if (round >= config.maxRounds) {
    return { verdict: "cap_reached", done: true };
  }

  return { verdict: "issues_found", done: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/convergence.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/convergence.ts tests/core/convergence.test.ts
git commit -m "feat: add convergence state machine"
```

---

### Task 4: Critic client (BYOC, OpenAI-compatible)

**Files:**
- Create: `src/client/critic-client.ts`
- Test: `tests/client/critic-client.test.ts`

**Interfaces:**
- Consumes: `Issue` from `src/core/types.ts` (Task 1)
- Produces: `CriticClientConfig { baseUrl, apiKey, model }`, `CriticRequest { systemPrompt, artifact, context? }`, `CriticResponse { issues: Issue[], summary: string }`, `CriticError` (class extends `Error`), `critique(config: CriticClientConfig, request: CriticRequest, fetchImpl?: typeof fetch): Promise<CriticResponse>` — Task 8's handler imports `critique` and `CriticError` by these exact names.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/client/critic-client.test.ts
import { describe, expect, it, vi } from "vitest";
import { CriticError, critique } from "../../src/client/critic-client.js";

const config = { baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };
const request = { systemPrompt: "You are a critic.", artifact: "const x = 1", context: "a test file" };

function fakeResponse(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Server Error",
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

describe("critique", () => {
  it("returns parsed issues and summary on a well-formed response", async () => {
    const body = JSON.stringify({
      issues: [{ category: "bug", severity: "major", description: "off by one" }],
      summary: "One major bug found.",
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(body));

    const result = await critique(config, request, fetchImpl as unknown as typeof fetch);

    expect(result.summary).toBe("One major bug found.");
    expect(result.issues).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries once with a stricter prompt when the first response is malformed, then succeeds", async () => {
    const goodBody = JSON.stringify({ issues: [], summary: "Looks good." });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse("not json at all"))
      .mockResolvedValueOnce(fakeResponse(goodBody));

    const result = await critique(config, request, fetchImpl as unknown as typeof fetch);

    expect(result.summary).toBe("Looks good.");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws CriticError when both attempts return malformed output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("still not json"));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws CriticError immediately on an HTTP failure, without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("", false, 500));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client/critic-client.test.ts`
Expected: FAIL — `src/client/critic-client.ts` does not exist yet.

- [ ] **Step 3: Implement src/client/critic-client.ts**

```typescript
import type { Issue } from "../core/types.js";

export interface CriticClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

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

type FetchLike = typeof fetch;

function buildMessages(request: CriticRequest, strict: boolean) {
  const systemPrompt = strict
    ? `${request.systemPrompt}\n\nRespond with ONLY valid JSON matching this shape, no prose, no markdown fences: {"issues":[{"category":string,"severity":"minor"|"major"|"critical","description":string,"location"?:string}],"summary":string}`
    : request.systemPrompt;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: request.context
        ? `Context:\n${request.context}\n\nArtifact:\n${request.artifact}`
        : `Artifact:\n${request.artifact}`,
    },
  ];
}

function parseResponse(raw: string): CriticResponse | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.issues) && typeof parsed.summary === "string") {
      return parsed as CriticResponse;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function critique(
  config: CriticClientConfig,
  request: CriticRequest,
  fetchImpl: FetchLike = fetch
): Promise<CriticResponse> {
  for (const strict of [false, true]) {
    const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(request, strict),
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new CriticError(`Critic request failed: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseResponse(content);
    if (parsed) return parsed;
  }

  throw new CriticError("Critic returned non-conforming output after retry");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/client/critic-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/client/critic-client.ts tests/client/critic-client.test.ts
git commit -m "feat: add BYOC critic client with retry-on-malformed"
```

---

### Task 5: Per-mode prompts and category taxonomy

**Files:**
- Create: `src/prompts/code.ts`
- Create: `src/prompts/docs.ts`
- Create: `src/prompts/index.ts`
- Test: `tests/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CODE_CATEGORIES`, `CODE_SYSTEM_PROMPT` (from `code.ts`); `DOCS_CATEGORIES`, `DOCS_SYSTEM_PROMPT` (from `docs.ts`); `getPromptForMode(mode: "code" | "docs"): { systemPrompt: string; categories: readonly string[] }` (from `index.ts`) — Task 8's handler calls `getPromptForMode`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/prompts/prompts.test.ts
import { describe, expect, it } from "vitest";
import { CODE_CATEGORIES, CODE_SYSTEM_PROMPT } from "../../src/prompts/code.js";
import { DOCS_CATEGORIES, DOCS_SYSTEM_PROMPT } from "../../src/prompts/docs.js";
import { getPromptForMode } from "../../src/prompts/index.js";

describe("getPromptForMode", () => {
  it("returns the code prompt and categories for mode 'code'", () => {
    const result = getPromptForMode("code");
    expect(result.systemPrompt).toBe(CODE_SYSTEM_PROMPT);
    expect(result.categories).toEqual(CODE_CATEGORIES);
  });

  it("returns the docs prompt and categories for mode 'docs'", () => {
    const result = getPromptForMode("docs");
    expect(result.systemPrompt).toBe(DOCS_SYSTEM_PROMPT);
    expect(result.categories).toEqual(DOCS_CATEGORIES);
  });
});

describe("category taxonomy", () => {
  it("matches the spec's fixed code categories", () => {
    expect(CODE_CATEGORIES).toEqual([
      "bug",
      "security",
      "performance",
      "error-handling",
      "test-coverage",
      "style",
    ]);
  });

  it("matches the spec's fixed docs categories", () => {
    expect(DOCS_CATEGORIES).toEqual([
      "factual-error",
      "clarity",
      "completeness",
      "consistency",
      "structure",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompts/prompts.test.ts`
Expected: FAIL — `src/prompts/*` do not exist yet.

- [ ] **Step 3: Implement src/prompts/code.ts**

```typescript
export const CODE_CATEGORIES = [
  "bug",
  "security",
  "performance",
  "error-handling",
  "test-coverage",
  "style",
] as const;

export const CODE_SYSTEM_PROMPT = `You are an independent adversarial code reviewer. You have not seen any prior discussion of this code — evaluate it fresh, on its own merits.

Find real, concrete problems: bugs, security vulnerabilities, missing error handling, unvalidated input, race conditions, missing or inadequate test coverage, and meaningful performance or style issues. Do not restate what the code does. Do not praise it.

For each problem, assign one category from: ${CODE_CATEGORIES.join(", ")}. Assign a severity: "critical" (breaks correctness or security), "major" (real bug or significant gap), or "minor" (style/cleanliness, not a correctness risk).

If the code is genuinely sound, say so and return an empty issues list — do not invent problems to seem thorough.`;
```

- [ ] **Step 4: Implement src/prompts/docs.ts**

```typescript
export const DOCS_CATEGORIES = [
  "factual-error",
  "clarity",
  "completeness",
  "consistency",
  "structure",
] as const;

export const DOCS_SYSTEM_PROMPT = `You are an independent adversarial reviewer of written documentation or planning text. You have not seen any prior discussion of this document — evaluate it fresh, on its own merits.

Find real, concrete problems: factual errors, unclear or ambiguous statements, missing information a reader would need, internal inconsistencies (sections that contradict each other), and structural problems that hurt readability. Do not restate what the document says. Do not praise it.

For each problem, assign one category from: ${DOCS_CATEGORIES.join(", ")}. Assign a severity: "critical" (a reader would be actively misled or blocked), "major" (a real gap or error), or "minor" (wording/polish, not a comprehension risk).

If the document is genuinely sound, say so and return an empty issues list — do not invent problems to seem thorough.`;
```

- [ ] **Step 5: Implement src/prompts/index.ts**

```typescript
import { CODE_CATEGORIES, CODE_SYSTEM_PROMPT } from "./code.js";
import { DOCS_CATEGORIES, DOCS_SYSTEM_PROMPT } from "./docs.js";

export interface ModePrompt {
  systemPrompt: string;
  categories: readonly string[];
}

export function getPromptForMode(mode: "code" | "docs"): ModePrompt {
  if (mode === "code") {
    return { systemPrompt: CODE_SYSTEM_PROMPT, categories: CODE_CATEGORIES };
  }
  return { systemPrompt: DOCS_SYSTEM_PROMPT, categories: DOCS_CATEGORIES };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/prompts/prompts.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/prompts tests/prompts
git commit -m "feat: add per-mode critic prompts and category taxonomy"
```

---

### Task 6: Server env config loader (BYOC)

**Files:**
- Create: `src/server/config.ts`
- Test: `tests/server/config.test.ts`

**Interfaces:**
- Consumes: nothing (reads `NodeJS.ProcessEnv`)
- Produces: `CriticEnvConfig { baseUrl, apiKey, model }`, `ConfigError` (class extends `Error`), `loadCriticConfig(env?: NodeJS.ProcessEnv): CriticEnvConfig` — Task 9's entrypoint calls `loadCriticConfig()` with no args (real `process.env`); this shape matches `CriticClientConfig` from Task 4 field-for-field.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/config.test.ts
import { describe, expect, it } from "vitest";
import { ConfigError, loadCriticConfig } from "../../src/server/config.js";

describe("loadCriticConfig", () => {
  it("returns config when all three env vars are set", () => {
    const env = {
      CRITIC_BASE_URL: "https://example.test/v1",
      CRITIC_API_KEY: "secret",
      CRITIC_MODEL: "test-model",
    };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "test-model",
    });
  });

  it("throws ConfigError listing every missing var", () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/config.test.ts`
Expected: FAIL — `src/server/config.ts` does not exist yet.

- [ ] **Step 3: Implement src/server/config.ts**

```typescript
export interface CriticEnvConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class ConfigError extends Error {}

export function loadCriticConfig(env: NodeJS.ProcessEnv = process.env): CriticEnvConfig {
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

  return { baseUrl: baseUrl as string, apiKey: apiKey as string, model: model as string };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/config.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts tests/server/config.test.ts
git commit -m "feat: add fail-loud BYOC env config loader"
```

---

### Task 7: Zod tool input schema

**Files:**
- Create: `src/server/tool-schema.ts`
- Test: `tests/server/tool-schema.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces: `AdversarialCritiqueInputSchema` (zod object), `AdversarialCritiqueInput` (inferred type) — Task 8's handler takes `AdversarialCritiqueInput` as its input parameter type; Task 9's entrypoint passes `AdversarialCritiqueInputSchema.shape` to `server.registerTool`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/tool-schema.test.ts
import { describe, expect, it } from "vitest";
import { AdversarialCritiqueInputSchema } from "../../src/server/tool-schema.js";

describe("AdversarialCritiqueInputSchema", () => {
  it("accepts a minimal valid input and defaults round to 1", () => {
    const result = AdversarialCritiqueInputSchema.parse({
      artifact: "const x = 1;",
      mode: "code",
    });
    expect(result.round).toBe(1);
  });

  it("rejects an empty artifact", () => {
    expect(() =>
      AdversarialCritiqueInputSchema.parse({ artifact: "", mode: "code" })
    ).toThrow();
  });

  it("rejects an invalid mode", () => {
    expect(() =>
      AdversarialCritiqueInputSchema.parse({ artifact: "text", mode: "spreadsheet" })
    ).toThrow();
  });

  it("accepts the full shape with history and config overrides", () => {
    const result = AdversarialCritiqueInputSchema.parse({
      artifact: "text",
      mode: "docs",
      context: "a README",
      round: 2,
      history: "opaque-blob",
      config: { maxRounds: 5, staleThreshold: 0.9 },
    });
    expect(result.config?.maxRounds).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/tool-schema.test.ts`
Expected: FAIL — `src/server/tool-schema.ts` does not exist yet.

- [ ] **Step 3: Implement src/server/tool-schema.ts**

```typescript
import { z } from "zod";

export const AdversarialCritiqueInputSchema = z.object({
  artifact: z.string().min(1).describe("The code or docs content to critique"),
  mode: z
    .enum(["code", "docs"])
    .describe("Whether the artifact is source code or documentation/prose"),
  context: z
    .string()
    .optional()
    .describe("What the artifact is for or its requirements, to focus the critique"),
  round: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe("Which round of critique this is, starting at 1"),
  history: z
    .string()
    .optional()
    .describe("Opaque history blob returned from the previous call; omit on round 1"),
  config: z
    .object({
      maxRounds: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Maximum rounds before forcing a stop, default 10"),
      staleThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Word-overlap fraction above which an issue counts as a repeat, default 0.8"),
    })
    .optional()
    .describe("Convergence tuning overrides"),
});

export type AdversarialCritiqueInput = z.infer<typeof AdversarialCritiqueInputSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/tool-schema.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/tool-schema.ts tests/server/tool-schema.test.ts
git commit -m "feat: add zod input schema for adversarial_critique tool"
```

---

### Task 8: Request handler (orchestration, DI-testable)

**Files:**
- Create: `src/server/handler.ts`
- Test: `tests/server/handler.test.ts`

**Interfaces:**
- Consumes: `CriticClientConfig`, `CriticRequest`, `CriticResponse`, `critique` (default), `CriticError` from `src/client/critic-client.ts` (Task 4); `getPromptForMode` from `src/prompts/index.ts` (Task 5); `decodeHistory`, `encodeHistory` from `src/core/history.ts` (Task 1); `evaluateConvergence` from `src/core/convergence.ts` (Task 3); `DEFAULT_CONVERGENCE_CONFIG`, `ConvergenceConfig` from `src/core/types.ts` (Task 1); `AdversarialCritiqueInput` from `src/server/tool-schema.ts` (Task 7)
- Produces: `HandlerDeps { criticConfig: CriticClientConfig; criticFn?: (config, request) => Promise<CriticResponse> }`, `ToolResult`, `handleAdversarialCritique(input: AdversarialCritiqueInput, deps: HandlerDeps): Promise<ToolResult>` — Task 9's entrypoint calls this directly inside the `registerTool` callback, passing `criticFn` unset (so the real `critique` default is used).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/handler.test.ts
import { describe, expect, it, vi } from "vitest";
import { handleAdversarialCritique } from "../../src/server/handler.js";
import { CriticError } from "../../src/client/critic-client.js";
import { encodeHistory } from "../../src/core/history.js";
import type { AdversarialCritiqueInput } from "../../src/server/tool-schema.js";

const criticConfig = { baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };

function input(overrides: Partial<AdversarialCritiqueInput> = {}): AdversarialCritiqueInput {
  return { artifact: "const x = 1;", mode: "code", round: 1, ...overrides };
}

describe("handleAdversarialCritique", () => {
  it("returns approved with done:true when the critic finds no issues", async () => {
    const criticFn = vi.fn().mockResolvedValue({ issues: [], summary: "Looks good." });

    const result = await handleAdversarialCritique(input(), { criticConfig, criticFn });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.verdict).toBe("approved");
    expect(result.structuredContent.done).toBe(true);
    expect(result.content[0].text).toBe("Looks good.");
  });

  it("returns issues_found with done:false on a normal in-progress round", async () => {
    const criticFn = vi.fn().mockResolvedValue({
      issues: [{ category: "bug", severity: "major", description: "off by one" }],
      summary: "One bug found.",
    });

    const result = await handleAdversarialCritique(input({ round: 1 }), { criticConfig, criticFn });

    expect(result.structuredContent.verdict).toBe("issues_found");
    expect(result.structuredContent.done).toBe(false);
    expect(typeof result.structuredContent.history).toBe("string");
  });

  it("returns isError:true with verdict 'error' when the critic call fails", async () => {
    const criticFn = vi.fn().mockRejectedValue(new CriticError("boom"));

    const result = await handleAdversarialCritique(input(), { criticConfig, criticFn });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.verdict).toBe("error");
  });

  it("carries prior history digests forward into the new history blob", async () => {
    const priorHistory = encodeHistory({ round: 1, issueDigests: ["earlier issue text"] });
    const criticFn = vi.fn().mockResolvedValue({
      issues: [{ category: "bug", severity: "major", description: "a brand new issue" }],
      summary: "Found one new issue.",
    });

    const result = await handleAdversarialCritique(
      input({ round: 2, history: priorHistory }),
      { criticConfig, criticFn }
    );

    expect(result.structuredContent.history).not.toBe(priorHistory);
    expect(result.structuredContent.verdict).toBe("issues_found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/handler.test.ts`
Expected: FAIL — `src/server/handler.ts` does not exist yet.

- [ ] **Step 3: Implement src/server/handler.ts**

```typescript
import {
  CriticClientConfig,
  CriticError,
  CriticRequest,
  CriticResponse,
  critique as defaultCritique,
} from "../client/critic-client.js";
import { decodeHistory, encodeHistory } from "../core/history.js";
import { evaluateConvergence } from "../core/convergence.js";
import { DEFAULT_CONVERGENCE_CONFIG, type ConvergenceConfig, type Issue } from "../core/types.js";
import { getPromptForMode } from "../prompts/index.js";
import type { AdversarialCritiqueInput } from "./tool-schema.js";

export interface HandlerDeps {
  criticConfig: CriticClientConfig;
  criticFn?: (config: CriticClientConfig, request: CriticRequest) => Promise<CriticResponse>;
}

export interface ToolResult {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    verdict: string;
    issues: Issue[];
    summary: string;
    round: number;
    done: boolean;
    history: string;
  };
}

export async function handleAdversarialCritique(
  input: AdversarialCritiqueInput,
  deps: HandlerDeps
): Promise<ToolResult> {
  const criticFn = deps.criticFn ?? defaultCritique;
  const round = input.round ?? 1;
  const history = decodeHistory(input.history);
  const { systemPrompt } = getPromptForMode(input.mode);
  const config: ConvergenceConfig = {
    maxRounds: input.config?.maxRounds ?? DEFAULT_CONVERGENCE_CONFIG.maxRounds,
    staleThreshold: input.config?.staleThreshold ?? DEFAULT_CONVERGENCE_CONFIG.staleThreshold,
  };

  let response: CriticResponse;
  try {
    response = await criticFn(deps.criticConfig, {
      systemPrompt,
      artifact: input.artifact,
      context: input.context,
    });
  } catch (error) {
    const message = error instanceof CriticError ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Critic call failed: ${message}` }],
      structuredContent: {
        verdict: "error",
        issues: [],
        summary: message,
        round,
        done: false,
        history: input.history ?? encodeHistory({ round: 0, issueDigests: [] }),
      },
    };
  }

  const { verdict, done } = evaluateConvergence(response.issues, round, history, config);
  const newHistory = encodeHistory({
    round,
    issueDigests: [...history.issueDigests, ...response.issues.map((i) => i.description)],
  });

  return {
    content: [{ type: "text", text: response.summary }],
    structuredContent: {
      verdict,
      issues: response.issues,
      summary: response.summary,
      round,
      done,
      history: newHistory,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/handler.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/handler.ts tests/server/handler.test.ts
git commit -m "feat: add adversarial_critique request handler"
```

---

### Task 9: MCP entrypoint, packaging finalize, README

**Files:**
- Create: `src/server/index.ts`
- Create: `LICENSE`
- Create: `README.md`

**Interfaces:**
- Consumes: `loadCriticConfig` (Task 6), `AdversarialCritiqueInputSchema` (Task 7), `handleAdversarialCritique` (Task 8), `McpServer`/`StdioServerTransport` from `@modelcontextprotocol/sdk`
- Produces: the runnable server binary at `dist/server/index.js` (nothing else depends on this file — it's the terminal wiring point)

- [ ] **Step 1: Implement src/server/index.ts**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCriticConfig } from "./config.js";
import { AdversarialCritiqueInputSchema } from "./tool-schema.js";
import { handleAdversarialCritique } from "./handler.js";

const criticConfig = loadCriticConfig();

const server = new McpServer({
  name: "adversarial-critic-mcp",
  version: "0.1.0",
});

server.registerTool(
  "adversarial_critique",
  {
    description:
      "Get an independent, fresh-session adversarial critique of a code or docs artifact, with built-in convergence (approve / minor-only / stale-loop / round-cap) so you know when to stop revising. Call again each round, passing back the returned history blob, until the result's done field is true.",
    inputSchema: AdversarialCritiqueInputSchema.shape,
  },
  async (input) => handleAdversarialCritique(input, { criticConfig })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and smoke-test missing-config failure**

Run: `npm run build && (unset CRITIC_BASE_URL CRITIC_API_KEY CRITIC_MODEL; node dist/server/index.js)`
Expected: process exits non-zero with an error mentioning the missing `CRITIC_*` variable names (from `ConfigError`), does not hang, does not start the stdio transport.

- [ ] **Step 3: Smoke-test clean startup**

Run: `CRITIC_BASE_URL=https://example.test/v1 CRITIC_API_KEY=x CRITIC_MODEL=test-model node dist/server/index.js &`, wait one second, then check the process is still running (e.g. `jobs` or `ps`), then stop it (`kill %1`).
Expected: process stays alive (waiting on stdio) instead of exiting — confirms config loads and the server starts listening.

- [ ] **Step 4: Create LICENSE**

```
MIT License

Copyright (c) 2026 adversarial-critic-mcp contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Create README.md**

````markdown
# adversarial-critic-mcp

Independent, fresh-session adversarial critique of a code or docs artifact,
exposed as one MCP tool: `adversarial_critique`. Your own agent stays the
creator — this tool is the critic. Call it each round, revise based on what
it finds, and stop when it tells you to.

## Install

```bash
npx -y adversarial-critic-mcp
```

Add to your MCP client config, e.g. `claude mcp add`:

```json
{
  "mcpServers": {
    "adversarial-critic": {
      "command": "npx",
      "args": ["-y", "adversarial-critic-mcp"],
      "env": {
        "CRITIC_BASE_URL": "https://api.openai.com/v1",
        "CRITIC_API_KEY": "sk-...",
        "CRITIC_MODEL": "gpt-4o"
      }
    }
  }
}
```

`CRITIC_BASE_URL` accepts any OpenAI-compatible chat-completions endpoint —
OpenAI, a local model server, or a compatibility proxy in front of another
provider.

## Why

Single-pass self-review anchors to its own prior reasoning. An independent
critic with a fresh context catches more — but only if it stays fresh each
round and the loop knows when to actually stop. This tool is stateless: it
returns an opaque history blob each call, you pass it back next round, and
it uses fuzzy duplicate detection to tell you when the critic has started
repeating itself instead of finding anything new.

## Tool: `adversarial_critique`

**Input:** `artifact`, `mode` (`"code"` or `"docs"`), optional `context`,
`round` (default 1), `history` (omit on round 1), optional `config`
(`maxRounds` default 10, `staleThreshold` default 0.8).

**Output:** `verdict` (`approved` / `issues_found` / `stale` /
`cap_reached` / `error`), `issues[]`, `summary`, `round`, `done`, `history`.
Stop calling once `done` is `true`.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
````

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 1–8 pass together.

- [ ] **Step 7: Commit**

```bash
git add src/server/index.ts LICENSE README.md
git commit -m "feat: add MCP entrypoint, LICENSE, and README"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 1 file structure) ✓, tool signature (Task 7 schema + Task 8 handler) ✓, convergence rules in exact spec order (Task 3) ✓, error handling incl. fail-open prohibition and retry-once (Tasks 4, 6, 8) ✓, BYOC env config (Task 6, wired in Task 9) ✓, packaging/README conventions from the MCP best-practices reference (Task 1 package.json, Task 9 README/entrypoint) ✓, testing strategy — pure `core` unit tests, DI-mocked `client`/`handler` tests, no live-network tests (Tasks 1–8) ✓. Deferred items (CLI wrapper, multi-provider, configurable taxonomy) intentionally have no task — spec lists them as out of scope for v1.
- **Placeholder scan:** No TBD/TODO/"add error handling"-style steps; the only bracketed placeholder is `YOUR_ORG` in `package.json`/README-adjacent metadata, called out explicitly as real unknown-until-publish data, not deferred plan content.
- **Type consistency:** `Issue`, `HistoryState`, `ConvergenceConfig`, `ConvergenceResult` (Task 1) are the exact names/shapes used unchanged through Tasks 2–3 and 8. `CriticClientConfig`/`CriticRequest`/`CriticResponse`/`CriticError`/`critique` (Task 4) match Task 8's imports verbatim. `AdversarialCritiqueInput` (Task 7) matches Task 8's handler signature and Task 9's `registerTool` call. `getPromptForMode` (Task 5) return shape (`{systemPrompt, categories}`) matches how Task 8 destructures it (`{ systemPrompt }`).
