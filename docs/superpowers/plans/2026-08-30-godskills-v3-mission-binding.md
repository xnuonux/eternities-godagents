# Godskills System v3 Mission Binding Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the certified 44-capability Godskills System v3 to each admitted Godagent mission before cortex inference through a provider-neutral, receipt-bound, authority-narrowing adapter.

**Architecture:** Godagents keeps Godskills as an external digest-pinned dependency. A release verifier establishes an immutable 22 plus 22 catalog, a mission binder selects and verifies no more than three packages, the vessel journals that binding before inference, and every cortex adapter receives the same canonical method envelope. Bodies are read only for selected first-party capabilities and are never copied into this repository or durable receipts.

**Tech Stack:** Node.js 24 ESM, JSON Schema 2020-12, `node:test`, canonical JSON and sha256 helpers already in the repository.

**Spec:** `docs/superpowers/specs/2026-08-30-godskills-v3-mission-binding-design.md`

## Global Constraints

- do not merge `eternities-godagents` with `eternities-godskills` and do not copy skill bodies.
- support exactly `eternities-godskills-adapter-v1`, System v3, Router v8, Intent Compiler v3, and portable manifest v1 in this release.
- verify 22 top-level Godskills plus 22 operational specialists.
- select zero to three capabilities per cycle, with three as an absolute ceiling.
- route after mission, observation, and host authority are known but before cortex inference and constitutional proposal selection.
- Godskills may narrow method and requirements but never expand authority, effects, preconditions, risk, evidence, context, credentials, budgets, identity, constitution, evolution, realm hands, or personal-keel ownership.
- fail closed on stale or mismatched receipts, unsupported protocols, unresolved routes, path escape, missing artifacts, digest mismatch, composition overflow, and any attempted expansion.
- preserve ordinary unbound Codex operation.
- fetch and reconcile both repositories before execution, but modify only `eternities-godagents`.

---

## File map

- Create `schemas/godskills-release-pin.schema.json`: closed host release descriptor.
- Create `schemas/godskills-cycle-receipt.schema.json`: body-free per-cycle binding receipt.
- Create `src/skills/release-verifier.mjs`: path containment, receipt-chain verification, manifest validation, and digest cache identity.
- Create `src/skills/capability-policy.mjs`: all-rounder and specialist eligibility without implicit quality loss.
- Create `src/skills/mission-binder.mjs`: route validation, selected artifact loading, ceiling intersection, package compilation, and receipt creation.
- Modify `src/skills/godskills-adapter.mjs`: expose the versioned adapter and retain transport as a narrow routing implementation detail.
- Modify `schemas/agent-genome.schema.json`: replace the legacy router id with persistent capability policy.
- Modify `schemas/host-policy.schema.json`: replace a bare repository path with the release pin.
- Modify creation fixtures and projections that emit `genome.godskills` or host policy.
- Modify `src/runtime/vessel.mjs`: bind the stack before cortex work, journal it, pass it through recovery, and remove post-decision routing.
- Modify `src/runtime/persistent-vessel.mjs`: require the adapter object rather than an ambient transport function.
- Modify `src/cortex/openai-compatible.mjs`: serialize the canonical method envelope without provider-specific reinterpretation.
- Add focused tests beside each component and extend existing admitted launch, inference, recovery, and unbound regression tests.

### Task 1: pin and verify one certified release

**Files:**
- Create: `schemas/godskills-release-pin.schema.json`
- Create: `src/skills/release-verifier.mjs`
- Create: `tests/godskills-release-verifier.test.mjs`
- Modify: `src/core/schema-validator.mjs`

**Interfaces:**
- Consumes: `{ adapterProtocol, repositoryRoot, systemReceipt, routerReceipt, compilerReceipt, portableReceipt, portableManifest, semanticEffectBindings, maximumSelected, maximumPackageBytes }`
- Produces: `verifyGodskillsRelease(releasePin, { artifactCache?, io? }) -> Promise<VerifiedGodskillsRelease>`
- `VerifiedGodskillsRelease` exposes `{ releaseDigest, root, manifest, capabilitiesById, pin, routerArtifacts, compilerArtifacts }` as frozen values.

- [ ] **Step 1: write failing release verification tests**

Cover the exact current fixture, each root receipt digest mutation, status mutation, wrong protocol, wrong 22 plus 22 counts, duplicate capability id, manifest logical-digest mismatch, absolute or escaping path, symlink or junction escape, missing file, wrong byte count, and selected artifact digest drift. assert that no capability body is read during release verification by wrapping the filesystem reader.

