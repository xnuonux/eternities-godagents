# Recoverable Godskills admission v1 implementation plan

## 1. Freeze contracts with failing tests

- Add closed schemas and builders for transport descriptors, stage dispatches,
  stage completions, binding intents, binding records, and pending projections.
- Prove canonical digests, exact fields, byte ceilings, coherent timestamps,
  credential rejection, stage separation, and authority-empty values.
- Observe tests fail because recoverable Godskills admission modules do not yet
  exist.

## 2. Build the stage outbox

- Verify one stage-specific injected transport descriptor at construction.
- Derive stable operation slots from stage and request identity.
- Publish an exact dispatch before transport use.
- Return local completions, otherwise reconcile before every possible execute.
- Recover completed external work after reconstruction without redispatch.
- Return a typed pending state and reject ambiguous, changed, oversized, or
  authority-bearing state.

## 3. Build the recoverable adapter

- Publish one complete immutable binding intent per mission before invoking the
  existing Godskills adapter.
- Construct the existing adapter with recoverable route and activation function
  transports.
- Publish one final verified binding record after successful compilation.
- Return that record directly on exact replay.
- Delegate `rehydrateMission` to the existing verified path without invoking
  either outbox.

## 4. Integrate pending admission with the identity-bound vessel

- Admit the recoverable adapter through the existing adapter interface.
- Return route or activation pending projections without vessel publication or
  native dispatch.
- Preserve existing bound, no-qualified-route, needs-decision, and immutable
  vessel behavior.

## 5. Prove both crash windows

- Interrupt after route execution but before local route-completion publication,
  reconstruct, and recover without another route execution.
- Interrupt after activation execution but before local activation-completion
  publication, reconstruct, and recover without another activation execution.
- Prove changed retry input and changed classification fail before duplicate
  external work.
- Complete the actual identity-bound native, review, revision, and final-review
  loop from the recovered binding, then prove terminal replay makes no external
  call.

## 6. Certify and integrate

- Build one deterministic fixture and append-only certification receipt with
  source, test, schema, design, plan, fixture, and historical-receipt manifests.
- Run focused tests twice, the complete suite, ledger verification, and release
  lineage verification.
- Reconcile `origin/main`, fast-forward canonical main only after exact evidence
  remains green, push, and remove only the merged feature worktree and branch.
