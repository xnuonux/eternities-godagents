# Effect-only vessel migration decision

Status: independently reviewed implementation boundary; runtime integration
and certification remain incomplete.
Evidence inspected at Godagents `b767bdb` on 2026-09-07. This is a continuation of
`mission-intent-ingress-audit.md`, not a new definition of product completion.

## Verified boundary

- `identity-bound-mission-vessel-contracts.mjs:174` accepts only v1 requests.
- Its `verifyRouteBinding` requires a `godskills-cycle-receipt` and cortex package
  even for no-qualified-route; the effect-only compiler/route pair is neither.
- `identity-bound-mission-vessel.mjs` binds/replays those objects before creating
  a native executor and opening the existing mission review journal/kernel.
- `identity-bound-native-transport.mjs` accepts a verified candidate and a
  vessel admission digest, rather than requiring the v1 admission schema.
- `sealed-local-identity-bound-mission-vessel.mjs` constructs the v1 recoverable
  adapter, including a separate activation process.
- `identity-policy.mjs` still requires the v1 routing pin and classifier even
  for the partially implemented v2 producer policy.
- Effect-only source capture, isolated materialization and one real subprocess
  vector are verified, but no v2 mission dispatch or recovery exists yet.

## Decision and alternatives

| Option | Compatibility | Trust/evidence fidelity | Maintenance |
| --- | --- | --- | --- |
| Rebrand the effect-only result as a v1 cycle | Superficially easy | Falsifies the receipt contract and loses its origin | Rejected |
| Widen every v1 adapter/schema in place | Broad regression surface | Can be correct, but requires all old and new combinations | Premature for this migration |
| Explicit v2 admission boundary reusing existing execution primitives | Leaves v1 wire/receipts unchanged | Retains exact effect evidence and host identity binding | Selected provisionally; avoid duplicating the mission kernel |

The v2 boundary owns its request, routing execution record, admission and
completion envelopes. It reuses the verified cortex candidate, identity-bound
native transport, native executor, mission admission, journal and resumable
kernel. It must not create a second model client, memory system, tool authority
system, or copy Godskills decision logic. The actual frozen consumer remains the
effect interpreter.

Strongest counterargument: another vessel facade can duplicate orchestration.
Reconsider if implementation requires copying the mission kernel or the entire
v1 admission state machine. Extract a genuinely shared primitive only when both
callers and unchanged v1 regression tests justify it. No generic framework first.

## Invariants and acceptance evidence

R1. Host ingress uses externally verified policy/manifest and producer pin.
Explicit method requests conflict with effect-only mode and must fail before
routing, not disappear. A regression reproduced that omission; the producer now
rejects it in both preparation and verification.

R2. V2 admission retains the full request digest, verified candidate digest,
policy digest, routing request digest, executable receipt pin, exact returned
compiler/route pair and result digest. The host-only binding is never sent to
Godskills or substituted for origin authentication.

R3. Intent and authority remain separate. Known permitted local effects may
reach native execution with no skill package. Denied, unknown or conflicting
effects cause zero native/model inference and zero Realm effect dispatch. A
bounded routing subprocess may run to determine needs-decision; do not confuse
that with native execution.

R4. Persist the source-bound routing execution intent before launching the
subprocess under a per-mission lock. Preserve exact result evidence before
admission. Recovery of committed completion never reruns routing or inference.
An incomplete execution record is uncertainty, not an instruction to retry.
Reconcile an existing bounded result against its original snapshot/inputs;
otherwise return an explicit unresolved/pending result.

R5. A result hash is not semantic verification. The recovery verifier must use
the pinned consumer contract against the original input/result without issuing
a new route decision or provider call. Keep that contract in Godskills; do not
implement a second routing algorithm in Godagents. Any needed verification-only
CLI interface requires a separately reviewed executable receipt migration.