- [ ] **Step 2: run the focused test and confirm the verifier is absent**

Run: `node --test tests/godskills-release-verifier.test.mjs`

Expected: fail because `release-verifier.mjs` and the release-pin schema do not exist.

- [ ] **Step 3: implement the closed release-pin schema and verifier**

Use the existing canonical JSON and digest helpers. resolve every artifact relative to the verified real repository root, reject path traversal and post-resolution escape, compare bytes and sha256, require the expected receipt ids and certified statuses, verify receipt links, require manifest id `portable-capabilities-v1`, require 44 unique rows split 22 and 22, and require `maximumSelected <= 3`. cache only immutable parsed artifacts keyed by content digest.

- [ ] **Step 4: run release verification tests**

Run: `node --test tests/godskills-release-verifier.test.mjs`

Expected: all release mutation and containment cases pass.

- [ ] **Step 5: commit the release boundary**

```text
git add schemas/godskills-release-pin.schema.json src/core/schema-validator.mjs src/skills/release-verifier.mjs tests/godskills-release-verifier.test.mjs
git commit -m "feat: verify pinned godskills releases"
```

### Task 2: encode capability policy without identity-release coupling

**Files:**
- Create: `src/skills/capability-policy.mjs`
- Create: `tests/godskills-capability-policy.test.mjs`
- Modify: `schemas/agent-genome.schema.json`
- Modify: `fixtures/agent-genome.json`
- Modify: `fixtures/networked-agent-genome.json`
- Modify: `fixtures/creation/modules/godskills.json`
- Modify: creation projection tests and fixtures that assert `genome.godskills`

**Interfaces:**
- Consumes: `genome.godskills` plus a verified manifest capability row.
- Produces: `compileCapabilityEligibility(policy, manifest) -> { eligibleIds, preferredIds, prohibitedIds, maxComposition }`
- Policy shape: `{ protocolId, profile, preferredFamilies, prohibitedFamilies, prohibitedCapabilities, maxComposition }`.

- [ ] **Step 1: write failing policy tests**

Assert that an all-rounder is eligible for all 44 manifest rows, specialist preferences rank matching rows first, a specialist remains eligible for non-preferred rows, explicit family and id prohibitions remove only matching rows, unknown family and capability ids fail schema validation, duplicates fail validation, and `maxComposition` above three fails.

- [ ] **Step 2: run the policy tests and confirm the old genome shape fails them**

Run: `node --test tests/godskills-capability-policy.test.mjs tests/creation-projection.test.mjs tests/creation-schemas.test.mjs`

Expected: fail because the current genome contains only `contractId` and `maxComposition`.

- [ ] **Step 3: implement the policy compiler and migrate fixtures**

Make preferences a deterministic ranking input only. compute prohibition from explicit family and capability arrays. reject release paths and digests in genome policy. keep capability policy in the genome so any envelope-expanding change remains governed evolution.

- [ ] **Step 4: run policy and creation tests**

Run: `node --test tests/godskills-capability-policy.test.mjs tests/creation-projection.test.mjs tests/creation-schemas.test.mjs tests/creation-compatibility.test.mjs`

Expected: all selected tests pass with the new policy shape.

- [ ] **Step 5: commit capability policy**

```text
git add schemas/agent-genome.schema.json src/skills/capability-policy.mjs tests/godskills-capability-policy.test.mjs fixtures
git commit -m "feat: govern godagent capability policy"
```

### Task 3: bind a bounded selected mission package

**Files:**
- Create: `schemas/godskills-cycle-receipt.schema.json`
- Create: `src/skills/mission-binder.mjs`
- Create: `tests/godskills-mission-binder.test.mjs`
- Modify: `src/core/schema-validator.mjs`
- Modify: `src/skills/godskills-adapter.mjs`
- Modify: `tests/godskills-adapter.test.mjs`

**Interfaces:**
- Consumes: `VerifiedGodskillsRelease`, routing transport, mission, observation, genome policy, host envelope, source state epoch.
- Produces: `createGodskillsAdapter({ releasePin, transport, artifactCache }) -> Promise<{ bindMission(input) }>`.
- `bindMission(input)` returns `{ status: 'bound', receipt, cortexPackage }`, `{ status: 'no-qualified-route', receipt, cortexPackage }`, or `{ status: 'needs-decision', unresolvedDecisions, receipt: null, cortexPackage: null }`.

- [ ] **Step 1: write failing mission binding tests**

