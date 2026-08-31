# Recoverable mission revision executor v1 implementation plan

Date: 2026-08-31

## 1. Close the revision recovery-context gap

- Add a failing kernel regression proving revision reconciliation receives the
  exact immutable admission, native artifact, and first review.
- Pass one identical context to revision reconcile and execute.

## 2. Freeze the package and transport contracts

- Add strict revision package, transport descriptor, dispatch, and completion
  schemas.
- Bind request, executor, artifacts, finding obligations, materializer,
  transport, bytes, tokens, times, and empty authority.

## 3. Build the provider-neutral revision executor

- Materialize and verify the exact revision package without reading Godskills.
- Derive a content-addressed executor descriptor from materializer and transport
  identities.
- Reproduce one dispatch for reconcile and execute.
- Convert one verified completion to an evidence-bound mission phase result.

## 4. Harden and integrate the full revise path

- Cover absent, pending, completed, ambiguous, changed, oversized, authority,
  credential, time, and finding-set cases.
- Interrupt after completed revision transport work and reconstruct both kernel
  and executor.
- Prove one execution, exact recovered dispatch, exact final Godskills review,
  and one accepted terminal mission receipt.
- Preserve the certified review-v1 fixture bytes and receipt history.

## 5. Certify and release

- Perform an inline adversarial review and repair confirmed defects test-first.
- Build a deterministic full-loop recovery fixture and append-only receipt.
- Run focused and complete suites, verify the receipt ledger and release
  lineage, fast-forward main, push, and remove only the completed worktree.