R6. Before native execution, create the ordinary mission admission with the
derived authority ceiling and no Godskills package. Bind its digest to the v2
outer admission, then reuse the existing kernel and identity transport. Recovery
must reconstruct those same inputs from authenticated current policy/candidate
and the stored exact request; changed policy, identity, observation, assessment,
source epoch, routing pin or result rejects recovery.

R7. The effect-only path is an explicit structured operation, not a replacement
for all-rounder/specialist skill selection. No release claims, live pin adoption,
paid provider use, Soul activation or Lunari integration follow from these tests.

## Ordered implementation handoff

1. Settle verification-only recovery access with the Godskills owner. Current
   CLI emits a new decision; its pure verifier exists but is not an exposed
   isolated recovery command. Preserve the frozen root until a replacement is
   reviewed, and never silently execute a new host-written wrapper as if pinned.
2. Implement the bounded v2 routing execution/reconciliation record and its
   source/host binding. Test output-exists, interrupted publication, invalid
   result, changed request and concurrent recovery. No native transport yet.
3. Implement the v2 outer admission/completion contracts and factory using the
   existing mission kernel. Test one native call on success, zero extra on
   recovery, and zero calls on denied/rebound intent.
4. Wire the versioned host policy and existing authenticated artifact-workflow
   ingress. Preserve v1 schemas, receipts and default paths. Run integrated
   independent review and release gates before merging.
5. Conduct the separately bounded fresh matched real-task evaluation, including
   routing/verification overhead. Passing structural checks is not this result.

Rollback is to keep v2 unadopted while preserving its evidence. Do not delete or
rewrite a historical receipt to switch dependencies.

## Review and interface settlement

Independent reviewer Gibbs (`01a07e01-fc77-70e1-bd91-d698b101bebe`) approved
the explicit v2 boundary provisionally, confirming that the existing identity
transport/kernel solve execution mechanics but not v2 admission semantics.
Its conditions are the R1-R7 identity/authority/recovery invariants, independently
reviewed admission/completion contracts, and unchanged v1 behavior. This is not
implementation or release certification.

The Godskills owner and coordinator agreed a separate
`scripts/verify-effect-only-v2.mjs` and sidecar
`receipts/effect-only-verifier-v2.json`, protocol
`eternities-godskills-effect-only-verifier-v2`. It binds the frozen routing receipt
and identical shared dependency hashes, without modifying the old executable.
Both roots must be pinned in the host admission. Implementation/review/issuance
of that sidecar remains pending.

The interface requires unique `--request`, `--expected-source`, `--result` flags,
bounded UTF-8 regular files (1 MiB request/source, 2 MiB result), empty stdout,
fixed redacted errors, no writes and no retries. Exit zero means exact stored-pair
consistency, including a valid needs-decision pair; it never grants authority.
Pure deterministic recomputation during verification is permitted. Count
verification subprocesses separately from new routing operations, native
inferences and effect dispatches.

`verifyEffectOnlyRoutingProjection` now reconstructs the host-side package from
fresh authenticated inputs and compares the whole stored projection. A new
red-to-green test rejects rehashed altered candidate/policy/request/routing
bindings, changed host policy and changed routing context. This does not verify
the Godskills result or replace the sidecar. The focused producer/projection/
source-capture test set passes 36 tests with no failures or skips.

## Single-attempt execution claim checkpoint

`src/skills/effect-only-execution-claim.mjs` adds the pre-launch primitive for the
next journal. The host supplies a stable per-mission slot in its own canonical
directory, plus host-binding, request, routing-root and verifier-root digests.
Only exclusive creation followed by a synced file write returns `claimed`.
An identical existing record returns `pending`; a partial, changed or malformed
record fails closed. Neither path deletes or rewrites evidence. This is not
authorization, a complete journal, or a power-loss durability guarantee for the
parent directory. No subprocess is launched by this primitive.

Four tests failed before implementation and now pass: first versus repeated
claim, preserved interrupted bytes, changed binding, and concurrent claimers.
The combined focused set passes 40 tests. Independent reviewer Schrodinger
(`01a07e07-82b9-7462-a3cb-8757e791f030`) reran the four tests and approved this
primitive for integration, with the same authorization/recovery/durability limits.

