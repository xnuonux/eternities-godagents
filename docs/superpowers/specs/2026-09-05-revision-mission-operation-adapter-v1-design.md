# revision mission-operation adapter v1

## intent

bind one already-admitted `mission-revision-executor-v1` instance to one exact
mission-program step through the certified generic mission-operation adapter.
the bridge is provider-neutral and opt-in. it does not replace the revision
executor, materializer, transport, mission journal, or phase ordering owner.

## boundary

the source descriptor binds only the verified revision executor descriptor,
revision phase request digest, revision context digest, mission-program and
step identity, authority ceiling digest, and completion ceilings. the generic
operation request remains body-free. the phase request and context stay in the
ephemeral source closure and are never copied into a durable mission-program
record or generic request.

the revision executor remains responsible for materializing and validating the
revision package, reconciling its transport, and producing the verified phase
result. the mission-program coordinator remains responsible for journal writes,
locks, ordering, recovery, artifact publication, aggregate completion, and
terminal replay.

## acceptance matrix

| id | proof |
| --- | --- |
| RMA-001 | exact revision phase request and context bind the source descriptor |
| RMA-002 | generic dispatch and request carry no phase body or context |
| RMA-003 | mission identity, step identity, authority ceiling, and result ceilings cannot drift |
| RMA-004 | live revision executor descriptor is revalidated before every call |
| RMA-005 | absent, pending, and completed reconciliation remain explicit; completed results project exact phase evidence |
| RMA-006 | absent-before-execute and completed replay prevent duplicate revision transport work |
| RMA-007 | changed request, context, descriptor, malformed result, and wrong phase fail closed |
| RMA-008 | source owns no credentials, providers, Realm, continuity, identity, evolution, Soul, or Lunari authority |

## proof limits

the deterministic fixture uses a trusted in-process revision executor and
transport. it proves binding and replay mechanics, not revision quality, model
quality, provider behavior, live Godskills execution, hosted durability, or
external exactly-once effects.
