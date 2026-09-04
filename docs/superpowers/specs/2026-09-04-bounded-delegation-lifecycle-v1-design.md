# bounded delegation lifecycle v1

## purpose

Godagents already has an authority-empty temporary-worker envelope, but no
durable worker lifecycle. This boundary adds a small provider-neutral
coordinator so a lead can ask a bounded set of temporary workers for typed
observations without turning them into persistent agents or giving them the
lead's authority.

The boundary is additive and opt-in. It is a host mechanism, not a model
choice. Worker adapters are injected by the host and remain callable only in
memory. The durable side stores the exact assignment, dispatch identity,
typed result artifact, usage, and recovery evidence, never the adapter
function, credentials, provider response envelope, Realm handle, or keel.

## closed input

One delegation input contains only:

- a mission id, lead instance id, and source epoch;
- a bounded authority list drawn from `observe`, `propose`, and `analyze`;
- bounded provenance-labelled excerpts;
- one to three unique worker assignments, each with a worker id, role, and
  completion ceiling; and
- a total completion-token and result-byte ceiling.

The coordinator derives the delegation id from this canonical input. An
assignment is not an agent genome, identity, provider route, model setting,
credential reference, filesystem path, Realm contract, or continuity writer.
The existing temporary-worker envelope is the only worker-visible context.

## adapter boundary

The constructor receives one adapter for every admitted worker id. Each
adapter exposes a plain, authority-empty descriptor plus `reconcile` and
`execute` methods. The descriptor is snapshotted into the delegation
identity. `reconcile` returns only `absent`, `pending`, or a strict completed
result for the exact dispatch digest. `execute` may be called only after an
`absent` result and returns the same strict completed result or `pending`.

The coordinator does not interpret model output as an action. A completed
worker result is a bounded observation artifact with a summary,
recommendations, risks, separated usage, and canonical times. It contains no
callable, authority, effect, credential, identity, keel, memory, Realm, or
provider response field.

## durable lifecycle

Each delegation has one content-addressed journal:

`delegation.admitted -> worker.prepared* -> worker.committed* -> delegation.completed`

The journal is append-only, digest chained, bounded, and protected by the
existing file lock. Every worker dispatch is derived from the admitted input,
assignment, envelope, descriptor, and completion ceiling. A prepared worker is
reconciled before any execute call. A completed reconciliation publishes the
missing artifact and commit event without redispatch. A pending reconciliation
remains pending. A terminal delegation replays the exact aggregate without
adapter calls.

The aggregate is a digest-bound list of committed worker result references in
worker-id order. It is a report, not a constitutional decision, Realm action,
or authority grant.

The aggregate completion time is the durable time of the final worker commit,
so a process boundary before completion publication cannot create a second
aggregate identity from a new wall-clock value.

## trust and proof limits

The host rechecks the authority projection, maximum worker count, per-worker
and total ceilings, descriptor identity, dispatch identity, artifact digest,
usage, and journal chain on every read. It fails closed on unknown fields,
authority-shaped output, stale or changed input, malformed timestamps,
ambiguous reconciliation, oversized files, duplicate workers, path aliases,
or any attempt to serialize adapter internals.

This proves a deterministic local lifecycle over injected worker adapters. It
does not prove live model quality, provider equivalence, hostile process
isolation, remote exactly-once behavior, useful delegation policy, or a safe
Lunari integration.
