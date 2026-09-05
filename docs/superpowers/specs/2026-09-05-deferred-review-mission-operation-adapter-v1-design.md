# deferred review mission-operation adapter v1

## decision

Adapt one already-admitted deferred Godskills review executor instance to the
descriptor-bound mission-operation contract. This is a source-specific,
provider-neutral migration boundary, not a replacement for the review kernel,
review executor, mission-program coordinator, or Godskills release boundary.

The adapter is opt-in and ephemeral. It is constructed around one exact review
phase request and its exact committed context. It exposes only the generic
mission-operation surface to the mission program. The request crossing that
surface remains payload-free.

## source binding

The source descriptor protocol is
`eternities-deferred-review-mission-operation-source-v1`. It contains only
non-secret identity and ceiling fields:

- the review executor descriptor digest and review phase;
- the phase request digest and round;
- the digest of the bound phase context;
- mission-program id, step id, and step index;
- the host authority-ceiling digest;
- the exact completion and result ceilings.

No admission, subject, Godskills package, review body, provider route,
credential, callable, path, or response bytes enter the source descriptor.

The adapter constructs the generic
`eternities-mission-operation-adapter-v1` description with operation kind
`review`. Its source descriptor is rebuilt from the live executor descriptor
before every source call. A changed executor descriptor fails before the
executor is called.

## phase projection

The source wrapper accepts the generic adapter request and first verifies:

- `operationKind` is `review`;
- program, step, index, input digest, authority ceiling, and both ceilings
  equal the pinned source descriptor;
- the generic source and mission-step descriptor digests remain bound.

It then invokes the existing executor with the closed-over phase request and
context. The phase request is independently verified against the executor
descriptor and the context is cloned, frozen, credential-screened, and
content-addressed at construction. The executor remains the owner of review
materialization, Godskills disclosure, transport reconciliation, and phase
result validation.

An underlying `absent` or `pending` result is projected unchanged. A completed
phase result becomes the existing mission-program completion shape:

- `resultDigest` is the verified phase result receipt digest;
- `resultBytes` is the verified phase artifact byte count;
- usage and times come from the phase result receipt;
- program, step, dispatch, and completion digests are rebuilt by the adapter.

The generic mission-operation adapter then performs its own completion and
ceiling checks. No phase artifact or result body crosses the generic request
boundary.

## recovery and authority

The source adapter owns no file, journal, lock, provider, Realm hand, keel,
memory, identity, or retry state. The existing review executor owns its
transport reconciliation and the mission-program coordinator owns its journal,
ordering, lock, artifact publication, and terminal replay.

The generic operation request authority is the fixed all-zero operation
projection. The review executor's authority-empty descriptor and the admitted
mission authority ceiling remain separately verified. A changed phase request,
context digest, executor descriptor, mission dispatch, authority ceiling, or
completion ceiling fails closed. A pending phase never becomes a completed
mission step by assumption.

## proof boundary

The deterministic fixture will use a trusted injected review executor built
from the existing phase contracts. It will prove descriptor binding, phase
request and context binding, exact ceiling projection, completed projection,
and duplicate-free terminal replay. The parent mission-operation adapter
receipt remains the direct proof of the generic body-free request surface;
this receipt binds that parent certificate explicitly rather than repeating
its fixture.

The focused adapter tests additionally prove absent-before-execute,
descriptor/context drift refusal, malformed-result rejection, and authority or
ceiling drift. The certification receipt itself proves source-bound receipt
construction.

It will not claim review quality, model quality, live Godskills execution,
provider equivalence, scheduler behavior, hostile process isolation, remote
exactly-once effects, default vessel wiring, or Lunari readiness.

## explicit non-goals

- no changes to the generic mission-operation schemas or mission-program journal;
- no Godskills body loading in Godagents;
- no live provider, Codex, Claude Code, local-model, or MCP adapter;
- no delegation or Realm operation integration in this receipt;
- no default launcher or portable SDK expansion;
- no scheduler, nested mission, quorum, retry, or child-process claim;
- no keel, memory, identity, constitution, evolution, Inspiration, Soul, or
  Luna phenomenological-core behavior.
