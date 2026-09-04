# certification release gate v1 design

## purpose

The Realm negotiation certifier already runs the focused Realm certification
tests and the complete repository suite before it writes the final
source-bound receipt. Its final release step then reran the certification
ledger and release-lineage suites in a separate process. That repeated the
most expensive evidence work without adding a new assertion.

This milestone makes that final step explicit and bounded. It preserves the
existing receipt format, ledger implementation, lineage implementation, and
Realm behavior while replacing only the redundant final test bundle with a
receipt-aware release gate.

## protocol

The adapter exposes the exact protocol id
`eternities-certification-release-gates-v1` and a frozen plan with three
ordered steps:

1. run the focused Realm negotiation certification test;
2. run `src/certification/verify-ledger.mjs` directly;
3. run `src/certification/verify-release-lineage.mjs` directly.

The plan records the two repeated suites that are forbidden in this release
step:

- `tests/certification-ledger.test.mjs`;
- `tests/release-lineage.test.mjs`.

The focused test path is restricted to a relative `tests/*.test.mjs` path with
no backslashes, traversal segments, control characters, or shell syntax.

## evidence contract

The focused test must pass with a positive test count. Each direct verifier
must emit one JSON result with `status: "verified"`. The adapter derives the
ledger receipt count from the verified ledger receipts and requires the
lineage result to have the same receipt count and ledger digest. It also
requires a valid release head and release-lineage digest.

The returned release evidence contains only the bounded plan, focused test
count, verifier names, receipt count, head commit, ledger digest, and lineage
digest. It does not copy receipt bodies into another artifact.

## safety and compatibility

- Direct verifier processes receive a scrubbed Git environment, matching the
  existing certification support boundary.
- A verifier failure, malformed JSON result, digest mismatch, or unexpected
  status fails the release gate.
- No credentials, Realm handles, provider calls, model routing, authority,
  Godskills, keel, memory, identity, or Luna behavior is changed.
- The durable Realm negotiation receipt remains byte-for-byte governed by its
  existing schema and reconstruction function. Release-gate evidence remains
  process output and certification prose, not a new receipt field.

## proof boundary

This proves that the final Realm release check uses three non-duplicative gate
commands and that the direct ledger and lineage results agree. It does not
prove that the underlying Realm connector is live, that external effects are
safe, or that the Godagents runtime is product-ready.
