# routing-evidence activation classifier v1 implementation plan

1. extend routing-executable verification to retain a minimal frozen projection
   of the exact verified routing cards and reject projection/release mismatch.
2. add failing tests for provenance, family and risk classification, mixed-route
   collapse, review availability, descriptor determinism, malformed inputs, and
   prohibited output fields.
3. implement the authority-empty routing-evidence classifier and descriptor.
4. add a deterministic fixture, builder, append-only certification receipt,
   certification document, package command, and ledger lineage.
5. run focused tests, the complete repository suite, release gates, two receipt
   reproductions, and an inline adversarial source review.
6. reconcile with origin, fast-forward canonical main, push, verify equality,
   remove the exact clean worktree and branch, then begin explicit host adoption.
