# codex recoverable turn journal v1 design

## status

- parent protocol: `codex-bound-turn-v1`
- parent receipt: `receipts/codex-bound-turn-v1.json`
- scope: inert, host-side durable transaction evidence for recoverable Codex bound turns
- next integration: a coordinator that reconciles a trusted task transport against this journal

## problem

The phase-3 host proves one exact bound turn while its process remains alive. It does not durably record the transaction before and between reservation, binding, dispatch, response verification, lease closure, and final host acceptance.

An interruption can therefore leave the next process unable to distinguish:

- no reservation from a reservation whose receipt was not retained;
- no model dispatch from a dispatch whose response receipt was not retained;
- an undispatched orphan binding from a completed turn awaiting finalization;
- an exact retry from a changed request attempting to reuse an operation id.

Blindly repeating an uncertain external dispatch would duplicate cost and could break causal order. Treating a model echo as recovery evidence would let untrusted text manufacture host state.

## decision

Build one bounded, append-only, atomically replaced journal per logical turn transaction. The journal is inert: it never calls a model, reserves a task, acquires a binding, writes continuity, invokes a Realm hand, or chooses a Godskill. It only records and verifies host-generated evidence supplied by a later coordinator.

The transaction directory is derived from a canonical transaction id rather than caller-controlled path text. The root is host policy. Every mutation is serialized by a recoverable process lock and followed by a complete reread and semantic replay.

Large untrusted model output is stored separately as an exact content-addressed UTF-8 response blob. The journal stores only its byte count and digest. A terminal result is recoverable only when the response blob, transport receipt, binding lifecycle receipt, and host turn receipt all verify and cross-link.

## transaction identity

The opening identity contains only:

- operation and operation id;
- turn id;
- exact request digest;
- exact parent host-turn receipt digest or the zero digest;
- exact task-transport descriptor digest;
- cortex id;
- task reference for an existing task, or `null` until a create reservation is recorded.

The transaction id is the canonical digest of that identity. Reusing an operation id with different identity material is an integrity collision, never a new transaction.

No transcript, credential, filesystem path, model-selected identity, continuity body, Realm authority, or skill body enters the opening identity.

## event chain

Each event binds its sequence, previous digest, transaction id, event type, recorded time, and closed payload. The journal state binds the exact event array and current head digest.

The closed event vocabulary is:

1. `turn.opened`
2. `task.reserved`
3. `attempt.prepared`
4. `transport.completed`
5. `binding.closed`
6. `attempt.abandoned`
7. `task.cancelled`
8. `turn.accepted`
9. `turn.quarantined`

An existing-task transaction starts with its task in `turn.opened`. A create transaction receives its task only through one verified `task.reserved` receipt.

Attempts are ordinal. One attempt binds one active phase-2 binding receipt, one exact dispatch digest, one envelope digest, and the lease expiry. An undispatched attempt may close and become abandoned. Once a verified transport completion is recorded, that attempt can only close and become accepted or quarantined. It can never be silently abandoned and redispatched.

## response evidence

`transport.completed` requires:

- the exact phase-3 transport receipt;
- a host transport-execution witness binding the dispatch digest, transport receipt digest, response digest, response bytes, and trusted start/completion times;
- a response blob whose UTF-8 byte count and SHA-256 match both receipts;
- execution beginning and completing no later than the bound lease expiry.

The execution witness does not prove a current public Codex transport implements recovery. It defines the evidence a trusted future transport must supply.

## replay and idempotency

Every journal method is exact-idempotent. Repeating the same transition returns the existing event without appending. Repeating a transition with changed evidence fails closed.

Replay verifies:

- canonical JSON and bounded file size before parsing;
- state and event digests;
- sequence, previous digest, transaction id, and monotonic timestamps;
- exact payload keys and event ordering;
- task and actor consistency across receipts;
- binding, envelope, dispatch, transport, response, lifecycle, parent, and host receipt links;
- one terminal outcome;
- no acceptance without verified response bytes and a closed binding.

An incomplete atomic replacement is ignored only when the canonical destination remains intact. Corruption of the destination, response blob, or event chain fails closed.

## recovery projection

Inspection reconstructs a bounded projection containing:

- transaction identity and status;
- task when known;
- current attempt ordinal and evidence digests;
- whether a reservation, uncertain dispatch, verified transport result, closed binding, or terminal receipt exists;
- exact next legal host action;
- the terminal host receipt and response text only after complete verification.

The next-action vocabulary is closed: `reserve-task`, `prepare-attempt`, `reconcile-dispatch`, `close-binding`, `finalize-turn`, `none`, or `quarantine`.

## failure behavior

- operation-id collision fails before mutation;
- malformed, oversized, noncanonical, reordered, truncated, or digest-changed journal state fails closed;
- response blobs are published exclusively and an existing different blob is rejected;
- changed reservation, task, actor, dispatch, response, lifecycle, or host receipt evidence is rejected;
- a transport-completed attempt cannot be abandoned;
- an active or uncertain attempt cannot be replaced without a verified terminal lifecycle receipt;
- accepted, cancelled, and quarantined transactions are terminal;
- no journal evidence grants continuity admission, personal-keel write authority, Godskill activation, or Realm effects.

## proof limits

- no live Codex app task integration;
- no task transport reconciliation implementation;
- no automatic binding acquisition, renewal, expiry wait, release, or revocation;
- no external dispatch;
- no continuity-content admission;
- no Godskills activation;
- no Realm effect;
- no cross-machine journal replication;
- no hostile same-user operating-system isolation;
- no claim that atomic replacement alone survives every filesystem or hardware failure mode.

## acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `CBJ-001` | opening identity is deterministic and operation-id collisions fail closed | identity and collision tests |
| `CBJ-002` | create and existing-task transaction shapes replay to the same bounded projection after process-shaped reconstruction | restart tests |
| `CBJ-003` | every transition is exact-idempotent and changed evidence is rejected | duplicate and mutation matrix |
| `CBJ-004` | event order, sequence, previous digest, timestamps, state digest, canonical bytes, and size bounds are verified | corruption matrix |
| `CBJ-005` | uncertain dispatch is distinguishable from verified transport completion | next-action tests |
| `CBJ-006` | a completed transport cannot be abandoned or silently redispatched | negative transition tests |
| `CBJ-007` | response bytes are content-addressed, bounded, and independently reverified | blob mutation and overflow tests |
| `CBJ-008` | execution begins and completes under the exact active lease | temporal boundary tests |
| `CBJ-009` | final acceptance requires exact transport, lifecycle, response, parent, task, actor, and host-receipt links | semantic cross-link matrix |
| `CBJ-010` | terminal replay returns one exact host receipt and response without transcript replay | terminal recovery test |
| `CBJ-011` | credentials, paths, continuity bodies, skill bodies, and Realm authority are absent from trusted journal metadata | containment test |
| `CBJ-012` | deterministic fixture, source manifest, tests, and historical receipts are append-only certified | release receipt and ledger verification |

