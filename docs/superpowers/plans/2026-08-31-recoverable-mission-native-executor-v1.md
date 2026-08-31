# Recoverable mission native executor v1 implementation plan

## 1. Freeze the boundary

- Preserve the current Godagents and Godskills canonical heads.
- Extend native kernel context with the exact immutable admission while keeping
  the existing mission and Godskills projection.
- Keep provider selection, credentials, model routing, Realm, continuity,
  Lunari, Inspiration, and Soul outside this milestone.

## 2. Drive contracts from failing tests

- Add native package, transport descriptor, dispatch, and completion schemas.
- Add tests for native-only and Godskills-bound package construction.
- Add hostile tests for coherent mission, admission, package, ceiling, usage,
  time, authority, credential-shaped field, response mutation, and byte drift.
- Add reconciliation tests proving exact absent-before-execute and zero
  execution for pending or completed state.

## 3. Implement the native execution boundary

- Add a synchronous side-effect-free native materializer.
- Add strict provider-neutral native transport builders and verifiers.
- Add a reconstructable native executor that snapshots transport responses,
  caches only exact request/context identities, and commits the transport
  completion digest as executor evidence.
- Register all schemas and document the boundary.

## 4. Prove the real full loop

- Compose actual native, deferred review, and revision executors.
- Interrupt after native transport completion.
- Reconstruct every component, reproduce the exact native dispatch, and recover
  without redispatch.
- Continue through revise and final accept, then prove terminal replay makes no
  external call.
- Prove native-only missions disclose no Godskills context.

## 5. Certify and integrate

- Generate one deterministic fixture and one append-only certification receipt.
- Pin source, implementation, tests, Godskills dependency, all executor
  identities, historical receipts, requirements, measurements, and proof
  limits.
- Run focused tests, the full suite, receipt-ledger verification, release-lineage
  verification, and repeated receipt reconstruction.
- Commit source separately from release evidence, fast-forward canonical main,
  push, and remove only the completed worktree and branch.
