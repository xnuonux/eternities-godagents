# Godagent Deterministic Creator Protocol Phase 3 Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and certify a headless creator protocol whose manual, preset, and future agent-guided interfaces all produce the same reviewed Phase 1 creation build.

**Architecture:** Add a frozen catalog over validated creation libraries, an immutable digest-linked draft command engine, a pure preview projection, and a review-pinned finalizer that delegates authority to the existing compiler. The first slice uses local JSON fixtures and no network, database, frontend framework, genesis call, evolution path, or Soul path.

**Tech Stack:** Node.js 24 ESM, `node:test`, existing canonical JSON and SHA-256 utilities, existing strict schema validator, existing Phase 1 creation compiler and verifier

**Spec:** `docs/superpowers/specs/2026-08-29-godagent-deterministic-creator-protocol-design.md`

## Global Constraints

- Keep the repository dependency-free.
- Preserve all historical receipt bytes and existing fixture build IDs.
- Require the creation-policy digest through a caller-supplied trust path.
- Never place credentials, provider routing, runtime host policy, mutable evolution, Inspiration state, or active Soul state in catalog, command, draft, preview, or finalization values.
- Presets store validated kind-and-payload choices, replay them as ordinary current-revision commands, and never call the compiler directly.
- Preview writes no files and finalization cannot call transactional genesis.
- Use canonical JSON for every digest-bearing value and sort filesystem-derived inputs bytewise.
- Every behavior change follows red, green, refactor and receives a focused commit.

---

### Task 1: Creator contracts and immutable draft chain

**Files:**
- Create: `schemas/creator-command.schema.json`
- Create: `schemas/creator-draft.schema.json`
- Create: `schemas/creator-preset.schema.json`
- Create: `src/creator/contracts.mjs`
- Create: `src/creator/draft.mjs`
- Modify: `src/core/schema-validator.mjs`
- Test: `tests/creator-contracts.test.mjs`
- Test: `tests/creator-draft.test.mjs`

**Interfaces:**
- Consumes: `canonicalJson(value)`, `sha256Value(value)`, `assertSchema(name, value)`, `MODULE_KINDS`, `parseModuleRef(reference)`, `expressionRef(expression)`, `deepFreeze(value)`
- Produces: `CREATOR_COMMAND_KINDS`, `validateCreatorChoice(choice)`, `validateCreatorCommand(command)`, `createCreatorDraft({ catalogDigest, creatorRef })`, `applyCreatorCommand({ draft, command })`, and `creatorDraftProjection(draft)`

- [ ] **Step 1: Write failing schema and command-contract tests**

Add assertions that `validateCreatorChoice` accepts exactly `kind` and `payload`, while the command envelope requires exactly `schemaVersion`, `kind`, `expectedDraftDigest`, and `payload`. Command kinds are closed; `select-module` requires one canonical kind-matching module ref; section commands accept only the exact corresponding candidate section; unknown keys, path-shaped refs, functions, `undefined`, `__proto__`, `credential`, provider routing, mutable evolution, and active Soul values fail without echoing their values. `validateCreatorCommand` must call the same choice validator after checking its concurrency envelope.

Representative test:

```js
const command = {
  schemaVersion: 1,
  kind: 'select-module',
  expectedDraftDigest: digest('a'),
  payload: { kind: 'lineage', ref: 'lineage:synthetic-explorer@1.0.0' },
};
assert.deepEqual(validateCreatorCommand(command), command);
assert.throws(
  () => validateCreatorCommand({ ...command, payload: { ...command.payload, credential: 'canary' } }),
  /command payload is invalid/,
);
```

- [ ] **Step 2: Run the contract test and verify red**

Run: `node --test tests/creator-contracts.test.mjs`

Expected: FAIL because creator schemas and `validateCreatorCommand` do not exist.

- [ ] **Step 3: Implement the closed command contracts**

Register the three new schemas. Keep the JSON schema envelope simple enough for the repository validator and enforce per-kind exact keys in `contracts.mjs`.

Use the command kinds:

```js
export const CREATOR_COMMAND_KINDS = Object.freeze([
  'set-blueprint', 'set-genesis', 'set-expression', 'select-module', 'set-telos',
  'set-constitution', 'set-prompt-os', 'set-memory', 'set-realm',
]);
```

Return a deep-cloned, canonicalized, frozen command. Validate candidate sections by constructing the narrow corresponding object and calling the existing candidate schema only after all required sections exist; for individual sections use exact-key checks and the same bounds copied from `creation-candidate.schema.json`.

