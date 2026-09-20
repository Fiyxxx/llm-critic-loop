![llm-critic-loop — independent fresh-session review for code and docs](assets/llm-critic-loop-banner.png)

# llm-critic-loop

[![CI](https://github.com/Fiyxxx/llm-critic-loop/actions/workflows/ci.yml/badge.svg)](https://github.com/Fiyxxx/llm-critic-loop/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/llm-critic-loop.svg)](https://www.npmjs.com/package/llm-critic-loop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Your coding agent is a bad judge of its own work.** Ask any model to
review the code it just wrote and it anchors on its own prior reasoning —
a well-documented self-evaluation bias — and waves through its own mistakes.
`llm-critic-loop` fixes that by giving it an adversarial critic: a second
model, in a fresh session with no memory of how the artifact was written,
whose only job is to find what's wrong with it.

One MCP tool, `critic`. Your agent stays the creator. Call it each round,
revise based on what it finds, and stop the moment it tells you to —
built-in convergence detection catches both "actually done" and "just
repeating itself," so the loop can't run forever.

- 🔍 **Independent, fresh-session review** — no shared context with the
  agent that wrote the artifact, so it can't rationalize its own blind spots
- 🔌 **Bring your own critic** — any OpenAI-compatible chat-completions
  endpoint: OpenAI, Anthropic, Gemini, xAI, Groq, Mistral, DeepSeek, or a
  local model
- 🛑 **Built-in convergence** — approve / issues-found / stale-loop /
  round-cap verdicts, so your agent knows exactly when to stop
- ⚡ **One-command setup** — `npx llm-critic-loop init` walks you through
  provider, model, and key, then wires it into your MCP client for you

## Requirements

Node.js >= 18.17 to run the MCP server. `npx llm-critic-loop init` (the
setup wizard) additionally requires Node.js >= 20.12, since its interactive
prompts library needs it; on an older Node it prints a clear error and you
can fall back to the manual setup below.

## Install

```bash
npx -y llm-critic-loop init
```

Interactive setup: pick a provider (OpenAI, Anthropic, Gemini, xAI, Groq,
Mistral, DeepSeek, a local model server, or a custom endpoint), pick a model
from a curated list (or type your own), enter your API key, and choose
whether to add it for this project or all your projects. If the `claude` CLI
is on your `PATH`, it runs `claude mcp add` for you; otherwise it prints the
exact command to paste. Nothing is written to disk — the key only ever goes
into the command that registers the server.

### Changing provider, model, key, or scope later

Run the same command again:

```bash
npx -y llm-critic-loop init
```

It's idempotent — it replaces whatever `critic` config already exists at
the scope you pick, so rerunning it is the standard way to switch models,
rotate a key, or move it from project-only to all-projects. No need to
remove anything first.

### Manual setup

Prefer to do it by hand, or using a different MCP client? Add it with the
Claude Code CLI:

```bash
claude mcp add critic -e CRITIC_BASE_URL=https://api.openai.com/v1 \
  -e CRITIC_API_KEY=sk-... -e CRITIC_MODEL=gpt-4o \
  -- npx -y llm-critic-loop
```

`claude mcp add` refuses if `critic` already exists, so to change settings
by hand, remove it first: `claude mcp remove critic` (add `-s local` /
`-s user` if you added it at a non-default scope), then run `add` again.

Or add it directly to your MCP client config:

```json
{
  "mcpServers": {
    "critic": {
      "command": "npx",
      "args": ["-y", "llm-critic-loop"],
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

All three `CRITIC_BASE_URL`/`CRITIC_API_KEY`/`CRITIC_MODEL` variables are
**required** unless `CRITIC_CLI` is set, in which case those three are
ignored and only `CRITIC_CLI` (`claude` or `codex`) is required —
`CRITIC_MODEL` stays optional in that mode. If a required variable for
whichever mode you're in is missing or empty, the server exits non-zero at
startup with an explicit error naming the variable, rather than starting up
and failing on the first tool call. That is deliberate — a misconfigured
critic should be obvious immediately, not surface later as a mysterious
`verdict: "error"`.

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

## How it stays fresh — and knows when to stop

The server itself holds no state between calls. Every response carries an
opaque `history` blob; you pass it back on the next round, and that's the
entire memory of the loop. Each critique still runs in a brand-new model
session — no chat history, no memory of its own prior verdicts — so it
never anchors on a judgment it already made.

Convergence is decided from that history, not by asking the critic to
grade itself:

- **`approved`** — this round found zero issues
- **`issues_found`** — real, new problems to go fix
- **`stale`** — the critic's issues this round overlap the prior round's
  above a word-fraction threshold (default 0.8): it's repeating itself,
  not finding anything new
- **`cap_reached`** — hit `maxRounds` (default 10) without converging

`done` is `true` on every verdict except `issues_found`. Stop calling the
moment you see it.

## Tool: `critic`

**Input:** `artifact`, `mode` (`"code"` or `"docs"`), optional `context`,
`round` (default 1), `history` (omit on round 1), optional `config`
(`maxRounds` default 10, `staleThreshold` default 0.8).

**Output:** `verdict` (`approved` / `issues_found` / `stale` /
`cap_reached` / `error`), `issues[]`, `summary`, `round`, `done`, `history`.
Stop calling once `done` is `true`.

## Security note

The critic's `summary` and every issue `description` are relayed verbatim
into the calling agent's context. The artifact under review may itself be
untrusted or attacker-influenced text, so a crafted artifact could in
principle steer the critic's output to influence your agent's subsequent
reasoning — a prompt-injection path that runs through the critique rather
than around it. This is inherent to any LLM-review tool and is not
something this server can fix in code; treat critique output as untrusted
model output, the same as you would the artifact itself.

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). This project
follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Found a security
issue? See [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
