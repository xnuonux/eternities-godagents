# sealed OpenAI-compatible phase transport v1 implementation plan

## milestone

Implement and certify one policy-pinned, credential-isolated, locally
at-most-once OpenAI-compatible transport suite for the existing identity-bound
native, Godskills review, and mission revision contracts.

## implementation sequence

1. add failing policy tests for canonical loading, external digest pinning,
   HTTPS and endpoint semantics, exact model identity, credential variable
   validation, bounded ceilings, unknown fields, and descriptor derivation.
2. add the provider-policy schema and loader, closed policy errors, lazy
   credential resolver, and deterministic phase descriptor builder.
3. add failing request tests for all three phase projections, strict response
   schemas, stable system prefixes, exact dispatch bindings, request bytes,
   credential-bearing inputs, and completion-token ceilings.
4. implement the shared canonical request compiler and the three trusted
   artifact projectors. Reuse the existing HTTPS transport and existing phase
   completion builders. Do not reuse the legacy action-proposal parser.
5. add failing response tests for exact model and choice identity, refusals,
   tools, malformed JSON, credential reflection, invalid usage, semantic phase
   contradictions, raw-body containment, and every byte ceiling.
6. implement sanitized response parsing and usage mapping, then prove native,
   review, and revision success against deterministic fake HTTPS responses.
7. add failing durable-operation tests for absent reconciliation, exact
   completion replay, two-process contention, changed dispatch, malformed and
   symlinked state, closed failure recovery, and interruption at each checkpoint.
8. implement immutable prepared, attempt, completion, and failure records using
   existing atomic publication and file-lock primitives. Publish the attempt
   before network access and never automatically retry an ambiguous attempt.
9. add an end-to-end admitted-host integration fixture that assembles the suite
   with existing review and revision executors, uses fake network responses,
   proves the full reviewed mission loop, reconstructs after interruption, and
   scans all durable and emitted surfaces for credential leakage.
10. add a deterministic certification fixture, receipt builder, schemas,
    certification document, package command, append-only ledger row, release
    lineage coverage, and architecture update.
11. run focused tests, the full repository suite, receipt and ledger gates, and
    two clean receipt reproductions. Perform an inline adversarial source and
    trust-boundary review because subagents are prohibited for this task.
12. reconcile origin, merge only the fully verified branch into main, push,
    verify local and remote equality, then remove only the exact feature
    worktree and merged branch.

## test discipline

Each behavior change begins with a focused failing test. Production code is
added only after the failure demonstrates the missing behavior. After every
green slice, run the affected sibling tests. The full suite is reserved for the
final certification gate.

Network tests use injected fake fetch implementations only. They must inspect
the exact outbound request and return realistic non-streaming Chat Completions
envelopes. No test may read a real API credential or contact a live endpoint.

## proof limit

Passing this milestone proves deterministic policy binding, strict request and
response projection, secret containment inside the tested process boundary,
local at-most-once dispatch, durable successful replay, and fail-closed
ambiguity. It does not prove live model quality, universal provider behavior,
or exactly-once execution across the remote HTTPS boundary.
