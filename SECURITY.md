# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately via [GitHub Security Advisories](https://github.com/Fiyxxx/llm-critic-loop/security/advisories/new) rather than opening a public issue.

Include what you found, how to reproduce it, and its potential impact. We'll acknowledge reports as soon as possible.

## Known, inherent risk: prompt injection via critique output

This server relays an LLM's `summary` and issue `description` fields verbatim into the calling agent's context. Because the artifact under review may itself be untrusted or attacker-influenced text, a crafted artifact could in principle steer the critic's output to influence the calling agent's subsequent reasoning.

This is inherent to any LLM-review tool and is not a bug fixable in this codebase — see the [README security note](README.md#security-note). Treat all critique output as untrusted model output, the same as the artifact itself. This is documented here for transparency, not because it needs a private report.

## Supported versions

This project is pre-1.0. Only the latest published version on npm receives fixes.
