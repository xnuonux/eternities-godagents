# external host qualification dossier v1 implementation plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral, body-free qualification dossier that binds portable-host contract evidence while refusing to claim live external-host qualification without explicit live evidence.

**Architecture:** Validate one exact SDK-issued portable host description, bind the certified conformance and adversarial receipt digests, and optionally validate a strictly bounded live-evidence envelope. Export construction and verification from the SDK, but do not add provider calls or default launch wiring.

**Tech Stack:** Node.js 24 ESM, JSON Schema, canonical JSON, SHA-256 digests, Node test runner, source-bound certification receipts.

**Spec:** `docs/superpowers/specs/2026-09-05-external-host-qualification-v1-design.md`

## Global Constraints

- Preserve the exact `eternities-portable-phase-host-v1` authority-empty description and all historical receipt bytes.
- Store no provider credentials, raw provider bodies, endpoints, callable handles, Realm handles, identity state, keel state, memory state, or model output.
- Keep the current contract-only certificate explicitly separate from live provider quality and external-host qualification.
- Preserve ordinary unbound Codex operation and all existing default launch paths.
- Keep the preserved untracked root `package-lock.json` untouched.

---

### Task 1: Add the dossier schema and failing contract tests

**Files:**
- Create: `schemas/external-host-qualification-dossier.schema.json`
- Create: `tests/external-host-qualification.test.mjs`
- Create: `tests/helpers/external-host-qualification-fixture.mjs`

**Interfaces:**
- The fixture exports `buildDeterministicExternalHostQualificationFixture()`.
- The test imports `buildExternalHostQualificationDossier` and
  `verifyExternalHostQualificationDossier` from the not-yet-created host module.
- The dossier shape is exactly `{schemaVersion, protocolId, status,
  hostDescription, hostDescriptionDigest, baseline, liveEvidence,
  dossierDigest}`.

- [ ] **Step 1: Write the failing tests**

Add tests for these exact behaviors:

```js
test('builds a deterministic contract-only dossier', async () => {
  const fixture = await buildDeterministicExternalHostQualificationFixture();
  const dossier = buildExternalHostQualificationDossier(fixture.input);
  assert.equal(dossier.status, 'contract-only');
  assert.equal(dossier.liveEvidence, null);
  assert.deepEqual(dossier, fixture.dossier);
});

test('binds a reserved live-evidence dossier without calling a provider', async () => {
  const fixture = await buildDeterministicExternalHostQualificationFixture();
  const live = buildExternalHostQualificationDossier({
    ...fixture.input,
    liveEvidence: fixture.liveEvidence,
  });
  assert.equal(live.status, 'live-evidence-bound');
  verifyExternalHostQualificationDossier(live);
});

for (const [label, mutate] of hostileCases) {
  test(`rejects ${label}`, async () => {
    const fixture = await buildDeterministicExternalHostQualificationFixture();
    assert.throws(() => verifyExternalHostQualificationDossier(mutate(fixture.dossier)));
  });
}
```

The hostile cases must cover host-description digest drift, authority expansion,
baseline receipt drift, a contract-only dossier with live evidence, missing
live phases, invalid source commit, credential-shaped fields, unknown fields,
and an oversized serialized dossier.

- [ ] **Step 2: Run the focused test to verify the intended failure**

Run: `node --test tests/external-host-qualification.test.mjs`

Expected: FAIL because the host module and schema-backed implementation do not
exist yet. Fix only test typos if the failure is an import or syntax error.

- [ ] **Step 3: Add the schema and deterministic fixture data**

The schema must require the exact top-level fields, fixed protocol id, the two
status values, the authority-free portable host description object, two baseline
receipt digests and protocol ids, nullable live evidence, and a 64-character
lowercase dossier digest. It must reject additional properties and require the
three phase result digests in live evidence.

The fixture must construct the existing provider-neutral host descriptors from
the repository helpers, use the current certified receipt digests
`4c82249de231aab58d35778e357ec03d8d830fe8421d58699fb95b2c55be0553` and
`0c1923a3033668b56e8013a98f7adad0f73a5a8cc93496848ff1c9d6ad72a4cc`, and use
fixed digest-shaped values for the reserved live evidence. It must not make a
network request or read a credential.

- [ ] **Step 4: Run the focused test again**

Run: `node --test tests/external-host-qualification.test.mjs`

Expected: FAIL only because the production builder and verifier are still
absent; the fixture and schema imports must load.

- [ ] **Step 5: Commit the red contract**

Run: `git add schemas/external-host-qualification-dossier.schema.json tests/external-host-qualification.test.mjs tests/helpers/external-host-qualification-fixture.mjs && git commit -m "test: define external host qualification dossier"`

