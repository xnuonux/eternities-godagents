# Admitted Sealed Typed Execution Host v1 Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the certified sealed local typed execution runner behind one sibling identity-bound, externally policy-pinned, programmatic host without changing any existing launch path.

**Architecture:** A new canonical policy binds the admitted identity, all runner trust roots, executor descriptors, and resource ceilings. A closed launcher verifies genesis and policy, derives Godskills input from the existing identity candidate, snapshots descriptor-matched executors, and invokes the certified runner beneath an admission-owned runtime root.

**Tech Stack:** Node.js ESM, canonical JSON, existing local JSON-schema validator, SHA-256 receipts, filesystem-backed recovery, Node test runner, Git source manifests.

**Spec:** `docs/superpowers/specs/2026-08-31-admitted-sealed-typed-execution-host-v1-design.md`

## Global Constraints

- Preserve all existing admitted host, vessel, policy, CLI, provider, Realm, and receipt bytes.
- Add no default launch path, provider credential path, Realm action, continuity write, or Soul activation.
- Reject caller route transport, activation transport, activation result, typed method, registry, execution handle, runner factory, and direct Godskills binding input.
- Treat descriptor-bound executor implementations as trusted and keep external exactly-once explicitly unproved.
- Build behavior test-first and certify only one exact reviewed source commit.

---

### Task 1: Close the typed host policy and executor contracts

**Files:**

- Create: `schemas/admitted-typed-execution-host-policy.schema.json`
- Create: `schemas/typed-capability-executor-descriptor.schema.json`
- Create: `schemas/admitted-typed-execution-host-completion.schema.json`
- Modify: `src/core/schema-validator.mjs`
- Create: `src/host/admitted-typed-execution-contracts.mjs`
- Create: `src/host/admitted-typed-execution-policy.mjs`
- Test: `tests/admitted-typed-execution-policy.test.mjs`

**Interfaces:**

- Consumes: existing `assertSchema`, canonical JSON, digest helpers, release-pin schemas, typed-composition and stepper verifiers.
- Produces: `loadAdmittedTypedExecutionPolicy(path)`, `verifyTypedCapabilityExecutorDescriptor(value)`, `verifyAdmittedTypedExecutionHostRequest(value)`, and `buildAdmittedTypedExecutionHostCompletion(input)`.

- [ ] **Step 1: Write failing policy and descriptor tests**

```js
test('loads one canonical externally pinnable typed host policy', async () => {
  const loaded = await loadAdmittedTypedExecutionPolicy(policyPath);
  assert.equal(loaded.policy.runtime.protocolId, 'eternities-admitted-sealed-typed-execution-host-v1');
  assert.match(loaded.digest, /^[a-f0-9]{64}$/);
});

test('executor descriptors are authority-empty and filename sorted by capability', () => {
  assert.deepEqual(verifyTypedCapabilityExecutorDescriptor(descriptor).authority, []);
});
```

- [ ] **Step 2: Verify the tests fail because the new policy modules and schemas do not exist**

Run: `node --test tests/admitted-typed-execution-policy.test.mjs`

Expected: failure naming the missing policy or contract module.

- [ ] **Step 3: Implement closed schemas and semantic verification**

Require exact runtime fields for genesis path bindings, four release pins, classifier descriptor, executor descriptor list, and limits. Require sorted unique authority arrays, exact executor capability ids, empty descriptor authority, coherent byte ceilings, and no credential, endpoint, model, command, or path-bearing executor fields.

- [ ] **Step 4: Run the policy tests green**

Run: `node --test tests/admitted-typed-execution-policy.test.mjs`

Expected: all policy, canonical-byte, malformed-field, authority, ordering, ceiling, and post-build mutation tests pass.

- [ ] **Step 5: Commit the closed contract layer**

```text
git add schemas src/core/schema-validator.mjs src/host/admitted-typed-execution-contracts.mjs src/host/admitted-typed-execution-policy.mjs tests/admitted-typed-execution-policy.test.mjs
git commit -m "feat: close admitted typed execution policy"
```

### Task 2: Add the identity-bound programmatic launcher

**Files:**

- Create: `src/host/admitted-sealed-typed-execution-launch.mjs`
- Test: `tests/admitted-sealed-typed-execution-launch.test.mjs`
- Create: `tests/helpers/admitted-sealed-typed-execution-host-fixture.mjs`

