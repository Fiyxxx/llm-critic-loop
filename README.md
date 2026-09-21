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

## Features

- 🔍 **Independent, fresh-session review** — no shared context with the
  agent that wrote the artifact, so it can't rationalize its own blind spots
- 🔌 **Bring your own critic** — any OpenAI-compatible chat-completions
  endpoint (OpenAI, Anthropic, Gemini, xAI, Groq, Mistral, DeepSeek, or a
  local model), or skip the API key entirely and reuse your existing
  `claude`/`codex` CLI login
- 🛑 **Built-in convergence** — approve / issues-found / stale-loop /
  round-cap verdicts, so your agent knows exactly when to stop, decided
  from history rather than by asking the critic to grade itself
- 🧭 **Calibrated, structured findings** — every issue carries a category,
  a severity, an honest confidence level, and must point at the specific
  text that backs it, so hunches show up as hunches instead of dressed-up
  certainty
- 📝 **Code and docs modes** — the same tool reviews source code or
  written documentation/planning text, with a taxonomy and prompt tuned
  for each
- ⚡ **One-command setup** — `npx llm-critic-loop init` walks you through
  provider, model, and key (or CLI auth), then wires it into your MCP
  client for you

## Requirements

Node.js >= 18.17 to run the MCP server. `npx llm-critic-loop init` (the
setup wizard) additionally requires Node.js >= 20.12, since its interactive
prompts library needs it; on an older Node it prints a clear error and you
can fall back to the manual setup below.

## Setup

### Quick setup (recommended)

```bash
npx -y llm-critic-loop init
```

Interactive wizard: pick a provider (OpenAI, Anthropic, Gemini, xAI, Groq,
Mistral, DeepSeek, a local model server, or a custom endpoint), pick a model
from a curated list (or type your own), enter your API key, and choose
whether to add it for this project or all your projects. If the `claude` CLI
is on your `PATH`, it runs `claude mcp add` for you; otherwise it prints the
exact command to paste. Nothing is written to disk — the key only ever goes
into the command that registers the server. It also offers a quick
end-to-end connection test once setup is done, so you know it actually
works before you start relying on it.

Run the same command again any time you want to switch provider, model, or
key, or move it from project-only to all-projects — it's idempotent, and
replaces whatever `critic` config already exists at the scope you pick. No
need to remove anything first.

### Using your existing `claude` or `codex` login instead of an API key

If you already have [Claude Code](https://claude.com/claude-code) or
[Codex CLI](https://github.com/openai/codex) installed and logged in
(subscription or API key, either works), you can skip `CRITIC_BASE_URL`/
`CRITIC_API_KEY` entirely and point critic at the CLI instead — the `init`
wizard offers this automatically when it detects the relevant CLI on your
`PATH`. To do it by hand:

```bash
claude mcp add critic -e CRITIC_CLI=claude -e CRITIC_MODEL=claude-opus-5 \
  -- npx -y llm-critic-loop
```

```bash
claude mcp add critic -e CRITIC_CLI=codex -- npx -y llm-critic-loop
```

`CRITIC_CLI` accepts `claude` or `codex`. `CRITIC_MODEL` is optional in this
mode — omit it to use that CLI's own configured default model.

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

## Usage

You don't call `critic` yourself — your coding agent does, as an MCP tool,
the same way it calls any other tool it has access to. Once it's registered
(above), just ask your agent to use it, e.g.:

> "Use the critic tool to review the changes you just made, then fix
> whatever it finds and check again until it's done."

For it to happen automatically instead of on request, add an instruction
like this to your project's agent instructions file (`CLAUDE.md`, `AGENTS.md`,
or your client's equivalent):

```markdown
After writing or editing code, call the `critic` tool (mode: "code") on
what changed. Check `done` first: stop once it's true. If it's false, fix
the issues in `issues[]` and call `critic` again — pass `round` incremented
by one and the `history` value from the previous response.
```

That's the whole loop: your agent is the creator, `critic` is the reviewer,
and the `round`/`history` fields are how the two calls know they're part of
the same review instead of two unrelated ones.

## Tool: `critic`

**Input:** `artifact` (the code or docs text to review), `mode` (`"code"`
or `"docs"`), optional `context` (what the artifact is for, to focus the
critique), `round` (default 1), `history` (opaque blob from the previous
call, omit on round 1), optional `config` (`maxRounds` default 10,
`staleThreshold` default 0.8).

**Output:** `verdict` (`approved` / `issues_found` / `stale` /
`cap_reached` / `error`), `issues[]`, `summary`, `round`, `done`, `history`.
Stop calling once `done` is `true`.

Each issue carries:

- `category` — a taxonomy label (see Modes below)
- `severity` — `minor` / `major` / `critical`
- `confidence` — `low` / `medium` / `high`, the critic's honest certainty
- `description` — what's wrong and why it matters
- `location` — the specific text in the artifact the issue points at
- `suggestion` (optional) — a concrete fix, given only when the critic is
  confident of one

`low`-confidence issues are informational: they still appear in `issues[]`,
but never by themselves turn the verdict into `issues_found` or count
toward round-over-round staleness, so a critic can flag a hunch honestly
without blocking your loop on it. Every issue is expected to anchor to
specific text in the artifact via `location` — a claim with no anchor is a
guess, and the critic is instructed to mark it `low` confidence rather than
present it as verified.

### Modes

- **`code`** — categories: `bug`, `security`, `performance`,
  `error-handling`, `test-coverage`, `architecture`, `style`
- **`docs`** — categories: `factual-error`, `clarity`, `completeness`,
  `consistency`, `structure`

## How it stays fresh — and knows when to stop

The server itself holds no state between calls. Every response carries an
opaque `history` blob; you pass it back on the next round, and that's the
entire memory of the loop. Each critique still runs in a brand-new model
session — no chat history, no memory of its own prior verdicts — so it
never anchors on a judgment it already made.

Convergence is decided from that history, not by asking the critic to
grade itself:

- **`approved`** — this round found zero (countable) issues
- **`issues_found`** — real, new problems to go fix, **except**: from round
  2 onward, if every remaining issue is `minor`, it's accepted as-is —
  `verdict` is still `issues_found` but `done` is already `true`, so it's
  not worth another round chasing polish
- **`stale`** — the critic's issues this round overlap the prior round's
  above a word-fraction threshold (default 0.8): it's repeating itself,
  not finding anything new
- **`cap_reached`** — hit `maxRounds` (default 10) without converging

Always check `done`, not `verdict`, to decide whether to keep looping —
`issues_found` doesn't always mean "call again," for the minor-only case
above. Stop calling the moment `done` is `true`.

## Running two critics for one review

`llm-critic-loop` doesn't run an ensemble for you — it's one tool, one
critic per call, by design. But nothing stops you from calling it twice
with different `config`s (e.g. two different `CRITIC_MODEL`s, or one HTTP
and one CLI) and merging the results yourself. Different models miss
different things, so two independent critiques on the same artifact
regularly surface largely non-overlapping issues. If you want more
coverage, that's the pattern: two calls at your orchestration layer, not a
feature inside the tool.

Pick a fast model for the critic if you're iterating in a tight loop —
review latency is entirely the model's, not the server's, and a slow critic
makes you re-load context on every round just to read its output.

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
