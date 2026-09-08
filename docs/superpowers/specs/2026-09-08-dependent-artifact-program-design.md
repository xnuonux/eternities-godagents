# Dependent artifact missions in one persistent actor

Baseline: main `04388b23338e3dc32fa2bf87740c6805a6f9e6a3`.
Architectural decision under Dom's standing autonomous implementation approval.
No new live allowance, model routing, Soul, evolution or Lunari integration.

## Outcome and evidence

One operator-created agent completes two ordered, dependent artifact missions,
retaining its admission and identity. The second receives explicitly selected,
verified evidence from the first. Recovery must not repeat an uncertain inference
or silently substitute a changed predecessor. One pre-admitted completion budget
covers the whole program. This is a usable workflow goal, not merely a graph parser.

Verified existing machinery:

- `examples/local-artifact-workflow/prepare.mjs` publishes an immutable workflow-3
  manifest and identity/provider/mission inputs, with one admission and Realm.
- `examples/local-artifact-workflow/run.mjs` owns the workspace lock, input pins,
  Realm pre/post checks, issued facade and artifact writer.
- `src/host/admitted-effect-only-identity-launcher.mjs` authenticates independent
  mission requests through the same admitted host and exposes no-new-inference
  reconciliation. The prior two-mission SDK probe preserved eight actor bindings.
- `src/runtime/mission-program.mjs` already sequences at most eight steps, binds
  descriptors and dispatches, enforces aggregate ceilings and reconciles before
  execution. Its public inspection does not yet expose a committed step's exact
  completion. `mission-operation-adapter.mjs` supplies the zero-authority adapter.
- Existing `artifact.mjs` publishes/verifies canonical digest-named outputs.

## Options and decision

1. Use the existing coordinator plus one artifact-specific source and exclusive
   resolution records. This reuses ordering, reservations and provider journals;
   it requires a shared workflow owner and one small committed-result read port.
2. Build a standalone dependent scheduler. Its input contract could be tailored,
   but it would duplicate the existing ordering, recovery and budget engine.
3. Mutate the root mission or copy its workspace for each step. This needs less
   orchestration initially, but breaks immutable pins or duplicates a resident actor.

Select option 1. Keep old workflow commands byte-compatible in behavior. The new
program is additive and explicitly prepared/pinned. The strongest objection is
that joining too many audit layers can add overhead without user benefit: measure
two-step runtime/calls/context against the same model with equivalent history after
controlled correctness, and reconsider this source boundary if it adds no recovery
or usability value. No superiority follows from structural tests.

## Interfaces, records and authority

### D-1: immutable actor/workflow binding

Never rewrite `workflow.json`, `mission-request.json`, `identity-policy.json` or
`provider-policy.json`. A program takes the original workflow path and external
manifest digest. Both preparation and run reverify its actual admission, policy,
distribution, Realm and personal-keel head. Preparation remains inert: no model,
credential resolution, live residency claim or provider readiness/refresh.

Use the existing `compileCortexBindingCandidate`/`verifyGenesisAdmission` pipeline
for actor evidence, not a second genesis verifier. Assemble the existing local
admission-path structure through one shared helper. Program actor projection is
instanceId, sha256 of verified full-envelope identity, genomeValueDigest and current
keel-head digest. The source additionally pins genesisId, keelId, creationBuildId,
distributionBuildId and admissionReceiptDigest, plus workflow/provider/identity-
policy/Realm/publisher digests. No task-dependent candidate digest is treated as a
stable actor identity. A changed keel head fails this pinned program; it is not
automatically migrated or erased.

### D-2: explicit bounded definition

Definition v1 is a closed JSON object:

```
{ schemaVersion: 1, context, maxContextBytes,
  budget: { maxCompletionTokens, maxResultBytes },
  steps: [{ stepId, objective, successEvidence, stopConditions,
    maxCompletionTokens, maxArtifactBytes,
    predecessors: [{ stepId, projection: 'content' | 'digest' }] }] }
```

One to eight unique ordered steps. Identifiers match the existing mission-program
identifier grammar. Success/stop arrays obey the current vessel's sorted-unique,
1-to-16 item contract. No self, forward, duplicate or unknown predecessor; references
are sorted by predecessor index. No model, authority, identity, credentials, shell
commands, writable paths or arbitrary request overrides are accepted as fields.
`context` and objective are ordinary task data, never authority.

