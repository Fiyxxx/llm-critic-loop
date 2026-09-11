# Contributing

## Setup

```bash
npm install
npm run build
npm test
```

## Workflow

1. Fork and branch from `main`.
2. Make your change. This project follows [test-driven development](https://github.com/anthropics/skills) informally: add or update a test alongside any behavior change.
3. Before opening a PR, run everything CI runs:

   ```bash
   npm run lint
   npm run format:check
   npm run build
   npm test
   ```

   `npm run format` will auto-fix formatting issues.

4. Open a PR against `main` describing what changed and why. Fill in the PR template's testing section.

## Code style

- TypeScript, strict mode, ESM (`NodeNext` module resolution).
- No comments explaining _what_ code does — only _why_, when the reason isn't obvious from reading it (see existing code for examples).
- Keep modules small and single-purpose; the existing `src/core`, `src/client`, `src/server`, `src/prompts` split reflects that.

## Reporting bugs / requesting features

Use the issue templates. For security issues, see [SECURITY.md](SECURITY.md) instead of opening a public issue.
