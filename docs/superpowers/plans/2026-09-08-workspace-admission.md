# Workspace admission implementation plan

> **For agentic workers:** Use `executing-plans` for inline task-by-task execution. Steps use checkbox syntax for tracking.

**Goal:** Carry an explicit workspace capability declaration through fresh creation, admission and the real inert cortex envelope without widening old hosts.

**Architecture:** Add a closed Realm profile to the existing distribution verifier and a matching resource projection to the existing cortex schema/compiler. Reuse actual genesis and admission checks. The later issued workspace owner remains a separate implementation task, not an implied capability of this inert profile.

**Tech Stack:** Node24+, first-party ESM and existing JSON-schema validator; no added dependency or provider call.

**Spec:** `docs/superpowers/specs/2026-09-08-workspace-admission-design.md`.

## Global constraints

- Preserve all v1/v2 Realm, identity, effect-producer, Godskills and historical receipt behavior.
- Profile local-workspace-v3; maximumFiles1..16, maximumRevisionBytes1..4194304.
- Fixed browser profile host-reviewed-browser-local-v1; independentReviewRequired:true, sourceMutation:false.
- No provider/browser dispatch, automatic identity migration, Soul or Lunari work.
- Preserve user package-lock.json; no unnecessary installation or full-suite rerun before the combined release gate.

## Task 1: closed profile through actual fresh admission

Completed prerequisite. The real admission test first rejected compatibility
before production changes. An earlier fixture-order policy-pin mismatch was
corrected in the test, not by weakening policy verification. The new profile
then reached actual genesis/cortex compilation with exact inert resource limits.
Focused new/old caller gate:27 passed,0 failed,3455.324ms,exit0. The final explicit
model-projection assertion also passed all5 new tests,542.9737ms,exit0.

**Files:** create `schemas/local-workspace-realm-contract.schema.json`,
`tests/local-workspace-admission.test.mjs`; modify
`src/core/schema-validator.mjs`, `src/realm/distribution-contract.mjs`,
`src/cortex/binding-compiler.mjs`, `schemas/cortex-identity-envelope.schema.json`.

**Interfaces:** keep `verifyDistributionRealmContract(input)` and all existing
creation/admission/binding APIs unchanged. Its new-profile result has the same
{schemaVersion,profile,contractDigest,capabilities} inspection shape. The full
contract and cortex resource projection are fixed in the spec.

- [x] Write a test constructing first-party creation inputs, matching five Realm
  capabilities in candidate/policy/embodiment, then call real compileCreation,
  admitLocalCreation, readAdmissionBinding/localGenesisAdmission and
  compileCortexBindingCandidate. Assert literal workspace resource limits and
  inert/empty-granted-effects output. Run `node --test tests/local-workspace-admission.test.mjs`;
  observe rejection of the unsupported version before any production edit.
- [x] Implement the exact v3 schema and register it. Add the explicit profile
  branch to verifyDistributionRealmContract, sharing artifact publication
  semantics without accepting unknown top-level or nested fields.
- [x] Add the explicit schema3 resource projection in compileFullEnvelope and
  the third closed resourceLimits branch. Do not use a generic fallback:

```js
const resourceLimits = {
  profile: realm.profile,
  maximumArtifactBytes: realm.artifactStore.maximumBytes,
  maximumFiles: realm.workspace.maximumFiles,
  maximumRevisionBytes: realm.workspace.maximumRevisionBytes,
  browserProfile: realm.workspace.browserProfile,
  independentReviewRequired: realm.workspace.independentReviewRequired,
  sourceMutation: realm.workspace.sourceMutation,
};
```

- [x] Re-run the real admission test and existing local-artifact Realm/binding and
  cortex binding tests. Observe exact limits at the real caller, not only schema acceptance.

## Task 2: refusal boundaries and handoff

Completed prerequisite. Sartre01a083fc-7326-7112-aeec-af344cfead76 independently
reviewed the source, closed schemas, real caller coverage and legacy refusals,
finding no must-fix issue. This branch remains unreleased; there is no new
certificate, owner, execution host, provider result or full integration claim.

**Files:** extend `tests/local-workspace-admission.test.mjs`; update this plan.

- [x] Exercise literal invalid changes for profile, capability, producer, fixed
  roots, maximumFiles0/17, maximumRevisionBytes0/4194305, fractional limits,
  independentReviewRequired:false, sourceMutation:true and unknown fields.
  Each must throw from verifyDistributionRealmContract; no corrected/coerced input.
- [x] Test a fresh creation with a missing required workspace capability against
  the full contract, then verify no admitted actor was published.
- [x] Instantiate the old counter host with v3 and assert no state file. Pass
  v3 to inspectArtifactRealmForHost and assert rejection. Re-verify an admitted
  snapshot after changing Realm bytes and assert rejection, not a new binding.
- [x] Run the focused new/old caller tests, obtain independent review of this
  additive boundary, and commit the coherent change. Do not label it a runnable
  agent or live quality result. Keep the larger workspace branch unreleased until
  the issued-owner execution path and its final integration gates are complete.

## Next dependent deliverable

The issued owner must bind real actor/admission, host policy, selected file
preimages, proposed child, independent review, suite/runtime, dispatch and actual
result. Reuse mission-operation-adapter/recovery; no second generic scheduler or
provider journal. Use the existing operations preflight for the traced callers
and symmetric review/comparison constraints. Its implementation plan follows
after the admission tests expose the actual compatible caller surface.
