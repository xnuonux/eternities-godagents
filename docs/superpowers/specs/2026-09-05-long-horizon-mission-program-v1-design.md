# long-horizon mission program v1 design

## intent

Godagents already has several durable one-operation boundaries: the persistent
vessel runs one mission cycle, the mission review kernel runs one bounded
mission, and bounded delegation runs one bounded worker aggregate. This design
adds the smallest missing universal spine: a durable, provider-neutral program
that sequences already-owned operations without becoming a second vessel or
granting authority.

The program is an orchestration boundary. The actor, constitution, Godskills
release, Realm Contract, keel, memory, model, and host remain owned by their
existing boundaries. A program can request a step through an explicitly
descriptor-bound adapter, but it cannot manufacture identity, authority,
credentials, Realm effects, continuity writes, evolution, Soul, Inspiration,
or Lunari behavior.

## boundary and vocabulary

- **program**: one immutable actor-bound ordered plan with up to eight steps;
- **step**: one bounded operation identified by a stable step id, kind, input
  digest, completion ceiling, and adapter descriptor digest;
- **adapter**: a trusted host-side port exposing `descriptor()`,
  `reconcile(dispatch)`, and `execute(dispatch)` for exactly one step kind;
- **dispatch**: the only data the coordinator gives an adapter. It contains
  program identity, step identity, input and authority-ceiling digests,
  bounded budgets, and the adapter descriptor. It contains no raw mission,
  credential, filesystem path, Realm handle, keel writer, or model route;
- **program journal**: a canonical hash-chained local state file plus bounded
  content-addressed completion artifacts;
- **pending**: an ambiguous or externally unfinished step. Pending work is
  never guessed complete and is never redispatched by this protocol.

The adapter is an explicit trust boundary. The coordinator verifies its
descriptor and the returned completion shape, but v1 does not claim hostile
same-user process isolation or external exactly-once execution.

## admitted input

The exact program input is:

```text
{
  schemaVersion: 1,
  protocolId: "eternities-long-horizon-mission-program-v1",
  programId: digest,
  actor: {
    instanceId: identifier,
    identityDigest: digest,
    genomeDigest: digest,
    keelHeadDigest: digest
  },
  missionDigest: digest,
  authorityCeilingDigest: digest,
  budget: {
    maxCompletionTokens: positive integer,
    maxResultBytes: positive integer
  },
  steps: [
    {
      stepId: identifier,
      kind: identifier,
      inputDigest: digest,
      maxCompletionTokens: positive integer,
      maxResultBytes: positive integer
    }
  ]
}
```

`programId` is derived from the canonical input and the journal path is rooted
under the caller-supplied program root. The input is digest-only by design. A
future operation-specific adapter owns the corresponding mission or phase
body and proves that it matches the digest before doing work.

The coordinator rejects unknown keys, duplicate or unsorted step ids, more than
eight steps, zero or over-budget ceilings, credentials, authority/effect
fields, Realm handles, filesystem roots, keel or memory writers, model routes,
and nested program controls before journal creation.

## adapter contract

Every selected adapter must expose a stable descriptor with:

```text
{
  schemaVersion: 1,
  protocolId: "eternities-mission-program-step-adapter-v1",
  kind: identifier,
  adapterId: identifier,
  adapterVersion: version,
  authority: {
    realmEffects: 0,
    continuityWrites: 0,
    identityMutation: 0,
    evolution: 0,
    soul: 0
  },
  descriptorDigest: digest
}
```

The exact descriptor is captured at coordinator construction and compared
before every operation and recovery. A caller cannot replace a descriptor by
passing a structurally equivalent object after admission. A step kind without
an exact adapter fails closed.

`reconcile(dispatch)` returns exactly one of:

- `{ status: "absent" }`, allowing one execute call;
- `{ status: "pending" }`, leaving the program pending;
- `{ status: "completed", completion }`, which is committed without execute.

