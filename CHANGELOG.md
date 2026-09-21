# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

### Fixed

- README's stop-condition rule ("`done` is `true` on every verdict except
  `issues_found`") was wrong: from round 2 onward, an all-minor issue set is
  accepted with `verdict: "issues_found"` and `done: true`. Docs now tell
  integrators to check `done`, not `verdict`, to decide whether to loop
  again. Found by an independent code review.

## [0.2.0] - 2026-09-21

### Added

- `npx llm-critic-loop init`: interactive setup wizard (provider, model,
  API key, scope) that runs `claude mcp add` for you, or prints the
  equivalent command if the `claude` CLI isn't on `PATH`. Idempotent:
  rerunning it removes any existing `critic` entry at the chosen scope
  first, so it's also the standard way to change provider, model, key, or
  scope later. Offers an optional end-to-end connection smoke test once
  setup is done.
- `CRITIC_CLI` config mode (`claude` or `codex`): point critic at your
  existing `claude`/`codex` CLI login instead of an API key. `CRITIC_MODEL`
  is optional in this mode; the `init` wizard offers it automatically when
  it detects the relevant CLI on `PATH`.
- CI workflow (lint, format check, build, test on Node 18/20/22).
- ESLint + Prettier tooling (`npm run lint`, `npm run format`).
- Test coverage reporting (`npm run test:coverage`).
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, issue/PR templates.
- Each issue now carries a `confidence` (`low`/`medium`/`high`) and an
  optional `suggestion`. `low`-confidence issues still appear in `issues[]`
  but no longer count toward the `issues_found`/`stale` verdict or
  round-over-round staleness tracking, so a critic can flag an honest hunch
  without blocking the loop on it.
- New `architecture` category for `mode: "code"` (unwarranted structural
  complexity — tangled responsibilities, single-caller abstractions).
- Prompts now require every issue to anchor to specific text in the artifact
  (`location`) and instruct the critic not to inflate severity to seem
  thorough; an unanchored claim should be marked `low` confidence instead of
  presented as verified.
- README documents running two critics (different `CRITIC_MODEL`s or
  HTTP + CLI) and merging results yourself for ensemble-style coverage, and
  notes that review latency is the chosen model's, not the server's.

### Changed

- MCP tool renamed from `adversarial_critique` to `critic`.

### Fixed

- `isValidIssue`'s type guard now has its own `RawIssue` type instead of
  asserting `value is Issue` while leaving `confidence` unchecked — closes a
  type-soundness gap where code between validation and normalization could
  read `issue.confidence` as always present when it wasn't.
- An issue's `suggestion` field is now rejected if it's an empty or
  whitespace-only string, matching the existing rule for `description`.
- Server-reported version now reads from `package.json` at startup instead of
  a separately hardcoded string, so the two can no longer drift.
- `init` on Node < 20.12 now prints a clear error instead of crashing with a
  raw `SyntaxError` (its prompts library requires Node >= 20.12; the MCP
  server itself is unaffected and still runs on Node >= 18.17).
- Downgraded `vitest`/`@vitest/coverage-v8` from 4.x to 3.2.7: vitest 4's
  Vite 8 dependency pulls in `rolldown`, which needs Node >= 20.12 and broke
  the whole test suite on Node 18 in CI. vitest 3.2.7 genuinely supports
  Node 18, matching this project's documented engines range.

## [0.1.0] - 2026-09-11

Initial release: `adversarial_critique` MCP tool with BYOC (bring-your-own-critic)
config, convergence detection (approve / issues found / stale / round cap),
and per-mode (`code` / `docs`) critique prompts.
