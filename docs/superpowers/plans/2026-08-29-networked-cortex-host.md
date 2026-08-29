# Networked Cortex and Local Host Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the provider-neutral Godagent vessel to one OpenAI-compatible network cortex and one policy-bound local CLI host without allowing credentials, provider envelopes, or user text to manufacture authority or enter durable continuity.

**Architecture:** Add a strict cortex result protocol, a credential-free durable inference lifecycle, an injected OpenAI-compatible transport adapter, and a local policy composition root. The vessel remains the sole continuity owner, the arbiter remains the sole intent committer, and the action gateway remains the sole Realm mutation path.

**Tech Stack:** Node.js 24 ESM, built-in `fetch`, `node:test`, strict local JSON schema validation, canonical JSON, SHA-256, JSONL continuity.

**Spec:** `docs/superpowers/specs/2026-08-29-networked-cortex-host-design.md`

## Global Constraints

- No automated test or certification command may contact an external network.
- Credentials are resolved through a closure from one environment variable and never enter genomes, distributions, journals, snapshots, receipts, output, errors, or command-line arguments.
- Endpoint, model, retry policy, and host policy remain runtime concerns and are excluded from deterministic foundry artifacts.
- Host authority and Godskills context come from validated local policy, never mission text or model output.
- The historical v0 receipt remains unchanged; networked-cortex proof receives a separate versioned receipt.
- The Soul port remains frozen and dormant.
- Provider inference may retry only under a bounded policy; Realm actions remain governed by the existing independent idempotency law.

---

### Task 1: Cortex result and inference-attempt contracts

**Files:**
- Create: `schemas/cortex-attempt.schema.json`
- Create: `src/cortex/result.mjs`
- Modify: `src/core/schema-validator.mjs`
- Test: `tests/cortex-result.test.mjs`

**Interfaces:**
- Produces: `acceptedProposal(proposal, metadata)` and `failedInference(reasonCode, metadata)`.
- Produces: `assertCortexResult(result)` and schema name `cortex-attempt`.
- The closed failure codes are `connect-failed`, `timeout`, `rate-limited`, `transient-server`, `authentication`, `authorization`, `invalid-request`, `forbidden-endpoint`, `forbidden-model`, `refusal`, `oversized-output`, `invalid-response`, `schema-rejected`, `semantic-rejected`, and `retry-exhausted`.

- [ ] **Step 1: Write failing contract tests**

```js
test('accepted result contains only proposal and sanitized metadata', () => {
  const result = acceptedProposal(proposal, {
    attemptId: 'attempt-1', adapterId: 'openai-compatible-v1', profile: 'chat-completions-json',
    modelId: 'test-model', requestDigest: 'a'.repeat(64), responseDigest: 'b'.repeat(64), usage: { inputTokens: 3, outputTokens: 5 },
  });
  assert.equal(assertCortexResult(result), result);
  assert.equal(JSON.stringify(result).includes('rawResponse'), false);
});

test('unknown failure reason is rejected', () => {
  assert.throws(() => failedInference('provider-said-something', metadata));
});
```

- [ ] **Step 2: Run `node --test tests/cortex-result.test.mjs` and verify missing-module failure**

- [ ] **Step 3: Implement frozen accepted/failed result constructors and the strict attempt schema**

```js
export function acceptedProposal(proposal, metadata) {
  return freezeAndValidate({ schemaVersion: 1, status: 'accepted', proposal, ...metadata });
}

export function failedInference(reasonCode, metadata) {
  return freezeAndValidate({ schemaVersion: 1, status: 'failed', reasonCode, ...metadata });
}
```

- [ ] **Step 4: Run the focused test and then `npm test`**

- [ ] **Step 5: Commit with `feat:add-cortex-result-contract`**

### Task 2: Receipt-safety projection

**Files:**
- Create: `src/cortex/receipt-safety.mjs`
- Test: `tests/receipt-safety.test.mjs`

**Interfaces:**
- Produces: `projectInferenceEvent(event)` returning a frozen allowlisted event payload.
- Produces: `assertNoCredentialFields(value)` rejecting field names matching `authorization`, `apiKey`, `api_key`, `token`, `secret`, `credential`, `password`, `headers`, `rawRequest`, `rawResponse`, or `environment`, case-insensitively.
- Consumes only sanitized Task 1 result metadata.

