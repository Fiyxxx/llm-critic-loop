# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

### Added

- `npx llm-critic-loop init`: interactive setup wizard (provider, model,
  API key, scope) that runs `claude mcp add` for you, or prints the
  equivalent command if the `claude` CLI isn't on `PATH`.
- CI workflow (lint, format check, build, test on Node 18/20/22).
- ESLint + Prettier tooling (`npm run lint`, `npm run format`).
- Test coverage reporting (`npm run test:coverage`).
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, issue/PR templates.

### Changed

- MCP tool renamed from `adversarial_critique` to `critic`.

### Fixed

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
