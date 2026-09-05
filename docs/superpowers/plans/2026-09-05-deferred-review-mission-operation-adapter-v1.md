# deferred review mission-operation adapter v1 implementation plan

## goal

Create one small source-specific wrapper that adapts an already-admitted
deferred review executor to the certified generic mission-operation adapter.
Keep the phase executor and mission-program coordinator as the owners of their
existing contracts and persistence.

## task 1: write the red contract tests

- add `tests/review-mission-operation-adapter.test.mjs`;
- use the existing mission phase contracts and review fixture admission;
- create a deterministic injected review executor with a mutable descriptor,
  exact phase result, and observable calls;
- assert source descriptor binding, phase request/context binding, and exact
  program step identity;
- assert the source descriptor contains no phase body or context and bind the
  already-certified generic body-free parent adapter;
- assert absent then execute, completed mapping, and terminal replay;
- assert changed executor descriptor, phase request, context, authority,
  ceilings, and dispatch identity fail before the source call;
- assert malformed phase results and duplicate execution fail closed.

Run only this new test before implementation and preserve the red result in the
working notes.

## task 2: implement the wrapper

- add `src/runtime/review-mission-operation-adapter.mjs`;
- verify and freeze the phase request and context at construction;
- derive a compact source descriptor from only digests and ceilings;
- rebuild and compare the live source descriptor before every call;
- verify the generic request against the pinned phase and step identities;
- invoke the existing executor with its own request/context;
- project phase results into the existing mission-program completion shape;
- delegate duplicate and pending behavior to the existing executor and generic
  adapter without adding writes or locks.

## task 3: certify the source-specific boundary

- add a deterministic fixture and a focused certification test;
- build a source-bound receipt using the existing mission-operation receipt
  protocol and bind the wrapper source digest, fixture, and test counts;
- register one append-only receipt and update the ledger and release lineage;
- update README and architecture with the proof boundary;
- refresh current-head evidence only after the source receipt is committed.

## task 4: integrate safely

- run the focused wrapper and certification tests;
- run the complete suite and current-head verifier;
- run the ledger and release-lineage gates;
- inspect the final diff for accidental Godskills or default-launch changes;
- merge only the verified branch and push main.

## acceptance

- source-bound descriptor digest and phase request/context identities are exact;
- generic requests are body-free and authority-empty;
- source drift and changed binding fail before executor calls;
- reconcile precedes execute and completed retry performs no duplicate execute;
- all new schemas and receipts are canonical and credential-free;
- existing tests and receipts remain valid;
- no Godskills checkout files change.

## explicit non-goals

- no evaluator or model quality claim;
- no live provider or host adapter;
- no Realm effects, delegation, scheduler, or nested programs;
- no default vessel, SDK, Codex, Claude Code, MCP, keel, memory, identity,
  evolution, Inspiration, Soul, or Lunari integration.
