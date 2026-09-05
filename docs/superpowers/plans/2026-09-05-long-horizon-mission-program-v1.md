# long-horizon mission program v1 implementation plan

## outcome

Add and certify a small provider-neutral mission-program coordinator. It will
sequence up to eight digest-bound step adapters with durable recovery and exact
terminal replay. It will not integrate a live provider, the default vessel,
Godskills bodies, Realm effects, keel or memory writes, or Lunari.

## phase 1: preregister the contract and test surface

1. Add `schemas/mission-program-input.schema.json`,
   `schemas/mission-program-descriptor.schema.json`,
   `schemas/mission-program-dispatch.schema.json`,
   `schemas/mission-program-completion.schema.json`,
   `schemas/mission-program-event.schema.json`, and
   `schemas/mission-program-state.schema.json` with `additionalProperties:
   false` and the exact ceilings from the design.
2. Add `tests/mission-program.test.mjs` and
   `tests/mission-program-certification.test.mjs` before runtime code. Cover
   MP-001 through MP-011 using a deterministic in-process adapter fixture.
3. Add the command names to `package.json` only after the tests name the
   fixture and receipt paths. Keep the existing `package-lock.json` untouched.

## phase 2: implement the smallest runtime

1. Add `src/runtime/mission-program.mjs` with strict canonical input and
   descriptor verification, digest-bound program identity, bounded event
   journal, content-addressed completion artifacts, and a single active-step
   recovery loop.
2. Reuse existing canonical JSON, digest, schema, atomic-publication, file-lock,
   and bounded-file utilities. Do not modify the existing vessel, mission
   review kernel, delegation coordinator, or Godskills repository.
3. Expose only `createMissionProgramCoordinator`,
   `assertMissionProgramCoordinator`, and the step adapter protocol from the
   runtime module. Do not add it to the default launch path.
4. Run focused tests after each state-machine slice: admission, ordering,
   reconciliation, recovery, replay, and tamper matrix.

## phase 3: deterministic fixture and certification

1. Add `fixtures/mission-program-v1.json` and
   `scripts/build-mission-program-fixture.mjs` with fixed time, two ordered
   steps, one pending recovery path, one process-boundary recovery path, and
   one exact terminal replay.
2. Add `scripts/build-mission-program-v1-receipt.mjs` to bind source manifest,
   schemas, tests, fixture, focused/full test counts, proof metrics, source
   commit, and the prior receipt ledger. Append
   `receipts/mission-program-v1.json` only after all gates pass.
3. Add a release-gate entry and a certification command test. Keep the
   certificate explicit that this is a trusted local adapter fixture.

## phase 4: documentation and integration boundary

1. Add the certified boundary to `README.md` and `docs/architecture.md` with
   the exact non-goals and recovery semantics from the design.
2. Add the new receipt to the current-head evidence only if the generated
   current-head builder can bind it without changing the Godskills pin or
   weakening the existing evidence. If not, leave the older certificate intact
   and issue a separate local receipt first.
3. Run the focused mission-program tests, the complete suite, the receipt
   verifier, and the current-head verifier before any merge.

## phase 5: review and integration

1. Perform an adversarial review of the state machine, durable-file scan,
   authority firewall, and ambiguous-completion behavior.
2. If the full verification is green and no pre-existing user change is
   touched, commit the implementation and receipt together as an append-only
   milestone and push `main`.
3. Do not claim a live runtime, default launcher adoption, or Lunari readiness.

## stop conditions

Stop implementation and preserve the evidence if any of these occur:

- the current Godskills head moves and the existing cross-repository pin cannot
  be reconciled without modifying `eternities-godskills`;
- a step adapter would need to receive raw mission text, credentials, Realm
  handles, or a continuity writer;
- recovery cannot distinguish absent, pending, and completed work without
  guessing;
- a test unexpectedly touches more than the declared bounded surface or the
  existing untracked lockfile would be overwritten.
