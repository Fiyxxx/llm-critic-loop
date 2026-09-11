# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

### Added

- CI workflow (lint, format check, build, test on Node 18/20/22).
- ESLint + Prettier tooling (`npm run lint`, `npm run format`).
- Test coverage reporting (`npm run test:coverage`).
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, issue/PR templates.

### Fixed

- Server-reported version now reads from `package.json` at startup instead of
  a separately hardcoded string, so the two can no longer drift.

## [0.1.0] - 2026-09-11

Initial release: `adversarial_critique` MCP tool with BYOC (bring-your-own-critic)
config, convergence detection (approve / issues found / stale / round cap),
and per-mode (`code` / `docs`) critique prompts.
