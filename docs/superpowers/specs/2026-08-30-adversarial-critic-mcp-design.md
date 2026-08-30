# adversarial-critic-mcp — Design

Date: 2026-08-30
Status: approved for planning

## Problem

Single-pass LLM self-review anchors to its own prior reasoning and misses real
issues (missing error handling, unvalidated input, race conditions, factual
errors in docs). An independent, fresh-context critic catches more, but
existing OSS multi-agent-debate/review tools either (a) are code-only, (b)
keep both sides' full transcript growing across rounds (re-introducing
anchoring/groupthink), or (c) cap rounds with no real stale-loop detection.
No existing tool combines: generic artifact type (code + docs), fresh-session
critic per round, and fuzzy-duplicate stale-loop detection.

Sources: [myers.io adversarial loop](https://myers.io/2026/04/15/LLMs-and-the-Adversarial-loop/),
prior-art survey (self-refine-skill, alecnielsen/adversarial-review, heym
4-agent review, mcp-multi-agent-code-review) — all found code-only or
same-context debate.

## Goal

Ship a small, open-source, drop-in MCP server that any agentic host (Claude
Code, Cursor, Copilot, Codex CLI, custom MCP clients) can install and call to
get an independent adversarial critique of a code or docs artifact, with
built-in convergence logic so the calling agent knows when to stop revising.

## Non-goals (v1)

- Not a full autonomous loop that revises artifacts itself — the calling
  host's own agent stays the Creator (already has file access, session,
  context). This tool is Critic-as-a-service only.
- Not multi-provider abstraction — BYOC via one OpenAI-compatible endpoint
  for the critic model, configured once at server startup.
- No server-side session/state store — fully stateless; the host passes an
  opaque history blob back each round.
- No CLI wrapper in v1 (component split leaves this open for later without
  redesign — `core` has zero MCP dependency).

## Architecture

Two-layer split:

- **`core/`** — pure, I/O-free. Convergence state machine, fuzzy-dedup
  matcher, history-blob encode/decode, issue/verdict types. Fully
  unit-testable without network or a running server. Framework-agnostic —
  reusable outside MCP later (CLI, CI script) with no redesign.
- **`server/`** — MCP wiring only: reads BYOC env config at startup (fails
  loud if unset/malformed), exposes one tool, calls `client` then `core`,
  returns the MCP result.
- **`client/`** — thin wrapper around an OpenAI-compatible chat-completions
  endpoint for the critic model. Structured-output parsing, one retry on
  malformed JSON, then hard error.
- **`prompts/`** — per-mode (code/docs) critic system prompts + severity/
  category taxonomy, versioned separately from `core` so prompt tuning never
  touches loop logic.

Round flow: host sends artifact + mode + prior history blob → server calls
critic model with mode-specific system prompt → parses structured critique →
`core` runs convergence check against the passed-back history → returns
verdict + updated history blob. Host revises based on issues, calls again
next round, stops when `done: true`.

## Tool: `adversarial_critique`

Input:
```ts
{
  artifact: string,
  mode: "code" | "docs",
  context?: string,        // what the artifact is for / requirements
  round?: number,           // default 1
  history?: string,         // opaque blob from prior call; omit on round 1
  config?: {
    maxRounds?: number,      // default 10
    staleThreshold?: number, // default 0.8 (fuzzy word-overlap fraction)
  }
}
```

Output (`structuredContent`, plus a human-readable `content` text summary):
```ts
{
  verdict: "approved" | "issues_found" | "stale" | "cap_reached" | "error",
  issues: Array<{
    category: string,             // see taxonomy below
    severity: "minor" | "major" | "critical",
    description: string,
    location?: string,
  }>,
  summary: string,
  round: number,
  done: boolean,      // host should stop looping when true
  history: string,    // pass back unmodified on next call
}
```

### Severity/category taxonomy

- `code`: bug, security, performance, error-handling, test-coverage, style
- `docs`: factual-error, clarity, completeness, consistency, structure

### Convergence rules (in `core`, pure function, unit-tested independent of any model call)

1. Zero issues returned → `approved`, `done: true`.
2. Issues present but all severity `minor` (and round ≥ 2) → `issues_found`
   with `done: true` — host may accept as-is.
3. Fuzzy-dedup: each new issue is checked against the history blob's
   prior-issue digests via word-overlap. If **every** new issue individually
   has word-overlap ≥ `staleThreshold` against at least one prior digest —
   i.e. not a single genuinely new issue was raised this round — verdict
   `stale`, `done: true`: the critic is repeating itself, further rounds
   unproductive. One genuinely new issue is enough to keep the loop going;
   this is a universal (every-issue) test, not an aggregate fraction of how
   many new issues happened to be duplicates.
4. `round >= maxRounds` → `cap_reached`, `done: true`, regardless of issue
   state.
5. Otherwise → `issues_found`, `done: false`, host should revise and call
   again.

## Error handling

- Critic call fails/times out → `verdict: "error"`, MCP `isError: true`,
  `done: false`. Never fail open — a broken critic call must never resolve
  to `approved`.
- Critic returns non-conforming structured output → one retry with a
  stricter format instruction, then hard error (no coercion/guessing).
- Invalid tool input → standard zod/MCP invalid-params rejection.
- Missing/malformed BYOC env config (`CRITIC_BASE_URL`, `CRITIC_API_KEY`,
  `CRITIC_MODEL`) at startup → server exits with an error, never half-starts
  silently.

## Configuration (BYOC)

Read once at server startup from environment variables:
- `CRITIC_BASE_URL` — OpenAI-compatible chat-completions endpoint
- `CRITIC_API_KEY`
- `CRITIC_MODEL`

Chosen over per-call params to avoid leaking credentials into tool-call
payloads/logs, and to match how MCP hosts already inject env at server
launch (`claude mcp add`, etc.) — zero extra protocol surface.

## Testing strategy

- `core`: vitest, pure unit tests — convergence state machine and
  fuzzy-dedup matcher fed synthetic critic outputs, no network involved.
- `client`: unit tests against mocked HTTP (msw/nock) — JSON parsing,
  retry-once-then-error path.
- `server`: thin integration test with a mocked `client`.
- Prompt quality: manual eval set (artifacts with known injected issues per
  mode) run against a real API key — not CI-blocking; prompts are tuned
  iteratively and are a content concern, not a logic-correctness one.

## Packaging & distribution

Reference: `modelcontextprotocol/servers` (see memory: MCP server best
practices) —
- TypeScript, `@modelcontextprotocol/sdk`, zod schemas with `.describe()` on
  every field (these are the tool docs the calling model reads).
- `isError: true` in the tool result for domain errors (critic failure,
  malformed output) — never `throw` for these, since a thrown exception
  becomes an opaque JSON-RPC InternalError invisible to the calling agent's
  reasoning. Reserve `throw`/`McpError` for actual protocol-level failures.
- package.json: `"bin"` field for npx installability, `"files": ["dist"]`,
  `"prepare": "npm run build"`, `mcpName: "io.github.<org>/adversarial-critic-mcp"`.
- README leads with the one-line install/run command and the JSON
  client-config block, before the feature list.
- License: MIT.
- Publish to: official Anthropic MCP Registry (baseline), Glama, Smithery,
  GitHub topic tags (`mcp-server`, `adversarial-review`).

## Open items for later (explicitly deferred, not blocking v1)

- CLI wrapper around `core`+`client` for non-agentic/CI use.
- Multi-provider critic model abstraction beyond single OpenAI-compatible
  endpoint.
- Configurable severity taxonomy per project (currently fixed per mode).
