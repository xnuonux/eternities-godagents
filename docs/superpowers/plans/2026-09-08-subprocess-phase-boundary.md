# Subprocess phase boundary implementation plan

> **For agentic workers:** Use `executing-plans` inline. Steps use checkbox syntax.

**Goal:** Reuse durable governed phase operations for real subprocess outcomes.

**Architecture:** Add one closed subprocess invocation mode to the existing
durable engine, and a versioned process response witness. Preserve HTTP behavior,
receipt history and the existing portable host architecture.

**Tech Stack:** Node.js ESM, node:test, existing Ed25519 resolution fixtures.

**Spec:** `docs/superpowers/specs/2026-09-08-subprocess-phase-boundary-design.md`

## Global constraints

- No new dependencies, credentials, inference calls or paid fallback.
- Preserve historical HTTP records and user-owned `package-lock.json`.
- No new host type, fake HTTP status, dummy credential, or speculative registry.
- Process outcome contract is `subprocess-json-v1`, pinned in provider policy.
- Source/code tests do not establish live model quality or accounting semantics.

## Task 1: Versioned response witness and durable process invocation

**Files:**
- Modify `src/transports/provider-phase-resolution.mjs` for process witness union.
- Modify `src/transports/durable-phase-operation.mjs` for closed process mode.
- Add `tests/durable-process-phase.test.mjs` using real local child processes,
  actual admitted native dispatches and existing resolution authority fixtures.

**Interfaces:** Retain existing functions and HTTP signatures. Add optional
`process: { invoke, assertCredentialAbsent }` to the durable factory, exclusive
with `network` and `networkRequest`. Use the process result specified in the
design. `buildProviderPhaseResponseWitness`/`verifyProviderPhaseResponseWitness`
accept the versioned union; callers need no separate resolution authority.

- [x] Write tests first: child returns `{"content":"local process artifact"}`;
  assert verified completion content, then call execute/reconcile again and
  assert only one invocation. Throw after invocation and assert next execute
  rejects `operation-pending` without another invocation.
- [x] Add signed process adoption using existing fixture private key, bind the
  response witness, reject altered response bytes, then adopt exact response
  and verify replay. Preserve the same authority checks as HTTP.
- [x] Add closed-mode and canary tests: refuse mixed HTTP/process configuration,
  unpinned process mode, secret-bearing input/output, and fabricated HTTP result.
- [x] Run `node --test tests/durable-process-phase.test.mjs` and retain the red
  result before changing production code.
- [x] Implement the closed union and capability-screening branch, preserving
  prepared/attempt publication and existing failure/reconciliation ordering.
- [x] Run new tests and existing `tests/anthropic-messages-phase-transport.test.mjs`
  and provider resolution tests selected from their actual filenames.
- [ ] Independent review focused on uncertainty, adoption, mode binding and
  credential serialization. Resolve confirmed defects with regression tests.

## Task 2: Integration gate

- [ ] Reconcile upstream and inspect exact diff. Run the full suite only at the
  final integration gate, preserve failures and new evidence, and inspect
  current-head source/certificate effects before merging or claiming completion.
- [ ] Merge/push only verified work under standing approval. Report this boundary
  separately from the still-unimplemented Grok transport and live comparison.

## Next milestone, not part of this boundary's completion claim

Build the actual three-phase Grok transport with pinned CLI/bridge/configuration,
strict phase parsing, authenticated credential handling, bounded child cleanup,
proven usage mapping and source-bound live admission. Then qualify a fresh fair
same-provider native-versus-Godagent task comparison. A successful subprocess
fixture cannot replace those deliverables.
