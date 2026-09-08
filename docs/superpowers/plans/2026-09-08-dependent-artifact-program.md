# Dependent artifact program implementation plan

> **For agentic workers:** Use `executing-plans` inline. The five slices below share a runtime boundary; implement sequentially and use independent review at their real checkpoints.

**Goal:** One fresh operator-created actor completes and recovers two dependent artifact missions under an explicit aggregate budget, without copying identity or changing old inputs.

**Architecture:** Reuse the existing mission-program coordinator, add a pure definition/resolution contract and one artifact source, and retain authentication/Realm/publication in a lock-scoped workflow owner. The program stores recipe and completion references, not another provider outbox.

**Tech Stack:** Node 24+ ESM, existing canonical JSON/digests, authenticated facade, local locks and exclusive publication.

**Spec:** [dependent artifact program](../specs/2026-09-08-dependent-artifact-program-design.md).

## Global constraints

- No live calls, user credential reads, spending renewal, model routing or provider refresh.
- No Godskills source/pin/body changes, Soul, evolution, personal-keel writes or Lunari integration.
- One immutable workflow-3 admission; retain all root input bytes and existing commands.
- At most eight ordered steps; aggregate reservations fit both the explicit program and host total-completion ceilings.
- Native `maxArtifactBytes` excludes newline; program `maxResultBytes` counts UTF-8 canonical artifact publication bytes including newline.
- Context package is explicit and at most 4,096 UTF-8 bytes; never truncate/summarize to pass.
- Generic coordinator and adapter retain zero authority; only the existing authenticated facade and workflow owner may execute/publish.
- Standing autonomous approval covers these scoped sequential changes and verified integration, not additional spending/effects.
- Preserve user-untracked `package-lock.json`. Targeted tests per slice; one final full integration gate, historical receipts unchanged.

## Task 1: exact committed-step read port

**Files:** `src/runtime/mission-program.mjs`, `tests/mission-program.test.mjs`.

**Interface:** issued coordinator gains
`readCommittedStep(programId, stepId)`. Missing program/unknown step/invalid ids or
malformed evidence throw. An admitted but uncommitted step returns
`{status:'uncommitted',programId,stepId,stepIndex}`. A committed one adds
`status:'committed', completion` with the exact existing verified completion.
The result is deeply frozen, payload-free, and performs no adapter invocation.

- [x] Add tests beside the existing private `makeInput`, `makeAdapter` and
  `withRoot` helpers. Verify pending-first and committed-first/pending-second,
  completed replay, unknown identifiers, changed journal/artifact, and a read
  from inside step two while the existing program lock is held:

```js
const before = structuredClone(first.calls);
const entry = await coordinator.readCommittedStep(input.programId, 'step-a');
assert.equal(entry.status, 'committed');
assert.deepEqual(entry.completion, expectedCompletion);
assert.deepEqual(first.calls, before);
```

- [x] Run `node --test --test-name-pattern='committed-step' tests/mission-program.test.mjs`; observe missing-method RED.
- [x] Implement over existing `operationPaths` and `replayState`, with no new lock or raw-file classification:

```js
const projection = await replayState(paths.journal, paths.artifacts);
if (!projection) fail('program-missing', 'mission program journal is missing');
const step = projection.admission.steps.find(value => value.stepId === stepId);
if (!step) fail('step-missing', 'mission program step is missing');
const entry = projection.committed.get(step.stepIndex);
```

  Return a frozen copy of `entry.completion`, which replay already verifies
  against the admitted dispatch and artifact reference. Export only through the
  existing issued coordinator; do not change existing serialized protocols.
- [x] Run `node --test tests/mission-program.test.mjs tests/mission-operation-adapter.test.mjs`, review and commit this read-port slice.

Task-1 checkpoint: four new cases failed on the missing method, then all 27
focused coordinator/adapter tests passed, exit 0, 491.9489 ms. Independent review
cleared the read port. No inference, new journal format or mutating capability
was added. Tasks 2 through 5 remain separate, with Task 2 in progress.

