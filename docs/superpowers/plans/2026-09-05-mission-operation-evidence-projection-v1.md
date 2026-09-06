# implementation plan: mission-operation evidence projection v1

## scope

Implement a pure, body-free join projection over one verified mission-program
forensics result and generic mission-operation evidence entries. Preserve every
existing protocol and receipt byte.

## steps

1. Write failing unit tests for a completed multi-step projection, a pending
   operation, subset joins, deterministic replay, and rejection of duplicate,
   unknown, changed, authority-bearing, credential-shaped, and oversized
   evidence.
2. Add `schemas/mission-operation-evidence.schema.json` and the runtime module
   with strict input verification, canonical step ordering, digest binding,
   authority-empty output, and a bounded output ceiling.
3. Add a deterministic fixture builder and focused certification tests. The
   fixture must construct evidence using the existing generic mission-operation
   builders rather than inventing a parallel wire format.
4. Add a source-bound certification receipt and document the proof limits in
   README and architecture documentation.
5. Register the receipt in the append-only ledger, current-head evidence, and
   release-lineage gates. Run focused tests first, then the full suite and the
   three release gates.

## acceptance

- the projection is pure and adapter-free;
- every supplied entry joins to one exact mission-program step;
- earlier prefixes disclose no future step completion;
- generic descriptions, requests, dispatches, and receipts are revalidated;
- credentials and all authority expansion fail closed;
- repeated projection is byte-identical and within the ceiling;
- focused and full tests pass;
- the receipt, current-head certificate, certification ledger, and release
  lineage all verify at the merged head.

## explicit non-goals

No provider, scheduler, nested delegation, live effect retry, rollback,
credentials, default launch wiring, keel or memory write, identity mutation,
evolution, Inspiration, Soul, or Lunari behavior.