Use a two-capability fixture to prove exact selected entrypoint and contract digest verification, owner relationship enforcement, route request source-envelope binding, explicit prohibitions, specialist preference ordering, maximum composition, package byte ceiling, and context ceiling. prove that the closed host effect binding maps `read` only to `local-read` and `write` only to `local-write`, rejects an unmapped semantic effect, preserves descriptive risk, evidence, and precondition obligations without marking them satisfied, and enforces host subsets for authority, concrete effects, available preconditions, risk ceiling, evidence floor, and context. assert that only selected paths are read and that cold quarry and unselected capabilities are never opened.

- [ ] **Step 2: add method-shaping tests**

For two missions with the same host authority but different selected contracts, assert different canonical `methods`, `evidenceRequirements`, `proposalRequirements`, and `terminationConditions`, while the authority projection remains byte-identical.

- [ ] **Step 3: run the binder tests and confirm failure**

Run: `node --test tests/godskills-mission-binder.test.mjs tests/godskills-adapter.test.mjs`

Expected: fail because the current adapter returns paths only and has no release or package receipt.

- [ ] **Step 4: implement source-envelope, package, and receipt compilation**

Build the source envelope from mission, observation digest, state epoch, genome policy digest, host ceilings, realm hand-contract digest, and release digest. validate the external route, load only selected manifest rows, verify selected files, intersect every ceiling, compile canonical method arrays, hash the stack and package, and validate the body-free cycle receipt. treat `needs-decision` as an unresolved non-binding result. emit an empty receipt-bound package for `no-qualified-route`.

- [ ] **Step 5: run mission binding tests**

Run: `node --test tests/godskills-mission-binder.test.mjs tests/godskills-adapter.test.mjs`

Expected: all routing, loading, shaping, and expansion-negative cases pass.

- [ ] **Step 6: commit the mission binder**

```text
git add schemas/godskills-cycle-receipt.schema.json src/core/schema-validator.mjs src/skills/godskills-adapter.mjs src/skills/mission-binder.mjs tests/godskills-adapter.test.mjs tests/godskills-mission-binder.test.mjs
git commit -m "feat: bind selected godskills mission packages"
```

### Task 4: move binding before cortex and constitutional selection

**Files:**
- Modify: `src/runtime/vessel.mjs`
- Modify: `src/runtime/persistent-vessel.mjs`
- Modify: `tests/admitted-launch.test.mjs`
- Create: `tests/godskills-runtime-order.test.mjs`
- Modify: `tests/journal-recovery.test.mjs`

**Interfaces:**
- Consumes: adapter object with `bindMission(input)`.
- Produces: durable `godskills.bound` event before `cortex.requested`, and passes `cortexPackage` into every proposal path.

- [ ] **Step 1: write the ordered journal test**

Run one networked cycle and assert this strict subsequence: `mission.admitted`, `realm.observed`, `godskills.bound`, `cortex.requested`, `cortex.accepted`, `proposal.collected`, `decision.committed`. make the cortex spy fail if called before the adapter spy has bound a package.

- [ ] **Step 2: write unresolved and malformed-route tests**

Assert `needs-decision`, stale receipt, digest mismatch, and overflow record `cycle.aborted` without any cortex prepare or execute call. assert `no-qualified-route` reaches cortex with an empty receipt-bound method envelope.

- [ ] **Step 3: run the runtime-order tests and observe current post-decision behavior fail**

Run: `node --test tests/godskills-runtime-order.test.mjs tests/admitted-launch.test.mjs`

Expected: fail because `godskill.routed` currently follows `decision.committed`.

- [ ] **Step 4: reorder the vessel state machine**

Bind immediately after `realm.observed`. add `activeGodskillsBinding` to state, replace `godskill.routed` with `godskills.bound`, pass the exact package into both networked `cortexContext` and local `cortex.infer`, and remove the route call from `completeFromProposals`. clear the binding on completed or aborted cycles.

- [ ] **Step 5: make crash recovery deterministic**

If `godskills.bound` exists, rehydrate and verify the exact package digest without routing again. if a crash occurred before binding, allow recomputation only when the source-envelope digest matches. add crash checkpoints before and after binding and assert no duplicate route after durable binding.

- [ ] **Step 6: run runtime and recovery tests**

Run: `node --test tests/godskills-runtime-order.test.mjs tests/admitted-launch.test.mjs tests/inference-lifecycle.test.mjs tests/journal-recovery.test.mjs`

Expected: all ordered, abort, retry, and crash cases pass.

- [ ] **Step 7: commit runtime ordering**

