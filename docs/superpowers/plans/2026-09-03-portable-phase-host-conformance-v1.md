# portable phase-host conformance v1 implementation plan

## goal

Expose a small provider-neutral host adapter protocol that future host
integrations can implement without importing private Godagents modules or
gaining authority. Preserve both current provider host families and all
existing launch paths.

## bounded tasks

- [ ] add failing contract tests for exact descriptions, brand checks,
  descriptor pinning, capability and authority rejection, secret-shaped field
  rejection, and current-provider wrapping;
- [ ] add the canonical description schema and the branded adapter factory;
- [ ] expose only the new protocol builders and verifiers through the package
  root, and extend the SDK descriptor with the protocol id;
- [ ] add a deterministic fixture and append-only certification receipt;
- [ ] run focused, full, ledger, lineage, diff, and source-bound checks;
- [ ] obtain independent review before integrating into main.

## explicit non-goals

- no Codex, Claude Code, local-model, or MCP implementation;
- no provider-backed mission bridge or default-launch change;
- no new Godskills body, route, release pin, or capability authority;
- no live provider call or quality claim;
- no Realm, keel, continuity, evolution, Inspiration, Lunari, or Soul change.