### Task 2: Implement the fail-closed dossier verifier

**Files:**
- Create: `src/host/external-host-qualification.mjs`
- Modify: `tests/external-host-qualification.test.mjs`

**Interfaces:**
- Export `EXTERNAL_HOST_QUALIFICATION_PROTOCOL_ID`.
- Export `buildExternalHostQualificationDossier(input)`.
- Export `verifyExternalHostQualificationDossier(value)`.

- [ ] **Step 1: Implement exact shape and digest helpers**

Use `canonicalJson`, `sha256Value`, `assertSchema`, and
`assertNoCredentialFields`. Recompute `hostDescriptionDigest` from
`hostDescription`, call `verifyPortablePhaseHostDescription`, and reject any
value that contains credential-shaped fields. Enforce a 64 KiB canonical byte
ceiling before returning.

- [ ] **Step 2: Implement baseline and live-evidence validation**

Require fixed baseline protocol ids and valid receipt digests. For
`contract-only`, require `liveEvidence === null`. For
`live-evidence-bound`, require exactly `providerFamily`, `sourceCommit`,
`liveRunReceiptDigest`, `securityReceiptDigest`, and
`phaseReceiptDigests`; require a 40-character lowercase commit and all three
lowercase 64-character phase digests. Never inspect or invoke a provider.

- [ ] **Step 3: Run the focused tests to verify green**

Run: `node --test tests/external-host-qualification.test.mjs`

Expected: all contract, reserved-live-shape, digest, authority, credential,
unknown-field, and size tests pass.

- [ ] **Step 4: Commit the implementation**

Run: `git add src/host/external-host-qualification.mjs tests/external-host-qualification.test.mjs && git commit -m "feat: add external host qualification dossier"`

### Task 3: Expose the boundary through the SDK

**Files:**
- Modify: `src/sdk/index.mjs`
- Modify: `tests/portable-sdk-surface.test.mjs`
- Modify: `tests/external-host-qualification.test.mjs`

**Interfaces:**
- Add `eternities-external-host-qualification-v1` to the SDK description’s
  `supportedAdapterProtocols`.
- Export the protocol id, builder, and verifier from the package root.

- [ ] **Step 1: Add the SDK surface test**

Assert the exact three new root exports, the protocol id in the frozen SDK
description, and the unchanged authority and proof-limit declarations.

- [ ] **Step 2: Run the SDK surface test to verify red**

Run: `node --test tests/portable-sdk-surface.test.mjs tests/external-host-qualification.test.mjs`

Expected: FAIL because the root export and description entry are absent.

- [ ] **Step 3: Add the explicit exports**

Re-export only the new protocol id, builder, and verifier. Do not add a default
host, provider selection, credentials, or a new package entrypoint.

- [ ] **Step 4: Run the focused SDK tests**

Run: `node --test tests/portable-sdk-surface.test.mjs tests/external-host-qualification.test.mjs`

Expected: PASS with no provider or credential work.

- [ ] **Step 5: Commit the SDK boundary**

Run: `git add src/sdk/index.mjs tests/portable-sdk-surface.test.mjs tests/external-host-qualification.test.mjs && git commit -m "feat: expose host qualification dossier in sdk"`

### Task 4: Add deterministic fixture and source-bound certification

