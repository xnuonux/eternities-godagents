# descriptor-bound mission operation adapter v1 implementation plan

## goal

Add one small provider-neutral adapter boundary that binds an existing
operation descriptor to a payload-free mission-program step, with strict
request and outcome verification and an independent local certification
receipt. Preserve every existing receipt and keep source-specific review,
delegation, and Realm integrations opt-in.

## task 1: define schemas and public contract

- add exact schemas for the adapter description, bounded operation request,
  and compact operation receipt;
- register the schemas in `src/core/schema-validator.mjs`;
- add fixed protocol constants and the empty authority projection;
- document that the mission-step descriptor carries the complete source
  digest in its bounded adapter id without changing the existing step schema.

acceptance:

- canonical descriptions and requests validate;
- unknown fields, invalid identifiers, bad digests, non-empty authority, and
  oversized values fail closed;
- no schema permits bodies, credentials, paths, handles, or callables.

## task 2: write failing tests first

- add `tests/mission-operation-adapter.test.mjs`;
- build a deterministic fake source with a mutable descriptor and observable
  calls;
- assert construction, description and mission-step digest binding;
- assert request minimization and exact source arguments;
- assert absent, pending, completed, terminal compatibility, drift,
  malformed outcome, authority, credential, ceiling, and completion-binding
  failures;
- run the new test before implementation and preserve the failure evidence in
  the working notes.

acceptance:

- each design invariant has a direct test;
- a source callback never sees the original mission-program dispatch body or
  any user-supplied authority value;
- existing tests remain untouched by the red phase.

## task 3: implement the smallest adapter

- add `src/runtime/mission-operation-adapter.mjs`;
- verify and freeze the source descriptor at construction;
- derive the exact mission-step descriptor, description, and request digests;
- revalidate the source descriptor before every operation call;
- project only the three allowed outcomes;
- expose the standalone request surface and the thin mission-program adapter;
- perform no writes, locks, provider calls, Realm calls, or continuity work.

acceptance:

- all new tests pass;
- the existing mission-program coordinator can execute the thin adapter;
- source drift fails before reconcile or execute;
- completed outcomes are rechecked against the original dispatch and ceilings.

## task 4: certify the boundary

- add a deterministic fixture builder and source-bound certification receipt;
- bind implementation source, schemas, tests, fixture digest, and explicit
  proof limits;
- register the receipt in the append-only certification ledger;
- update README and architecture with the boundary and non-goals;
- update the current-head builder and tests to bind the new receipt;
- refresh the current audit after the current-head append-only certificate.

acceptance:

- focused adapter tests, the complete suite, ledger, release-lineage, and
  current-head gates pass;
- the receipt source commit is the implementation commit and the final
  current-head artifact is an append-only certificate commit;
- Godskills checkout and all existing source-bound artifacts remain unchanged.

## explicit non-goals

- no source-specific review, delegation, or Realm effect integration in this
  slice;
- no live provider or model calls;
- no change to the mission-program v1 schema or journal protocol;
- no default launcher, scheduler, UI, Godskills body loading, keel or memory
  writes, identity, evolution, Inspiration, Soul, Lunari, or Luna integration.
