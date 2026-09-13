# llm-critic-loop

[![CI](https://github.com/Fiyxxx/llm-critic-loop/actions/workflows/ci.yml/badge.svg)](https://github.com/Fiyxxx/llm-critic-loop/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/llm-critic-loop.svg)](https://www.npmjs.com/package/llm-critic-loop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Independent, fresh-session adversarial critique of a code or docs artifact,
exposed as one MCP tool: `critic`. Your own agent stays the creator — this
tool is the critic. Call it each round, revise based on what it finds, and
stop when it tells you to.

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

### Manual setup

Prefer to do it by hand, or using a different MCP client? Add it with the
Claude Code CLI:

```bash
claude mcp add critic -e CRITIC_BASE_URL=https://api.openai.com/v1 \
  -e CRITIC_API_KEY=sk-... -e CRITIC_MODEL=gpt-4o \
  -- npx -y llm-critic-loop
```

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

All three `CRITIC_*` variables are **required**. If any is missing or empty,
the server exits non-zero at startup with an explicit error naming the
variable, rather than starting up and failing on the first tool call. That
is deliberate — a misconfigured critic should be obvious immediately, not
surface later as a mysterious `verdict: "error"`.

## Security note

The critic's `summary` and every issue `description` are relayed verbatim
into the calling agent's context. The artifact under review may itself be
untrusted or attacker-influenced text, so a crafted artifact could in
principle steer the critic's output to influence your agent's subsequent
reasoning — a prompt-injection path that runs through the critique rather
than around it. This is inherent to any LLM-review tool and is not
something this server can fix in code; treat critique output as untrusted
model output, the same as you would the artifact itself.

## Why

Single-pass self-review anchors to its own prior reasoning. An independent
critic with a fresh context catches more — but only if it stays fresh each
round and the loop knows when to actually stop. This tool is stateless: it
returns an opaque history blob each call, you pass it back next round, and
it uses fuzzy duplicate detection to tell you when the critic has started
repeating itself instead of finding anything new.

## Tool: `critic`

**Input:** `artifact`, `mode` (`"code"` or `"docs"`), optional `context`,
`round` (default 1), `history` (omit on round 1), optional `config`
(`maxRounds` default 10, `staleThreshold` default 0.8).

**Output:** `verdict` (`approved` / `issues_found` / `stale` /
`cap_reached` / `error`), `issues[]`, `summary`, `round`, `done`, `history`.
Stop calling once `done` is `true`.

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
