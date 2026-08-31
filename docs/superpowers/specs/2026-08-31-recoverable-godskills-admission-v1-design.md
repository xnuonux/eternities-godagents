# Recoverable Godskills admission v1 design

## Status

- date: 2026-08-31
- parent release: `4247e09ad70d4e1d7c42318bb0a913d18915c47b`
- scope: provider-neutral crash recovery for pre-vessel Godskills routing and activation
- historical receipts remain immutable

## Problem

The identity-bound mission vessel publishes one immutable admission after the
Godskills adapter has routed the mission, classified the selected capability,
compiled adaptive activation, and built its cortex package. Once that admission
exists, reconstruction uses only `rehydrateMission` and performs no external
routing, classification, or activation call.

Before publication, however, the current adapter is one opaque `bindMission`
call. If the process dies after its routing or activation transport completes,
the next attempt repeats that external call. Deterministic request identities
make an idempotent remote service possible, but the local runtime neither
requires terminal lookup nor proves exact recovery. A changed retry can also
reach a different request identity because no pre-admission intent has yet been
published for the stable mission id.

## Decision

Add a recoverable Godskills admission adapter around the existing verified
Godskills adapter. It owns three durable layers:

1. one immutable binding intent per mission id, published before any external
   routing or activation work;
2. one route outbox and one activation outbox whose injected transports require
   terminal reconciliation and atomic deduplication by exact dispatch digest;
3. one immutable final binding record returned directly on exact replay.

The existing Godskills adapter remains the only authority for release
verification, eligibility, routing-result validation, classification-result
binding, adaptive activation validation, body disclosure, package compilation,
and rehydration. The new layer supplies recoverable transports and persistence;
it does not copy or replace policy.

## Constructor boundary

The adapter receives:

- an exact verified Godskills release pin;
- one routing transport and one activation transport;
- one local activation classifier;
- an admission root, clock, checkpoint hook, and lock policy;
- optional existing release-verifier I/O and artifact cache.

Each transport exposes `descriptor`, `reconcile`, and `execute`. Descriptors are
closed, credential-free, authority-empty, independently content-addressed, and
fixed to exactly one stage, `route` or `activation`. They declare terminal
reconciliation by dispatch digest, atomic deduplication, and dispatch and
completion byte ceilings.

Provider names, model ids, endpoints, credentials, retry policies, Realm hands,
continuity writers, identity ownership, evolution controls, and Soul state are
outside this constructor and every persisted or transported record.

## Stable binding intent

The binding slot is derived only from the protocol and mission request id. Its
intent record contains the complete credential-free input to `bindMission`, the
verified release digest, their digests, and its own record digest. It is
canonically published before the existing adapter begins.

An exact retry may continue. Any changed mission text, observation, genome
policy, host ceiling, requested authority, explicit method request, source
epoch, release, or mission identity collides with the same slot and fails before
transport use. Concurrent calls serialize through one per-binding lock.

## Recoverable external operations

The existing adapter invokes each outbox as an ordinary function transport. The
outbox derives a stable operation slot from stage and the stage request id,
builds one dispatch over the exact request, and publishes that dispatch before
external work.

For every call it then follows one sequence:

1. return a previously verified local completion if present;
2. reconcile the exact dispatch with the injected transport;
3. if completed, verify and canonically publish the completion;
4. if pending, return a typed pending projection without executing;
5. if absent, execute exactly once;
6. verify and publish the returned completion before exposing its result.

Ambiguous reconciliation, changed descriptors, request collisions, malformed
results, credential-shaped fields, authority expansion, invalid timestamps,
oversized dispatches or completions, and coherent rehash attacks fail closed.
The external transport, not the model, promises terminal lookup and atomic
deduplication. A process death after external completion but before local
publication is recovered by exact reconciliation without another external
execution.

## Classification and staged recovery

Classification remains a local host function and is intentionally not treated
as an external authority. If a process dies after route completion but before
activation completion, replay obtains the exact stored route result and may
recompute classification. The resulting activation request must match the
already published activation dispatch byte-for-byte. Drift collides with the
stable activation request id and fails before another external activation.

After the complete Godskills binding is produced, the adapter publishes one
final binding record tied to the binding intent. Exact `bindMission` replay
returns that verified record directly, so it performs no routing,
classification, or activation. It still uses the existing verified Godskills
rehydration path to validate the stored binding semantically, which may read a
selected method body. `rehydrateMission` uses that same path against the caller's
stored receipt and does not invoke either outbox.

## Pending behavior

An injected transport may report `pending` during reconciliation or execution.
The recoverable adapter converts that state into a closed result containing the
binding status `pending`, the stage, and the exact operation digest. The
identity-bound mission vessel returns this projection without publishing a
vessel admission or dispatching native cognition. Retrying the same request
continues through the same intent and operation records.

## Persistent records

All files are canonical JSON and publish exclusively beneath the configured
admission root:

```text
bindings/<mission-slot>/
  intent.json
  result.json
  binding.lock
operations/<stage>/<operation-slot>/
  dispatch.json
  completion.json
  operation.lock
```

The final binding record contains the exact existing adapter result, intent
digest, release digest, and record digest. It never contains transport
credentials or callable authority. Existing records are verified before use
and are never overwritten.

## Acceptance claims

| id | claim |
| --- | --- |
| `RGA-001` | one mission id publishes one immutable complete Godskills binding intent before external work |
| `RGA-002` | changed binding input or release collides and fails before any transport call |
| `RGA-003` | route and activation dispatches bind exact requests, stages, descriptors, ceilings, and empty authority |
| `RGA-004` | every possible external execution follows exact absent reconciliation |
| `RGA-005` | pending, completed, and ambiguous states cannot cause duplicate execution |
| `RGA-006` | route completion recovers across process death without rerouting |
| `RGA-007` | activation completion recovers across process death without reactivation |
| `RGA-008` | classification drift after an interrupted activation fails before external work |
| `RGA-009` | the final binding is canonically published once and exact replay performs no routing, classification, or activation |
| `RGA-010` | the actual pinned Godskills adapter still validates every recovered route and activation result |
| `RGA-011` | pending admission returns without vessel publication or native dispatch |
| `RGA-012` | credentials, provider routing, Realm, continuity, personal-keel, identity, evolution, Inspiration, and Soul authority remain absent |
| `RGA-013` | identity-bound vessel crash recovery completes from the same binding without duplicate external work |
| `RGA-014` | deterministic fixtures, full tests, append-only ledger, and release lineage remain release gates |

## Explicit non-goals

- no concrete OpenAI, Anthropic, local-model, Codex, Claude Code, or MCP
  transport;
- no credential resolution, provider selection, model selection, or retry
  policy;
- no claim that routing or activation output is high quality;
- no guarantee beyond the injected transport's exact terminal lookup and
  atomic-deduplication contract;
- no hostile same-user filesystem isolation;
- no Realm action, compensation, continuity admission, personal-keel write,
  Lunari integration, Inspiration, or Soul activation.

This phase closes duplicate external Godskills work before vessel publication.
It does not replace the later immutable vessel admission or weaken the existing
identity, mission, and transport boundaries.