- [ ] **Step 1: Write failing recursive-denylist and allowlist tests**

```js
test('credential-shaped fields are rejected at any depth', () => {
  assert.throws(() => assertNoCredentialFields({ safe: { Authorization: 'Bearer canary' } }), /credential-shaped field/);
});

test('projection drops provider envelopes and preserves causal metadata', () => {
  const projected = projectInferenceEvent({
    eventType: 'cortex.accepted', attemptId: 'a1', adapterId: 'openai-compatible-v1',
    profile: 'chat-completions-json', modelId: 'm1', stateEpoch: 0,
    requestDigest: 'a'.repeat(64), responseDigest: 'b'.repeat(64), status: 'accepted',
  });
  assert.deepEqual(Object.keys(projected).sort(), EXPECTED_KEYS);
});
```

- [ ] **Step 2: Run the focused test and verify missing-module failure**

- [ ] **Step 3: Implement recursive key rejection and fixed event projections for `cortex.requested`, `cortex.accepted`, and `cortex.failed`**

- [ ] **Step 4: Run focused tests and `npm test`**

- [ ] **Step 5: Commit with `feat:guard-inference-receipts`**

### Task 3: OpenAI-compatible transport adapter

**Files:**
- Create: `src/cortex/openai-compatible.mjs`
- Create: `src/cortex/http-transport.mjs`
- Test: `tests/openai-compatible.test.mjs`

**Interfaces:**
- Produces: `createOpenAICompatibleCortex({ adapterId, profile, endpoint, modelId, timeoutMs, maxResponseBytes, transport, resolveCredential, clock })`.
- Produces: `createHttpsTransport({ fetchImpl })` which rejects non-HTTPS URLs.
- Adapter method: `infer(context, attempt)` returning a Task 1 cortex result.
- `transport(request)` receives URL, method, headers, body, timeout signal and returns `{ status, headers, bodyText }`; tests inject a fake transport.

- [ ] **Step 1: Write failing request construction, accepted response, and secret-closure tests**

```js
test('adapter constructs one bounded request and assigns trusted proposal identity', async () => {
  const cortex = createOpenAICompatibleCortex({ ...config, transport: fakeTransport(validBody), resolveCredential: () => CANARY });
  const result = await cortex.infer(context, { attemptId: 'attempt-1', ordinal: 1 });
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal.organId, 'openai-compatible-v1');
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});
```

- [ ] **Step 2: Add failing cases for multiple choices, tool calls, non-text content, invalid JSON, unknown fields, stale epoch, authority expansion, oversized body, `401`, `403`, `429`, and transient `5xx`**

- [ ] **Step 3: Run the focused test and verify missing-module failure**

- [ ] **Step 4: Implement strict request creation, byte-bounded body collection, response parsing, trusted field assignment, semantic checks, SHA-256 semantic digests, and closed error classification**

```js
const proposal = {
  ...parsedProposal,
  schemaVersion: 1,
  proposalId: `${attempt.attemptId}:proposal`,
  organId: adapterId,
  organVersion: '1',
  sourceStateEpoch: context.stateEpoch,
  evidenceRefs: [context.observation.observationId],
};
```

- [ ] **Step 5: Implement HTTPS-only built-in transport with timeout abort and no logging**

- [ ] **Step 6: Run focused tests and `npm test`**

- [ ] **Step 7: Commit with `feat:add-openai-compatible-cortex`**

### Task 4: Durable inference lifecycle and bounded retry

**Files:**
- Create: `src/cortex/inference-runner.mjs`
- Modify: `src/runtime/vessel.mjs`
- Modify: `src/runtime/scheduler.mjs`
- Test: `tests/inference-lifecycle.test.mjs`

**Interfaces:**
- Produces: `runInference({ cortex, context, policy, record, existingAttempts })`.
- `policy` contains `{ maxAttempts, retryableReasonCodes }` and is already validated by the host.
- Vessel records safe projections only and persists the accepted proposal before constitutional arbitration.
- Scheduler receives accepted proposals only; transport failures are not silently discarded diagnostics.