- [ ] **Step 4: Run the contract test and verify green**

Run: `node --test tests/creator-contracts.test.mjs`

Expected: PASS with no warnings.

- [ ] **Step 5: Write failing immutable-draft tests**

Assert that a new draft is revision zero, has a zero previous digest, fixes `evolution: { policy: 'frozen-v0' }` and `soulPort: { schemaVersion: 1, status: 'dormant' }`, and is deeply frozen. Applying a command must require the exact current digest, increment revision once, bind the previous digest, and produce a deterministic new digest. The same commands from objects with different insertion order must yield identical draft bytes. A stale command must reject without mutating either value.

```js
const initial = createCreatorDraft({
  catalogDigest: digest('c'),
  creatorRef: 'creator:dom',
});
const next = applyCreatorCommand({
  draft: initial,
  command: {
    schemaVersion: 1,
    kind: 'set-expression',
    expectedDraftDigest: initial.draftDigest,
    payload: { ref: 'expression:aether-architect@1.0.0' },
  },
});
assert.equal(next.revision, 1);
assert.equal(next.previousDraftDigest, initial.draftDigest);
assert.equal(Object.isFrozen(next), true);
```

- [ ] **Step 6: Run the draft test and verify red**

Run: `node --test tests/creator-draft.test.mjs`

Expected: FAIL because `draft.mjs` does not exist.

- [ ] **Step 7: Implement minimal immutable draft replay**

`creatorDraftProjection` excludes `draftDigest`, and `draftDigest` is `sha256Value(creatorDraftProjection(draft))`. `applyCreatorCommand` clones only the approved field, canonicalizes array order only where the underlying candidate contract is set-like, validates the resulting draft schema, and returns `deepFreeze(next)`.

- [ ] **Step 8: Run both focused tests and the full suite**

Run: `node --test tests/creator-contracts.test.mjs tests/creator-draft.test.mjs`

Run: `npm test`

Expected: all tests pass and historical tests remain green.

- [ ] **Step 9: Commit the contracts and draft engine**

```powershell
git add schemas/creator-command.schema.json schemas/creator-draft.schema.json schemas/creator-preset.schema.json src/core/schema-validator.mjs src/creator/contracts.mjs src/creator/draft.mjs tests/creator-contracts.test.mjs tests/creator-draft.test.mjs
git commit -m "feat: add immutable creator draft protocol"
```

---

### Task 2: Deterministic validated creator catalog

**Files:**
- Create: `src/creator/catalog.mjs`
- Create: `fixtures/creator/expressions/aether-architect.json`
- Create: `fixtures/creator/expressions/quiet-cartographer.json`
- Create: `fixtures/creator/presets/aether-architect.json`
- Create: `fixtures/creator/presets/quiet-cartographer.json`
- Create: `fixtures/creation/modules/lineage-cartographer.json`
- Create: `fixtures/creation/modules/archetype-research-strategist.json`
- Create: `fixtures/creation/modules/attributes-research-balanced.json`
- Create: `fixtures/creation/modules/personality-patient-skeptic.json`
- Create: `fixtures/creation/modules/voice-quiet-precise.json`
- Test: `tests/creator-catalog.test.mjs`

**Interfaces:**
- Consumes: `loadCreationPolicy(path, expectedDigest)`, `validateModuleContract(module, policy)`, `moduleRef(module)`, `expressionRef(expression)`, `validateCreatorCommand(command)`, `canonicalJson`, `sha256Text`, `sha256Value`
- Produces: `loadCreatorLibrary({ policyPath, expectedPolicyDigest, moduleDirectory, expressionDirectory, presetDirectory }) -> { catalog, sourceLoader }` and `loadCreatorCatalog(options) -> frozen catalog`

- [ ] **Step 1: Write failing catalog tests**

Assert that loading the same libraries with shuffled directory enumeration and reformatted JSON yields the same `catalogDigest`; rows sort by canonical identity; maps are read-only; every module and expression has a source digest; presets contain only validated choices; and two real presets are discoverable.

Add adversarial temporary libraries that contain duplicate refs, unknown JSON files, malformed modules, expression-ref collisions, a preset command with authority-shaped data, and a policy mismatch. Each must reject catalog loading before a catalog is returned.

- [ ] **Step 2: Run the catalog test and verify red**

Run: `node --test tests/creator-catalog.test.mjs`

Expected: FAIL because the loader and fixture libraries do not exist.

- [ ] **Step 3: Add one meaningful alternative creation path**