## Task 2: pure definitions and exact step resolution

**Files:** create `src/runtime/artifact-program-contracts.mjs`,
`tests/artifact-program-contracts.test.mjs`.

**Interfaces:**

```js
compileArtifactProgram({definition,sourceBinding,baseRequest,policy})
verifyArtifactProgram(program,{sourceBinding,baseRequest,policy})
materializeArtifactProgramStep({program,stepId,baseRequest,policy,predecessors,resolvedAt})
verifyArtifactProgramResolution(resolution,{program,stepId,baseRequest,policy,predecessors})
```

`sourceBinding` is a closed object containing `workflowManifestDigest`,
`identityPolicyDigest`, `providerPolicyDigest`, `realmBindingDigest`,
`producerDescriptorDigest`, `genesisId`, `keelId`, `creationBuildId`,
`distributionBuildId`, `admissionReceiptDigest`, and `actor`. Actor has the exact
four existing mission-program fields. The runtime owner authenticates these
inputs; pure validation does not confer identity or execution authority.

Compiled value fields are `schemaVersion:1`,
`protocolId:'eternities-dependent-artifact-program-v1'`, `definition`,
`sourceBinding`, `baseRequestDigest`, `programInput`, `programDigest`.
The final digest covers the preceding fields. Program input uses the existing
schema and binds definition/source plus the exact base request digest into
`missionDigest` and each recipe inputDigest. Compatible edits to the base request
must not reuse a previous program identity.

Predecessor input is an ordered array of
`{stepId,programCompletion,missionReceiptDigest,artifact}`. The owner supplies it
only after D-4's real committed query and authenticated accepted reconciliation.
Pure validation checks completion digest/schema/program-step-kind, accepted artifact
digest/publication bytes and usage ceilings. It does not claim those self-consistent
inputs prove execution. The durable resolution projects only the selected content
and exact digest references, not full program or provider receipts.

- [x] Test repeatable immutable compilation and deterministic distinct step ids,
  same authority/host/epoch constraints, native-only caps, exact request/effect
  assessment, and selected predecessor content/digest projections:

```js
const p = compileArtifactProgram(inputs);
assert.equal(p.programInput.steps[0].maxResultBytes,
  inputs.definition.steps[0].maxArtifactBytes + 1);
const r = materializeArtifactProgramStep({...resolutionInputs,program:p});
assert.equal(r.requestDigest, sha256Value(r.request));
assert.deepEqual(r.request.hostCeiling, inputs.baseRequest.hostCeiling);
assert.equal(r.request.budgets.totalCompletionTokens,
  inputs.definition.steps[1].maxCompletionTokens);
```

- [x] Observe the missing-module/function RED using an optional import that
  suppresses only `ERR_MODULE_NOT_FOUND`, not unrelated import errors.
- [x] Implement closed field checks, canonical clones/freezing and existing host
  request/schema validation. Reject repeated/unknown/self/forward/out-of-order
  predecessor ids, hidden authority/model/credential fields, invalid integers,
  overcommitted token/publication budgets, wrong policy/source pins and every
  malformed or mismatched completion/artifact/recipe.
- [x] Derive task/mission/observation ids from the full programId+stepId digest,
  not truncated user names. Replace only declared mission/observation/budget
  fields in a clone of the verified base request. Remove/rebuild its existing
  effect assessment using `prepareLocalArtifactEffectRequest`; validate with
  `verifyIdentityHostRequest` before returning a resolution.
- [x] Context is canonical `{context:definition.context,predecessors:[...]}`.
  Each reference contains stepId/projection/programCompletionDigest/
  missionReceiptDigest/artifactDigest/artifactBytes and optional complete content.
  Enforce exact UTF-8 context bytes before returning, including metadata. The
  resolution binds programId, stepId/index, recipeDigest, sourceBindingDigest,
  predecessors, request/requestDigest, resolvedAt and resolutionDigest.
- [x] Add tamper, caller-mutation, unicode-byte and exact-boundary tests; verify
  rehashed edited resolutions still fail recomputation from expected sources.
  Run both new contract tests and Task-1 tests, then review and commit.

