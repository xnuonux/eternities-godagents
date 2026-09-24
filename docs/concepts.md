# Actors, models, and action

Godagents separates the identity of an actor from the machinery that generates
its next response. That is the project's central design choice.

## One actor, several responsibilities

The **genome** describes the actor's purpose, constitution, component choices,
capability preferences, and compatibility requirements. Creation assembles a
candidate; **admission** checks and binds the reviewed identity to an instance.
An assembled candidate is not automatically an authorized running actor.

The **cortex** supplies model reasoning or, in the local demo, deterministic
proposals. Models are replaceable at defined binding boundaries. A model change
still requires compatibility and host qualification; it is not permission to
reinterpret the actor's history.

The **constitution** and operator's grants constrain action. A desired outcome,
model response, skill, or imported document cannot grant itself tools or authority.

**Continuity** lives in durable state and records. Imported material keeps its
provenance; it does not become an actor's lived history merely because the actor
reads it. Recovery must account for already completed or uncertain actions.

## Two execution paths

### Local governed loop

The local runtime observes a Realm, collects proposals, commits a decision through
its arbiter, invokes a declared action, and reconciles the result. The counter demo
uses this path. A **Realm Contract** describes observations, available actions
(called hands), required authority, and expected consequences.

See the concrete [vessel](../src/runtime/vessel.mjs),
[arbiter](../src/runtime/arbiter.mjs), and [action gateway](../src/realm/action-gateway.mjs).

### Native coding host

Pi owns its existing model/tool loop, file retrieval, context management, saved
sessions, and compaction. Godagents binds an admitted actor and mission to that
host, checks grants, and records native actions. This lets the project reuse an
established coding environment.

The [native binding](native-pi-session.md) has its own evidence and boundaries.
A test of the local Realm loop does not automatically qualify native shell
effects. A working directory or a permission statement is not an operating-system
sandbox. The operator remains responsible for the actual environment and grants.

## Godskills and the wider project

Godskills provides independently usable capability guidance. Godagents can bind a
selected stack to a mission; it does not need to embed the entire skill library.
Skills supply methods, while the host supplies authority. Scheduled review and
completed review are separate states, and review text requires judgment.

Within Eternities, these mechanisms are foundations for future persistent actors
and resident systems. LUNA, Umbrum, and Lunari retain their own identities and
development contracts. Soul activation and autonomous evolution remain outside
this runtime's release boundary.

## Reading the evidence

| Evidence | What it tells you |
| --- | --- |
| A schema or interface | What data a component accepts or promises. |
| A deterministic test | Whether a specified behavior passed on controlled inputs. |
| A stored certification receipt | What exact source/artifact boundary was checked at issuance. |
| A live model trial | What happened on that task, provider, host, and budget. |
| An independent review | Another evaluator's findings, subject to its stated coverage. |
| A matched comparison | How two configurations performed on the same bounded task. |

None of these alone establishes universal agent quality. Start with
[current state](current-state.md) for the dated outcomes and limitations, then
follow the relevant audit rather than treating a historical count as current CI.
