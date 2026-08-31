# Identity-bound mission vessel v1 implementation plan

## 1. Freeze contracts with failing tests

- Add closed schemas and contract tests for the vessel request, immutable vessel
  admission, identity-bound inner transport descriptor, dispatch, completion,
  and vessel completion receipt.
- Prove canonical digests, exact field sets, bounded bytes and tokens, coherent
  times, credential rejection, and authority-empty values.
- Observe the tests fail because the runtime modules do not yet exist.

## 2. Build the identity-bound native transport

- Verify one Cortex Binding candidate and one inner transport descriptor at
  construction.
- Derive the ordinary outer native-transport descriptor from the candidate,
  model projection, vessel admission, and inner descriptor identities.
- Materialize the exact inner dispatch from the verified outer dispatch.
- Require exact absent reconciliation before execution and recover exact
  completed work after reconstruction.
- Convert verified inner completions into the existing native completion
  contract without changing the mission kernel or native executor.

## 3. Build the default mission vessel

- Validate one closed vessel request.
- Compile the Cortex Binding candidate from verified genesis sources.
- Derive constitution and Realm identities from that candidate.
- Bind Godskills once for a new mission or rehydrate the exact stored binding on
  recovery.
- Canonically publish one immutable vessel-admission record per mission id.
- Reconstruct the identity-bound transport, recoverable native executor, and
  existing mission kernel from that record.
- Return pending state or one verified vessel completion receipt.

## 4. Prove real composition and recovery

- Use a real admitted-identity fixture, real Cortex Binding compiler, real
  mission kernel, real native executor, and real review/revision executors.
- Interrupt after the inner native transport has completed but before the
  mission journal commits native output.
- Reconstruct every process-local component, rehydrate Godskills without
  rerouting, recover native output without redispatch, and finish the full
  review-revision-review path.
- Prove a second terminal replay touches no external surface.
- Mutate task, observation, mission, host ceiling, budgets, candidate sources,
  Godskills receipt, identity projection, dispatch, completion, usage, and
  authority fields and require closed failure.

## 5. Certify and integrate

- Build one deterministic fixture and append-only certification receipt with
  source, test, schema, design, plan, fixture, and historical receipt manifests.
- Run the focused proof twice, the complete repository suite, certification
  ledger verification, and release-lineage verification.
- Reconcile current `origin/main`, fast-forward only after all evidence remains
  exact, push canonical main, and remove only the completed feature worktree and
  branch.
