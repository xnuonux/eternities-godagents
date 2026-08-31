# Resumable mission and executed-review kernel v1 implementation plan

Date: 2026-08-31

## 1. Freeze contracts in failing tests

- Add contract tests for admission, executor descriptors, phase requests,
  phase results, artifacts, usage arithmetic, and authority-field rejection.
- Add schema registration and schema smoke tests only after the contract tests
  fail for the intended missing behavior.

## 2. Build the inert journal first

- Add append-only event and state schemas.
- Implement exact replay, transition validation, content-addressed artifact
  publication, and a pure next-action projection.
- Prove mutation, truncation, cross-mission substitution, artifact loss, and
  illegal transition failures before adding any executor call.

## 3. Add recoverable phase execution

- Define the injected executor adapter boundary.
- Prepare each request durably before reconciliation or dispatch.
- Reconcile before every possible dispatch.
- Verify and commit completed results and artifacts once.
- Retain crash checkpoints around prepare, execute, artifact publication, and
  event commit.

## 4. Add review, revision, and verdict semantics

- Verify the body-free deferred-review binding from the Godskills cycle.
- Enforce native commit before review binding.
- Implement no-review, accept, reject, one-revision, and terminal second-review
  paths.
- Require every required finding id in the revision receipt.

## 5. Add economics and adversarial coverage

- Bind phase reservations and exact token accounting.
- Enforce per-phase and total completion ceilings.
- Test pending, ambiguous, forged, downgraded, stale, oversized, and
  authority-bearing results.
- Prove exact terminal replay uses no executor.

## 6. Integrate documentation and deterministic fixture

- Add a deterministic native-only mission and a crash-recovered reviewed
  mission fixture.
- Update README and architecture with the exact boundary and proof limits.
- Add a deterministic receipt builder and focused certification test.

## 7. Release gate

- Run focused tests during development.
- Commit the reviewed source candidate.
- Run two deterministic fixture and receipt rebuilds.
- Run the complete suite only at the final gate.
- Issue an append-only certification receipt whose source commit is exact.
- Update the ledger and release-lineage checks, merge to main, rerun canonical
  verification, push, and remove the clean merged worktree.