This deliberately does not copy the v1 process transport's `execute` behavior:
that method can continue to `runNode` when an earlier start record exists but
completion materialization returns nothing. V2 requires reconciliation instead.
The v1 transport is not modified or recertified by this checkpoint.

## Routing journal implementation checkpoint

`createEffectOnlyRoutingJournal` now owns a stable hashed slot, per-slot lock,
exact immutable input publication, single-attempt execution claim, candidate
result reconciliation and verified completion publication. Source and result
files are bounded; partial/changed records are preserved rather than replaced.
Recovery verifies saved results again but never receives a fresh routing claim.
An exception observing routing returns pending even if a result was left behind;
the next call may verify that result without routing again. A valid
needs-decision result remains needs-decision, never native admission.

The internal journal takes trusted host route/verify callbacks. The next
production factory must bind those callbacks to the independently pinned,
captured route and verification executables and authenticate host inputs. The
journal alone is not an authority boundary and is not yet connected to a vessel.

Ten focused tests cover normal recovery, start without result, lost transport
observation, needs-decision recovery, changed input/result, malformed-result
redaction, preservation of a changed completion record, orphaned-result rejection,
exact result-byte binding and BOM insertion. These use controlled
callbacks only at the subprocess boundary. They prove journal behavior, not
Godskills semantics or native task quality. The combined focused set passes 53
tests. Halley (`01a07e13-129d-7001-b62d-b0c81413f2d2`) approved the frozen
internal component after the orphan-result and exact-byte regressions were fixed.
Result publication belongs to the trusted adapter; the frozen CLI publishes
exclusively. Host-exclusive filesystem ownership is required. No protection
against same-user path replacement or power-loss exactly-once execution is
claimed, and parent-directory fsync is not established. No main merge or live
policy adoption follows from this component review.

## Pinned process adapters and journal interoperability

`createEffectOnlyProcessAdapters` now requires paired branded routing and sidecar
captures, materializes both snapshots, and supplies the journal's route/verify
callbacks. Each callback serializes bounded input files in a fresh host-owned
directory and runs only its pinned Node entrypoint with a stripped environment,
no shell, hidden window and ignored stdout/stderr. A routing result must target
the operation's `result.json`. Timeouts do not cause retries. Process counters
currently count dispatch attempts; launch errors are not proof of zero work.

The adapter test uses synthetic executable fixtures to isolate transport behavior
and the real journal to establish one route and two verifications across first
execution/recovery. It also checks forged results, unbranded sidecars, output
path escape, input size and timeout behavior. The focused set passes 55 tests.

The separate `scripts/evaluation/effect-only-journal-smoke.mjs` runs the actual
frozen Godskills route and verifier against their pinned golden vector. The
first result and recovered result were identical: one routing subprocess,
two verification subprocesses and zero native inferences. Report:
`D:\00-INDEX\operations\2026-09-07-effect-only-snapshot-smoke\journal-smoke-e7Jwwo\journal-smoke-report.json`.
Completion digest: `ea55c81d39c48d0bae542a5e3e615482a8eca84d7050f4cf6e4e05818a459031`.
This offline host-binding marker is explicitly not an authenticated agent
admission. Rebuilding the adapters and journal against the persisted slot also
recovers with zero routing attempts and one verification attempt. Kepler
(`01a07e1a-038e-76a3-8c13-9e1271fa7738`) approved the internal integration after
reviewing this persistence evidence and the pinned-code constraints. The
Godskills owner independently checked the saved completion and golden result.

The frozen routing CLI bounds result bytes before publication; ignored stdout
and stderr do not accumulate captured output. Timeout handling kills the direct
child and is scoped to these pinned non-spawning modules, not arbitrary process
trees. Input/evidence directories remain retained intentionally, with no
automatic deletion. Filesystem safety still requires host-exclusive directories.
The v2 vessel and policy wiring are still required before the live, matched
native-task comparison.
