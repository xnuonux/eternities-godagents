# Grok Subscription Phase Transport Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. Steps use checkbox syntax.

**Goal:** Connect the existing portable Godagent runtime to pinned subscription Grok without fake HTTP or ambiguous accounting.

**Architecture:** A bounded policy and provider-specific prompt/result codec wrap the existing durable subprocess suite. The owned bridge supplies a fresh, restricted native process. The existing portable host exposes the three phases.

**Tech Stack:** Node ESM, built-in test runner, existing Perseus CJS bridge, vendor Grok CLI.

**Spec:** `docs/superpowers/specs/2026-09-08-grok-subscription-phase-transport.md`

## Global constraints

- No OpenRouter, direct paid xAI fallback, hidden retry, or model replacement.
- No identity/authority change, Soul activation, or Lunari integration.
- Preserve the user-owned untracked `package-lock.json` and historical receipts.
- The new branch starts at `7696018`; closed prior gates are not rerun until integration.

## 1. Honest phase codec

Create `src/transports/grok-cli-phase-protocol.mjs` and
`tests/grok-cli-phase-protocol.test.mjs`. Export
`compileGrokCliPhaseRequest({phase,dispatch,descriptor,policy})`,
`inspectGrokCliPhaseResponse({phase,dispatch,descriptor,policy,response,startedAt,completedAt})`,
and `verifyGrokCliProviderEvidence(value)`.

- [x] Write red tests using real neutral dispatches for native/review/revision.
  Assert emitted prompt binding, local output rejection, exact ledger arithmetic,
  missing/contradictory counters, requested model, one reported round, budgets,
  optional cost absence, and labeled residual cache-write derivation.
- [x] Run `node --test tests/grok-cli-phase-protocol.test.mjs`; retain red outcome.
- [x] Implement bounded compilation and strict native terminal parsing, reusing
  `buildProviderNeutralPhaseCompletion`. Example expected normalized ledger:
  `{inputTokens:120, cachedInputTokens:15, reasoningTokens:3,
  visibleOutputTokens:7, completionTokens:10}` from raw input100/read15/write5/output10.
- [x] Rerun the targeted tests and inspect mutations. Commit the coupled adapter batch before the full gate.

## 2. Pinned native process and policy

Create `src/transports/grok-cli-phase-policy.mjs`,
`src/transports/grok-cli-phase-process.mjs`, and matching targeted tests.
The policy loader returns `{policy,digest}` from canonical newline JSON with
external `GODAGENT_GROK_PHASE_POLICY_SHA256`. The process factory returns the
durable engine's `{credentialResolver,process}` interface.

- [x] Write and observe red tests for missing/mismatched pins, oversized policy,
  non-OAuth/stale credentials, secret reflection, credential rotation,
  controlled arguments/environment, nonzero/timeout outcomes, owned cleanup.
- [x] Implement only the tested boundary. Compile prompt JSON locally and run
  the pinned bridge with explicit model, one turn, no tools/subagents/web/plan,
  no auto-update, no JSON-schema correction mode. Capture raw output.
- [x] Run targeted policy/process tests and request independent review.

## 3. Durable portable integration

Create `src/transports/grok-cli-phase-transport.mjs` and
`tests/grok-cli-phase-transport.test.mjs`. Reuse the existing three descriptor
builders and `createDurablePhaseOperationSuite` with `process`, not `network`.

- [x] Write and observe red real-child tests for all phases, authenticated
  artifacts, byte-bound evidence, terminal replay without auth/provider access,
  and unresolved interruption without a second process.
- [x] Implement the suite and existing portable host wrapper. Reuse signed
  provider-phase resolution policy loading; do not add a new recovery system.
- [x] Verify targeted tests, resolve independent review, reconcile upstream,
  run final merged gates and publish only verified work. Record exact proof and
  explicitly leave live performance qualification outstanding.

Integrated runtime `5d3d0ba`: 1,300 full tests, 37 post-fast-forward checks,
3 published current-head checks passed. The audit preserves the initial
unexplained stopped gate as well as the successful unchanged reruns. No live
model qualification or quality claim is completed by this implementation plan.
