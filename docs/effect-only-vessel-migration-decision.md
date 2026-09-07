# Effect-only vessel migration decision

Status: proposed implementation boundary, pending independent architecture review.
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
rewrite a historical receipt to switch dependencies. Recovery contract review is
the immediate unresolved dependency, not a reason to expand product scope.
