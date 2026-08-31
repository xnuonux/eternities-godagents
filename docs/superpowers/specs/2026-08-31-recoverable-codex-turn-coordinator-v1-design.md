# recoverable codex turn coordinator v1 design

## status

- parent protocols: cortex binding phases 1 through 3 and recoverable turn journal v1
- parent journal receipt: `receipts/codex-recoverable-turn-journal-v1.json`
- scope: recovery-first orchestration over one injected trusted task transport
- excluded: claiming that the current public Codex app task controls satisfy the transport contract

## problem

The phase-3 host proves a sealed turn in one live process. The recoverable journal proves inert durable evidence and legal transitions. Neither component yet coordinates external task reservation, binding acquisition, dispatch reconciliation, process-death recovery, lease closure, and final acceptance as one resumable operation.

A correct coordinator must never answer an uncertain dispatch by blindly running the model again. It must also handle a process dying after a verified model completion but before releasing its phase-2 writer lease. In that case the lease eventually expires rather than receiving an ordinary release receipt, even though the model execution began and completed while the lease was valid.

## decision

Build a provider-neutral coordinator with a stronger injected transport contract and no live Codex app claim.

The transport supplies:

- the existing strict phase-3 task-control descriptor;
- a recovery descriptor promising terminal reservation lookup by operation and terminal dispatch lookup by canonical dispatch digest;
- suspended create reservation;
- exact reservation reconciliation;
- exact dispatch reconciliation before any new dispatch;
- phase-3 transport receipts and journal-v1 execution witnesses.

`terminal reconciliation` means the transport does not report a prior operation as absent while it is running or durably completed. A live implementation may wait internally, but it may not expose an ambiguous state that causes the coordinator to redispatch.

The coordinator binds the task-control and recovery descriptors into one canonical transport-binding digest. That digest enters reservation, envelope, journal, and final receipt evidence.

## operation flow

### open

1. validate the phase-3 turn request and cortex id;
2. verify a parent phase-3 or recoverable host receipt for continue and compaction resume;
3. look up an existing operation-id journal and compare its stable request, parent, task, turn, operation, and cortex identity;
4. if the existing journal is terminal, return the verified durable result without transport discovery or use;
5. otherwise verify both transport descriptors and required methods, require the current combined digest to match any incomplete journal, and open a new exact transaction only when none exists.

### reserve create task

1. reconcile the exact reservation intent;
2. if reserved, record the returned receipt;
3. if absent, reserve once and record the receipt;
4. if already cancelled, record both linked receipts and stop;
5. never call reservation again after durable journal evidence exists.

### prepare binding attempt

1. acquire one phase-2 task and personal-keel writer lease;
2. recompile and verify the phase-1 candidate under that lease;
3. require parent actor identity to match for continuation;
4. build one phase-3 sealed envelope and dispatch over the combined transport-binding digest;
5. durably record the complete attempt before external dispatch.

### reconcile and dispatch

1. ask the trusted transport for terminal reconciliation of the exact dispatch;
2. if completed, verify and record response, transport receipt, and execution witness;
3. if absent and this process still owns the exact live binding handle, dispatch once and record completion;
4. if absent after process reconstruction, inspect the exact binding id;
5. if the orphan binding is active, fail retryably without dispatch;
6. after terminal binding expiry or release, record closure, abandon that undispatched attempt, and acquire a new ordinal;
7. never abandon an attempt with verified transport completion.

### close and finalize

If the current process retains the binding handle, release it and record the lifecycle receipt. After process reconstruction, inspect the exact registry record until it is terminal.

A completed transport may finalize after either:

- ordinary `released` closure; or
- process-death `expired` closure, only when the journal already proves execution began and completed before lease expiry.

Explicitly revoked bindings cannot finalize. They quarantine.

The coordinator issues a recoverable host receipt binding:

- all phase-3 task, actor, parent, reservation, binding, envelope, transport, cortex, response, and zero-authority fields;
- the journal transaction id and pre-acceptance head;
- the execution-witness digest;
- whether finalization followed reconstructed process state.

The journal records that receipt as its terminal accepted event. Exact retry then returns the same response and receipt without reservation, binding, or dispatch calls.

## registry recovery

The phase-2 registry gains a read-only exact-binding query. Query first records any lease expiry through the existing atomic registry mutation path, then returns either the public active receipt or terminal lifecycle receipt for the requested binding id. It exposes no lease credential and grants no mutation authority.

## failure behavior

- changed request, task, parent, descriptor, actor, candidate, binding, envelope, response, or receipt evidence fails closed;
- operation-id collision fails before transport use;
- reservation reconciliation is always consulted before reservation;
- dispatch reconciliation is always consulted before dispatch;
- orphan active bindings produce a retryable pending error, not a second dispatch;
- absent orphan dispatch plus terminal binding closure produces an explicit abandoned attempt before rebinding;
- completed transport plus expired binding may finalize only from an execution witness already proven inside the lease;
- revoked completed attempts quarantine;
- transport ambiguity or unsupported recovery capability fails without dispatch;
- model text cannot influence identity, receipt fields, continuity admission, Godskills, or Realm authority.

## proof limits

- deterministic injected transport only, no live Codex app adapter;
- terminal reconciliation does not itself serialize two callers that both observe absence; a trusted adapter must atomically deduplicate reservation and dispatch claims by their canonical keys;
- no provider credential handling;
- no task migration to another task id;
- no continuity-content admission or personal-keel write;
- no Godskills activation;
- no Realm effect;
- no background polling service;
- no cross-machine registry or journal replication;
- no hostile same-user operating-system isolation;
- no model quality claim;
- no independent review while the user requires inline-only work.

## acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `CRC-001` | create reconciliation precedes and deduplicates reservation | ordered transport fixture and crash retry |
| `CRC-002` | dispatch reconciliation precedes every new dispatch | ordered transport fixture |
| `CRC-003` | exact retry after accepted journal state makes zero external calls | terminal replay test |
| `CRC-004` | crash after reservation resumes without a second task | checkpoint matrix |
| `CRC-005` | crash before attempt publication causes no dispatch and eventually rebinds after expiry | checkpoint matrix |
| `CRC-006` | crash after attempt publication but before dispatch abandons only after absent reconciliation and terminal lease | checkpoint matrix |
| `CRC-007` | crash after durable transport completion finalizes from an expired lease without redispatch | checkpoint matrix |
| `CRC-008` | crash after binding closure or acceptance returns one exact receipt and response | checkpoint matrix |
| `CRC-009` | parent actor survives create, continue, compaction resume, and cortex replacement | integration fixture |
| `CRC-010` | revoked, changed, ambiguous, and forged evidence fail closed | adversarial matrix |
| `CRC-011` | model output cannot manufacture continuity, skill, Realm, or receipt authority | malicious response test |
| `CRC-012` | source, deterministic fixture, tests, historical receipts, and release lineage are append-only certified | release receipt and ledger verification |
