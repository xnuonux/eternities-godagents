# Resumable mission and executed-review kernel v1

Date: 2026-08-31

Status: implementation design

## Purpose

Godagents currently binds Godskills before inference and records adaptive
`review` decisions as `scheduled-not-executed`. The vessel runtime can recover
one inference and one Realm action, while the Codex coordinator can recover one
transport turn. Neither boundary owns a durable provider-neutral mission whose
native artifact, later review, bounded revision, final verdict, and completion
survive process death without repeating a completed external call.

This milestone adds that missing operational spine. It is a separate runtime
boundary so historical vessel, Godskills, Codex, genesis, and Realm receipts
remain byte-stable.

## Non-negotiable invariants

1. Native output is durably committed before any review request exists.
2. A Godskills `review` activation remains body-free before native inference.
3. Every external phase is prepared in the journal before dispatch and is
   reconciled by exact request digest before any new dispatch.
4. A completed external phase is never dispatched again after recovery.
5. One mission permits at most one native dispatch, two review dispatches, and
   one revision dispatch.
6. Review findings are evidence, not authority. Native, review, and revision
   output cannot grant Realm effects, credentials, identity ownership,
   continuity admission, evolution, Soul, or personal-keel ownership.
7. The kernel never invokes a Realm hand. Its final receipt records
   `realmEffects: 0` and `authorityExpanded: false`.
8. Exact mission, Godskills, executor, request, result, artifact, usage, and
   journal identities are content-addressed and cross-verified.
9. Recovery performs no Godskills routing or adaptive activation decision.
10. All-rounder and unbound missions preserve a native-only path.

## Boundary and trust model

The kernel trusts a host-injected executor adapter only for terminal
reconciliation and dispatch deduplication. Every executor exposes:

- a closed descriptor identifying its phase and reconciliation protocol;
- `reconcile(request)`, returning exactly `absent`, `pending`, or a completed
  result for that request;
- `execute(request)`, which must atomically deduplicate by request digest and
  return the same completed result later through reconciliation.

The kernel independently verifies every echoed field, output digest, timing,
usage total, phase, and descriptor identity. A dishonest executor can still
lie about model behavior, timing, or usage. This version proves coordination
mechanics against trusted injected adapters, not hostile-provider isolation.

## Admission

One closed mission admission contains:

- a stable mission id and objective;
- explicit success evidence and stop conditions;
- one host-pinned authority-ceiling digest;
- per-phase and total completion-token ceilings;
- an optional exact Godskills cycle receipt and body-free cortex package.

When Godskills is present, the kernel verifies the cycle receipt schema,
request identity, package digest, activation decision coherence, and exact
deferred-review set. Every deferred review must map one-to-one to a selected
capability whose activation mode is `review`, preserve the certified entrypoint
and contract digests, and retain `scheduled-not-executed` until native output is
committed.

The kernel admits no inline skill body. A future Godskills review executor may
load exact reviewed artifacts only after it receives the post-native review
request.

## Phase state machine

The canonical path is:

```text
mission.admitted
  -> native.prepared
  -> native.committed
  -> native.accepted                       (no review scheduled)
  -> verdict.committed
  -> mission.completed
```

The reviewed path is:

```text
mission.admitted
  -> native.prepared
  -> native.committed
  -> review.bound
  -> review.prepared(round 1)
  -> review.committed(round 1)
       -> native.accepted                  (accept)
       -> verdict.committed                (reject)
       -> revision.prepared                (revise)
          -> revision.committed
          -> review.prepared(round 2)
          -> review.committed(round 2)
          -> verdict.committed
  -> mission.completed
```

Round two is terminal. A second `revise` recommendation becomes a rejected
verdict with reason `revision-budget-exhausted`; it cannot start another loop.

## Portable artifacts

The executor output families are closed objects:

- native: proposal text;
- review: exact subject digest, recommendation (`accept`, `revise`, or
  `reject`), stable findings, and summary;
- revision: exact native and review digests, revised text, and the sorted set
  of addressed required finding ids.

The kernel stores canonical artifact bytes under their SHA-256 identity before
committing the corresponding event. A phase result binds those exact bytes.
Journal events carry identities and bounded metadata, never duplicate artifact
bodies.

## Verdict policy

The verdict is deterministic mechanism, not a quality oracle:

- no review: accept the native artifact;
- review `accept`: accept the reviewed subject;
- review `reject`: reject the mission;
- first review `revise`: require one revision and one second review;
- second review `accept`: accept the revised artifact;
- second review `reject` or `revise`: reject.

A revision must address every required finding id from round one. This proves
contract completeness only. It does not prove that the prose or code actually
repairs a finding.

## Recovery

The journal is one append-only digest chain per mission id. Opening an existing
mission replays every event, re-verifies every referenced artifact, and
reconstructs the single next legal action. Exact terminal replay returns the
same receipt without consulting an executor.

For a prepared but uncommitted phase, recovery first calls `reconcile` with the
exact stored request. `completed` commits the original result, `pending` returns
without mutation, and `absent` allows one deduplicated dispatch. The kernel
does not infer absence from timeout, process death, missing local state, or a
new executor instance.

## Economic boundary

Every phase request reserves a completion-token ceiling. Every completed result
reports input, cached-input, reasoning, visible-output, and total completion
tokens. The kernel verifies arithmetic and enforces both the phase ceiling and
the mission-wide completion ceiling before committing a result or preparing a
later phase. Cached input is reported separately and is never counted as newly
consumed input by the kernel.

This creates a portable usage ledger. It does not prove provider billing,
prices, cache correctness, or wall-clock honesty.

## Acceptance requirements

- MRK-001: strict admission and executor contracts fail closed.
- MRK-002: native output is committed before review is bound or dispatched.
- MRK-003: no-review missions complete through the exact native artifact.
- MRK-004: accept, reject, revise-accept, revise-reject, and exhausted-revision
  paths produce deterministic verdicts.
- MRK-005: required findings must be addressed before post-revision review.
- MRK-006: crash recovery at every external-call publication window causes no
  duplicate completed dispatch.
- MRK-007: pending reconciliation performs no dispatch.
- MRK-008: exact terminal replay performs zero executor calls.
- MRK-009: changed mission, Godskills root, deferred set, executor descriptor,
  request, result, artifact, usage, or journal bytes fail closed.
- MRK-010: phase and total token budgets fail before further dispatch.
- MRK-011: output cannot mint authority, Realm, identity, continuity, keel,
  evolution, Inspiration, or Soul fields.
- MRK-012: historical receipts remain exact and the complete repository suite
  passes before release certification.

## Explicit proof limits

- no live model or provider qualification;
- no hostile executor isolation;
- no claim that review or revision improves quality;
- no automatic Godskills evaluator-package execution yet;
- no Realm action or compensation;
- no continuity-content admission or personal-keel write;
- no Codex desktop task integration;
- no delegation, daemon, cross-machine replication, Lunari, Inspiration, or
  Soul activation;
- no independent review while the user requires inline-only execution.
