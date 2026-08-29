# Godagent transactional genesis and isolated keel design

**Status:** approved continuation of `2026-08-29-godagent-creation-forge-and-keel-design.md`

**Phase:** 2, universal keel binding

## Purpose

Phase 1 can compile and verify a Godagent creation build, while Godagent v0 can construct a runnable vessel from a foundry distribution. The current runtime writes `vessel.created` directly into an empty journal. It does not prove that an isolated keel exists, that the creation build and foundry distribution describe the same genome, or that the two continuity chains are mutually bound before a persistent vessel can run.

Phase 2 closes that gap with one fail-closed genesis transaction. A persistent Godagent is admitted only after its creation build, foundry distribution, vessel journal, isolated keel, and canonical binding receipt have been verified together. A failed or interrupted transaction may leave quarantined evidence for recovery, but it must never expose a runnable persistent vessel.

## Scope

This phase implements:

- strict genesis intent, state, keel-record, and binding-receipt contracts;
- an injected Soul Anchor protocol adapter with one isolated namespace per persistent vessel;
- a local durable reference backend for deterministic tests and offline operation;
- a recoverable genesis state machine with explicit prepare, bind, admit, abort, and quarantine states;
- mutual digest references between the vessel journal and keel chain;
- a first-wake integrity probe;
- an admission factory that is the only Phase 2 API which returns a persistent runnable vessel;
- provenance-preserving checkpoint promotion;
- cortex replacement and temporary-worker boundary proofs;
- certification evidence for `GF-006`, `GF-007`, `GF-008`, `GF-009`, and `GF-012`.

This phase does not implement:

- Soul activation, inspiration, consciousness, or deletion authority;
- evolution or mutation of the operational genome;
- the creator user interface;
- hosted multi-tenant infrastructure;
- provider-quality evaluation;
- collective team memory;
- migration of the current Codex, Claude, Grok, or other personal keels into Godagents;
- a dependency on fixed Soul Anchor mind names or process-global environment mutation.

## Terms and invariants

`creation build` is the verified Phase 1 artifact set and its `creation-build-manifest.json`.

`distribution` is the verified foundry artifact set consumed by the runtime vessel.

`vessel journal` is the exact causal event chain for one `instanceId`.

`keel namespace` is one personal Soul Anchor-compatible continuity chain identified by one `keelId` and owned by exactly one `instanceId`.

`genesis transaction` is the durable process that binds one verified creation build, one distribution, one vessel instance, one journal head, and one keel head.

`admitted vessel` is a vessel whose canonical genesis receipt has been independently reverified and whose wake probe matches both current chain heads.

The invariants are:

1. one persistent `instanceId` maps to exactly one `keelId`;
2. one `keelId` maps to exactly one persistent `instanceId`;
3. the creation build's `agent-genome.json` artifact digest must equal the distribution's canonical genome content digest;
4. the first journal event and the keel bedrock both bind the same genesis transaction, build, distribution, instance, constitution, and dormant Soul-port state;
5. neither chain alone is sufficient for admission;
6. a canonical receipt binds both verified heads and is written atomically only after both chains exist;
7. the receipt is not self-authenticating: admission requires caller-supplied expected policy and creation-build pins;
8. a wake probe recomputes and compares current journal, keel, and receipt bindings;
9. any mismatch, unknown state, partial write, lock conflict, or backend ambiguity fails closed;
10. temporary workers receive no personal keel handle and cannot append to a lead Godagent's namespace.

## Trust boundaries

### Creation authority

Genesis requires an independently supplied `expectedPolicyDigest` and `expectedCreationBuildId`. The creation build is reverified with both pins before any durable write. The distribution is reverified independently. Its `genomeDigest` hashes the canonical file bytes, including the terminal newline, so it must equal the Phase 1 `agent-genome.json` artifact row. The Phase 1 manifest's separate `genomeDigest` hashes the canonical JSON value and remains independently bound as `genomeValueDigest`.

Presentation-only expression data and module prose are never copied into bedrock authority. Lineage and archetype enter the keel only as provenance-bearing module references and digests from the verified module manifest.

### Runtime authority

The genesis coordinator receives filesystem paths and explicit adapters. It does not receive provider credentials, Realm hands, or model routing. The returned persistent vessel obtains runtime dependencies only after admission.