Each step completion cap is positive and at most the pinned host native cap.
The sum of reservations must fit the explicit program completion budget, which is
itself at most the host's total-completion ceiling. Every step artifact cap is at
most the host's artifact cap; summed step caps must fit the explicit program result
budget, bounded by the existing coordinator's 16,777,216-byte maximum. A recipe's
`maxArtifactBytes` is the native canonical-artifact ceiling excluding the final
newline, as in existing mission budgets. Reserve `maxArtifactBytes + 1` for each
program step and sum those publication ceilings into `budget.maxResultBytes`.
Reject a step whose publication ceiling exceeds the coordinator maximum. These are
ceilings, not predicted usage or renewed spending authorization.

`maxContextBytes` is explicit, positive and at most 4,096 UTF-8 bytes, matching the
current vessel observation boundary conservatively. The exact canonical context
package must fit, including metadata; otherwise fail before inference. Never trim,
summarize, strip or silently replace content to fit. Content projection carries
the complete accepted artifact's `content`; digest projection carries its verified
identity and digests without content. No transcript or unrelated skill body is loaded.

### D-3: non-circular program admission

A pure contract compiler derives the existing mission-program input:

- actor comes from D-1, never the definition;
- missionDigest binds definition plus the workflow/source binding;
- authorityCeilingDigest binds the existing host ceiling and requested authority;
- each step kind is `artifact-mission` and its inputDigest binds only its immutable
  recipe and source binding, not an unknown future output;
- per-step result ceiling is `recipe.maxArtifactBytes + 1`; resultDigest is the
  accepted artifact digest (canonical JSON without newline), while resultBytes
  is exactly `Buffer.byteLength(canonicalJson(artifact) + '\n', 'utf8')`, verified
  equal to the Realm writer's returned `artifact.bytes`. The program completion
  record itself remains independently bounded by the existing coordinator;
- programId is the existing hash of the unsigned program input.

One immutable program manifest under `artifact-programs/<programId>/program.json`
binds the definition, source binding, program input and source descriptor. Its
external byte digest is required for run/recovery. No artifact or actor path is
taken from the definition. Duplicate preparation verifies exact existing bytes,
never overwrites them. The source descriptor can include the computed programId
because the generic program input does not itself contain adapter descriptors.

### D-4: authoritative predecessor reads

Add `coordinator.readCommittedStep(programId, stepId)` as a read-only query over
the existing verified journal/artifact replay. It returns either an explicit
uncommitted step reference or the exact verified committed completion; a missing
program/unknown step/malformed evidence is an error, not provider absence. It
performs no adapter inference and adds no scheduler or authority. The program host
owns the actual issued coordinator and calls this port internally; caller-provided
JSON cannot substitute for that query.

Before resolving a dependent step, require every selected predecessor to be
committed there. Reconcile its exact saved request through the authenticated
facade, require an accepted terminal result, compare the committed program result
digest/bytes to the actual accepted artifact, and verify its published file through
the existing writer. Do not rely on a self-hashed source record alone.

### D-5: exclusive resolution, not a duplicate provider journal

Before inference, publish exactly one bounded canonical step resolution under the
program's owned directory. It binds program/step/recipe/source identity, exact
committed predecessor completion and mission-receipt/artifact digests, the selected
bounded context, the derived request/digest, and resolvedAt. On recovery recompute
it from current authenticated sources using its original resolvedAt and require
byte-identical equality. Alias, oversized, malformed and changed records fail.

The derived request inherits only the base request's host/authority/epoch/method
constraints, with deterministic program+step task/mission/observation identifiers,
the step objective/success/stop conditions and native/artifact ceilings. Its total
completion cap equals its native cap because this profile is native-only. The
observation contains canonical `{context, predecessors}` and sorted evidence
digests. Regenerate the existing structured-effect assessment; never reuse an old
assessment after changing its subject. Validate through the existing host request
verifier before publication/dispatch. Root prepared inputs stay unchanged.

The source record binds inputs, not transport state. Provider attempts/completions
remain exclusively in existing per-mission host journals. The coordinator owns
ordered commit and aggregate accounting. The source has no second retry engine.

