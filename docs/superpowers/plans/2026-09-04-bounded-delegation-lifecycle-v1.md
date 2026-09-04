# bounded delegation lifecycle v1 implementation plan

## bounded milestone

Turn the existing authority-empty temporary-worker envelope into one opt-in,
durable, provider-neutral delegation coordinator. The coordinator may admit at
most three independent workers, dispatch each worker at most once for an exact
dispatch identity, collect typed observation results, and publish one bounded
aggregate. It must not become a Realm executor, identity owner, keel writer,
credential holder, nested-agent runtime, or default-vessel path.

## implementation sequence

1. Add red tests for strict admission, worker descriptor binding, successful
   two-worker aggregation, result and completion ceilings, terminal replay,
   pending reconciliation, crash recovery after worker completion, tamper
   rejection, authority containment, and bounded inspection.
2. Add strict schemas for the coordinator input, worker dispatch, worker
   result, journal event, journal state, and completion receipt, then register
   them with the schema validator.
3. Implement the smallest durable coordinator on top of canonical JSON,
   SHA-256 identities, exclusive artifact publication, and the existing file
   lock. Keep adapters constructor-owned and keep all durable records free of
   functions, credentials, paths, Realm handles, identity payloads, and keel
   material.
4. Add a deterministic three-worker fixture and a source-bound certification
   receipt only after focused, relevant regression, and complete suites pass.
5. Review the final diff and receipt, verify the certification ledger and
   release lineage, then integrate the clean branch.

## acceptance tests

- one valid delegation admits no more than three workers and returns a
  deterministic aggregate sorted by worker identity;
- each worker envelope is limited to `observe`, `propose`, and `analyze`, and
  the coordinator rejects Realm, credential, identity, evolution, Soul, keel,
  nested-delegation, path, function, and provider-shaped fields before adapter
  calls;
- every dispatch binds the exact coordinator input, worker assignment,
  authority projection, descriptor, and completion ceiling;
- an adapter completion is published once, terminal replay performs no adapter
  call, and a completed reconciliation after interruption does not redispatch;
- a process boundary before aggregate publication recovers the same aggregate
  identity from the durable worker-commit evidence;
- a pending reconciliation remains pending and never guesses that a worker
  completed;
- changed input, descriptor, dispatch, worker result, artifact bytes, journal
  chain, event order, usage, or aggregate digest fails closed;
- per-worker and delegation-wide result and completion ceilings are enforced;
- inspection exposes only bounded lifecycle and digest metadata, never worker
  body content or adapter internals; and
- the default vessel, portable SDK, Realm boundary, Godskills release,
  identity, continuity, and historical receipts remain unchanged.

## explicit non-goals

- no live provider, Codex, Claude Code, MCP, or local-model adapter;
- no child-process spawning, sandbox claim, nested delegation, quorum,
  consensus, scheduler, retry, or cross-machine replication;
- no Realm hand, credential, identity mutation, constitution mutation,
  evolution, personal-keel write, memory admission, Soul, Inspiration,
  Lunari, or phenomenological-core behavior; and
- no claim of multi-agent quality, model equivalence, product readiness, or
  exactly-once execution beyond the injected adapter reconciliation contract.
