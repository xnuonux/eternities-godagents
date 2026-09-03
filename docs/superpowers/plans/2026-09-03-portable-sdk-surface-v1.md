# Portable Godagents SDK Surface v1 Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a minimal stable package root for the existing verified provider-phase host and admitted provider-backed launcher without adding authority or changing launch behavior.

**Architecture:** Add one `src/sdk/index.mjs` façade that exports only the existing provider-host and admitted-launcher entrypoints plus an explicit, deeply frozen SDK descriptor. Add a package `exports` map while keeping the package private. Prove the closed surface, descriptor honesty, both provider-family constructions, and launcher construction with direct tests; document the intentionally incomplete provider-neutral claim.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, canonical JSON and digest helpers already used by Godagents, npm package self-reference.

**Spec:** `docs/superpowers/specs/2026-09-03-portable-sdk-surface-v1-design.md`

## Global Constraints

- The package remains private and has no runtime dependencies.
- Provider family is explicit and limited to the two registered families.
- Existing provider policy, credential, admission, Godskills, Realm, continuity, keel, evolution, Inspiration, Lunari, and Soul boundaries remain unchanged.
- Automated tests make no live provider request.
- Existing certification receipts and launch paths remain unchanged.
- No Godskills body, routing logic, or release pin is copied or modified.

---

### Task 1: Define the SDK façade contract with failing tests

**Files:**
- Create: `tests/portable-sdk-surface.test.mjs`
- Create: `src/sdk/index.mjs`
- Modify: `package.json`
- Test: `tests/portable-sdk-surface.test.mjs`

**Interfaces:**
- Consumes: `createProviderPhaseHost`, `verifyProviderPhaseHostDescription`, and `assertProviderPhaseHostInstance` from `src/host/provider-phase-host-sdk.mjs`; `createAdmittedProviderBackedIdentityLauncher` and its verifier from `src/host/admitted-provider-backed-identity-launcher.mjs`.
- Produces: `GODAGENT_SDK_PROTOCOL_ID`, `GODAGENT_SDK_VERSION`, `describeGodagentSdk()`, and the five existing verified host/launcher functions from `src/sdk/index.mjs`; package self-reference `@eternities/godagents` resolves to that façade.

- [ ] **Step 1: Write the failing export and descriptor tests**

Add tests that import `@eternities/godagents` and assert the exact export list, descriptor fields, deep freezing, and absence of credential/path/provider-response/authority operation keys. Add a second test that calls `describeGodagentSdk()` twice, mutates neither result, and asserts canonical equality with distinct object identity.

Add a third test that imports the two current policy fixtures, writes canonical provider policy files into an isolated temporary directory, constructs both provider families through the package root with a fetch function that would throw if called, and asserts each returned description is accepted by the exported verifier and reports zero calls. Add a fourth test that asserts the exported launcher factory and verifier are functions and rejects an unknown launcher configuration field before any dependency construction.

Run:

```powershell
node --test tests/portable-sdk-surface.test.mjs
```

Expected: FAIL because the package has no `exports` map or SDK façade yet.

- [ ] **Step 2: Implement the minimal façade**

Create `src/sdk/index.mjs` with the following closed root exports:

```js
export const GODAGENT_SDK_PROTOCOL_ID = 'eternities-godagents-sdk-v1';
export const GODAGENT_SDK_VERSION = '0.1.0';
export function describeGodagentSdk() { /* fresh deeply frozen descriptor */ }
export { createProviderPhaseHost, verifyProviderPhaseHostDescription, assertProviderPhaseHostInstance } from '../host/provider-phase-host-sdk.mjs';
export { createAdmittedProviderBackedIdentityLauncher, verifyAdmittedProviderBackedIdentityLauncherDescription } from '../host/admitted-provider-backed-identity-launcher.mjs';
```

The descriptor must be built from fixed, non-secret literals, cloned before
return, and recursively frozen. It must declare `status: 'experimental'`,
the two existing family ids, and false proof flags for live provider quality,
remote exactly-once, default host adoption, public publication, Realm,
continuity, evolution, Inspiration, Lunari, and Soul. It must not accept
arguments or read the environment.

Add the package export map:

```json
"exports": {
  ".": "./src/sdk/index.mjs",
  "./package.json": "./package.json"
}
```

Do not add wildcard exports or alter the existing scripts.

- [ ] **Step 3: Run the focused tests to verify green**

Run:

```powershell
node --test tests/portable-sdk-surface.test.mjs
```

Expected: all four focused tests pass with zero failures, and the throwing
fetch function is never called during either host construction.

### Task 2: Verify compatibility and document the public boundary

**Files:**
- Modify: `README.md`
- Test: `tests/portable-sdk-surface.test.mjs`

**Interfaces:**
- Consumes: the package façade and the exact current provider host/launcher contracts from Task 1.
- Produces: an operator-readable SDK section that names the supported scope and proof limits without implying a universal adapter product.

- [ ] **Step 1: Add the compatibility assertions**

Extend the focused test with one assertion that the package root does not
expose `createPersistentVessel`, `launchAdmittedSealedIdentityMission`, raw
transport factories, credential resolvers, or any key containing `secret`,
`credential`, `realm`, `keel`, `continuity`, `evolution`, `soul`, `lunari`, or
`inspiration`. Assert that the two exported verifier functions reject a
descriptor with a changed digest, preserving the existing fail-closed
behavior through the façade.

- [ ] **Step 2: Run the focused regression tests**

Run:

```powershell
node --test tests/portable-sdk-surface.test.mjs tests/provider-phase-host-sdk.test.mjs tests/provider-backed-identity-cli-contracts.test.mjs
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 3: Document the surface**

Add a `Portable SDK surface v1` section after the provider-backed CLI section
in `README.md`. Show a short import example, identify the two supported
provider families, state that the package remains private and experimental,
and list the explicit non-goals: live quality, new adapters, default launch
changes, public publication, and all authority-bearing systems.

- [ ] **Step 4: Run the full verification**

Run:

```powershell
npm test
npm run verify:certifications
npm run verify:release-lineage
git diff --check
git status --short --branch
```

Expected: the full suite passes, certification and release-lineage verification
remain valid, diff checking is clean, and only the planned files are changed.

### Task 3: Independent review and handoff

**Files:**
- Review: the Task 1 and Task 2 diff from the current main commit
- Test: all verification commands from Task 2

**Interfaces:**
- Consumes: the exact candidate commit, focused and full test results, and the package façade design.
- Produces: an independent review of export closure, descriptor honesty, authority preservation, and compatibility.

- [ ] **Step 1: Request an independent review**

Give a reviewer the exact base and candidate commits plus the spec path. Ask
for critical, important, and minor findings, with special attention to
accidental internal exports, descriptor claims, environment or credential
reads, and launch-path changes.

- [ ] **Step 2: Resolve review findings**

For every critical or important finding, add a regression test first, observe
the failure, apply the smallest fix, and rerun the focused and full gates.
Record any valid minor finding as a bounded follow-up rather than expanding
this slice.

- [ ] **Step 3: Decide integration without changing main implicitly**

Only after fresh verification and review, report the exact branch, commit,
files, test counts, and proof limits. Do not create a certification receipt or
merge the branch until the integration decision is explicitly made by the
coordinator.
