# delegation mission-operation adapter v1

## intent

bind the already-certified bounded delegation lifecycle to one exact
mission-program step without duplicating its journal, worker reconciliation, or
authority policy. the adapter is an opt-in provider-neutral migration
boundary. it does not turn temporary workers into persistent Godagents.

## source contract

the source is one authenticated bounded-delegation coordinator plus one frozen
delegation input. the coordinator exposes a read-only content-addressed
description of that input and its current worker descriptor set. the adapter
pins that description before constructing the generic operation description.

the source descriptor contains only:

- the source protocol, kind, and version;
- the derived delegation id and input digest;
- the exact authority-envelope digest and worker-set digest;
- worker identities and count; and
- the delegation completion and result ceilings.

it contains no excerpts, worker output, adapter functions, credentials,
provider route, Realm handle, keel, memory, identity, evolution, or durable
state.

## binding rules

1. the frozen delegation input must be canonical, credential-free, and bound
   to the mission-program dispatch input digest;
2. the mission-program completion and result ceilings must equal the bounded
   delegation budget, so the adapter cannot run a wider operation than the
   mission step admits;
3. the source descriptor must be reconstructed and equal before every source
   reconcile or execute call;
4. reconcile maps an absent journal to `absent`, an admitted or incomplete
   journal to `pending`, and a completed journal to one compact projection;
5. execute calls the bounded delegation coordinator only after the generic
   adapter has observed `absent`; a pending delegation stays pending;
6. a completed delegation projects only the delegation id, aggregate digest,
   ordered worker identities, aggregate usage, and adapter-owned timestamps;
7. terminal mission-program replay must not call a worker adapter or create a
   second delegation aggregate; and
8. any source drift, input or ceiling mismatch, malformed projection,
   authority-shaped field, or unsupported result fails closed.

## ownership boundaries

the bounded delegation coordinator owns admission, worker descriptors,
temporary-worker envelopes, journal, locks, artifacts, reconciliation,
worker dispatch, aggregate construction, recovery, and terminal replay.

the mission-program coordinator owns step ordering, mission journal writes,
step completion, terminal replay, and phase recovery. the generic
mission-operation adapter owns only the source-to-step binding and compact
projection. the host owns the delegation input, worker adapters, Realm and
continuity authority, credentials, provider selection, and any later product
integration.

## acceptance matrix

| id | acceptance condition |
| --- | --- |
| DMA-001 | one exact bounded delegation description binds the source descriptor and input digest |
| DMA-002 | the generic mission request remains body-free and its ceilings equal the delegation budget |
| DMA-003 | source descriptor, delegation identity, worker set, and authority-envelope digest cannot drift |
| DMA-004 | reconcile precedes coordinator execution and maps absent, pending, and completed states exactly |
| DMA-005 | completed delegation projection is compact, ordered, digest-bound, and usage-preserving |
| DMA-006 | coordinator recovery after worker execution does not redispatch the completed worker |
| DMA-007 | mission-program terminal replay makes no coordinator worker calls and preserves the aggregate |
| DMA-008 | credentials, output bodies, Realm effects, continuity writes, identity mutation, evolution, Soul, provider, and scheduler surfaces remain absent |

## proof limits

this boundary does not certify worker or model quality, child-process
isolation, remote exactly-once execution, quorum, scheduling, nested
delegation, persistent-agent creation, host adoption, Realm consequences,
keel or memory ownership, evolution, Inspiration, Soul, Lunari, or a default
mission launch path.
