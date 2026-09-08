# Effect-only local workflow implementation plan

> **For agentic workers:** Use `executing-plans` for inline task-by-task execution.

**Goal:** Prepare, run, retrieve and replay an effect-only v2 mission through the existing local operator workflow.

**Architecture:** Preserve the exact v1 configuration and manifest. Add an explicit schema-v2 configuration with separately approved routing/verifier pins and a structured effect request; use the issued-host facade rather than v1 review dependencies. Persist a versioned manifest and verify the v2 terminal chain before artifact publication.

**Tech Stack:** Node 24 ESM, existing filesystem journals, JSON policies, node:test.

**Spec:** `docs/effect-only-sdk-launch.md`, `docs/effect-only-vessel-migration-decision.md`.

## Global constraints

- No provider calls during preparation; no paid calls in this implementation batch.
- Do not grant authority, select models, change genomes, activate Soul, or integrate Lunari.
- Preserve v1 behavior, historical receipts and occupied workspaces.
- Godskills roots remain external pinned dependencies, never copied into this repository.

## 1. Inert preparation

Files: `examples/local-artifact-workflow/prepare.mjs`, `cli.mjs`, `tests/local-artifact-workflow.test.mjs`.

Interface: `prepareLocalWorkflow({workspace, configuration})` retains its return shape. V2 exact root keys are `schemaVersion`, `admission`, `family`, `providerPolicyPath`, `effectOnly`, `request`, `hostPolicy`. `effectOnly` exact keys are `repositoryRoot`, `routingExecutable`, `verifierExecutable`, `producerDescriptorDigest`. The request is already prepared by the structured producer; preparation verifies it, not silently edits it.

- [ ] Add a v2 preparation scenario using real creation/admission and frozen test dependency pins. Assert schema-v2 manifest/policy, no review/classifier dependencies, verified request and zero fetches. Run it red against the closed v1 configuration.
- [ ] Branch exact configuration validation by explicit schemaVersion 2. Build v2 runtime using issued host native descriptor and explicit pins. Call `verifyIdentityHostPolicyRouting(loaded.policy)` before publishing the ready manifest. V2 manifest omits review/revision materialization fields; retain v1 fields unchanged.
- [ ] Resolve `effectOnly.repositoryRoot` relative to the CLI configuration instead of accessing nonexistent `releasePin`. Run v1 and v2 preparation tests and closed-shape/pin-negative checks.
- [ ] Commit the verified inert preparation batch.

## 2. Run and verify terminal output

Files: `examples/local-artifact-workflow/run.mjs`, existing v2 completion contracts, `tests/local-artifact-workflow.test.mjs`.

Interface: `runLocalWorkflow({manifestPath, expectedManifestDigest, env, createProviderPhaseHostImpl})` preserves existing operator result shapes. A schema-v2 manifest selects `createAdmittedEffectOnlyIdentityLauncher({host, hostKind:'provider'})`, using pinned prepared policy and request snapshots.

- [ ] Extend the v2 test past preparation: controlled provider native artifact, identical replay, denied write zero dispatch, ambiguous dispatch pending. Confirm current runner rejects the v2 manifest before implementing.
- [ ] Validate exact v2 manifest keys and policy/request version agreement. Build issued provider host with pinned prepared provider policy and existing runtime location. Do not route through the v1 executor-prefix derivation.
- [ ] Verify v2 terminal evidence with the existing admission/context-aware completion verifier, reconstructing from authenticated persisted evidence rather than trusting a self-hashed arbitrary result. Preserve the existing checked artifact writer and bounded output.
- [ ] Exercise tampered manifest/input/receipt and accepted-artifact mismatch rejection; preserve v1 rejection and recovery behavior.
- [ ] Commit after targeted checks and independent review.

## 3. Integration

Files: `docs/local-artifact-workflow.md`, `docs/current-state.md`, new scoped audit under `docs/audits`.

- [ ] Document exact v2 fields and operator command, separate offline proof from live qualification, and retain ambiguity/no-retry guidance.
- [ ] Run workflow, CLI, transport, facade and receipt tests. Obtain independent boundary review.
- [ ] At the integration gate, run the full suite once, retain the log and exact commit, reconcile upstream, merge/push verified changes under standing approval. Relay exact merged coordinates to Godskills; do not promote its source branch implicitly.

Live comparison remains a separate resource-authorized gate, not a consequence of this migration.