**Interfaces:**

- Consumes: Task 1 policy/contracts, existing genesis admission verification, cortex candidate compiler, residency registry, routing verifier/classifier, typed release pins, and `createSealedLocalTypedExecutionRunner(options)`.
- Produces: `launchAdmittedSealedTypedExecutionMission({ admissionRoot, policyPath, request, env, executors })`.
- Host-owned only: canonical residency registry, verifier I/O, lock policy, clocks, checkpoints, and artifact caches.

- [ ] **Step 1: Write the successful end-to-end failing test**

```js
test('one pinned admitted identity completes the typed Muse-to-Forge graph', async (t) => {
  const observed = [];
  const result = await launchAdmittedSealedTypedExecutionMission(
    await hostArguments(t, { observed }),
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(observed.map(({ capabilityId }) => capabilityId), [
    'eternities-muse', 'eternities-forge',
  ]);
  assert.equal(result.receipt.authorityExpanded, false);
});
```

- [ ] **Step 2: Verify red from the missing launcher**

Run: `node --test tests/admitted-sealed-typed-execution-launch.test.mjs`

Expected: failure naming the missing launch module.

- [ ] **Step 3: Implement admission, policy, candidate, and dependency verification**

Verify the admission tree, binding, external policy digest, exact policy path bindings, genesis, Realm, residency, mission request ceilings, four releases, derived classifier, executor descriptors, and exact topology executor set before constructing the runner.

- [ ] **Step 4: Implement derived input and closed completion**

Derive `bindingInput` only from the verified mission request and cortex candidate. Pass snapshotted executor functions and return a canonical receipt binding policy, admission, candidate, compilation, execution, and `authorityExpanded: false` digests.

- [ ] **Step 5: Run the first launcher test green**

Run: `node --test tests/admitted-sealed-typed-execution-launch.test.mjs`

Expected: the two-node graph completes through real local routing and activation.

- [ ] **Step 6: Commit the first admitted host path**

```text
git add src/host/admitted-sealed-typed-execution-launch.mjs tests/admitted-sealed-typed-execution-launch.test.mjs tests/helpers/admitted-sealed-typed-execution-host-fixture.mjs
git commit -m "feat: admit sealed typed execution missions"
```

### Task 3: Prove fail-closed recovery and dependency ownership

**Files:**

- Modify: `tests/admitted-sealed-typed-execution-launch.test.mjs`
- Modify: `tests/helpers/admitted-sealed-typed-execution-host-fixture.mjs`
- Modify if a test exposes a defect: `src/host/admitted-sealed-typed-execution-launch.mjs`
- Modify if a test exposes a contract defect: `src/host/admitted-typed-execution-contracts.mjs`

**Interfaces:**

- Consumes: Task 2 launcher and admission-owned execution-binding namespace.
- Produces: exact recovery, replay, and negative-boundary evidence used by certification.

- [ ] **Step 1: Add a failing persisted-node recovery test**

Let Muse publish durably, then fail the trusted Forge executor. Snapshot the local process terminal state, reconstruct the launcher without privileged hooks, assert that recovery invokes only Forge, and prove the process terminal state remains byte-identical.

- [ ] **Step 2: Verify the recovery test fails for the intended missing behavior or exposed defect**

Run: `node --test --test-name-pattern="persisted node" tests/admitted-sealed-typed-execution-launch.test.mjs`

- [ ] **Step 3: Make the smallest launcher correction required for recovery**

Keep the runtime root fixed at `vessel/sealed-typed-execution-v1/<execution-binding-digest>`; do not add a second host journal or copy typed methods into host state. Bind that namespace to policy, admission, and exact executor descriptors.

- [ ] **Step 4: Add terminal replay and negative-boundary tests one at a time**

Cover changed external policy digest, policy/admission path, instance, Realm, request authority, budget, topology, executor descriptor, executor set, release pin, and forbidden injection options. Each must fail before the affected child or executor runs.

- [ ] **Step 5: Run launcher, runner, and legacy host regressions**

Run: `node --test tests/admitted-typed-execution-policy.test.mjs tests/admitted-sealed-typed-execution-launch.test.mjs tests/sealed-local-typed-execution-runner.test.mjs tests/admitted-sealed-identity-host-certification.test.mjs`

