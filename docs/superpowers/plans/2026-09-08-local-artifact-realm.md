# Local-artifact Realm implementation plan

> **For agentic workers:** Use `executing-plans` for inline task-by-task execution. These tasks share distribution and workflow contracts and must remain sequential.

**Goal:** Make a freshly created local artifact agent usable without representing its operating world as a test-only counter Realm.

**Architecture:** Preserve the legacy Realm validator and distribution container. Add one explicit embedded Realm profile and bind it to a new version of the existing artifact workflow using the existing effect producer and artifact writer. No new generic execution engine is needed.

**Tech stack:** Node.js 24+, JavaScript ESM, existing JSON-schema validator, canonical JSON/digests, local filesystem publication.

**Spec:** [verified boundary and architecture decision](../../audits/2026-09-08-creator-realm-boundary.md).

## Global constraints

- Keep Realm v1, workflow v1/v2 and historical receipt bytes unchanged.
- Keep the distribution manifest v1 container and its existing source-hash identity meaning.
- New profiles require fresh preparation/admission; never silently migrate an existing identity.
- No provider call, credential lookup, automatic deletion, Soul activation or Lunari integration during implementation tests.
- New Realm declarations never grant authority or widen host effects/ceilings.
- Preserve the user's untracked `package-lock.json`.
- Run focused tests during development; reserve the full suite for the final integration gate.

## Task 1: explicit embedded Realm profile and foundry compatibility

**Checkpoint:** implemented in `ae3b9dc`. Eighteen focused foundry/profile tests
passed, including the measured unchanged legacy build and manifest digests.
Independent review cleared the additive embedded-profile/container distinction.

**Files:** create `schemas/local-artifact-realm-contract.schema.json`,
`src/realm/distribution-contract.mjs`, `tests/local-artifact-realm-contract.test.mjs`;
modify `src/core/schema-validator.mjs` only to register the new schema and
`src/foundry/compile.mjs` only to dispatch the embedded Realm validator.
Keep `schemas/realm-contract.schema.json` unchanged.

**Interface:** `verifyDistributionRealmContract(contract)` returns a frozen
`{ schemaVersion, profile, contractDigest, capabilities }`. Version 1 calls the
existing validator and returns profile `fixture-local-v1`. Version 2 requires the
exact new profile. Other versions and unknown keys reject. This helper supplies
no runtime authority and does not replace v1-only validators in counter or
negotiated-action consumers.

The version-2 contract is a closed object with this shape. `producerDescriptorDigest`
must equal the independently obtained digest of the existing
`localArtifactEffectProducer`; it is not an arbitrary new producer definition.
`maximumBytes` includes the final canonical JSON newline, ranges from 1 to the
writer's existing 16,777,216-byte maximum, and is narrowed by the host later.

```js
const contract = {
  schemaVersion: 2, profile: 'local-artifact-v2',
  realmId: 'operator-artifacts', version: '1.0.0',
  trustModel: 'operator-local',
  capabilities: ['artifact.publish', 'artifact.verify'],
  artifactStore: {
    operation: 'publish-local-artifact', producerDescriptorDigest,
    relativeRoot: 'artifacts', maximumBytes: 65536,
    naming: 'sha256-canonical-json', publication: 'exclusive-hard-link',
    replay: 'verify-identical-canonical-json',
  },
  privacy: { retention: 'operator-managed', automaticDeletion: false },
};
```

- [ ] Write failing behavior tests for valid profile inspection, closed fields,
  wrong version/profile/producer, malformed digests, negative/overlarge ceilings,
  false capabilities, absolute/traversing output roots and unsupported retention.
  Exercise a real distribution compile/load round-trip with a fresh matching
  genome, not just the schema helper. Add the identity check below:

```js
assert.notEqual(first.manifest.buildId, changedContract.manifest.buildId);
assert.equal(first.manifest.schemaVersion, 1);
assert.deepEqual(first.manifest.compatibility.schemaRange, '1');
await assert.rejects(() => createPersistentLocalRealm({ contract, statePath }));
```

- [ ] Run `node --test tests/local-artifact-realm-contract.test.mjs` and record
  failures caused by the missing profile support.
- [ ] Implement the closed schema and dispatcher. Use it in both compilation
  and loading; keep source/artifact hashing, projection and manifest checks
  otherwise unchanged. The old reader rejects Realm v2 because its embedded
  schema is unsupported, not because the distribution identity lacks hashing.
- [ ] Run the new tests plus `tests/foundry.test.mjs` and
  `tests/distribution-verification.test.mjs`. Verify unchanged legacy distribution
  bytes, source-hash drift rejection, and unsupported consumer rejection.
- [ ] Commit the verified task without changing any historical receipt.

## Task 2: bind the real artifact workflow before dispatch and publication

**Files:** create `examples/local-artifact-workflow/realm-binding.mjs`,
`tests/local-artifact-workflow-realm-binding.test.mjs`; modify
`examples/local-artifact-workflow/prepare.mjs`, `run.mjs`, and `cli.mjs`.
Also update `src/cortex/binding-compiler.mjs` and
`schemas/cortex-identity-envelope.schema.json`: the real end-to-end test exposed
an unconditional counter-resource projection. Realm v2 must project its actual
artifact byte ceiling, not invent `maxActionsPerCycle`. The legacy shape remains
unchanged. Recovery coverage uses test-only helpers under `tests/helpers/`.
Keep the existing artifact writer and effect producer unless a regression proves
an enforcement change is necessary.

**Interfaces:**

