# Deferred Godskills review materializer v1 implementation plan

Date: 2026-08-31

## 1. Freeze the package contract

- Add failing schema and contract tests for one closed authority-empty package.
- Bind materializer, release, mission, admission, request, round, subject, prior
  review, selected capability bodies, and canonical package digest.

## 2. Prove post-native selective disclosure

- Build a real review-mode mission binding against the pinned Godskills release.
- Track release reads and prove construction opens no selected skill body.
- Materialize round one and prove only exact deferred entrypoint and contract
  bytes are opened.

## 3. Close round and substitution failures

- Add round-two subject and prior-review binding.
- Reject stale roots, changed descriptors, request substitutions, wrong subject
  digests, missing or extra context, duplicate descriptors, and body drift.

## 4. Enforce bounded portable output

- Enforce one explicit canonical byte ceiling.
- Reject authority-shaped subject or prior-review context before disclosure.
- Verify exact package bytes and digest on every return.

## 5. Integrate and release

- Document the boundary and explicit distinction from adaptive evaluator packages.
- Run focused materializer, mission-review, release-verifier, and adaptive binding
  tests.
- Perform an inline adversarial review and fix confirmed defects test-first.
- At the release gate, run the complete suite, issue an append-only receipt,
  update ledger and lineage, merge, push, and clean the worktree.
