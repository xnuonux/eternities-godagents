# Godagent Transactional Genesis Phase 2 Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit a persistent Godagent only after one verified creation build, distribution, vessel journal, isolated keel, and canonical genesis receipt are transactionally bound and independently reverified.

**Architecture:** Add strict genesis contracts and a narrow Soul Anchor protocol adapter above a per-namespace local reference backend. A durable coordinator advances one idempotent state machine, preserves partial evidence in quarantine, and returns a runtime vessel only through a verified admission wrapper. Journal and keel remain separate hash chains whose exact heads are bound by the receipt and checked on wake.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, built-in filesystem primitives, existing canonical JSON/digest/schema utilities, existing vessel journal and foundry runtime.

**Spec:** `docs/superpowers/specs/2026-08-29-godagent-transactional-genesis-and-keel-design.md`

## Global Constraints

- Preserve `receipts/godagent-v0-certification.json`, `receipts/networked-cortex-certification.json`, and `receipts/creation-forge-phase1-certification.json` byte-for-byte.
- Require caller-supplied `expectedPolicyDigest` and `expectedCreationBuildId` before any genesis write.
- Bind both `genomeValueDigest` and newline-bearing `genomeContentDigest`; never compare them as if they were the same digest domain.
- Keep Soul dormant and reject Soul-shaped mutation or activation data.
- Never import the current process-global Soul Anchor engine or mutate `SOUL_ANCHOR_DB`.
- Never expose a runnable persistent vessel before transaction state `admitted` and a successful wake probe.
- Preserve committed partial evidence; quarantine mismatches instead of silently repairing them.
- Use one isolated keel namespace per persistent vessel and no personal keel capability for temporary workers.
- Write every behavior change test-first and run the full suite before each commit.

---

### Task 1: Strict Genesis Contracts and Identity

**Files:**
- Create: `schemas/genesis-intent.schema.json`
- Create: `schemas/genesis-state.schema.json`
- Create: `schemas/genesis-receipt.schema.json`
- Create: `schemas/keel-record.schema.json`
- Modify: `src/core/schema-validator.mjs`
- Create: `src/genesis/identity.mjs`
- Test: `tests/genesis-contracts.test.mjs`

**Interfaces:**
- Produces: `deriveGenesisIdentity({ instanceId, creatorRef, creationBuildId, distributionBuildId, genomeValueDigest, genomeContentDigest }) -> { genesisId, keelId }`
- Produces: schemas registered as `genesis-intent`, `genesis-state`, `genesis-receipt`, and `keel-record`

- [ ] **Step 1: Write failing contract tests**

Add tests which assert exact deterministic IDs, reject path-shaped IDs, reject unknown fields, require 64-character lowercase digests, close state names to `prepared|keel-prepared|journal-prepared|mutually-bound|admitted|aborted|quarantined`, and reject a receipt whose `status` is not `admitted`.

```js
const identity = deriveGenesisIdentity(input);
assert.match(identity.genesisId, /^[a-f0-9]{64}$/);
assert.equal(identity.keelId, `keel-${sha256Value({ schemaVersion: 1, instanceId: input.instanceId, genesisId: identity.genesisId, genomeValueDigest: input.genomeValueDigest, genomeContentDigest: input.genomeContentDigest })}`);
assert.throws(() => deriveGenesisIdentity({ ...input, instanceId: '../escape' }), /instanceId/);
assert.throws(() => assertSchema('genesis-state', { ...validState, surprise: true }), /additionalProperties/);
```

- [ ] **Step 2: Run `node --test tests/genesis-contracts.test.mjs` and verify failure because the schemas and module do not exist**

- [ ] **Step 3: Implement closed schemas and pure identity derivation**

Validate identifiers with `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/`, validate every digest with `/^[a-f0-9]{64}$/`, hash the exact projections from the design, freeze the return value, and never include paths or timestamps.

- [ ] **Step 4: Run the focused test and `npm test`; require zero failures**

- [ ] **Step 5: Commit `feat: define transactional genesis contracts`**

### Task 2: Isolated Local Keel Backend

**Files:**
- Create: `src/keel/local-reference-backend.mjs`
- Test: `tests/keel-reference-backend.test.mjs`