Add a `synthetic-cartographer` lineage, `research-strategist` archetype, research-balanced attributes, patient-skeptic personality, and quiet-precise voice. Reuse the existing builder organs, portable Godskills, cortex, and local-workbench embodiment. The new lineage and archetype must be mutually compatible, remain inside the existing policy ceiling, and produce derived attributes within 0 through 100.

The two expression fixtures must both satisfy `expression-overlay.schema.json`. The two preset fixtures use this exact envelope:

```json
{
  "schemaVersion": 1,
  "id": "quiet-cartographer",
  "version": "1.0.0",
  "choices": []
}
```

Populate `choices` with the complete ordered kind-and-payload stream. Never embed a revision digest, compiler path, or build ID.

- [ ] **Step 4: Implement catalog loading and projection**

Read only direct `.json` files. Reject every non-JSON file or child directory as an unexpected library entry. Validate every source before selecting rows. Derive catalog rows from validated data, sort by canonical ref, and compute:

```js
const unsigned = {
  schemaVersion: 1,
  policyDigest,
  modules,
  expressions,
  presets,
};
const catalog = deepFreeze({ ...unsigned, catalogDigest: sha256Value(unsigned) });
```

Catalog rows may contain only the fields named in the spec. Return raw validated source values only through a separate frozen `sourceLoader` with `catalogDigest`, `resolveModule(ref)`, `resolveExpression(ref)`, and `resolvePreset(ref)` methods. Each resolver returns a fresh frozen clone, rejects unknown refs, and cannot enumerate or mutate the backing maps. `loadCreatorCatalog` returns only `library.catalog`.

- [ ] **Step 5: Run focused catalog and historical creation tests**

Run: `node --test tests/creator-catalog.test.mjs tests/creation-compiler.test.mjs`

Run: `npm run build:creation-fixture`

Expected build ID: `9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64`.

- [ ] **Step 6: Commit the catalog and alternative fixtures**

```powershell
git add src/creator/catalog.mjs fixtures/creator fixtures/creation/modules tests/creator-catalog.test.mjs
git commit -m "feat: add deterministic creator catalog"
```

---

### Task 3: Preview, closed compatibility issues, and preset parity

**Files:**
- Create: `src/creation/compatibility-error.mjs`
- Modify: `src/creation/compatibility.mjs`
- Create: `src/creator/preview.mjs`
- Create: `src/creator/preset.mjs`
- Test: `tests/creation-compatibility.test.mjs`
- Test: `tests/creator-preview.test.mjs`
- Test: `tests/creator-preset-parity.test.mjs`

**Interfaces:**
- Consumes: `applyCreatorCommand`, catalog rows, `resolveSelectedModules`, `assertCreationCompatibility`, `deriveAttributes`, `projectGenome`, `assertSchema('creation-candidate')`
- Produces: `CreationCompatibilityError(code)`, `previewCreatorDraft({ draft, catalog, sourceLoader })`, `replayCreatorPreset({ draft, preset })`

- [ ] **Step 1: Write a failing typed-compatibility regression**

Extend existing compatibility tests to assert stable codes for at least lineage/archetype mismatch, organ omission, Godskills omission, capability-family mismatch, Realm mismatch, authority ceiling, frozen evolution, and dormant Soul refusal.

```js
assert.throws(
  () => assertCreationCompatibility(input),
  (error) => error.name === 'CreationCompatibilityError'
    && error.code === 'lineage-archetype-incompatible',
);
```

- [ ] **Step 2: Run the compatibility test and verify red**

Run: `node --test tests/creation-compatibility.test.mjs`

Expected: FAIL because errors do not expose closed codes.

- [ ] **Step 3: Add closed codes without changing success behavior**

Create one error class that validates its code against a frozen set and uses a constant safe message per code. Replace compatibility `TypeError` throws only at the policy and compatibility boundaries covered by the tests. Do not include module-authored values in messages. Preserve successful validation rows byte-for-byte so historical build IDs do not change.

- [ ] **Step 4: Run compatibility and creation reproducibility tests**

Run: `node --test tests/creation-compatibility.test.mjs tests/creation-compiler.test.mjs`

Expected: PASS and canonical creation build ID unchanged.

- [ ] **Step 5: Write failing preview tests**

Assert incomplete drafts return sorted closed missing rows and no candidate, expression, genome, or derived attributes. A complete incompatible draft returns `blocked` with the exact compatibility code. A complete valid draft returns `ready`, the exact candidate and selected expression, derived attributes, operational genome, excluded field names, and a digest independent of property insertion order. Preview must not create files.