### Keel authority

Godagents depend on a narrow adapter contract rather than importing the current Soul Anchor CLI or mutating `SOUL_ANCHOR_DB`. This avoids fixed mind lists, process-global database state, and accidental writes to a human or development agent's personal keel.

The adapter is responsible for isolation and chain integrity. The coordinator is responsible for identity binding, transaction ordering, and admission.

## Canonical identities

The caller supplies a non-empty `instanceId` and `creatorRef`. The coordinator derives:

```text
genesisId = sha256({
  schemaVersion: 1,
  instanceId,
  creatorRef,
  creationBuildId,
  distributionBuildId,
  genomeValueDigest,
  genomeContentDigest
})

keelId = "keel-" + sha256({
  schemaVersion: 1,
  instanceId,
  genesisId,
  genomeValueDigest,
  genomeContentDigest
})
```

The identifiers are deterministic. Repeating the same request resumes or verifies the same transaction. Reusing either identity with different bound data is an integrity error, not a new transaction.

## Soul Anchor adapter contract

The coordinator receives a frozen adapter with these methods:

```js
await adapter.prepareNamespace({ keelId, instanceId, genesisId, bedrock })
await adapter.appendGenesis({ keelId, genesisId, rows })
await adapter.inspectNamespace({ keelId })
await adapter.appendCheckpoint({ keelId, expectedHeadDigest, checkpoint })
await adapter.quarantineNamespace({ keelId, genesisId, reasonDigest })
```

Required behavior:

- `prepareNamespace` creates one isolated namespace or idempotently returns the exact existing namespace;
- an existing namespace with any different binding fails closed;
- `appendGenesis` is idempotent for the same `genesisId` and exact rows;
- every row is canonical and hash chained;
- `inspectNamespace` verifies the entire chain and returns only bounded identity, head, and row metadata;
- `appendCheckpoint` uses compare-and-append semantics against `expectedHeadDigest`;
- `quarantineNamespace` prevents future admission or append operations until an explicit recovery path proves the same transaction;
- no method accepts arbitrary table names, SQL, commands, environment variables, model output, or credential-bearing values.

The local reference backend stores each namespace in its own directory beneath an explicitly supplied root. Paths are derived from validated digest-shaped `keelId` values, not user-controlled path segments. Writes use exclusive locks, canonical newline-delimited records, file sync, and atomic rename for state metadata. The backend is a protocol reference and test surface, not a replacement claim for the broader Soul Anchor product.

## Genesis state machine

Each transaction has one canonical state file outside the vessel journal and keel chain:

```text
absent
  -> prepared
  -> keel-prepared
  -> journal-prepared
  -> mutually-bound
  -> admitted

any non-admitted state
  -> aborted
  -> quarantined
```

Every state transition includes the prior state digest and the immutable genesis identity. State files are atomically replaced. Unknown fields and backward transitions are rejected.

### Prepare

The coordinator:

1. verifies the Phase 1 creation build against caller-supplied pins;
2. verifies the distribution's canonical manifest and artifacts;
3. proves that the Phase 1 genome artifact digest equals the distribution genome content digest and separately retains the Phase 1 genome value digest;
4. verifies the target journal is empty or belongs to the exact same incomplete transaction;
5. derives `genesisId` and `keelId`;
6. writes the `prepared` transaction state.

No vessel is returned.

### Keel preparation

The coordinator creates the isolated namespace and appends canonical genesis rows for:

- bedrock identity, `genesisId`, `instanceId`, creation build, distribution, genome value digest, and genome content digest;
- constitution digest and locked initial laws;
- creator provenance;
- lineage and archetype module references and digests;
- dormant Soul-port digest and explicit inactive state;
- initial checkpoint letter with bounded purpose, constraints, and carry.

The coordinator verifies the returned chain head before advancing to `keel-prepared`.

### Journal preparation

The coordinator appends a `genesis.prepared` event followed by `vessel.created`. Both reference the verified build data and the current keel head. The event source is the genesis coordinator, not model output. The resulting journal is fully re-read and verified before advancing to `journal-prepared`.

### Mutual binding