## Task 3: shared lock-scoped workflow owner

Task-2 checkpoint: eight contract cases plus 27 coordinator/adapter cases pass,
35 total, exit 0, 3086.8167 ms. Independent review cleared the pure consistency
slice. A compatible base-request mutation first reproduced a program-id collision;
the corrected program and step bindings include its exact digest. Runtime owners
must still call `verifyArtifactProgram` with their independently authenticated
current source binding before materialization. Self-consistency does not confer
admission or execution authority. Task 3 is in progress; Tasks 4/5 have not started.

**Files:** create `examples/local-artifact-workflow/owner.mjs` and
`tests/local-artifact-workflow-owner.test.mjs`; refactor only directly shared
code in `run.mjs` and the local genesis argument assembly in
`src/host/admitted-sealed-identity-launch.mjs` into
`src/host/local-genesis-admission.mjs` if needed for D-1 reuse.

**Interface:** `withLocalWorkflowOwner(options, callback)` preserves existing
manifest options and provider test seam. Its frozen issued owner has
`runPrepared(operation)`, `describeArtifactBinding()`,
`launchArtifactMission(request)`, `reconcileArtifactMission(request)`.
The last three require workflow 3. `assertLocalWorkflowOwner(owner)` checks the
in-process issuer/lifetime. Describe returns authenticated sourceBinding,
baseRequest and policy clones without provider readiness or credentials.
Artifact methods return the existing workflow outcome plus the authenticated
mission receipt/body needed internally by the source; `runPrepared` keeps the
old public output shape exactly. No arbitrary file or policy override is added.

- [x] Write lifecycle RED: methods share one lock; wrong pins/aliases fail before
  host construction; describe is inert; a retained owner rejects after scope exit;
  an in-flight call cannot outlive lock release; old output shapes remain exact.

```js
let held;
await withLocalWorkflowOwner(options, async owner => { held = owner; });
await assert.rejects(held.launchArtifactMission(request), /closed/);
assert.equal(providerCalls, 0);
```

- [x] Move existing checks and result handling, not reimplement or weaken them.
  Keep one workspace lock, then the coordinator lock later. Track started method
  promises without creating unhandled rejection chains. On callback exit stop
  new method admission, await tracked calls, invalidate, release in `finally`.
  Check active lifetime before/after awaited work; already tracked calls remain
  owned while closing and cannot use an invalidated capability.
- [x] Extract shared local genesis path assembly, still using existing
  `assertSafeAdmissionTree`, `readAdmissionBinding`, `assertAdmissionPolicyBinding`
  and `compileCortexBindingCandidate`/genesis verification. Describe binds the
  exact current identity projection/keel, never trusting just manifest fields.
- [x] Test a new request through one issued owner without writing the root request.
  Recheck Realm after completion, preserve facade issuance before any clone, and
  retain exact native/provider byte/credential rejection behavior.
- [x] Run owner tests plus local-artifact workflow, reconciliation, Realm-binding,
  operator-creation and admitted-effect-only reconciliation tests. Review and commit.

Task-3 checkpoint: six owner cases pass, exit 0, 3237.9814 ms. The six-file
targeted gate passes all 37 cases, exit 0, 10067.4021 ms. Independent source
review cleared the owner and literal genesis path extraction. Separate REDs
caught re-pinned policy/Realm and manifest/genesis inconsistencies in inert
description; both now reject. The mutation test uses a mutable caller clone of
the prepared frozen request and verifies the original dispatched mission survives.
Preparation's existing provider directories remain unchanged during description;
no provider construction, credential lookup or residency claim is introduced.

Minor diagnostic follow-up: simultaneous callback and in-flight operation errors
currently report the drained operation error. Lock cleanup and authority remain
correct; preserving both causes can be handled without changing the runtime lane.
At the Task-3 checkpoint, Tasks 4 and 5 had not started. No live-model quality, full-suite or release claim
follows from this targeted gate.

## Task 4: immutable operator program, resolution store and source