- [ ] **Step 6: Run preview tests and verify red**

Run: `node --test tests/creator-preview.test.mjs`

Expected: FAIL because preview does not exist.

- [ ] **Step 7: Implement pure preview**

Use a catalog-bound source loader that resolves the selected full module and expression values by exact ref and source digest. Build the candidate from draft fields, assert its existing schema, resolve modules, call compatibility, derive attributes, and call `projectGenome`. Catch only `CreationCompatibilityError` and return its code; unexpected errors remain loud.

Compute `previewDigest` over every returned field except itself. Freeze the result.

- [ ] **Step 8: Write failing preset/manual parity test**

Replay `aether-architect` manually and through its preset from the same revision-zero draft. Assert exact equality for every intermediate command result, final draft digest, preview digest, candidate, expression, derived attributes, and genome. Repeat for `quiet-cartographer`.

- [ ] **Step 9: Implement preset replay through ordinary commands**

`replayCreatorPreset` loops through `preset.choices`. For each validated choice it constructs `{ schemaVersion: 1, ...choice, expectedDraftDigest: current.draftDigest }` and passes that ordinary command to `applyCreatorCommand`. Reject an empty preset and any choice that does not validate.

- [ ] **Step 10: Run focused and full tests**

Run: `node --test tests/creation-compatibility.test.mjs tests/creator-preview.test.mjs tests/creator-preset-parity.test.mjs`

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 11: Commit preview and parity**

```powershell
git add src/creation/compatibility-error.mjs src/creation/compatibility.mjs src/creator/preview.mjs src/creator/preset.mjs tests/creation-compatibility.test.mjs tests/creator-preview.test.mjs tests/creator-preset-parity.test.mjs
git commit -m "feat: preview creator drafts through one command path"
```

---

### Task 4: Review-pinned finalization through the existing compiler

**Files:**
- Create: `schemas/creator-review-seal.schema.json`
- Create: `src/creator/finalize.mjs`
- Modify: `src/core/schema-validator.mjs`
- Test: `tests/creator-finalization.test.mjs`

**Interfaces:**
- Consumes: `previewCreatorDraft`, `compileCreation`, `verifyCreationBuild`, `canonicalJson`, `sha256Value`
- Produces: `buildCreatorReviewSeal({ catalogDigest, draftDigest, previewDigest })`, `finalizeCreatorDraft({ draft, catalog, reviewSeal, sourceDirectory, outputDirectory, policyPath, expectedPolicyDigest, moduleDirectory, sourceLoader })`

- [ ] **Step 1: Write failing review-seal and finalization tests**

Assert the seal binds exactly the three digests and its own digest. Finalization of each ready fixture must produce source candidate and expression bytes equal to preview, invoke the existing compiler path, and return a verified manifest. Equivalent manual and preset finalizations must produce the same build ID.

Add a substitution matrix changing one at a time: catalog digest, draft digest, preview digest, policy digest, selected module bytes, expression bytes, unexpected source entry, and unexpected output entry. Each change must fail before returning a manifest. Incomplete and blocked drafts must leave both target directories absent.

- [ ] **Step 2: Run the finalization test and verify red**

Run: `node --test tests/creator-finalization.test.mjs`

Expected: FAIL because the review seal and finalizer do not exist.

- [ ] **Step 3: Implement the review seal**

Use this unsigned value:

```js
const unsigned = {
  schemaVersion: 1,
  catalogDigest,
  draftDigest,
  previewDigest,
};
return deepFreeze({ ...unsigned, sealDigest: sha256Value(unsigned) });
```

The schema requires lowercase 64-character digests and no unknown fields.

- [ ] **Step 4: Implement fail-before-write finalization**

Recompute preview first, verify the review seal, verify the catalog's policy digest equals the independent pin, and confirm both target directories are absent or empty before creating either. Materialize canonical candidate and expression inputs, call `compileCreation` with the exact original module directory and policy pin, call `verifyCreationBuild`, compare manifest genome digest to the ready preview, and return a frozen result containing only the seal, paths, and verified manifest.

If a post-write compiler failure occurs, preserve the transaction-owned source and output directories as explicit failed evidence; never report success and never invoke genesis.

- [ ] **Step 5: Run finalization, creation, and historical receipt tests**

Run: `node --test tests/creator-finalization.test.mjs tests/creation-compiler.test.mjs tests/creation-certification.test.mjs tests/genesis-certification.test.mjs`