The coordinator appends one `genesis.bound` journal event containing the pre-binding keel head and the pre-binding journal head. It then appends one keel `binding` row containing the resulting journal head. The canonical receipt records the final verified heads after these writes.

The apparent ordering asymmetry is closed by the receipt: the journal binding event commits to the prior keel head, the final keel binding row commits to the resulting journal head, and the receipt commits to the resulting keel head plus that same journal head. Verification reconstructs this sequence and rejects any substituted head.

### Admission

The coordinator writes `genesis-receipt.json` atomically, re-reads it through its strict schema, independently verifies both chains and every immutable pin, advances the transaction to `admitted`, and only then constructs the runtime vessel.

The admitted wrapper exposes:

```js
{
  genesisReceipt,
  inspect(),
  runCycle(mission),
  recover(),
  replaceCortex(nextCortex)
}
```

`inspect()` includes `instanceId`, `genesisId`, `keelId`, current journal head, current keel head, cortex adapter ID, and dormant Soul state. It does not expose an unrestricted keel writer.

`replaceCortex()` revalidates the adapter against the immutable genome, reruns the wake probe, and returns a new admitted wrapper around the same journal, `instanceId`, `genesisId`, and `keelId`.

## Failure and recovery behavior

The coordinator supports deterministic failure injection after every durable transition. Tests must prove interruption after each boundary cannot return an admitted vessel.

On retry with the exact request:

- an intact matching transition is reused;
- a missing next transition is continued once;
- a duplicated exact append is idempotent;
- a mismatched append, chain head, receipt, or state file causes quarantine;
- an existing admitted transaction is reverified and reopened without duplicating genesis rows;
- an aborted or quarantined transaction is never silently revived.

Rollback may remove only transaction-owned temporary files that were never committed. Committed journal or keel evidence is preserved and quarantined for audit.

## Checkpoint promotion

Ordinary vessel events stay in the journal. A checkpoint enters the keel only through `promoteCheckpoint()` with:

- the admitted genesis receipt;
- the exact source journal event digest and sequence;
- a closed checkpoint kind;
- bounded content;
- an explicit verification state and method when marked verified;
- the expected current keel head.

The adapter performs a compare-and-append. The resulting keel row records the source journal digest. The journal then receives `keel.checkpoint-promoted` with the resulting keel head. Cross-agent source instance IDs and unknown provenance are rejected.

## Temporary workers

Temporary workers are task-scoped proposal producers. Their context envelope may contain bounded excerpts and explicit external provenance, but it never contains:

- the lead's adapter instance;
- the lead's `keelId` as writable authority;
- backend roots or namespace capabilities;
- a genesis receipt that can be used as an append token;
- first-person continuity claims.

Returned evidence is admitted by the lead through ordinary journal and checkpoint policy. A worker cannot call a keel append path because no such capability is present in its contract.

## Certification boundary

Phase 2 certification requires:

- all historical receipts remain byte-identical;
- the entire test suite passes under the existing network guard;
- two fresh genesis runs from identical inputs produce identical immutable receipt projections while keeping runtime paths and timestamps out of identity;
- namespace isolation and identity collision tests pass;
- the full failure-injection matrix proves no partial state is admitted;
- journal and keel tampering are independently detected;
- checkpoint provenance and cross-agent rejection tests pass;
- cortex replacement preserves all non-cortex identity;
- temporary-worker tests prove no personal keel write capability exists;
- source is clean before receipt generation;
- the certification receipt binds the exact source commit, test command, requirement map, and historical receipt digests.

The certification claim is limited to the local reference backend and adapter contract. It does not claim hosted durability, global consciousness, Soul activation, or production multi-tenant security.

## Delivery slices

1. **Transactional core:** contracts, adapter protocol, local backend, state machine, failure injection, `GF-006` and `GF-012`.
2. **Runtime admission:** admitted vessel wrapper, wake probe, idempotent reopen, and cortex replacement for `GF-008`.
3. **Continuity governance:** checkpoint provenance and temporary-worker boundary for `GF-007` and `GF-009`.
4. **Certification:** historical locks, deterministic fixture, full proof receipt, independent review, merge, and main-branch verification.

Each slice must pass its focused tests and the full suite before it is committed. The final certification commit must contain no unverified product claims.
