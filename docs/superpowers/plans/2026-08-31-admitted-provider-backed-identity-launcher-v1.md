# Admitted Provider-Backed Identity Launcher v1 Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and certify one immutable production launcher that carries a certified provider host through provider-backed mission dependencies into the admitted identity host without caller-supplied dependency handles.

**Architecture:** A new factory constructs the already certified dependency bundle once, binds its complete description, and closes over the genuine handles. Its launch method converts one explicit identity-policy digest into the existing policy-pin projection and delegates to the unchanged admitted host. Policy authorship, provider selection, credentials, signing, Realm, continuity, and Soul remain outside the boundary.

**Tech Stack:** Node.js ESM, `node:test`, canonical JSON and SHA-256 receipts, Git source reconstruction, existing Godagents and Godskills certification machinery.

**Spec:** `docs/superpowers/specs/2026-08-31-admitted-provider-backed-identity-launcher-v1-design.md`

## Global Constraints

- preserve every existing public launcher and historical receipt byte-for-byte
- perform no provider call during launcher construction
- accept no ambient process environment, provider selection, credential, direct transport, direct executor, classifier, Realm, continuity, identity mutation, evolution, Inspiration, Lunari, or Soul input
- use the existing admitted host for policy, admission, residency, request, dependency, recovery, and replay enforcement
- certify both provider families with exact replay and credential-canary evidence

---

### Task 1: Closed launcher contract

**Files:**
- Create: `tests/admitted-provider-backed-identity-launcher.test.mjs`
- Create: `src/host/admitted-provider-backed-identity-launcher.mjs`

**Interfaces:**
- Consumes: `createProviderBackedMissionDependencies(configuration)` and `launchAdmittedSealedIdentityMission(request)`
- Produces: `verifyAdmittedProviderBackedIdentityLauncherDescription(value)` and `createAdmittedProviderBackedIdentityLauncher(configuration)` returning exactly `{ describe, launch }`

- [ ] **Step 1: Write the failing construction and verification tests**

Test one SDK-issued provider host and exact Godskills release. Assert the module exports both functions, construction makes zero provider calls, `describe()` is deeply frozen, its dependency value equals `bundle.describe()`, and changing the dependency description or binding digest is rejected.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/admitted-provider-backed-identity-launcher.test.mjs`

Expected: fail because `src/host/admitted-provider-backed-identity-launcher.mjs` does not exist.

- [ ] **Step 3: Implement the minimal construction contract**

Use exact configuration keys, call `createProviderBackedMissionDependencies` once, bind its complete description under protocol `eternities-admitted-provider-backed-identity-launcher-v1`, include the closed authority declaration, compute `bindingDigest` with `sha256Value`, and return fresh frozen descriptions.

- [ ] **Step 4: Run the focused test and verify green**

Run: `node --test tests/admitted-provider-backed-identity-launcher.test.mjs`

Expected: all construction and verification tests pass with zero provider calls.

- [ ] **Step 5: Commit the closed construction contract**

```text
feat: add admitted provider-backed identity launcher
```

### Task 2: Exact launch delegation and hostile inputs

**Files:**
- Modify: `tests/admitted-provider-backed-identity-launcher.test.mjs`
- Modify: `src/host/admitted-provider-backed-identity-launcher.mjs`

**Interfaces:**
- Consumes: the captured `nativeTransport`, `reviewExecutor`, and `revisionExecutor`
- Produces: `launch({ admissionRoot, policyPath, request, identityPolicyDigest, registryRoot, clock, godskillsClock, checkpoint, lockOptions, godskillsLockOptions })`

- [ ] **Step 1: Write failing launch-surface tests**

Assert unknown fields, `env`, provider credentials, provider family, release pin, native transport, review executor, revision executor, classifier, Realm, continuity, and Soul additions fail before any provider call. Assert the explicit digest becomes only `GODAGENT_IDENTITY_POLICY_SHA256` and the exact captured handles reach the admitted host by exercising a real admitted fixture.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/admitted-provider-backed-identity-launcher.test.mjs`

Expected: the new launch tests fail because launch validation and delegation are absent.

- [ ] **Step 3: Implement minimal launch validation and delegation**

Validate an exact plain launch object, require a lowercase 64-character SHA-256 digest, snapshot data inputs before the first asynchronous boundary, construct only the identity-policy pin projection, and call the existing admitted host with the closed-over handles and construction-owned verifier cache and I/O.

- [ ] **Step 4: Run focused compatibility tests**

Run: `node --test tests/admitted-provider-backed-identity-launcher.test.mjs tests/admitted-sealed-identity-launch.test.mjs tests/provider-backed-mission-dependencies.test.mjs`