- [ ] **Step 1: Write a failing timeout-then-success test proving two durable attempt identities and one accepted proposal**

```js
assert.deepEqual(events.map((event) => event.eventType), [
  'cortex.requested', 'cortex.failed', 'cortex.requested', 'cortex.accepted',
]);
assert.notEqual(events[0].payload.attemptId, events[2].payload.attemptId);
```

- [ ] **Step 2: Write failing tests for retry exhaustion, non-retryable failure, and zero Realm invocations after cortex failure**

- [ ] **Step 3: Write crash-recovery tests for interruption after `cortex.requested` and after `cortex.accepted`; accepted recovery must not call transport again**

- [ ] **Step 4: Run focused tests and verify failures against the current direct `cortex.infer` path**

- [ ] **Step 5: Implement deterministic attempt IDs from instance, mission, epoch, and ordinal; record projected lifecycle events before/after each attempt**

- [ ] **Step 6: Extend vessel reduction and recovery so durable accepted proposals are reused and pre-acceptance interruptions obey the bounded host policy**

- [ ] **Step 7: Run focused tests, existing crash matrix, and `npm test`**

- [ ] **Step 8: Commit with `feat:govern-networked-inference-lifecycle`**

### Task 5: Validated local host policy and composition root

**Files:**
- Create: `schemas/host-policy.schema.json`
- Modify: `src/core/schema-validator.mjs`
- Create: `src/host/policy.mjs`
- Create: `src/host/local-cli.mjs`
- Create: `fixtures/host-policy.json`
- Test: `tests/host-policy.test.mjs`
- Test: `tests/local-cli.test.mjs`

**Interfaces:**
- Produces: `loadHostPolicy(path)` returning a deeply frozen policy plus canonical digest.
- Produces: `createCredentialResolver({ env, variableName })`; the returned closure exposes only `resolve()` and never serializes its value.
- Produces: `runLocalHost({ argv, env, stdout, stderr, fetchImpl, clock })` for injectable tests.
- CLI accepts policy path and mission text path only. It rejects key-like flags and unknown arguments.

- [ ] **Step 1: Write failing policy tests for allowed origin, models, timeout bounds, retry ceiling, authority, Realm ID, and Godskills context**

- [ ] **Step 2: Write failing CLI tests proving authority comes from policy and `--api-key`, `--token`, credential-bearing config, arbitrary endpoint, and HTTP downgrade are rejected**

- [ ] **Step 3: Run focused tests and verify missing-module/schema failures**

- [ ] **Step 4: Implement strict schema, canonical policy digest, HTTPS origin normalization, model allowlist, and deeply frozen policy loading**

- [ ] **Step 5: Implement the injectable CLI composition root and fixed output summaries**

```js
stdout.write(`${JSON.stringify({ status, instanceId, decisionId, actionId, discrepancyClass })}\n`);
stderr.write(`${JSON.stringify({ status: 'failed', reasonCode })}\n`);
```

- [ ] **Step 6: Run focused tests and `npm test`**

- [ ] **Step 7: Commit with `feat:add-policy-bound-local-host`**

### Task 6: Secret-containment and migration proof

**Files:**
- Create: `tests/networked-secret-containment.test.mjs`
- Modify: `tests/vessel-migration.test.mjs`
- Test: `tests/networked-secret-containment.test.mjs`
- Test: `tests/vessel-migration.test.mjs`

**Interfaces:**
- Consumes the Task 3 adapter, Task 4 lifecycle, and Task 5 host.
- Produces no new runtime API; establishes end-to-end invariants.

- [ ] **Step 1: Add a canary credential test that recursively scans distribution, journal, snapshot, receipts, captured stdout/stderr, and serialized errors**

```js
for (const surface of collectedSurfaces) {
  assert.equal(surface.includes(CANARY_SECRET), false, surfaceName);
}
```

- [ ] **Step 2: Add fixture-to-networked-to-fixture migration proving stable instance ID, constitution digest, artifact ID, continuity chain, and dormant Soul port**

- [ ] **Step 3: Add an untrusted provider-output test proving it cannot alter authority, Realm hand, host context, policy, or Soul state**