`execute(dispatch)` may return `pending` or one bounded completion. A completion
is content-addressed and may contain only a report reference, usage, and
bounded result metadata. The coordinator does not interpret a completion as a
constitutional decision or Realm action.

## journal state machine

```text
admitted
  -> step-prepared
  -> step-completed -> next step-prepared
  -> step-pending
  -> program-completed
  -> program-aborted
```

Only the first uncommitted step is active. The journal records the exact
dispatch before reconciliation or execution. A process boundary after
execution but before commitment is recovered by reconciliation; a pending
answer stays pending; an absent answer can execute once. A later step is never
dispatched before the previous completion is durable. Program completion binds
the ordered step completion references and aggregate usage.

Recovery verifies the entire canonical journal, every event digest, every
descriptor, every input digest, every completion artifact, all budgets, and the
current adapter set. It performs no route selection and no execution until the
same active step is re-established. Exact terminal replay reads only verified
local evidence and makes zero adapter calls.

## acceptance matrix

| id | acceptance requirement | proof |
| --- | --- | --- |
| MP-001 | deterministic input admission derives one stable program id and rejects unknown, duplicate, unsorted, oversized, credential-shaped, authority-shaped, Realm, keel, memory, model, and nested-program fields | unit tests and fixture assertions |
| MP-002 | construction pins exact step descriptors and rejects descriptor drift, unknown kinds, and adapter substitution | unit and recovery tests |
| MP-003 | steps execute strictly in admitted order and a future step is never disclosed or called early | ordered call trace fixture |
| MP-004 | every step publishes its exact dispatch before reconciliation or execution | journal event assertion |
| MP-005 | an absent reconciliation permits exactly one execute; pending never executes; completed reconciliation never executes | adapter call counters |
| MP-006 | interruption after prepare, after reconciliation, after execute, and before program completion recovers without duplicate completed work | crash-and-recover fixture |
| MP-007 | terminal program replay returns byte-identical results with zero adapter calls | replay assertion |
| MP-008 | tampered journal, dispatch, descriptor, input digest, completion, ordering, or aggregate usage fails closed | mutation matrix |
| MP-009 | aggregate completion and every step remain within total byte and completion ceilings | budget assertions |
| MP-010 | the dispatch and durable state contain no raw credential, mission body, filesystem path, Realm handle, keel writer, memory writer, authority expansion, or model route | durable-file scan |
| MP-011 | a program remains a coordinator only and cannot directly invoke a Realm, Godskills body, keel, memory, identity, evolution, Soul, Inspiration, or Lunari operation | import scan and capability assertions |
| MP-012 | source, schema, fixture, test manifest, focused tests, full tests, receipt, and prior receipt chain are bound by an append-only certification artifact | certification receipt |

## explicit non-goals

- no live provider or model selection, quality claim, or cross-model ranking;
- no Codex, Claude Code, local-model, MCP, or hosted adapter;
- no default launcher or persistent daemon;
- no scheduler, wall-clock wake service, cron, quorum, nested program, or
  distributed execution;
- no automatic retry after an ambiguous external operation;
- no copying or embedding of Godskills bodies or third-party skills;
- no Realm action, rollback, compensation, or external exactly-once claim;
- no personal-keel or memory content write;
- no identity mutation, evolution, Inspiration, Soul, sentience, or Lunari;
- no claim that deterministic fixtures establish product usability or model
  intelligence.

## risks and mitigations

1. **duplicate external cognition or effects**: prepare and reconcile every
   step, leave ambiguity pending, and never guess absence.
2. **authority laundering through a step adapter**: keep the dispatch
   authority-empty, forbid authority-shaped input, and require an exact
   descriptor with zero declared authority.
3. **program becoming a second vessel**: keep mission and operation bodies
   outside the program, and make the program return references rather than
   constitutional decisions or Realm effects.
4. **unbounded long-horizon growth**: cap steps, bytes, completion tokens, and
   journal size; no nested programs or background service in v1.
5. **receipt drift**: build a source-bound fixture and append-only receipt that
   records exact current-head pins and all proof limits.
