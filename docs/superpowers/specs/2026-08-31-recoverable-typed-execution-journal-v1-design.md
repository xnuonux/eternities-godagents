# Recoverable typed execution journal v1

## Objective

Consume the exact certified Godskills typed execution stepper and durably retain each accepted node output so a reconstructed Godagents process can replay the verified prefix and resume at the first unfinished node.

## Trust boundary

- Godagents pins the exact Godskills stepper source commit, receipt bytes, receipt digest, complete source closure, parent typed-composition receipt, fixture, and runtime module.
- The pinned adapter verifies every bound byte before importing either the historical typed-composition module or the additive stepper module.
- The journal never validates node output independently. It persists an output only after the privately branded Godskills stepper accepts it against the current privately branded step.
- Recovery creates a fresh execution handle, replays every canonical digest-linked record through newly emitted Godskills steps, and stops at the first absent record.

## Durable protocol

One execution identity owns one real local directory containing:

- `intent.json`, which binds mission, method, mission-input, stepper trust root, and execution identity;
- `steps/000000.json` onward, a contiguous append-only chain of exact accepted output envelopes;
- no serialized private handles, methods, registries, capability bodies, executors, credentials, or authority.

Every step record binds the current Godskills step digest, node identity, accepted output digest, previous journal head, and its own record digest. Existing exact bytes are idempotent. Changed bytes, gaps, aliases, symlinks, malformed JSON, non-canonical JSON, digest drift, or replay rejection fail closed before another executor runs.

## Recovery semantics

After a persisted record, process death is recoverable without invoking that completed node again. If process death occurs after an external executor returns but before the validated record is durably published, that node may run again. Therefore this protocol proves deterministic local prefix recovery and at-least-once execution across that crash window. It does not prove external exactly-once effects, executor idempotency, provider reconciliation, hostile same-user isolation, or default host adoption.

## Acceptance boundary

- exact Godskills stepper release verifies before import;
- two-node canary completes with historical output and execution-digest parity;
- a crash after the first persisted node resumes at node two without rerunning node one;
- invalid output creates no record and leaves node one retryable;
- corrupted, reordered, gapped, forged, or changed records fail before new execution;
- a crash before publication explicitly demonstrates the repeatable at-least-once window;
- no authority, effect, body-disclosure, live-provider, or default-launch claim is added.