**Files:** create `examples/local-artifact-workflow/program.mjs`,
`program-source.mjs`, `program-store.mjs`; extend `cli.mjs`; add
`tests/artifact-program-workflow.test.mjs` and helpers only when genuinely reused.

**Interfaces:** `prepareArtifactProgram({manifestPath,expectedManifestDigest,
definition})` returns `programManifestPath,programManifestDigest,programId`.
`runArtifactProgram({programManifestPath,expectedProgramManifestDigest,env,
createProviderPhaseHostImpl})` validates the pin and runs/replays through one owner.
Store only canonical bounded records under the derived program root; no caller
paths. `createArtifactProgramSource({owner,program,sourceDescriptor,manifestDigest,getCoordinator,store,clock})`
is private host wiring: `getCoordinator` must yield the actual issued coordinator,
never user JSON. It returns `{adapter,verifyCommittedSteps}`: the existing adapter
plus the host-only replay audit needed when a completed coordinator skips adapters.
Operator output contains compact completion/mission-receipt references and artifact
paths, not full mission receipts or artifact bodies.

- [x] Write a real issued-owner two-step RED test. Step two observes exact selected
  parent content and digest. The same instance/genesis/keel/genome/Realm stays
  bound and exactly two controlled provider calls occur. A plain counterfeit
  owner or changed descriptor cannot execute.
- [x] Prepare the program manifest exclusively under
  `artifact-programs/<programId>/program.json`. Use the original workflow reference
  and compiled value; compare an occupied destination byte-for-byte. Return an
  external digest only after verification. Definition/manifest/resolution reads
  use the existing workflow's 1-MiB regular-file/canonical/alias bounds.
- [x] Build one operation source of kind `artifact-mission` for all admitted steps.
  Its fixed source descriptor includes programId, compiled/source digests and
  publisher pin; validate every dispatch's step/index/recipe/authority/budgets.
  Before child resolution query `readCommittedStep`, reconcile each parent's exact
  stored request through the owner, compare actual accepted output and published
  bytes against the committed program completion, and then call Task-2 materializer.
- [x] Publish the resolution using existing exclusive publication; on reread use
  its original resolvedAt and recompute all other bytes from current sources.
  Do not write any provider attempt or completion journal in this store.
- [x] Source reconcile/execute call owner reconcile/launch respectively. Accepted
  completion maps artifactDigest/publication bytes and actual authenticated usage
  into the existing program completion format. Use resolution time as startedAt
  and current post-publication time as completedAt. Refusal/rejection raises a
  bound source error mapped by program owner to `needs-decision`; pending remains
  pending and no descendant executes. Do not add a generic coordinator status.
- [x] On completed aggregate replay revalidate root/actor/step resolutions and all
  published artifacts, not only coordinator metadata. Do not launch while auditing
  already committed results. Preserve source/provider/first-step bytes on failure.
- [x] CLI shapes are:

```text
program-prepare --manifest PATH --manifest-digest SHA256 --definition PATH
program-run --program PATH --program-digest SHA256
```

  `program-run` can execute newly absent steps. It is not no-inference inspection.
  Codes: 0 verified complete, 3 pending/needs-decision, 1 runtime failure, 2 args.
  Existing prepare/run/reconcile parsing and codes remain unchanged.
- [x] Test altered/missing/pending/refused parents, rehashed resolutions, changed
  actor/policy/Realm/provider, overflow, self/forward refs and concurrent invocations.
  Repeat with controlled OpenAI-compatible/Anthropic and Grok-portable hosts.
  Review and commit only after targeted gates pass.

## Task 5: public creator, real interruption, release gate

Task-4 checkpoint: the twelve-file targeted gate passes all 88 cases, exit 0,
48633.5047 ms. This includes 14 new workflow cases, one executable-pin case and
one dense-ancestor case, plus existing contracts, coordinator, owner, provider,
Realm and public-creator regression tests. Independent review cleared the core,
source-pin correction, per-round cache and exact-byte decoder before commit.

Observed REDs and corrections:

