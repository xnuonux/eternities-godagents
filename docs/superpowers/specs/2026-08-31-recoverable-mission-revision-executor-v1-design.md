# Recoverable mission revision executor v1

Date: 2026-08-31

Status: implementation design

## Purpose

The mission review kernel can durably order one revision after a `revise`
recommendation, and the certified deferred Godskills review executor can
produce and recover both review rounds. Revision execution is still supplied by
a scripted fixture. This milestone replaces that placeholder with one
provider-neutral, recoverable executor over the exact committed native artifact
and first review.

It does not reopen Godskill bodies. The first review is already the committed
translation of those methods into bounded findings. Revision receives only the
mission, native artifact, review artifact, required finding ids, and exact
request ceilings needed to repair the work.

## Kernel context correction

Revision reconciliation and execution must receive the same immutable committed
context. The existing context contains the native and first-review artifacts but
not the admission that binds the mission and budget. Revision context therefore
adds the complete verified admission. Existing fixture executors remain
compatible because unused context fields are ignored.

## Revision package

One deterministic materializer verifies:

- the complete admission and exact revision request;
- the revision executor descriptor and completion ceiling;
- request roles fixed to `native` and `review`;
- canonical native and review artifacts whose hashes equal those roles;
- a first review fixed to `revise` with at least one required finding;
- every artifact beneath the admitted byte ceiling;
- authority fixed to no expansion, Realm effects, continuity admission,
  personal-keel write, identity ownership, evolution, or Soul.

The package contains the admitted mission, admission and request identities,
executor identity, completion ceiling, exact native and review artifacts, and a
sorted compact list of required finding ids. It contains no provider, model,
endpoint, credential, retry policy, Godskill body, filesystem root, or authority
grant. The complete canonical package is byte-bounded and content-addressed.

## Transport and dispatch

The injected revision transport declares one closed descriptor with terminal
reconciliation and atomic deduplication by exact dispatch digest. Its dispatch
binds the request, executor, package materializer, transport descriptor,
complete package, token ceiling, and empty authority projection.

The executor reconstructs and verifies that same dispatch before reconciliation
and execution. `pending` waits. `completed` recovers. Only exact `absent`
permits one execution attempt. Ambiguous states fail closed.

## Completion

A completed transport result binds every dispatch identity, one strict revision
artifact, separated input and completion usage, canonical times, and empty
authority. Its canonical bytes must fit the transport ceiling.

The revision artifact must bind the exact native and review digests, address
every required finding, and name no finding absent from the committed review.
The completion digest becomes optional executor evidence in the ordinary
mission phase result. The mission journal remains the sole authority that
commits the revision and advances to final review.

## Recovery sequence

1. The kernel commits native output and the first `revise` review.
2. It prepares the revision request in the journal.
3. The revision executor materializes the exact package and reconciles its
   dispatch.
4. An absent dispatch executes once and returns one verified completion.
5. A simulated process interruption occurs before journal commitment.
6. A new kernel and revision executor recover the prepared request and committed
   context, reproduce the same dispatch, and reconcile the existing completion.
7. The journal commits that revision without redispatch.
8. The certified Godskills review executor reviews the exact revision in round
   two and the mission closes through its existing verdict and terminal receipt.

## Invariants

1. Revision cannot run before one committed native artifact and one committed
   `revise` review.
2. Reconciliation and execution receive the same immutable admission, native,
   and review context.
3. Package and dispatch bytes are deterministic under process reconstruction.
4. No Godskill body is opened for revision.
5. Only absent reconciliation permits execution.
6. Pending, completed, and ambiguous reconciliation never execute.
7. Completion binds the exact native and review artifacts and all required
   finding ids.
8. Unknown findings, missing required findings, authority fields, credentials,
   provider configuration, drift, and budget overflow fail closed.
9. A completed revision can be recovered after process interruption without
   redispatch.
10. Final review still uses the separately certified deferred Godskills review
    executor and exact revision artifact.

## Acceptance requirements

- RRE-001: revision reconciliation receives exact immutable admission and
  committed artifacts.
- RRE-002: package construction validates all request, artifact, finding, byte,
  token, and authority bindings.
- RRE-003: no Godskill body is opened during revision materialization.
- RRE-004: executor identity binds materializer and transport descriptors.
- RRE-005: dispatch bytes reproduce independently after reconstruction.
- RRE-006: every possible execution follows exact absent reconciliation.
- RRE-007: pending, completed, and ambiguous reconciliation perform zero
  execution calls.
- RRE-008: completion addresses every required and only known finding.
- RRE-009: changed package, request, context, descriptor, completion, usage,
  authority, and time fail closed.
- RRE-010: process reconstruction recovers completed revision without
  redispatch.
- RRE-011: final Godskills review and mission terminal receipt close the exact
  revised artifact.
- RRE-012: deterministic fixture, focused tests, full tests, historical receipt
  ledger, and release lineage remain gates.

## Proof limits

- injected transport terminal lookup and atomic deduplication remain trusted;
- no live model or provider qualification;
- no revision-quality improvement claim;
- no hostile same-user transport isolation;
- no generic native executor adapter;
- no default vessel, local CLI, or Codex desktop integration;
- no provider credential or model-routing implementation;
- no Realm action, continuity admission, personal-keel write, evolution,
  Inspiration, Lunari, or Soul activation;
- no independent review while the user requires inline-only execution.
