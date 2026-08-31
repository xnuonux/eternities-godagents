# durable Anthropic Messages phase transport v1 implementation plan

## goal

Certify one policy-pinned, credential-isolated, locally at-most-once Anthropic
Messages transport suite for native, review, and revision over a reusable durable
operation engine, without changing the certified OpenAI transport.

## sequence

1. add failing tests for suite construction, descriptor binding, exact headers,
   native success, provider evidence, and secret containment.
2. implement the smallest neutral operation engine and Anthropic suite needed to
   pass one native operation.
3. add failing replay, concurrent execution, interruption, ambiguous network,
   closed failure, response ceiling, and hostile operation-state tests.
4. implement immutable prepared, attempt, provider-evidence, completion, and
   failure records with atomic publication and exclusive locking.
5. add failing review and revision tests and implement all three adapters through
   the same engine.
6. add deterministic fixture, source manifest, receipt schema, receipt builder,
   certification tests, and release documentation.
7. reproduce fixture and receipt twice, run focused tests, then the full suite,
   certification ledger, lineage, and unchanged historical OpenAI fixture gates.
8. perform independent review, resolve every important finding test-first, freeze
   exact source and evidence digests, fast-forward main, push, and clean only this
   worktree and merged branch.

## test discipline

Every behavior begins with a focused failing test that names the production break
it catches. Fake fetch responses mirror Anthropic Messages envelopes completely.
No test reads a real credential or contacts a live provider. Full-suite and bulk
evidence work is reserved for the final integration gate.

## deferred work

- signed operator resolution for ambiguous Anthropic outcomes;
- migration of OpenAI durability onto the neutral engine;
- portable host SDK selection between certified provider families;
- live provider qualification or default-host adoption.