- Missing operator API and CLI entrypoints, then controlled two-step execution,
  exact selected evidence, aggregate accounting and credential-free replay.
- Mid-inference manifest drift and a coordinator junction were initially accepted;
  source revalidation and canonical child-directory ownership now reject them.
- Source closure omitted runner/store/coordinator. The descriptor now pins nine
  declared first-party boundary files: runner, store, source, owner, artifact writer,
  coordinator, operation adapter, pure contracts and local genesis assembly.
  Isolated data-copy mutations of each file reject before provider construction.
  This is not a transitive dependency, Node binary or hostile-same-user guarantee.
- Fatal UTF-8 decoding originally stripped a BOM before external-pin comparison;
  BOM preservation now makes the changed record fail canonical verification.
- Dense shared ancestry exceeded 128 host reconstructions before finishing.
  Fresh per-verification-round caches now complete all eight native calls with
  108 authenticated host constructions. The combined-gate case took 48458.9908 ms;
  this is bounded fanout evidence, not a fast-runtime or live-quality claim.

Native-only applicability: `effect-only-mission-runner.mjs` supplies null review
and revision executors and null Godskills binding. `mission-review-kernel.mjs`
accepts a valid native-only completion without a review verdict. Thus actual
review-derived terminal rejection is not reachable in this profile. Routing
`needs-decision` is tested with zero inference/descendant execution; the defensive
mapping of an authenticated `rejected` outcome is implemented but is not claimed
as tested native rejection. No fabricated owner or receipt substitutes for proof.

Task-5 source and controlled proof are complete at `fc21492`. The frozen candidate
passed all 1,406 full-suite tests, including the historical ledger and lineage.
The real public-creator interruption gate passed three tests; the merged focused
gate passed 48. See the [closeout](../../audits/2026-09-08-dependent-artifact-program-closeout.md)
for exact evidence, the preserved interrupted parallel run and release scope.
No live call or credential lookup against a user's provider occurred.

**Files:** add `tests/artifact-program-process-recovery.test.mjs` and its owned
child helper; reuse/refactor the public creator setup in
`tests/operator-artifact-creation.test.mjs` without replacing it with a precompiled
identity. Update `docs/local-artifact-workflow.md`, current-state and README with
exact results/limits; add one closeout under `docs/audits`.

- [x] Public creator finalizes fresh standalone operator sources, prepares one
  workflow/program and completes two dependent missions. Assert exact identity
  bindings, accepted outputs, total actual tokens/bytes, distinct deterministic
  mission IDs and immutable root/parent records.
- [x] Kill an owned child after first mission completion persistence but before
  publication/program commit; recover in a fresh process with the real 30-second
  lock delay. No repeat first inference; second mission receives the verified parent.
  Separately kill during an uncertain second call and prove recovery stays pending
  without another physical call. Observe network attempts with the existing witness.
- [x] Independent review of the full change range, targeted regression checks,
  freeze feature commit, full suite and historical ledger/lineage, reconcile origin,
  merge verified branch, focused merged checks and push exact main ref. Keep failed
  trial evidence, no regenerated historical receipts or claim of live superiority.
- [x] Record the next matched live comparison separately. Both arms receive the
  same context, previous result, durable transcript access, tools and model-specific
  budget. This plan does not renew MiniMax's exhausted allowance or qualify ClovAPI.

Next-study preparation is recorded in the closeout, with the detailed read-only
preflight under its evidence root. It is not a frozen or executed experiment.
The current host has no app-edit/test tool loop, and the supplied known-defect
candidate is ineligible for a fresh held-out quality claim. Do not silently
substitute artifact acceptance for actual product usefulness.

## Coverage and completion

D-4 maps to Task 1; D-2/D-3/D-5 pure contracts to Task 2; D-1/D-6 owner to Task 3;
D-3/D-5/D-6 runtime/CLI to Task 4; D-7/D-8 integrated proof to Task 5.
All five tasks must pass before claiming this two-step workflow done. Passing only
the pure contract or read-port tests is not an end-to-end product result.
