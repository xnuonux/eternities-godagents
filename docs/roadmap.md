# Product direction

The next product outcome is a reliable path from **create an actor** to **verify
useful work**, including interruption and continuation. Existing contracts and
hosts should compose into that experience before adding more abstractions.

This roadmap sets priorities, not delivery dates or completed release claims.
Detailed historical results remain in [current state](current-state.md).

## 1. Make the first useful run approachable

Delivered in this refinement: a self-contained fixture demo, portable quickstart,
and a documentation map. The native operator already supports preparation,
preflight, launch, resume, status, and history.

Next: simplify the complete creator-to-native-operator handoff while keeping
identity, provider choice, effects, and spending visible to the operator.

**Completion evidence:** a fresh operator can create an actor and complete a
useful coding task from documented inputs without editing runtime source.

## 2. Qualify recovery through real workflows

Build on the existing bounded recovery cases. Test interrupted tools, uncertain
provider outcomes, compaction, revoked authority, and process restarts through
the actual operator flow. Preserve completed work and prevent duplicate effects.

**Completion evidence:** explicit success and failure cases with independently
checked output, action records, and demonstrated recovery boundaries.

## 3. Establish portability with another host

Use a mature host's native tools and sessions through a small adapter. Keep the
actor contract separate from host-specific capabilities. Select the second host
through a bounded feasibility comparison before committing to integration.

**Completion evidence:** the same stated task and actor requirements work through
two independently qualified hosts, with differences and costs recorded.

## 4. Measure the value of the additional machinery

Compare the native model/host baseline with actor continuity and optional skill
configurations on matched tasks. Include failures, acceptance results, reported
token usage, wall time, and operator effort. Missing usage remains unknown.

**Completion evidence:** repeatable benefits on defined tasks, with negative
results preserved. Lower cost alone is not a win when acceptance criteria fail.

## Beyond this release

Lunari integration, hosted multi-actor environments, Inspiration, Soul activation,
and autonomous evolution require separate designs and qualification. They remain
part of the wider ambition without becoming implied features of version 0.2.0.