### D-6: shared workflow ownership and result mapping

Extract only the shared workspace/input/Realm checks and accepted-result path from
the existing workflow. The existing commands still use that same implementation.
The program host holds the same workspace lock around its drive; nested mission
calls use the verified lock-scoped owner, not a second acquisition of that lock.
The program coordinator lock is nested after the workspace lock consistently.
No capability retained past the workspace callback may execute/publish afterward.

The exact extraction is an issued, frozen owner provided only inside
`withLocalWorkflowOwner(options, async owner => ...)`. The outer function acquires
`workflow-run.lock`, verifies the snapshot and retains its `finally` release.
`owner.runPrepared(operation)` preserves the existing single-mission paths;
`owner.describeArtifactBinding()`, `owner.launchArtifactMission(request)` and
`owner.reconcileArtifactMission(request)` require workflow 3. The latter two call
the public issued facade and existing Realm/writer path without reacquiring the
workspace lock. The program source requires the issued owner, not a caller-built
object. The owner tracks in-flight calls; callback exit closes admission of new
calls, awaits already-owned calls, then invalidates/releases its capability/lock.
Every method rejects after scope close before provider work. No program adapter
calls `runLocalWorkflow` or bypasses the owner to call the lower internal runner.

The source's fixed descriptor is reverified before operations. Its reconcile calls
only the issued facade's reconcile; its execute calls only launch, for the same
resolved request. Completed accepted output is published by the workflow owner
before a program completion is returned. The completion binds actual artifact
digest/bytes and authenticated mission usage; startedAt is the resolution time,
completedAt is the observation after publication. The coordinator persists that
completion. A pre-commit interruption may observe a later completion time on
recovery; a committed predecessor always uses its coordinator-recorded completion.

Absent/pending map directly. Routing refusal or a rejected terminal result becomes
a typed program-level `needs-decision`, never completed success or permission for
the next step. Preserve the underlying evidence. No new generic coordinator
status or behavior is required: the owner maps a source refusal with its bound
step identity and reason. Re-running a fully completed program still verifies
current root/actor bindings, resolutions and published artifacts before returning
its saved aggregate, so generic completion cannot hide changed outside artifacts.

### D-7: interruption and publication

If accepted mission evidence exists but publication did not finish, reconcile
reuses the same writer and digest-named destination. Only after verified identical
publication can the program commit the step. Missing/altered required predecessor
evidence blocks descendants. Uncertain provider work remains pending. Preserve
normal lock aging and operator-owned forensic data. No remote exactly-once,
power-loss or hostile-same-user isolation claim.

### D-8: public operator path and evidence

Expose `prepareArtifactProgram` and `runArtifactProgram` beside the existing local
workflow, with additive CLI `program-prepare` and `program-run` commands. Preparation
requires the existing workflow pin plus a definition file; run requires the external
program-manifest pin. Running can execute new admitted steps, unlike single-mission
`reconcile`; document that distinction prominently. Do not imply a whole-program
no-new-inference method that the coordinator does not implement.

Acceptance requires a public-creator fresh agent, two controlled dependent missions,
correct carried evidence, one identity, exactly two physical calls, aggregate caps,
immutable root/first-step bytes, fresh-process replay, actual interrupted publication
and uncertain dispatch, and adverse predecessor/recipe/order/pin/alias/context tests.
Missing credentials, reflection, counterfeit issuers and budget violations remain
rejections. Existing commands and historical certifications must still verify.

## Delivery and exclusions

Dependency order: pure definition/resolution contracts and committed-step read;
shared authenticated workflow owner; artifact source plus operator program; integrated
public-creator/interruption/compatibility proof. Each slice is test-first and reviewed,
with one final full-suite/merged gate before release. No live calls are in these tests.
Then separately preregister a matched useful two-step comparison with equal baseline
history/durability/access and report usage, latency, recovery and answer quality.

No autonomous task invention, branching DAG scheduler, tool/credential expansion,
automatic summarization, model selection, Godskills bodies, identity evolution,
personal-keel writing, Soul, hosted civilization or Lunari integration. Keep this
profile additive; revert its new entrypoints without changing existing workspaces
if its data/recovery contract fails. The whole Godagents goal remains broader.