Expected: all tests pass and historical launcher behavior is unchanged.

- [ ] **Step 5: Commit launch delegation**

```text
feat: close provider-backed admitted launch delegation
```

### Task 3: Deterministic two-family certification fixture

**Files:**
- Create: `tests/helpers/admitted-provider-backed-identity-launcher-certification-fixture.mjs`
- Create: `tests/admitted-provider-backed-identity-launcher-integration.test.mjs`
- Create: `fixtures/admitted-provider-backed-identity-launcher-v1.json`
- Create: `scripts/build-admitted-provider-backed-identity-launcher-v1-fixture.mjs`

**Interfaces:**
- Consumes: the new launcher, both certified provider policies, real admitted identity fixtures, and pinned Godskills release and routing executable
- Produces: `buildDeterministicAdmittedProviderBackedIdentityLauncherFixture({ godskillsRoot })`

- [ ] **Step 1: Write the failing integration test**

For OpenAI-compatible and Anthropic families, build one launcher, author a matching external identity policy from `describe()`, launch a mission through native, review, revision, and final review, reconstruct the launcher, replay terminal state, and scan every durable file for the credential canary. Hand-derive expected totals of two families, eight provider calls, eight reviewed phases, and zero replay calls or credential leaks.

- [ ] **Step 2: Run the integration test and verify red**

Run: `node --test tests/admitted-provider-backed-identity-launcher-integration.test.mjs`

Expected: fail because the certification fixture and canonical fixture do not exist.

- [ ] **Step 3: Implement the deterministic fixture and builder**

Use fixed clocks, exact fake provider responses, separate temporary roots, the existing external identity-policy format, and canonical output. Do not read a real credential or contact a network provider.

- [ ] **Step 4: Build twice and verify exact equality**

Run the fixture builder twice into separate temporary destinations and compare SHA-256 plus canonical bytes.

Expected: both builds produce the same fixture digest and byte-identical JSON.

- [ ] **Step 5: Commit the fixture proof**

```text
test: prove admitted provider-backed launcher recovery
```

### Task 4: Append-only certification and release integration

**Files:**
- Create: `tests/admitted-provider-backed-identity-launcher-certification.test.mjs`
- Create: `scripts/build-admitted-provider-backed-identity-launcher-v1-receipt.mjs`
- Create: `receipts/admitted-provider-backed-identity-launcher-v1.json`
- Create: `docs/admitted-provider-backed-identity-launcher-v1-certification.md`
- Create: `docs/reviews/admitted-provider-backed-identity-launcher-v1-terra-review.json`
- Modify: `src/certification/verify-ledger.mjs`
- Modify: `tests/certification-ledger.test.mjs`
- Modify: `tests/release-lineage.test.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: exact source commit, fixture, design, plan, implementation and test manifests, protected roots, historical receipt hashes, and independent review attestation
- Produces: one append-only receipt under protocol `eternities-admitted-provider-backed-identity-launcher-certification-v1`

- [ ] **Step 1: Write failing receipt, ledger, and lineage tests**

Require requirements `APBIL-001` through `APBIL-009`, exact source reconstruction, exact manifests, protected-root hashes, independent review with zero unresolved critical or important findings, receipt count 45, and current-head ancestry.

- [ ] **Step 2: Run certification tests and verify red**

Run: `node --test tests/admitted-provider-backed-identity-launcher-certification.test.mjs tests/certification-ledger.test.mjs tests/release-lineage.test.mjs`

Expected: fail because the receipt, ledger entry, and count update are absent.

- [ ] **Step 3: Implement the certifier and documentation**

Follow the source-bound builder pattern from provider-backed mission dependencies v1. Derive all claims from fixture values, test counts, manifests, protected roots, and the canonical independent review attestation. Never self-declare review status.

- [ ] **Step 4: Independently review the exact candidate**

Review the source range for authority expansion, forged launcher or dependency substitution, mutable input races, credential disclosure, pre-policy provider work, replay duplication, receipt bootstrap, and incomplete manifest closure. Bind the exact reviewed commit and permit only the attestation file after review.

- [ ] **Step 5: Run certification and final gates**

Run focused tests, `npm test`, `npm run verify:certifications`, `npm run verify:release-lineage`, two clean receipt reproductions, and `git diff --check`.

Expected: all tests pass, 45 receipts verify, exact receipt and fixture bytes reproduce, and lineage binds current head to every certification source.

- [ ] **Step 6: Fast-forward and push canonical main**

Fetch both repositories again, require clean synchronized main branches, fast-forward the reviewed feature branch, rerun merged-main gates, push `main`, verify local and remote identity, then remove only the clean merged feature worktree and branch.