**Files:**
- Create: `fixtures/external-host-qualification-v1.json`
- Create: `scripts/build-external-host-qualification-v1-fixture.mjs`
- Create: `scripts/build-external-host-qualification-v1-receipt.mjs`
- Create: `tests/external-host-qualification-certification.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Add `build:external-host-qualification-fixture` and
  `certify:external-host-qualification` scripts.
- The receipt id is `external-host-qualification-v1` and the certification
  protocol is `eternities-external-host-qualification-certification-v1`.
- The receipt binds the spec, plan, implementation and test manifests, fixture
  digest, focused and full test counts, and explicit `liveQualification: false`.

- [ ] **Step 1: Write the certification reconstruction test**

Require the committed fixture to equal a fresh helper reconstruction and the
receipt to rebuild byte-for-byte from its source commit. Reject a forged
`liveQualification: true` metric and a changed baseline receipt digest.

- [ ] **Step 2: Run the certification test to verify red**

Run: `node --test tests/external-host-qualification-certification.test.mjs`

Expected: FAIL because the fixture, certifier, and receipt are absent.

- [ ] **Step 3: Implement the fixture builder and certifier**

Follow the existing source-bound certifier pattern. Run the focused dossier
tests before writing the receipt, then run the complete suite, build the
implementation and test manifests, and record zero provider calls, zero
credential disclosures, and `liveQualification: false`.

- [ ] **Step 4: Build and certify the new boundary**

Run:

```text
npm run build:external-host-qualification-fixture
npm run certify:external-host-qualification
```

Expected: the fixture and receipt are canonical, source-bound, and explicitly
contract-only.

- [ ] **Step 5: Commit the certification**

Run: `git add fixtures/external-host-qualification-v1.json scripts/build-external-host-qualification-v1-fixture.mjs scripts/build-external-host-qualification-v1-receipt.mjs tests/external-host-qualification-certification.test.mjs package.json receipts/external-host-qualification-v1.json && git commit -m "certify: external host qualification boundary"`

### Task 5: Bind current-head evidence and refresh documentation

**Files:**
- Modify: `src/certification/verify-ledger.mjs`
- Modify: `src/integration/current-head-certificate.mjs`
- Modify: `tests/cross-repository-current-head-v2.test.mjs`
- Modify: `tests/cross-repository-current-head-v2-receipt.test.mjs`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Register `receipts/external-host-qualification-v1.json` in the certification
  ledger with historical pre-feature baselines preserved.
- Add one current-head evidence row with `liveQualification: false` and the
  exact dossier receipt and fixture digests.
- Preserve compatibility profiles for commits before this receipt; old heads
  must not acquire the new boundary path.

- [ ] **Step 1: Add current-head red expectations**

Assert the current profile exposes the new boundary only when the committed
receipt exists, the receipt path and protocol match, and the evidence says
`liveQualification: false`. Assert a historical pre-feature certificate keeps
the old boundary path set.

- [ ] **Step 2: Run current-head tests to verify red**

Run: `node --test tests/cross-repository-current-head-v2.test.mjs tests/cross-repository-current-head-v2-receipt.test.mjs`

Expected: FAIL because the current-head integration has no dossier evidence or
compatibility profile.

- [ ] **Step 3: Implement ledger and current-head binding**

Add the receipt registry entry and a pre-dossier expected-file set. Extend the
current profile and verifier with exact dossier receipt checks, source commit
ancestry, full-test count, fixture digest, receipt digest, and the explicit
false live-qualification metric. Do not loosen any historical checks.

- [ ] **Step 4: Update the architecture and user-facing boundary**

Document the dossier as a contract-only migration boundary, name the exact
certification command and receipt, and state that Codex, Claude Code,
local-model, MCP, live provider quality, hosted durability, and remote
exactly-once behavior remain unqualified.

- [ ] **Step 5: Rebuild current-head evidence and run targeted gates**

Run:

```text
npm run build:cross-repository-current-head-v2
npm test -- tests/cross-repository-current-head-v2.test.mjs tests/cross-repository-current-head-v2-receipt.test.mjs
npm run verify:cross-repository-current-head-v2
```

Expected: the new current-head profile is verified and historical profiles
remain reproducible.

- [ ] **Step 6: Commit the integrated boundary**

Run: `git add README.md docs/architecture.md integrations/cross-repository-current-head-v2.json src/certification/verify-ledger.mjs src/integration/current-head-certificate.mjs tests/cross-repository-current-head-v2.test.mjs tests/cross-repository-current-head-v2-receipt.test.mjs && git commit -m "certify: bind host qualification to current head"`

### Task 6: Verify, review, merge, and publish

**Files:**
- No new implementation files; verify the complete branch.

- [ ] **Step 1: Run focused and full tests**

Run: `npm test`

Expected: 1,089 or more tests pass with zero failures after the new focused
tests are included.

- [ ] **Step 2: Run all certification and release gates**

Run: `npm run verify:certifications`, `npm run verify:release-lineage`, and
`npm run verify:cross-repository-current-head-v2`. Each must exit successfully
and report its exact digest.

- [ ] **Step 3: Inspect the diff and verify no credential or provider body**

Run: `git diff main...HEAD --check`, `git diff --stat main...HEAD`, and search
the new dossier, fixture, receipt, and manifests for `apiKey`, `token`,
`authorization`, `secret`, `endpoint`, and raw provider-body fields. Any
positive result is a stop condition unless it is a test-only rejection case.

- [ ] **Step 4: Merge and push only after all gates pass**

From the main checkout, fetch `origin`, verify `main` still equals its remote,
merge `feat/external-host-qualification-boundary-v1 --no-ff`, rerun the three
post-merge gates, and push `main` to `origin`.

- [ ] **Step 5: Report exact evidence and explicit proof limits**

Report the merge commit, receipt digest, fixture digest, focused/full test
counts, ledger digest, release-lineage digest, current-head digest, and the
fact that `liveQualification` remains false.
