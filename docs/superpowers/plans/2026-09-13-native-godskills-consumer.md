# Native Godskills consumer implementation plan

> **For agentic workers:** Use `dispatching-parallel-agents` for independent checks; keep the coupled native binding inline. Track verified steps below.

**Goal:** Deliver opt-in, receipt-bound Godskills disclosure to the real native Pi inference path, with immutable mission selection and unchanged unbound operation.

**Architecture:** Reuse the release/routing verifiers, routing-evidence classifier and local recoverable mission adapter. A thin native consumer derives mission/genome/effect facts from the admitted actor and grant, stores the exact verified binding, and rehydrates it before every native/compaction inference and on resume. The native association binds its digest. CLI configuration optionally carries the same independently pinned policy.

**Tech Stack:** Node24 ESM, existing Godagents runtime and optional Pi0.85.1 SDK, pinned first-party Godskills release.

**Spec:** `docs/audits/2026-09-13-native-godskills-readiness.md`, with the concrete contract below. Dom's standing approval covers scoped implementation, review, verified merge and push. No new provider spending, global activation or release-root migration.

## Contract and source ownership

- `src/skills/native-godskills-binding.mjs` owns policy validation, verified selection/recovery and bounded disclosure. It never grants tools or changes identity.
- `src/host/native-host-binding.mjs` derives effect ceiling after existing grant validation, binds the skill record digest into association and validates it before provider entry. Existing omitted-input behavior remains byte-compatible.
- `src/host/native-pi-operator-config.mjs` and `native-pi-operator.mjs` expose optional `godskills: {policy, expectedPolicyDigest}` with the complete config pin still required. Preflight verifies without routing, provider entry or session writes; status/history remain offline.
- No changes to old certification receipts or Godskills repository. No copying cold skill bodies. Selected certified contracts/entrypoints remain runtime inputs from the pinned release.
- Policy exact fields: `schemaVersion:1`, `protocolId:eternities-native-godskills-policy-v1`, `releasePin`, `routingPin`, `sourceStateEpoch`, `hostEnvelope`, `explicitMethodRequests`, `reviewAvailable`, `maximumDisclosureBytes`.
- Host envelope exact fields: `availableAuthority`, `permittedEffects`, `availablePreconditions`, `forbiddenCapabilities`, `maximumRisk`, `minimumEvidenceConfidence`, `contextBudget`, `maxCompositionSize`. Constitution, Realm digest and genome eligibility are derived, never policy-overridden.
- All lists bounded/unique; effects must be a subset of the validated native grant, constitution and Realm. Native read/write/process effect labels cannot imply unavailable tools. Other authority/precondition labels are explicit host attestations, not runtime permissions. Composition <=3 and disclosure <=32KiB, also <=release/host ceilings. Unsupported versions, corrupt roots, pending/unresolved/no-qualified routes, source drift and mismatched saved selection fail before inference.
- Review availability is a host assertion; this consumer never executes a separate review phase. Review disclosure is `scheduled-only`. Explicit method requests are host-owned, not inferred from untrusted task text.
- Store one `godskills.json` under the native state directory with policy/candidate/grant/input digests, exact mission binding and record digest. Resume requires it and rehydrates without route/classifier execution. Each provider entry verifies release closure and selected artifacts, comparing the exact compiled package. No reroute on compaction.
- Runtime JSON stays private. Expose only bounded selected package and digest metadata to the model; never the catalog, filesystem policy paths, other keels, or raw routing records. Native shell still has OS-user access, not confinement.

## 1. Verified native selection and recovery

- [ ] Add `tests/native-godskills-binding.test.mjs` against actual pinned local verifiers/adapter and a fresh admitted fixture. Before implementation, confirm missing consumer failure.
- [ ] Implement `prepareNativeGodskills({options,candidate,request,grant,effectCeiling,stateDirectory,resume})`, returning `{recordDigest,disclosure,validate}`. `validate()` rechecks the pinned closure and rehydrates the exact stored receipt, never dispatches a route.
- [ ] Test matching recovery, changed policy/mission/grant refusal, effect expansion, byte overflow, invalid protocol/pins, prohibited capability and no-route refusal, and persisted-record tampering. Assert real results, not mocked verifier brands.
- [ ] Run `node --test tests/native-godskills-binding.test.mjs`.

## 2. Native inference and operator integration

- [ ] Add real Pi SDK scripted-provider tests before wiring: exact selected disclosure appears once per call, no unselected bodies; same association across resume; drift blocks next provider; compaction reuses selection; omitted option preserves previous behavior.
- [ ] Wire the existing native stream through binding validation, persist selection digest in association, and add the optional operator config/preflight path. Test actual caller behavior and unchanged no-skill commands.
- [ ] Run focused native consumer/operator/session suites with the installed optional SDK enabled.

## 3. Review, release and useful handoff

- [ ] Independent source review on Grok subscription with bounded sterile review context; owner reproduces material findings and repairs test-first. No live quality claim from scripted providers.
- [ ] Run targeted integration, full relevant release suite once, and historical ledger verification without receipt regeneration. Inspect diff and preserve user package-lock.json.
- [ ] Fetch/reconcile, merge verified branch, push main, verify ref-aware merged gates, and publish the exact audit. A matched live benefit study is next, not implied by this consumer.

Rollback: omit the option for newly created native associations. Already-bound sessions cannot strip skills or change roots by editing a digest; they require explicit new association/migration. No destructive cleanup or automatic retries.
