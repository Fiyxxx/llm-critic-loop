# CLI auto-auth for critic (Claude + OpenAI)

## Problem

`llm-critic-loop` today requires the user to paste a raw API key into
`CRITIC_API_KEY` and hit an OpenAI-compatible `/chat/completions` endpoint
(`critic-client.ts`). Users who already have `claude` (Claude Code) or
`codex` (Codex CLI) installed and logged in — subscription or key, doesn't
matter which — have to go dig up/generate a separate API key just for this
tool, duplicating auth they already have.

## Scope

Two providers only: Anthropic (via the `claude` CLI) and OpenAI (via the
`codex` CLI). No other providers get a CLI-backed path in this round —
everyone else keeps the existing API-key flow, unchanged.

## Config shape

`CriticEnvConfig` becomes a discriminated union:

```ts
type CriticEnvConfig =
  | { mode: "http"; baseUrl: string; apiKey: string; model: string }
  | { mode: "cli"; cli: "claude" | "codex"; model?: string };
```

`loadCriticConfig`: presence of `CRITIC_CLI` (`"claude"` or `"codex"`, any
other value is a `ConfigError`) selects `cli` mode. In `cli` mode,
`CRITIC_MODEL` is optional (omitted → the CLI's own configured default
model) and `CRITIC_BASE_URL`/`CRITIC_API_KEY` are not read. Absence of
`CRITIC_CLI` falls through to today's `http` mode, requiring the existing
three vars exactly as now — zero behavior change for existing installs.

## CLI adapters

### `src/client/cli-adapters/claude.ts`

```
claude -p "<user content>" \
  --system-prompt "<critic system prompt>" \
  --output-format json \
  --json-schema '<inline JSON schema for {issues, summary}>' \
  --allowedTools "" \
  --strict-mcp-config \
  [--model <model>]
```

- `--allowedTools ""` — no tools available, so no permission prompts to
  hang on in non-interactive use, and no risk of the critic call touching
  the filesystem.
- `--strict-mcp-config` (no `--mcp-config` passed) — ignores project/user
  MCP config, so this call can never recursively load the `critic` MCP
  server itself.
- Spawned with `cwd` set to a dedicated scratch temp dir, not the caller's
  project directory — avoids CLAUDE.md auto-discovery, which otherwise
  pulls ~30K tokens of unrelated project context into the cache on every
  call (confirmed empirically: a trivial call cost $0.12, almost entirely
  cache-creation from this). Do **not** use `--bare` — it explicitly
  disables OAuth/keychain auth, which defeats the purpose of this feature.
- Parse: response is `--output-format json` envelope; read `.structured_output`
  directly (already the schema-validated object — no manual `JSON.parse`
  of a nested string needed). Fall back to `JSON.parse(.result)` if
  `structured_output` is absent (older CLI versions without schema
  support).

### `src/client/cli-adapters/codex.ts`

```
codex exec "<critic instructions + user content, combined — codex has no
  separate system-prompt flag>" \
  --sandbox read-only \
  --output-schema <tmp schema file> \
  -o <tmp output file> \
  [--model <model>]
```

- Codex has no `allowedTools`-equivalent kill switch; mitigate with
  `--sandbox read-only` (blocks writes) plus an explicit instruction in
  the prompt body itself ("Answer directly; do not attempt to use tools
  or run commands") — accepted as a softer guarantee than the Claude path.
- `--output-schema` takes a **file path**, not inline JSON (asymmetry from
  Claude) — write the schema to a temp file before spawning, delete it
  (and the `-o` output file) after reading.
- Parse: read the `-o` file after the process exits, `JSON.parse` it.

### `src/client/cli-critique.ts` (dispatcher)

Owns everything both adapters need identically:
- Spawn with a timeout (kill + `CriticError` on expiry) — default 120s for
  cli mode (vs 60s for http), since a cold cache-creation call can run
  longer.
- `ENOENT` on spawn → `CriticError` naming the missing binary and that it
  must be on `PATH` and logged in.
- Non-zero exit → `CriticError` with a trimmed stderr snippet (same
  `snippet()` helper style as the http path).
- Malformed/non-conforming JSON output → one retry with a stricter
  reminder appended to the prompt, mirroring the existing http path's
  `strict` two-pass loop; second failure throws
  `CriticError` with the same "non-conforming output after retry" message
  shape used today.

`critic-client.ts`'s exported `critique()` becomes a thin dispatcher on
`config.mode`: `"http"` → existing fetch logic (untouched); `"cli"` →
`cli-critique.ts`.

## Init wizard

Provider list (`providers.ts`) is unchanged. After model selection: if the
selected provider has a known CLI adapter (Anthropic → `claude`, OpenAI →
`codex`) **and** that binary is detected on `PATH`
(`spawnSync(cli, ["--version"])` succeeds), ask one extra question:

> "Use your existing `claude`/`codex` login, or enter an API key?"

If the binary isn't found, this question is skipped entirely — the wizard
falls straight through to today's `apiKey()` prompt, no dead-end option
ever shown.

Choosing "use existing login": skip `apiKey()`, and `buildAddCommand`
emits the `CRITIC_CLI=<claude|codex>` (+ optional `CRITIC_MODEL`) variant
instead of `CRITIC_BASE_URL`/`CRITIC_API_KEY`.

### Smoke test

After building and running the `claude mcp add` command (existing
behavior), ask: "Test the connection now?" On yes, run one real critique
call through the exact config just written (small fixed prompt, e.g.
critique a one-line placeholder snippet) and print success/failure before
declaring setup complete. Surfaces "logged in but wrong plan" / bad-key
problems at setup time instead of on first real use. Declining, or the
test failing, doesn't block finishing setup — it's a confidence check,
not a gate.

## Testing

- `config.ts`: new `cli` branch (valid `claude`/`codex`, invalid value →
  `ConfigError`, optional model), and a regression test that the existing
  `http` branch behavior is byte-for-byte unchanged.
- Both adapters: inject a `SpawnLike` (mirrors the existing `FetchLike`
  injection pattern) — cover success parse, binary-not-found (`ENOENT`),
  non-zero exit, timeout, malformed-output retry-then-fail.
- `init.ts`: new wizard branch (CLI detected → auth-method question
  shown; not detected → question skipped), `buildAddCommand`'s new `cli`
  variant, and the smoke-test prompt/skip paths.

## Explicitly out of scope

- Any provider besides Anthropic/OpenAI getting a CLI-backed path.
- Changing the existing `http` mode's request/response handling at all.
- A generic/pluggable "any CLI" adapter framework — just these two,
  hardcoded, since their flag surfaces are different enough that a shared
  abstraction would be premature.
