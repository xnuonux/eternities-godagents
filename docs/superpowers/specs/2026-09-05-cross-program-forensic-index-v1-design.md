# cross-program forensic index v1

## purpose

Add one provider-neutral, read-only index over independently verified
mission-program forensic projections and mission-operation evidence projections.
The index is a queryable evidence boundary, not a new journal and not a live
effect oracle.

## input boundary

The builder accepts a bounded list of program records. Each record contains:

- one verified mission-program forensic projection;
- one verified mission-operation evidence projection for the same program and
  selected journal prefix;
- digest-only source receipt bindings that exactly match every projected
  operation receipt;
- one lifecycle status and optional digest-only evidence for recovered or
  failed states.

The builder rejects duplicate program ids, mismatched heads or prefixes,
operation projection drift, incomplete or drifting receipt bindings,
credential-shaped fields, non-empty authority, and output above its byte
ceiling.

## output boundary

The canonical output sorts programs by program id and operations by step index.
It contains only program and prefix digests, bounded status values, operation
digests, digest-only source receipt bindings, and the empty authority ceiling.
It never copies descriptions, requests, dispatch bodies, completion bodies,
artifacts, provider output, credentials, or journal payloads.

Lifecycle status is `absent`, `admitted`, `pending`, `completed`, `recovered`,
or `failed`. The first four must agree with the verified forensic projection;
the latter two require a caller-supplied evidence digest and remain an
evidence assertion, not a live recovery or failure certification.

## non-goals

This boundary does not write state, call adapters or providers, join journal
chains, perform cross-program causality inference, schedule work, replay a
branch, authorize effects, inspect credentials, alter keel or memory, or
integrate Lunari, Soul, Inspiration, identity, or evolution.
