# Deferred Godskills review executor v1

Date: 2026-08-31

Status: implementation design

## Purpose

The mission review kernel can durably order and recover review phases, and the
deferred review materializer can open the exact selected Godskill bodies only
after native work is committed. Neither component sends that package to a
reviewing cortex or converts a verified review completion into the kernel's
phase-result contract.

This milestone adds that provider-neutral executor boundary. It composes the
certified materializer with one injected transport whose descriptor promises
terminal reconciliation by exact dispatch digest and atomic deduplication. The
executor exposes the kernel's existing `descriptor`, `reconcile`, and `execute`
surface and returns an ordinary verified mission phase result.

It does not select a provider, resolve credentials, improve model quality, or
grant authority.

## Recovery sequence

For every review attempt, including process reconstruction:

1. The kernel recovers the committed admission and subject artifacts from its
   journal.
2. The kernel passes the same closed review context to `reconcile` that it would
   pass to `execute`.
3. The executor materializes and verifies the exact deferred Godskills package.
4. The executor builds one content-addressed dispatch binding the package,
   request, executor descriptor, transport descriptor, and completion ceiling.
5. The transport reconciles that exact dispatch before any execution.
6. `pending` returns without dispatch. `completed` is verified and converted to
   one mission phase result. Only `absent` permits the kernel to call execute.
7. Execute sends the exact same dispatch and accepts only one closed completion
   bound to it.
8. The mission kernel remains the sole owner of durable phase commitment.

An in-process cache may avoid rebuilding the dispatch between an immediately
adjacent absent reconciliation and execute call. The cache is never trusted:
every retrieval is reverified, and reconstruction remains correct without it.

## Kernel context correction

The v1 kernel previously called `executor.reconcile(request)` without the
committed artifact context. That is sufficient for a fixture executor keyed
only by request digest, but insufficient for a real adapter that must prove the
same Godskills package on recovery.

Review reconciliation now receives `reconcile(request, context)`. Existing
executors remain compatible because JavaScript ignores unused arguments. The
review context adds the exact verified admission and retains its existing
body-free receipt and descriptor projections. The executor rejects unknown
context fields and requires those projections to equal the admission.

## Transport descriptor

The injected transport publishes one closed descriptor containing:

- protocol and schema version;
- a provider-neutral transport id;
- terminal reconciliation fixed to `by-dispatch-digest`;
- atomic deduplication fixed to true;
- one maximum canonical completion byte count;
- authority fixed to no expansion, no Realm effects, no continuity admission,
  no identity ownership, no evolution, no Soul, and no personal-keel write;
- a digest over the complete unsigned descriptor.

No endpoint, model name, credential, retry policy, or provider configuration is
accepted in the descriptor.

## Dispatch contract

One dispatch contains:

- protocol and schema version;
- request, executor-descriptor, materializer, transport-descriptor, package,
  and package digests;
- the exact completion-token ceiling;
- the complete verified materialized review package;
- the same empty authority projection;
- one digest over the complete unsigned dispatch.

The executor recomputes and verifies the package before every externally
observable transport operation. Changed admission, subject, prior review,
selected bodies, descriptor, transport identity, or package bytes therefore
changes or rejects the dispatch.

## Completion contract

One completed transport result contains:

- the exact dispatch, request, package, executor, and transport descriptor
  digests;
- one strict review artifact;
- separate input, cached-input, reasoning, visible-output, and completion token
  counts;
- canonical start and completion times;
- the empty authority projection;
- one completion digest.

The completion must fit the transport's declared canonical byte ceiling. Token
arithmetic and the admitted review completion ceiling are rechecked while
building the kernel phase result. A review artifact must bind the exact subject
digest already present in the request and materialized package.

## Invariants

1. A review package is verified before transport reconciliation or execution.
2. Reconciliation receives the same committed context as execution.
3. A dispatch is deterministic for one request, context, materializer, and
   transport descriptor.
4. Every execution is preceded by exact reconciliation under the mission
   kernel.
5. Pending and completed reconciliation never execute.
6. A completed response must bind every dispatch identity and fit both byte and
   token ceilings.
7. Unknown fields, authority-shaped content, provider configuration, changed
   descriptors, body drift, and ambiguous transport state fail closed.
8. Exact completed reconciliation and exact execute output produce the same
   mission phase result.
9. No transport response can mint Realm, continuity, identity, evolution,
   personal-keel, Inspiration, or Soul authority.
10. No review body is opened on native-only missions.

## Acceptance requirements

- DRE-001: kernel reconciliation receives exact committed review context.
- DRE-002: executor construction binds one verified release, materializer, and
  closed transport descriptor.
- DRE-003: exact dispatch bytes reproduce independently.
- DRE-004: reconciliation occurs before every possible transport execution.
- DRE-005: pending and completed reconciliation perform zero execution calls.
- DRE-006: exact completion becomes one valid mission review phase result.
- DRE-007: changed package, request, context, descriptor, and completion links
  fail closed.
- DRE-008: response bytes and separated token accounting remain bounded.
- DRE-009: provider, credential, authority, Realm, continuity, and personal-keel
  fields cannot enter trusted contracts.
- DRE-010: process reconstruction can recover a completed review without
  redispatch.
- DRE-011: complete mission review still closes through the existing journal,
  verdict, and completion receipt.
- DRE-012: historical receipts, focused integration tests, full tests, and
  deterministic rebuild remain release gates.

## Proof limits

- injected transport correctness is trusted at its declared reconciliation and
  atomic-deduplication boundary;
- no live provider or model qualification;
- no hostile same-user transport isolation;
- no review-quality improvement claim;
- no revision executor adapter;
- no default vessel, local CLI, or Codex desktop task integration;
- no provider credential or model-routing implementation;
- no Realm action, continuity admission, personal-keel write, evolution,
  Inspiration, Lunari, or Soul activation;
- no independent review while the user requires inline-only execution.
