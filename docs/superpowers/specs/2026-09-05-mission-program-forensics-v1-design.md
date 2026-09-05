# mission-program forensic projection v1

Status: approved bounded design

## purpose

The certified mission-program coordinator now preserves a tamper-evident
ordered journal, but its public inspection surface exposes only aggregate
status. Operators and later recovery tooling need a deterministic way to see
what happened without reading or replaying the mission body and without
calling any adapter. This milestone adds a read-only forensic projection over
one existing mission program.

The projection is an observability boundary, not a second coordinator. It
does not change mission execution, recovery, admission, or terminal replay.

## contract

`MISSION_PROGRAM_FORENSICS_PROTOCOL_ID` is
`eternities-mission-program-forensics-v1`.

The API is a coordinator method:

```js
const projection = await coordinator.forensics(programId, options);
```

The method reuses the coordinator's verified journal and completion-artifact
replay. It accepts only a verified program id and an optional inclusive
`throughSequence`. The sequence must be an integer between zero and the
journal's current event count. A missing program returns the existing
`absent` status and no filesystem mutation.

The result contains exactly:

- protocol and program identity
- `status`: `absent`, `admitted`, `pending`, or `completed`
- the selected sequence and current head sequence and digest
- a digest of the returned projection
- an ordered bounded event summary
- a bounded step summary
- a terminal aggregate digest when one exists

Each event summary contains only sequence, event type, recorded time,
previous digest, content digest, and a payload digest. It may include the
step id and index, dispatch digest, artifact digest, or aggregate digest when
those already exist in the event's validated shape. It never includes an
event payload, result bytes, input contents, provider data, credentials,
filesystem paths, Realm handles, model routes, or personal-keel material.

The step summary contains step id, index, kind, and one of `admitted`,
`prepared`, `committed`, or `pending`. It contains no input or descriptor
body. The state-at-sequence summary is derived only from the verified prefix:
it reports the prefix status, next step id or `none`, committed and prepared
step ids, and the prefix head digest. A prefix ending before admission is
invalid rather than guessed.

## invariants

1. The source journal is fully verified before projection. Invalid JSON,
   canonical bytes, schema, chain, digest, lifecycle order, descriptor, or
   completion artifact fails closed through the existing mission-program
   integrity errors.
2. Projection output is deterministic for identical journal and artifact
   bytes. Its `projectionDigest` covers the complete returned object except
   that field.
3. `throughSequence` cannot reveal a future event. It can only select an
   already verified prefix and never changes the stored journal.
4. The full journal remains verified even when a prefix is requested. A
   corrupted future event or artifact is not hidden by asking for an earlier
   sequence.
5. The method makes zero adapter calls and performs no writes, locks,
   reconciliation, dispatch, completion publication, or model/provider work.
6. The projection is bounded by the existing mission journal event ceiling and
   a separate serialized output ceiling. It is not a cross-program query or
   an unbounded log export.
7. A terminal program returns the exact terminal aggregate digest and the same
   full projection on every call. Terminal replay remains an execution concern
   of `execute`, not this read-only method.
8. The public method is available only on authentic SDK-issued mission
   coordinators. Lookalike objects and forged program ids remain rejected.

## state-at-sequence semantics

The implementation replays the verified events once, then derives each
requested prefix from event metadata and committed step indices. The prefix
must end at an existing event boundary. Sequence zero is allowed only for an
absent program; an admitted program must include its admission event. A
prefix can be `admitted` after admission, `pending` after a prepared step, or
`completed` only after the terminal event. It never claims a step completed
before its commit event.

## proof plan

Tests must prove:

- deterministic full projection and digest
- exact prefix state summaries for admission, prepared, committed, and
  terminal boundaries
- absent and invalid sequence behavior
- no disclosure of payloads or sensitive-shaped fields
- zero adapter calls, zero writes, and unchanged journal/artifacts
- tampered journal, future event, and completion artifact rejection
- authentic-coordinator and program-id binding
- serialized output ceiling and stable event ordering

The certification receipt binds the implementation source, fixture digest,
focused and full test counts, and the current certification ledger. It reports
the projection as bounded local observability only. It does not claim a
cross-component trace viewer, live provider trace correlation, branch replay,
reversible time travel, UI, or hosted durability.

## non-goals

- no mission execution or recovery changes
- no adapter, provider, Codex, Claude Code, MCP, or Realm integration
- no Godskills body loading or routing
- no cross-program or cross-vessel query index
- no event mutation, branching, rollback, or time-travel writes
- no mission body, result body, credential, path, handle, identity,
  constitution, evolution, Soul, Inspiration, keel, or memory disclosure
- no default launcher, scheduler, daemon, or product UI