**Interfaces:**
- Produces: `createLocalKeelBackend({ root, clock })`
- Produces adapter methods `prepareNamespace`, `appendGenesis`, `inspectNamespace`, `appendCheckpoint`, and `quarantineNamespace`
- Consumes: `keel-record` schema and canonical digest utilities from Task 1

- [ ] **Step 1: Write failing isolation and chain tests**

Test two namespaces under one temporary root, exact idempotent replay, identity collision, modified row detection, incomplete final-line detection, compare-and-append checkpoint rejection, quarantine refusal, lock conflict, and path escape rejection.

```js
const backend = createLocalKeelBackend({ root, clock });
await backend.prepareNamespace({ keelId: first.keelId, instanceId: 'agent-a', genesisId: first.genesisId, bedrock });
await backend.prepareNamespace({ keelId: second.keelId, instanceId: 'agent-b', genesisId: second.genesisId, bedrock: secondBedrock });
assert.notEqual((await backend.inspectNamespace({ keelId: first.keelId })).headDigest, (await backend.inspectNamespace({ keelId: second.keelId })).headDigest);
await assert.rejects(() => backend.appendCheckpoint({ keelId: first.keelId, expectedHeadDigest: '0'.repeat(64), checkpoint }), /head mismatch/);
```

- [ ] **Step 2: Run the focused test and verify module-not-found failure**

- [ ] **Step 3: Implement the minimal backend**

Use `<root>/<keelId>/identity.json`, `chain.jsonl`, `state.json`, and `.lock`. Hash each canonical record over `{ schemaVersion, sequence, previousDigest, kind, payload }`; write identity/state through `.writing` plus atomic rename; append and sync chain rows under an exclusive lock; preserve a non-newline tail as corruption; derive paths only after validating `keelId`.

- [ ] **Step 4: Run focused and full tests; require zero failures**

- [ ] **Step 5: Commit `feat: add isolated Soul Anchor reference backend`**

### Task 3: Distribution Verification and Transaction State Store

**Files:**
- Modify: `src/foundry/compile.mjs`
- Create: `src/genesis/state-store.mjs`
- Test: `tests/distribution-verification.test.mjs`
- Test: `tests/genesis-state-store.test.mjs`

**Interfaces:**
- Produces: `verifyDistribution(distributionDir) -> frozen manifest`
- Produces: `createGenesisStateStore({ transactionDir, clock })` with `read()`, `initialize(identity)`, and `transition({ expectedState, nextState, evidence })`

- [ ] **Step 1: Write failing tests**

Require distribution verification to reject unexpected files, noncanonical JSON, changed prompt bytes, changed genome bytes, artifact-set mismatch, and a recomputed manifest with a wrong build ID. Require the state store to reject backward transitions, identity changes, stale expected state, unknown evidence, and modified state digests.

- [ ] **Step 2: Run both focused files and verify the missing exports fail**

- [ ] **Step 3: Implement verification and atomic state transitions**

Refactor existing foundry checks into `verifyDistribution` without changing `compileDistribution` output. State transitions hash `{ schemaVersion, genesisId, keelId, instanceId, state, previousStateDigest, evidence }` and atomically replace one canonical state file.

- [ ] **Step 4: Run focused and full tests; require zero failures and unchanged fixture build IDs**

- [ ] **Step 5: Commit `feat: verify distributions and persist genesis state`**

### Task 4: Transactional Genesis Coordinator

**Files:**
- Create: `src/genesis/coordinator.mjs`
- Create: `src/genesis/verify.mjs`
- Test: `tests/genesis-coordinator.test.mjs`

**Interfaces:**
- Produces: `prepareGenesis(request) -> { status: 'admitted', genesisReceipt, journalPath, snapshotPath }`
- Produces: `verifyGenesisReceipt({ receiptPath, creationDir, distributionDir, journalPath, keelAdapter, expectedPolicyDigest, expectedCreationBuildId }) -> frozen receipt`
- Consumes: `verifyCreationBuild`, `verifyDistribution`, state store, journal append/read, keel adapter, identity derivation