```text
git add src/runtime/vessel.mjs src/runtime/persistent-vessel.mjs tests/godskills-runtime-order.test.mjs tests/admitted-launch.test.mjs tests/inference-lifecycle.test.mjs tests/journal-recovery.test.mjs
git commit -m "fix: bind godskills before cortex inference"
```

### Task 5: expose the same method envelope to every cortex

**Files:**
- Modify: `src/cortex/openai-compatible.mjs`
- Modify: `tests/openai-compatible.test.mjs`
- Modify: local fixture cortex tests that inspect inference context

**Interfaces:**
- Consumes: `context.methodEnvelope` from the vessel.
- Produces: provider request containing the exact canonical envelope and proposal validation linked to `sourceEnvelopeDigest` and `packageDigest`.

- [ ] **Step 1: write failing provider-neutral request tests**

Assert that OpenAI-compatible requests include the exact method envelope, no unselected body, and no release path or repository root. assert prompt byte limits include the package bytes. assert local fixture cortex receives the same object before proposing.

- [ ] **Step 2: write proposal-shape and termination tests**

Extend the structured proposal boundary with method-envelope digest acknowledgement and selected proposal requirements. reject a proposal whose acknowledgement mismatches, whose shape violates selected requirements, or whose claimed continuation violates a selected terminal condition.

- [ ] **Step 3: run cortex tests and confirm the envelope is currently missing**

Run: `node --test tests/openai-compatible.test.mjs tests/godskills-runtime-order.test.mjs`

Expected: fail because `requestFor` currently serializes only mission, observation, constraints, and required proposal fields.

- [ ] **Step 4: serialize and enforce the canonical envelope**

Add `methodEnvelope` to the canonical request object. do not let provider adapters read the filesystem or reroute. enforce package-aware proposal admission in shared host code so every provider gets the same semantics.

- [ ] **Step 5: run cortex tests**

Run: `node --test tests/openai-compatible.test.mjs tests/godskills-runtime-order.test.mjs tests/inference-lifecycle.test.mjs`

Expected: all provider-neutral binding and budget tests pass.

- [ ] **Step 6: commit cortex binding**

```text
git add src/cortex/openai-compatible.mjs tests/openai-compatible.test.mjs tests/godskills-runtime-order.test.mjs tests/inference-lifecycle.test.mjs
git commit -m "feat: compile godskills into cortex requests"
```

### Task 6: migrate host policy to the release descriptor

**Files:**
- Modify: `schemas/host-policy.schema.json`
- Modify: `fixtures/host-policy.json`
- Modify: `src/host/local-cli.mjs`
- Modify: `src/host/admitted-launch.mjs`
- Modify: `tests/host-policy.test.mjs`
- Modify: `tests/local-cli.test.mjs`
- Modify: `tests/admitted-launch-cli.test.mjs`

**Interfaces:**
- Consumes: `runtime.godskillsRelease` instead of `runtime.godskillsRepository`.
- Produces: one verified adapter object passed into persistent vessel construction.

- [ ] **Step 1: write failing host-policy tests**

Reject the legacy bare repository path, incomplete pins, unknown protocols, maximum selected above three, package budget above the host context budget, and release descriptors that do not bind all five roots. assert validation happens before realm use or cortex construction.

- [ ] **Step 2: run host tests and confirm the old policy shape fails**

Run: `node --test tests/host-policy.test.mjs tests/local-cli.test.mjs tests/admitted-launch-cli.test.mjs`

Expected: fail because the host accepts only `godskillsRepository`.

- [ ] **Step 3: construct the adapter during admitted launch**

Validate policy, verify the release, construct one adapter, and pass it through `createPersistentVessel`. remove ambient filesystem knowledge from the vessel and cortex. keep credentials and realm hands outside the adapter input.

- [ ] **Step 4: run host tests**

Run: `node --test tests/host-policy.test.mjs tests/local-cli.test.mjs tests/admitted-launch-cli.test.mjs tests/admitted-launch.test.mjs`

Expected: all policy, admission, and no-side-effect-before-verification tests pass.

- [ ] **Step 5: commit host migration**

```text
git add schemas/host-policy.schema.json fixtures/host-policy.json src/host/local-cli.mjs src/host/admitted-launch.mjs tests/host-policy.test.mjs tests/local-cli.test.mjs tests/admitted-launch-cli.test.mjs tests/admitted-launch.test.mjs
git commit -m "feat: pin godskills release at admission"
```

### Task 7: add operational dependency migration receipts

**Files:**
- Create: `schemas/godskills-release-migration.schema.json`
- Create: `src/skills/release-migration.mjs`
- Create: `tests/godskills-release-migration.test.mjs`
- Modify: `src/core/schema-validator.mjs`
- Modify: certification ledger schema or builder only if required by the repository's current receipt registry.