Expected: all pass with zero skips.

- [ ] **Step 6: Commit recovery and rejection evidence**

```text
git add src/host tests/admitted-sealed-typed-execution-launch.test.mjs tests/helpers/admitted-sealed-typed-execution-host-fixture.mjs
git commit -m "test: prove admitted typed execution recovery"
```

### Task 4: Freeze deterministic certification and independent review

**Files:**

- Create: `fixtures/admitted-sealed-typed-execution-host-v1.json`
- Create: `scripts/build-admitted-sealed-typed-execution-host-v1-receipt.mjs`
- Create: `tests/admitted-sealed-typed-execution-host-certification.test.mjs`
- Create after review: `docs/admitted-sealed-typed-execution-host-v1-terra-review.json`
- Create after source commit: `receipts/admitted-sealed-typed-execution-host-v1.json`
- Create after source commit: `docs/admitted-sealed-typed-execution-host-v1-certification.md`
- Modify: `src/certification/verify-ledger.mjs`
- Modify: `tests/certification-ledger.test.mjs`
- Modify: `tests/release-lineage.test.mjs`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes: deterministic fixture helper, all 33 historical receipt file hashes, runner receipt `7558bed70b3199936f39244d44c0402807818c286b5eaf8c68688d96821ea831`, exact source diff, and independent Terra review.
- Produces: the 34th canonical Godagents receipt and exact release-lineage proof.

- [ ] **Step 1: Build the deterministic host fixture twice**

Assert byte identity across independent roots, one crash after persisted Muse output, Forge-only recovery, zero-work terminal replay, policy/admission/candidate bindings, no serialized method, and no authority expansion.

- [ ] **Step 2: Add ledger and lineage expectations for 34 receipts and verify red**

Run: `node --test tests/certification-ledger.test.mjs tests/release-lineage.test.mjs`

Expected: exact failures reporting 33 instead of 34 or the missing receipt set.

- [ ] **Step 3: Implement the exact-source receipt builder**

Bind all 33 historical receipt file hashes, implementation and test manifests, specification, plan, fixture, exact runner receipt and all transitive Godskills roots, independent review record, focused/full test counts, claims, metrics, and proof limits.

- [ ] **Step 4: Stage source and obtain one exact-diff Terra review**

Compute the binary diff SHA-256 against the feature parent while excluding only the review record. Require zero unresolved critical and important defects before freezing the canonical review JSON.

- [ ] **Step 5: Commit source and build certification**

Run: `node scripts/build-admitted-sealed-typed-execution-host-v1-receipt.mjs`

Expected: deterministic fixture, focused tests, full suite, receipt reproduction, 34-receipt ledger, and lineage all pass.

- [ ] **Step 6: Rebuild the receipt twice from the exact source commit**

Assert identical logical receipt digest and identical canonical receipt file SHA-256.

- [ ] **Step 7: Commit certification artifacts**

```text
git add receipts/admitted-sealed-typed-execution-host-v1.json docs/admitted-sealed-typed-execution-host-v1-certification.md
git commit -m "certify: admit sealed typed execution host v1"
```

### Task 5: Integrate only the fully verified release

**Files:**

- No new source files.
- Preserve every unrelated worktree and branch.

**Interfaces:**

- Consumes: clean certified feature branch, current fetched `origin/main`, full release gate.
- Produces: canonical pushed main containing the 34th receipt.

- [ ] **Step 1: Fetch and reconcile upstream**

Run: `git fetch origin` and compare feature base, local main, and `origin/main`.

- [ ] **Step 2: Fast-forward canonical main only if ancestry is exact**

Run the repository's full release gate from canonical main after integration.

- [ ] **Step 3: Push and verify remote equality**

Require local main equals `origin/main`, the worktree is clean, and ledger plus lineage pass after push.

- [ ] **Step 4: Remove only the verified clean feature worktree and branch**

Resolve the exact worktree path, require empty porcelain status, remove that path, and delete only `feat/admitted-sealed-typed-execution-host-v1`.

- [ ] **Step 5: Seal the major checkpoint and select the next adoption boundary**

Record source commit, release commit, receipt digest, file SHA-256, fixture digest, test counts, review disposition, remaining proof limits, and the next highest-leverage open gap.