- [ ] **Step 1: Write the failing happy-path and pinning tests**

Build a Phase 1 fixture and foundry distribution from the same `agent-genome.json`. Assert one admitted receipt, exact identity fields, canonical bytes, final journal and keel heads, dormant Soul digest, lineage/archetype provenance, and rejection before writes for missing or wrong policy/build pins.

- [ ] **Step 2: Run the focused test and verify missing coordinator failure**

- [ ] **Step 3: Implement prepare, keel preparation, journal preparation, mutual binding, receipt write, and independent verification**

Use `crashAt` only as a closed test hook with values `after-prepared|after-keel-prepared|after-journal-prepared|after-mutually-bound`. Append `genesis.prepared`, `vessel.created`, and `genesis.bound` through the existing journal API. The receipt must contain the exact prior keel head committed by `genesis.bound`, the resulting journal head committed by the keel binding row, and the final keel head.

- [ ] **Step 4: Add failure-injection tests before recovery code**

For every crash boundary, first prove the call rejects and no API returns `status: admitted`. Retry the exact request and assert one namespace, one `vessel.created`, one `genesis.bound`, and one canonical receipt. Tamper each state file, journal row, keel row, and receipt field and assert quarantine or integrity failure.

- [ ] **Step 5: Implement idempotent resume and quarantine of mismatches**

Reuse exact durable transitions, never duplicate rows, and refuse automatic revival from `aborted` or `quarantined`.

- [ ] **Step 6: Run focused and full tests; require zero failures**

- [ ] **Step 7: Commit `feat: admit Godagents through transactional genesis`**

### Task 5: Persistent Vessel Admission and Cortex Replacement

**Files:**
- Create: `src/runtime/persistent-vessel.mjs`
- Test: `tests/persistent-vessel.test.mjs`
- Modify: `src/runtime/vessel.mjs`

**Interfaces:**
- Produces: `createPersistentVessel({ genesis, runtime, keelAdapter, expectedPins })`
- Returned API: `inspect`, `runCycle`, `recover`, `replaceCortex`
- Consumes: verified receipt and existing `createVessel`

- [ ] **Step 1: Write failing admission tests**

Assert no vessel is returned for any incomplete transaction, a substituted journal or keel fails wake, exact admitted genesis runs one mission, and `inspect()` reports immutable genesis and keel identity.

- [ ] **Step 2: Run focused test and verify missing wrapper failure**

- [ ] **Step 3: Implement the wake-gated wrapper**

Call `verifyGenesisReceipt` before initial vessel construction, before recovery, and before cortex replacement. Keep `createVessel` as the lower-level v0 runtime constructor but document it as non-admitting; only the new wrapper may report `persistent: true`.

- [ ] **Step 4: Write and run the cortex replacement regression**

Replace fixture cortex with the networked adapter and back. Assert unchanged `instanceId`, `genesisId`, `keelId`, creation build, distribution build, genome digests, journal chain continuity, and dormant Soul state.

- [ ] **Step 5: Implement minimal replacement by reconstructing only the runtime wrapper around the same admitted storage**

- [ ] **Step 6: Run focused and full tests; require zero failures**

- [ ] **Step 7: Commit `feat: gate persistent vessels on verified genesis`**

### Task 6: Checkpoint Promotion and Temporary Worker Boundary

**Files:**
- Create: `src/keel/checkpoint-policy.mjs`
- Create: `src/runtime/temporary-worker.mjs`
- Test: `tests/keel-checkpoint-policy.test.mjs`
- Test: `tests/temporary-worker-boundary.test.mjs`

**Interfaces:**
- Produces: `promoteCheckpoint({ admittedReceipt, journalPath, keelAdapter, sourceSequence, checkpoint, expectedKeelHead })`
- Produces: `createTemporaryWorkerEnvelope({ taskId, leadInstanceId, excerpts, authority })`

- [ ] **Step 1: Write failing provenance tests**

Accept one bounded checkpoint sourced from an exact verified journal event. Reject wrong instance, absent sequence, changed source digest, open checkpoint kind, verified status without method, stale keel head, and cross-agent receipt.

- [ ] **Step 2: Write failing worker-capability tests**