**Interfaces:**
- Consumes: old verified release, new verified release, unchanged genome policy and identity digests.
- Produces: `planGodskillsReleaseMigration({ from, to, genomePolicy, identity }) -> migrationReceipt`.

- [ ] **Step 1: write failing migration tests**

Assert a protocol-compatible digest update produces a body-free receipt and preserves instance, genome, genesis, keel, and constitution digests. reject protocol downgrade, removed required capability, broader effects, broader authority, higher composition, higher context requirement, or any attempt to edit genome policy as an operational migration.

- [ ] **Step 2: run the migration test and confirm the module is absent**

Run: `node --test tests/godskills-release-migration.test.mjs`

Expected: fail because migration planning is not implemented.

- [ ] **Step 3: implement compatibility classification and rollback pin**

Compare content-addressed manifests and protocol versions, classify capability additions and removals, require unchanged identity inputs, include verification evidence and rollback descriptor, and return `governed-evolution-required` for any capability-envelope expansion.

- [ ] **Step 4: run migration tests**

Run: `node --test tests/godskills-release-migration.test.mjs`

Expected: all dependency-versus-evolution cases pass.

- [ ] **Step 5: commit migration receipts**

```text
git add schemas/godskills-release-migration.schema.json src/core/schema-validator.mjs src/skills/release-migration.mjs tests/godskills-release-migration.test.mjs
git commit -m "feat: receipt godskills dependency migrations"
```

### Task 8: certify the integrated boundary

**Files:**
- Create: `tests/godskills-v3-integration.test.mjs`
- Create: `scripts/build-godskills-v3-integration-receipt.mjs`
- Create: `receipts/godskills-v3-integration.json`
- Modify: `package.json`
- Modify: `README.md` and `docs/architecture.md` with links only, not copied skill content.

**Interfaces:**
- Consumes: completed adapter, current external certified release, runtime, cortex, host, recovery, and migration tests.
- Produces: deterministic integration receipt covering `GSV3-001` through `GSV3-014`.

- [ ] **Step 1: write the certification test before the builder**

Rebuild the receipt in memory and compare it byte-for-byte with the checked-in receipt. include source commit, spec digest, plan digest, release pins, test counts, zero authority expansions, zero unselected body loads, zero cold-quarry reads, ordered-event proof, recovery proof, migration proof, and explicit proof limits.

- [ ] **Step 2: run the certification test and confirm it fails**

Run: `node --test tests/godskills-v3-integration.test.mjs`

Expected: fail because the builder and receipt do not exist.

- [ ] **Step 3: implement and build the deterministic receipt**

Add `build:godskills-v3-integration` to `package.json`, generate the receipt from verified files and test fixtures, and keep machine-specific roots and secrets out of the receipt.

- [ ] **Step 4: run focused source and integration gates**

Run in `C:\dev\eternities-godskills`:

```text
node --test tests/godskills-system-v3-certification.test.mjs tests/intent-compiler-v3-certification.test.mjs tests/portable-capability-manifest.test.mjs
```

Run in `C:\dev\eternities-godagents`:

```text
node --test tests/godskills-release-verifier.test.mjs tests/godskills-capability-policy.test.mjs tests/godskills-mission-binder.test.mjs tests/godskills-runtime-order.test.mjs tests/openai-compatible.test.mjs tests/godskills-release-migration.test.mjs tests/godskills-v3-integration.test.mjs
```

Expected: every focused gate passes.

- [ ] **Step 5: run the final repository gate**

Run: `npm test`

Expected: zero failures, no changed Godskills files, and no untracked copied skill bodies.

- [ ] **Step 6: self-review against every acceptance id**

Map `GSV3-001` through `GSV3-014` to a named passing test and receipt field. scan for repository-root leakage, credential leakage, cold-quarry references, copied `SKILL.md` files, unknown protocol fallback, and any route after `decision.committed`.

- [ ] **Step 7: commit the certified integration**

```text
git add package.json README.md docs/architecture.md scripts/build-godskills-v3-integration-receipt.mjs receipts/godskills-v3-integration.json tests/godskills-v3-integration.test.mjs
git commit -m "test: certify godskills v3 mission binding"
```

## execution order

Tasks 1 and 2 may be developed independently in isolated worktrees. Tasks 3 through 8 are sequential because each consumes the prior interface. reconcile the existing local cortex-binding design commit before creating worktrees, and merge only fully verified task branches into the current Godagents main. never commit or modify the Godskills repository during this plan.