Run: `npm test`

Expected: all tests pass and historical receipts remain byte-identical.

- [ ] **Step 6: Commit review-pinned finalization**

```powershell
git add schemas/creator-review-seal.schema.json src/core/schema-validator.mjs src/creator/finalize.mjs tests/creator-finalization.test.mjs
git commit -m "feat: finalize reviewed creator drafts"
```

---

### Task 5: Phase 3 fixture, certification, operator docs, and merge gate

**Files:**
- Create: `scripts/build-creator-fixture.mjs`
- Create: `src/certification/certify-creator-protocol-phase3.mjs`
- Create: `tests/creator-certification.test.mjs`
- Create: `receipts/creator-protocol-phase3-certification.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: every Phase 3 public function and all historical receipt digests
- Produces: `npm run build:creator-fixture`, `npm run certify:creator-protocol`, one canonical certification receipt

- [ ] **Step 1: Write failing certification-contract tests**

Require exact proof rows `GC-001` through `GC-008`, a passing guarded suite, clean source, two deterministic catalog loads, manual/preset parity, two byte-identical finalizations, preserved historical receipts, and explicit exclusions. Missing or failed evidence must produce `rejected`.

- [ ] **Step 2: Run certification test and verify red**

Run: `node --test tests/creator-certification.test.mjs`

Expected: FAIL because the certifier does not exist.

- [ ] **Step 3: Implement deterministic fixture build and certifier**

The fixture builder prints one JSON object containing `catalogDigest`, both preset `draftDigest` values, both `previewDigest` values, and both creation build IDs. Two isolated roots must produce byte-identical JSON.

The certifier runs `node --test` under `src/certification/no-network-guard.mjs`, projects timings out of test identity using the Phase 2 deterministic summary function, verifies all historical receipt bytes, runs two isolated creator fixture builds, and writes one canonical receipt. The receipt source commit is the clean implementation commit before the receipt commit.

- [ ] **Step 4: Add commands and accurate operator documentation**

Add:

```json
"build:creator-fixture": "node scripts/build-creator-fixture.mjs",
"certify:creator-protocol": "node src/certification/certify-creator-protocol-phase3.mjs"
```

Document that the protocol is headless, presets are ordinary command streams, finalization does not instantiate a vessel, and Soul remains dormant.

- [ ] **Step 5: Run all verification gates**

Run in order:

```powershell
npm test
npm run build:fixture
npm run build:networked-fixture
npm run build:creation-fixture
npm run build:genesis-fixture
npm run build:creator-fixture
npm run certify:creator-protocol
```

Expected historical build IDs:

- v0: `116a4cf0e9abc8063a528fd25e142a9b2ee6b5e1418f4ad980795f8bd994be01`
- networked: `f54f0943e230d3249f20318f085e6f4917895f1974c2bff9e61158385eee2914`
- creation: `9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64`
- genesis: `823cb7c5117fff0032ac30b9cd443536a00175dde44023a2bf27dc59f9a51a77`

- [ ] **Step 6: Commit the implementation source and certification receipt separately**

```powershell
git add package.json scripts/build-creator-fixture.mjs src/certification/certify-creator-protocol-phase3.mjs tests/creator-certification.test.mjs README.md docs/architecture.md
git commit -m "feat: certify deterministic creator protocol"
npm run certify:creator-protocol
git add receipts/creator-protocol-phase3-certification.json
git commit -m "certify: creator protocol phase 3"
```

- [ ] **Step 7: Request independent review**

The reviewer must independently reproduce `GC-001` through `GC-008`, verify manual/preset parity and fail-before-write behavior, run the complete guarded suite, recompute the receipt digest, verify every historical receipt, and report any P0, P1, or P2 finding against the exact source and receipt commits.

- [ ] **Step 8: Merge, rerun, and push**

Fetch and reconcile `origin/main`. Fast-forward the verified branch into `main`, rerun `npm test`, every build command, and the certification reproduction at its pinned clean source commit. Push only after local and remote `main` match the reviewed receipt boundary.

## Plan self-review

- Spec coverage: `GC-001` through `GC-008` map to Tasks 1 through 5.
- Scope: one headless local protocol, no UI, host, genesis, evolution, Lunari, Inspiration, or Soul implementation.
- Type consistency: catalog, draft, command, preview, seal, and finalizer names are stable across tasks.
- Historical stability: every existing build ID and receipt is an explicit gate.
- Placeholder scan: no deferred implementation step or undefined public interface remains.
