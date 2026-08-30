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
