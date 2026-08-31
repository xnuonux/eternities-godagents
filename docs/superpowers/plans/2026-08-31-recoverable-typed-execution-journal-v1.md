# Recoverable typed execution journal v1 implementation plan

1. Add an immutable sidecar pin and verifier for the certified Godskills typed execution stepper release.
2. Add a privately branded adapter that compiles with the historical typed-composition module and advances only through the verified stepper.
3. Write failure-first tests for persisted-prefix recovery, invalid-output non-publication, corrupted-record rejection, and the explicit pre-publication repeat window.
4. Implement the canonical digest-linked local journal with bounded files, real-path containment, exclusive publication, and per-execution locking.
5. Freeze a deterministic crash-and-recovery fixture and a source-pinned certification receipt.
6. Run focused, complete, ledger, lineage, historical-byte, and exact-reproduction verification before fast-forward integration.