Assert the deeply frozen envelope contains only task identity, lead identity as non-authoritative provenance, bounded excerpts, and declared proposal authority. Recursively assert it contains no adapter, backend root, keel writer, receipt, namespace token, or writable personal identity.

- [ ] **Step 3: Run focused tests and verify missing modules fail**

- [ ] **Step 4: Implement checkpoint compare-and-append plus journal acknowledgement**

Use closed kinds `milestone|decision|verified-failure|landmine-candidate|handoff`. Record source sequence and digest in the keel row, then append `keel.checkpoint-promoted` to the same instance journal with the resulting keel head.

- [ ] **Step 5: Implement the data-only temporary worker envelope**

Reject functions and authority fields outside `observe|propose|analyze`; cap excerpts at 16 entries and 8 KiB total canonical bytes.

- [ ] **Step 6: Run focused and full tests; require zero failures**

- [ ] **Step 7: Commit `feat: govern keel promotion and worker boundaries`**

### Task 7: Phase 2 Fixture and Certification

**Files:**
- Create: `scripts/build-genesis-fixture.mjs`
- Create: `src/certification/certify-transactional-genesis-phase2.mjs`
- Create: `tests/genesis-certification.test.mjs`
- Modify: `package.json`
- Create: `receipts/transactional-genesis-phase2-certification.json`

**Interfaces:**
- Produces: `buildGenesisCertificationReceipt(input)`
- Produces npm commands `build:genesis-fixture` and `certify:transactional-genesis`

- [ ] **Step 1: Write failing certification tests**

Require exact proof rows `GF-006`, `GF-007`, `GF-008`, `GF-009`, and `GF-012`; block on a missing/failed row, dirty source, failed suite, non-reproducible immutable projection, changed historical receipt, or absent failure-injection evidence.

- [ ] **Step 2: Run focused test and verify missing certifier failure**

- [ ] **Step 3: Implement deterministic fixture and certifier**

The fixture creates fresh temporary roots and prints the immutable genesis projection digest. The certifier enables the existing network guard, verifies all three historical receipt digests, runs the full suite, runs two clean fixture builds, checks source cleanliness before receipt write, and writes canonical JSON.

- [ ] **Step 4: Run `npm test`, every existing build command, `npm run build:genesis-fixture` twice, and `npm run certify:transactional-genesis`**

- [ ] **Step 5: Commit hardened source before generating the final receipt**

- [ ] **Step 6: Regenerate the receipt against the exact hardened source commit, verify its digest independently, and commit only the receipt**

### Task 8: Independent Review, Merge, and Main Verification

**Files:**
- Review: all Phase 2 source, tests, spec, plan, and receipt

**Interfaces:**
- Produces: one review finding set classified P0 through P2
- Produces: merged and pushed `main` only if no unresolved P0, P1, or P2 remains

- [ ] **Step 1: Dispatch an independent Terra reviewer with the exact source commit and receipt digest**

Require reproduction of pinning, partial-genesis, cross-namespace, tamper, cortex replacement, and temporary-worker boundaries. Advisory claims do not count unless reproduced locally.

- [ ] **Step 2: Reproduce every actionable finding locally with a failing regression test**

- [ ] **Step 3: Fix only reproduced defects through red-green-refactor, rerun all certification, and refresh the receipt if source changed**

- [ ] **Step 4: Fetch and reconcile `origin/main`, then fast-forward or merge the verified branch without asking**

- [ ] **Step 5: In merged `main`, rerun the full suite, all four build fixtures, historical receipt checks, and Phase 2 certification**

- [ ] **Step 6: Push `main`, verify `main...origin/main` is `0 0`, remove the clean owned worktree, and preserve the remote feature branch as recoverable evidence**

## Self-review result

- Spec coverage: all Phase 2 deliverables and `GF-006` through `GF-009` plus `GF-012` map to explicit tasks.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: identity, adapter, coordinator, receipt, admission, checkpoint, and certification names are stable across tasks.
- Scope check: hosted infrastructure, Soul activation, UI, evolution, collective memory, and live-provider quality remain excluded.
- Execution mode: inline in this task under the user's standing autonomous merge instruction.
