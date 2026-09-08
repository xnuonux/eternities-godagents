# Authenticated no-new-inference reconciliation

## Context and decision

Source: `9da95750adb3e4c6466eeea363ff85ea9cbb10bb`. The
[multi-mission preflight](../../audits/2026-09-08-multi-mission-preflight.md)
demonstrates same-actor SDK reuse and exact prior-mission replay. It does not
provide an operator dependency pipeline. The next pipeline must use the existing
mission program and authenticated artifact owner, not bypass authentication or
invent another journal engine.

The current native-only facade exposes `launch`. The underlying kernel calls an
executor's `execute` when reconciliation reports `absent`. Consequently `launch`
is not a safe stand-in for inspection when a coordinator needs to determine
whether work may be started. This prerequisite adds a separate, explicitly issued
reconciliation operation that never initiates a new inference.

This is **reconciliation**, not read-only inspection: it may authenticate and
claim the existing local residency, prepare bounded local journal records,
reconcile provider evidence, commit already completed results, and publish an
already accepted artifact through the existing authorized writer. It grants no
authority and may not execute a new native, review or revision phase. No provider
refresh, HTTP dispatch or model subprocess may occur on the registered local
durable transport profiles used by this milestone.

Decision owner is Dom under the standing autonomous Godagents implementation
approval. No new provider expenditure or external side effect is approved.

## Alternatives

| Route | Benefit | Cost and rejection reason |
| --- | --- | --- |
| call `launch` and label it inspect | little code | can start inference after absent reconciliation; rejected |
| infer state from private files | avoids changing the facade | duplicates authentication and outbox rules; partial evidence can become false absence; rejected |
| separate no-execute drive through the existing kernel and facade | reuses authentication, receipts and recovery | requires explicit nonterminal status and issuer binding tests; selected |

The strongest counterargument is that this introduces another public method
before the dependent pipeline exists. The source audit shows an actual consumer
need: mission-program adapters reconcile before execute. Reconsider only if an
already issued equivalent port is discovered, not merely a lower-level private
reader or a generic transport reconciliation method.

## Requirements

- R-1: existing `run`/`launch`, workflow v1/v2/v3, receipts and wire inputs retain
  their behavior. Reconciliation mode is host-selected, never mission-provided.
- R-2: `createResumableMissionReviewKernel` gains `reconcile(input)`. It uses the
  same admission, descriptors, journal and driver as `run(input)`, but returns
  `absent` at a phase proven absent by the exact existing executor reconciliation
  rather than calling `executor.execute`. `pending` remains pending. Persisted
  results may be committed and terminal evidence completed without inference.
- R-3: absence means **no phase result or uncertain attempt according to the
  authenticated existing transport**, not that no local preparation file exists.
  Both absent and pending include the exact prepared request/phase reference.
  Missing, malformed, contradictory or tampered durable evidence must not be
  normalized into absence.
  The order is authenticate, materialize/verify the exact prepared request and
  dispatch, invoke the existing transport reconciliation, then classify its
  result. Journal absence alone cannot skip any of those steps.
- R-4: the public native-only facade gains `reconcile(input)` with the same
  accepted caller fields as `launch(input)`. It traverses the same policy,
  admission, residency, dependency, request and credential-safety checks.
  It does not call the internal execution function directly from a new adapter.
- R-5: reconciliation returns a separately branded wrapper with fields
  `schemaVersion: 1`,
  `protocolId: eternities-admitted-effect-only-reconciliation-v1`, `status`,
  `requestDigest`, `identityPolicyDigest`, and `result`. Status is exactly
  `absent`, `pending`, `completed`, or `needs-decision` (existing routing refusal).
  Digests derive from snapshotted authenticated inputs, not returned model data.
  `assertAdmittedEffectOnlyReconciliationResult(value, expectedBinding)` verifies
  the in-process issuer, exact bytes and expected request/policy digests. A copied,
  deserialized, edited or ordinary launch result is not an issued reconciliation.
  A completed nested result retains the existing terminal-result issuance check.
- R-6: the new host execution mode is accepted only for the explicit native-only
  policy v2. It narrows execution; it does not silently alter legacy v1 review
  semantics or accept a mode flag inside a mission/request/configuration body.
- R-7: `reconcileLocalWorkflow` and CLI `reconcile` initially require a protocol-3
  artifact workflow. They recheck the existing external manifest pin, all input
  pins, admission and Realm binding. They reuse the existing writer only for an
  authenticated already accepted result, with the same post-recovery Realm check.
  They never create a new identity, replace a prepared input or modify a trust pin.
- R-8: the CLI returns code 3 with `artifact: null` for absent, pending or
  needs-decision; code 0 only for accepted completed recovery; code 4 for verified
  rejection; codes 1/2 preserve runtime/argument failures. Absence must not be
  described as success or as permission independent of host authority.
- R-9: preserve provider evidence and historical receipts. Track actual executor,
  HTTP and model-process calls in controlled tests. No live call, model selection,
  credential lookup or spend renewal is part of implementation verification.
  Refresh/resolver tripwires must cover host construction as well as kernel drive;
  no `ensure...Ready` path may run merely to construct a reconciliation host.

## Ownership and failure behavior

The kernel owns phase preparation and state transitions. The authenticated
identity host owns policy, residency, admission and dependency verification. The
issued provider/portable host owns transport evidence and its existing
absent/pending/completed rules. The local workflow owns Realm checks and artifact
publication. The generic mission program remains unchanged and gains no effects.

A future step source must distinguish `needs-decision` or rejected completion
from accepted work; it cannot feed those outcomes to dependent stages. This
milestone supplies the prerequisite port, not dependency templates or a program
adapter. Never make a program's `completed` scheduling state stand for task
quality or accepted predecessor evidence.

Mode selection must be per invocation, not mutable shared state on a reused
kernel or facade. A normal launch after an absent reconciliation remains subject
to fresh reconciliation and all current pins. The absent wrapper is not a bypass
ticket. Concurrent normal launches still use the existing locks and durable
provider boundaries. Portable hosts remain trusted implementations; no hostile
in-process provider implementation is claimed to be sandboxed by this method.

## Proof and compatibility

Use controlled fresh admissions, including the operator Realm. Prove no new
dispatch before first launch, pending preservation, completed evidence recovery,
tamper rejection, per-call mode isolation, separate issuance and normal-launch
compatibility. Exercise both HTTP protocol families and the qualified Grok
subprocess shape with controlled data; do not reinterpret those tests as live
model qualification. Run focused checks during development and one full gate
before integration. Preserve source and log hashes, then merge the exact tested
code under standing approval and rerun focused merged checks.

Rollback is disabling the new entrypoints; old stored missions and their evidence
remain readable by the unchanged launch path. No historical identity migration,
receipt rewrite, Realm schema change, Godskills release upgrade, scheduler,
automatic retry, memory/keel write capability, evolution, Soul, hosted service or
Lunari integration belongs in this milestone.

## Ordered handoff

1. Prove kernel no-execute reconciliation while preserving existing run behavior.
2. Thread that fixed mode through the authenticated native-only host and issue
   correctly bound facade results.
3. Expose protocol-3 local workflow/CLI reconciliation, retaining Realm and writer
   ownership; independently review, verify and integrate.

Afterward, design the artifact-mission source adapter using immutable recipe and
backward-reference digests plus exclusive predecessor-resolution records. Live
quality comparison follows actual dependency-flow and recovery proof; this
prerequisite does not itself establish product completion or quality advantage.