- `captureArtifactRealmBinding({ verifiedDistribution, maximumArtifactBytes })`
  returns `{ profile, contractDigest, distributionBuildId, producerDescriptorDigest }`
  after requiring Realm v2 and a contract ceiling at least as large as the
  host's permitted serialized artifact bytes. It reads the producer descriptor
  from the existing first-party constant, never from model prose.
- `verifyArtifactRealmBinding({ verifiedDistribution, binding, maximumArtifactBytes })`
  checks those exact values against the externally pinned workflow binding and
  returns the validated contract ceiling. It never refreshes the pin on mismatch.

Protocol-3 preparation is explicit (`configuration.schemaVersion: 3`) and still
uses the current effect-only mission/host protocol 2. The workflow manifest alone
advances to 3 and adds the exact `realmBinding` object above. Do not conflate the
workflow version with the embedded mission or distribution version. Derive the
distribution location from the admitted workspace, not a caller-controlled new
path. Bind its verified build ID and Realm source hash; do not duplicate the
distribution or create a second artifact store.

- [ ] Write failing tests for fresh protocol-3 preparation, stale Realm bytes,
  wrong profile/build/producer, incompatible ceiling, and version downgrade.
  Assert zero dispatch for preflight failures and zero artifact publication for
  drift introduced while the controlled model operation is pending:

```js
assert.equal(providerAttempts, 0); // profile or pin rejected before dispatch
assert.equal(await artifactDirectoryExists(), false); // post-dispatch drift
assert.equal(await originalEvidenceHash(), originalHash); // no rewritten history
```

- [ ] Run `node --test tests/local-artifact-workflow-realm-binding.test.mjs` and
  verify the missing binding causes the intended failures.
- [ ] Implement profile-3 capture during preparation and exact re-verification
  before launch and before artifact publication. Retain old profile branches.
  Pass the narrower effective byte ceiling to the existing writer. Unsupported
  versions must fail before workspace creation where preflight has enough input.
- [ ] Exercise real creator finalization and admission, a controlled accepted
  result, actual artifact bytes, and a fresh-process recovery with no second
  controlled dispatch. Test that a v1/v2 workspace is neither reinterpreted nor
  silently upgraded. Test credential-field rejection and path-alias rejection
  remain intact through the new path.
- [ ] Run the new tests, `tests/local-artifact-workflow.test.mjs`,
  `tests/local-workflow-artifact.test.mjs`,
  `tests/local-workflow-process-recovery.test.mjs`, and
  `tests/grok-local-artifact-workflow.test.mjs`.
- [ ] Commit only after those checks pass; do not publish a live qualification.

**Implementation evidence:** the initial protocol-3 tests failed on absent
workflow support, then on the old counter-only cortex projection. The controlled
workflow now publishes accepted bytes and verifies them in a fresh process with
no repeated dispatch. Binding mutation, downgrade, incompatible ceiling, aliased
distribution and reflected credentials reject. Realm drift during inference
preserves the original prepared, attempt and completion files and publishes no
artifact. An additional actual SIGKILL after persisted completion also recovered
through the public CLI without a network attempt (31.6 seconds); the real stale
lock delay was observed, not bypassed. These are controlled-provider results,
not live-model quality evidence. The final task-2 gate passed all 35 tests with
zero failures, skips or cancellations in 95.2 seconds. Independent follow-up
review cleared the evidence preservation and actual-kill tests for commit.

## Task 3: a reviewed operator starter and integrated proof

**Files:** add `examples/local-artifact-workflow/operator-library/` containing
the minimum standalone first-party policy, nine module kinds, one expression,
one creator preset and a truthful local-artifact Realm. Add
`tests/operator-artifact-creation.test.mjs` and update `docs/local-artifact-workflow.md`.
Preserve derivation provenance instead of erasing the original catalog lineage.
Do not ship a compiled identity or duplicate the whole fixture library.

The starter's Realm capabilities are exactly `artifact.publish` and
`artifact.verify`, not generic filesystem access. Its constitution remains
within existing `local-read`/`local-write` effects; Soul stays dormant and
evolution frozen. Its initial cortex uses the already declared OpenAI-compatible
adapter. Do not silently advertise Grok/Anthropic compatibility under that label;
additional cortex profiles require their own explicit mapping and qualification.
Godskills capability policy remains separate from the host-pinned release and
ephemeral mission stack. No skill bodies are copied.

- [ ] Write a failing test that starts from the public creator CLI and standalone
  operator library, reviews/finalizes a new selection, prepares a profile-3
  admission and runs the controlled publication/recovery path. No test-helper
  creation factory or precompiled fixture may supply the agent's inputs.
- [ ] Run `node --test tests/operator-artifact-creation.test.mjs` and verify the
  failure is the missing operator path, then add only its required source assets.
- [ ] Verify mismatched source/policy/preview digests reject; independently read
  the resulting genome, admission, Realm binding and final artifact. Distinguish
  identity/presentation attributes from measured model quality.
- [ ] Independently review the complete change. Run the full repository suite
  at the final integration gate, preserve the log and source pins, reconcile
  upstream, merge under standing approval, rerun focused merged checks and push.
- [ ] Perform a new operational preparation from the documented operator steps.
  Keep it inert until a separate live study has an exact model/endpoint, budget,
  source freeze and quality oracle. Do not renew the exhausted MiniMax allowance.

## Acceptance mapping and non-goals

Spec requirements 1-2 map to tasks 1-2; requirements 3-4 map to task 3 plus the
process-recovery checks in task 2. Requirement 5 is a separate live qualification,
not satisfied by this implementation's controlled responses. Universal product
completion and comparative quality remain open afterward. No general Realm tools,
old-agent migration, automatic retention enforcement, hosted tenancy, Soul or
Lunari work belongs in this change.