- [ ] **Step 4: Run focused tests and verify expected failures before any corrective changes**

- [ ] **Step 5: Make only the smallest corrections required by the end-to-end tests**

- [ ] **Step 6: Run focused tests and `npm test`**

- [ ] **Step 7: Commit with `test:prove-networked-cortex-containment`**

### Task 7: Versioned networked-cortex certification

**Files:**
- Create: `src/certification/certify-networked-cortex.mjs`
- Create: `tests/networked-certification.test.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `receipts/networked-cortex-certification.json` during certification

**Interfaces:**
- Produces command `npm run certify:networked-cortex`.
- Produces a canonical receipt tied to the source commit and explicit exclusions.
- The certifier injects a transport that throws on every real-network attempt.

- [ ] **Step 1: Write failing receipt-structure tests requiring test count, source commit, design digest, canary containment result, no-external-network result, and requirement IDs `NC-001` through `NC-010`**

- [ ] **Step 2: Write a failing test proving the historical v0 receipt bytes remain unchanged**

- [ ] **Step 3: Run focused tests and verify missing certifier/script failure**

- [ ] **Step 4: Implement clean-tree certification that runs the complete suite, injects a fail-closed network transport, scans outputs for a canary secret, and emits canonical JSON**

- [ ] **Step 5: Add `certify:networked-cortex` to `package.json` and document the new proof boundary without claiming live-provider compatibility**

- [ ] **Step 6: Run `npm test`, `npm run build:fixture`, `npm run demo`, and `npm run certify:networked-cortex`**

- [ ] **Step 7: Commit source and docs with `feat:certify-networked-cortex-boundary`, rerun certification from the clean source commit, then commit only the generated receipt with `cert:record-networked-cortex-proof`**

### Task 8: Independent review and final reconciliation

**Files:**
- Modify only files implicated by confirmed review defects.
- Update: `docs/superpowers/plans/2026-08-29-networked-cortex-host.md` checkboxes and final evidence section.

**Interfaces:**
- Consumes the clean candidate branch and versioned receipt.
- Produces a final clean branch, reviewer findings disposition, and exact verification evidence.

- [ ] **Step 1: Dispatch a read-only Terra review of contracts, secret surfaces, recovery, authority derivation, and certification truthfulness**

- [ ] **Step 2: Reproduce each material finding before changing code**

- [ ] **Step 3: For each confirmed defect, add a failing regression test, implement the smallest correction, and rerun the affected suite**

- [ ] **Step 4: Run the full final gate**

```powershell
npm test
npm run build:fixture
npm run demo
npm run certify:networked-cortex
git diff --check
git status --short --branch
```

- [ ] **Step 5: Record exact test totals, certification digest, source commit, receipt commit, and deferred boundaries in the plan evidence section**

- [ ] **Step 6: Commit final reconciliation with `docs:record-networked-cortex-evidence` if documentation changed**

## Final evidence

The independent Terra review reproduced two p1 defects in the first candidate: provider-controlled nested values could enter the journal, and an allowed Realm hand could carry an unbounded payload. It also identified completion-spend, policy-integrity, and process-local network-guard gaps. The hardened candidate now:

- rejects reflected credentials and credential-shaped provider data, normalizes free-form provider prose, and scans the end-to-end journal surface;
- validates strict per-hand inputs and expected transitions at both adapter admission and the action gateway;
- bounds prompt bytes, completion tokens per attempt, completion tokens per cycle, response bytes, timeouts, and attempt count;
- requires a separately supplied canonical policy digest before credential resolution;
- propagates the certification guard through spawned Node processes while excluding OS-level isolation and signed policy identity.

Fresh pre-certification verification on 2026-08-29 produced 92 passing tests, fixture build `116a4cf0e9abc8063a528fd25e142a9b2ee6b5e1418f4ad980795f8bd994be01`, networked fixture build `f54f0943e230d3249f20318f085e6f4917895f1974c2bff9e61158385eee2914`, a successful local demo with discrepancy class `none`, and a clean `git diff --check`. The versioned receipt generated from the final clean source commit is the authority for the exact source commit, test-output digest, and certification digest.
