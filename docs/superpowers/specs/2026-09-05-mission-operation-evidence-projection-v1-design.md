# mission-operation evidence projection v1

## intent

The runtime now has several source-specific mission-operation adapters, but
their evidence remains split between a mission-program journal and each
adapter's receipt. This design adds one read-only join boundary for one
verified mission. It makes the relationship queryable without copying a
mission body, provider body, Realm payload, credential, or adapter source
closure.

This is an observability boundary, not a coordinator and not a new execution
path.

## boundary

`buildMissionOperationEvidenceProjection` accepts:

1. one already verified `mission-program-forensics-v1` projection; and
2. zero or more body-free entries containing one generic mission-operation
   description, dispatch, request, and receipt.

The function verifies every supplied operation description, request, dispatch,
and receipt with the existing mission-operation contract. It then joins each
entry to exactly one mission-program step by `programId`, `stepId`,
`stepIndex`, operation kind, and mission-step descriptor digest. The operation
source remains represented only by its descriptor digest. The returned value
contains digests, bounded metadata, authority projections, and the selected
mission-journal status. It never returns operation or source bodies.

Entries may be a strict subset of program steps because native or other
non-operation adapters can share a mission program. Each entry must still
match one and only one step. Duplicate step identities, unknown steps, or
descriptor drift fail closed.

## projection

The projection binds:

- the selected mission-program projection digest and selected journal head;
- the exact program id, step id, step index, and operation kind;
- the mission-step descriptor digest, source descriptor digest, request digest,
  dispatch digest, and operation receipt digest;
- the receipt disposition, completion digest, and source-evidence digest;
- the empty operation authority projection; and
- the step status from the verified mission-program prefix.

An operation receipt is optional only when the caller supplies no entry for a
step. A supplied entry must contain a completed, pending, or absent receipt.
The projection therefore distinguishes journal status from operation
disposition rather than collapsing them into a single inferred state. A read
through an earlier journal sequence cannot disclose a later committed step.

## trust and failure behavior

- Verify the whole input forensic projection before joining it.
- Verify every description, dispatch, request, and receipt through the existing
  generic contract and revalidate the receipt against the exact request and
  dispatch supplied in the entry.
- Require the operation authority projection to remain all zeroes.
- Screen every input and output for credential-shaped fields.
- Use canonical ordering by step index and a fixed output byte ceiling.
- Never call an adapter, provider, Realm, credential resolver, keel, memory
  writer, or filesystem path.
- Fail closed on program, step, descriptor, request, dispatch, receipt,
  disposition, authority, digest, sequence, or byte-ceiling drift.

## proof limits

The fixture proves a deterministic local join and rejection behavior only. It
does not certify an adapter implementation, a provider, a model, a live
receipt, external exactly-once behavior, recovery of a remote operation,
cross-program indexing, branch replay, time travel, scheduler behavior, Realm
authority, keel or memory writes, identity, evolution, Soul, Inspiration, or
Lunari integration.

## non-goals

- no new mission journal event;
- no changes to operation wire bytes;
- no automatic operation discovery or adapter calls;
- no cross-program database or hosted query service;
- no interpretation of source-specific result bodies;
- no default vessel or host adoption.
