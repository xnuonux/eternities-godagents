# Godagents project execution

Start with `docs/current-state.md` and the latest linked checkpoint. Historical
receipts are evidence at their recorded revision, not current completion claims.

## Model-backed testing default

Dom's 2026-09-12 instruction: use the native Grok 4.6 CLI subscription for
model-backed tests and delegated review in this project unless explicitly changed.
Use the pinned `createGrokCliPhaseProcess` transport and the existing
`C:/dev/perseus-v2/perseus-grok-cli.js` bridge. Verify current binary/bridge digests
in a fresh trial policy; do not silently rebind historical admissions or attempts.

These are stateless test workers, not the persistent Grok engineer. Keep the
disposable home and empty working directory, memory/subagents/web/MCP disabled,
empty tool allowlist, explicit system-prompt override and one-turn limit. Never
invoke keel wake, load Grok's personal letters, inherit a project identity, or
resume a Grok conversation for a test. The Godagent's explicitly supplied identity
and mission remain distinct from Grok's personal keel. This does not disable
Codex's own session continuity or modify global interactive Grok settings.

Keep calls bounded by the registered task budget and timeout. No automatic retry,
OpenRouter, paid API fallback, or quota-exhaustion loop. Use deterministic tests
for mechanics; use the subscription where a live model can answer a real quality
or integration question. A review worker receives bounded source/evidence and
returns findings; it does not run repository tools or decide acceptance.

For new workspace comparisons, use `scripts/evaluation/grok-baseline.mjs` to
retain screened usage before proposal acceptance. Do not reuse failed trial slots.
