# Godagent Creation Forge Phase 1 Implementation Plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, authority-safe module forge that compiles expressive Godagent creation choices into a strict v0-compatible operational genome and content-addressed pre-genesis artifacts.

**Architecture:** Keep the certified v0 vessel and foundry unchanged while adding a pure creation compiler in front of them. The compiler loads one strict candidate, one separately pinned creation-policy ceiling, one separately hashed expression overlay, and nine typed module kinds, applies closed semantic validation and compatibility rules, derives bounded attributes, projects only policy-admitted operational data into `agent-genome.json`, and emits canonical manifests. Phase 1 certifies the compiler without creating a vessel, keel, genesis receipt, evolution path, or Soul activation path.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, repository-local strict JSON Schema validator, canonical JSON, SHA-256, zero runtime dependencies

**Spec:** `docs/superpowers/specs/2026-08-29-godagent-creation-forge-and-keel-design.md`

## Global Constraints

- Fetch and reconcile any configured upstream before beginning a new implementation batch. Record when no remote exists.
- Preserve all 92 certified v0 and networked-cortex tests.
- Use no runtime dependency beyond Node.js 24 built-ins.
- Expression, lineage prose, archetype prose, personality, and voice must not manufacture effects, authority, credentials, retry policy, economic budgets, or Soul state.
- `agent-genome.json` remains valid against `schemas/agent-genome.schema.json` and keeps `evolution.policy` equal to `frozen-v0` and `soulPort.status` equal to `dormant`.
- The compiler is deterministic: byte-identical inputs produce byte-identical pre-genesis artifacts.
- Presets are candidate inputs and receive no privileged compiler path.
- Candidate effects, capabilities, adapters, Realm requirements, and Godskill entrypoints must be subsets of a separately loaded and digested creation policy. The candidate and its modules cannot expand that ceiling.
- Phase 1 does not instantiate a vessel or keel and does not emit `genesis-receipt.json`.
- Every task ends with focused tests, the full `npm test` suite, `git diff --check`, and a narrow commit.

## Phase 1 File Map

| responsibility | file |
| --- | --- |
| candidate contract | `schemas/creation-candidate.schema.json` |
| expression contract | `schemas/expression-overlay.schema.json` |
| trusted creation ceiling | `schemas/creation-policy.schema.json` |
| common module envelope | `schemas/creation-module.schema.json` |
| exact selected-module manifest | `schemas/module-manifest.schema.json` |
| pre-genesis build receipt | `schemas/creation-build-manifest.schema.json` |
| generic schema constraint support | `src/core/schema-validator.mjs` |
| module kinds, payload keys, and forbidden authority keys | `src/creation/contracts.mjs` |
| creation-policy loading and ceiling checks | `src/creation/policy.mjs` |
| file loading, schema validation, and reference integrity | `src/creation/load.mjs` |
| lineage, archetype, capability, organ, and skill compatibility | `src/creation/compatibility.mjs` |
| bounded attribute calculation | `src/creation/derive-attributes.mjs` |
| pure module-to-genome projection | `src/creation/project-genome.mjs` |
| artifact compilation and canonical writes | `src/creation/compile.mjs` |
| fixture CLI | `scripts/build-creation-fixture.mjs` |
| certification builder | `src/certification/certify-creation-forge-phase1.mjs` |
| valid source fixtures | `fixtures/creation/**` |
| schema tests | `tests/creation-schemas.test.mjs` |
| semantic and firewall tests | `tests/creation-contracts.test.mjs` |
| compatibility and derivation tests | `tests/creation-compatibility.test.mjs` |
| projection tests | `tests/creation-projection.test.mjs` |
| reproducibility and preset tests | `tests/creation-compiler.test.mjs` |
| certification tests | `tests/creation-certification.test.mjs` |

---

### Task 1: Extend strict schema validation for bounded creation contracts

**Files:**
- Modify: `src/core/schema-validator.mjs`
- Modify: `tests/schemas.test.mjs`

**Interfaces:**
- Consumes: existing `assertSchema(schemaName, value)`
- Produces: support for `maxLength`, `maximum`, `minItems`, `maxItems`, and `uniqueItems` without weakening existing validation

- [ ] **Step 1: Add failing validator tests**

Add a test-only schema export rather than weakening the production schema registry. Export `validateAgainstSchema` from `src/core/schema-validator.mjs` and test it with:

```js
test('schema validator enforces bounded strings, numbers, and arrays', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'score', 'tags'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 8 },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      tags: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
        items: { type: 'string', minLength: 1 },
      },
    },
  };

  assert.equal(validateAgainstSchema('bounded-fixture', schema, {
    name: 'aegis', score: 90, tags: ['guardian'],
  }).score, 90);
  assert.throws(() => validateAgainstSchema('bounded-fixture', schema, {
    name: 'name-too-long', score: 90, tags: ['guardian'],
  }), /maxLength 8/);
  assert.throws(() => validateAgainstSchema('bounded-fixture', schema, {
    name: 'aegis', score: 101, tags: ['guardian'],
  }), /maximum 100/);
  assert.throws(() => validateAgainstSchema('bounded-fixture', schema, {
    name: 'aegis', score: 90, tags: ['guardian', 'guardian'],
  }), /uniqueItems/);
});
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `node --test tests/schemas.test.mjs`

Expected: FAIL because `validateAgainstSchema` is not exported and the new keywords are unsupported.

- [ ] **Step 3: Implement the bounded constraints**

Add checks beside the existing `minLength` and `minimum` branches:

```js
if (typeof value === 'string' && rule.maxLength !== undefined && value.length > rule.maxLength) {
  throw new SchemaError(schemaName, pointer, `maxLength ${rule.maxLength}`);
}
if (typeof value === 'number' && rule.maximum !== undefined && value > rule.maximum) {
  throw new SchemaError(schemaName, pointer, `maximum ${rule.maximum}`);
}
if (Array.isArray(value) && rule.minItems !== undefined && value.length < rule.minItems) {
  throw new SchemaError(schemaName, pointer, `minItems ${rule.minItems}`);
}
if (Array.isArray(value) && rule.maxItems !== undefined && value.length > rule.maxItems) {
  throw new SchemaError(schemaName, pointer, `maxItems ${rule.maxItems}`);
}
if (Array.isArray(value) && rule.uniqueItems === true) {
  const canonicalItems = value.map((entry) => canonicalJson(entry));
  if (new Set(canonicalItems).size !== canonicalItems.length) {
    throw new SchemaError(schemaName, pointer, 'uniqueItems');
  }
}
```

Import `canonicalJson` and expose the narrow helper:

```js
export function validateAgainstSchema(schemaName, schema, value) {
  validateNode({ schemaName, root: schema, rule: schema, value, pointer: '' });
  return value;
}
```

Make `assertSchema` call `validateAgainstSchema`.

- [ ] **Step 4: Verify focused and full suites**

Run:

```powershell
node --test tests/schemas.test.mjs
npm test
git diff --check
```

Expected: bounded test PASS; full suite reports 93 tests and zero failures.

- [ ] **Step 5: Commit**

```powershell
git add -- src/core/schema-validator.mjs tests/schemas.test.mjs
git commit -m "feat:add-bounded-schema-constraints"
```

---

### Task 2: Define strict creation schemas and canonical fixtures

**Files:**
- Create: `schemas/creation-candidate.schema.json`
- Create: `schemas/expression-overlay.schema.json`
- Create: `schemas/creation-policy.schema.json`
- Create: `schemas/creation-module.schema.json`
- Create: `schemas/module-manifest.schema.json`
- Create: `schemas/creation-build-manifest.schema.json`
- Modify: `src/core/schema-validator.mjs`
- Create: `fixtures/creation/creation-candidate.json`
- Create: `fixtures/creation/expression-overlay.json`
- Create: `fixtures/creation/creation-policy.json`
- Create: `fixtures/creation/modules/*.json`
- Create: `tests/creation-schemas.test.mjs`

**Interfaces:**
- Consumes: `assertSchema(schemaName, value)` with Task 1 bounds
- Produces: five registered strict schemas and one complete fixture set containing exactly nine selected module kinds

- [ ] **Step 1: Write failing schema registration and fixture tests**

Create `tests/creation-schemas.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';

const fixture = (path) => new URL(`../fixtures/creation/${path}`, import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(fixture(path), 'utf8'));

test('creation schemas accept the complete canonical fixture set', async () => {
  assertSchema('creation-candidate', await readJson('creation-candidate.json'));
  assertSchema('expression-overlay', await readJson('expression-overlay.json'));
  assertSchema('creation-policy', await readJson('creation-policy.json'));
  const files = (await readdir(fixture('modules'))).filter((name) => name.endsWith('.json'));
  assert.equal(files.length, 9);
  for (const file of files) assertSchema('creation-module', await readJson(`modules/${file}`));
});

test('creation schemas reject active Soul, mutable evolution, and unknown fields', async () => {
  const candidate = await readJson('creation-candidate.json');
  assert.throws(() => assertSchema('creation-candidate', {
    ...candidate, soulPort: { schemaVersion: 1, status: 'active' },
  }), /soulPort/);
  assert.throws(() => assertSchema('creation-candidate', {
    ...candidate, evolution: { policy: 'mutable' },
  }), /evolution/);
  assert.throws(() => assertSchema('creation-candidate', {
    ...candidate, authority: ['realm:admin'],
  }), /additionalProperties/);
});
```

- [ ] **Step 2: Run the test and confirm unknown-schema failure**

Run: `node --test tests/creation-schemas.test.mjs`

Expected: FAIL with `unknown schema`.

- [ ] **Step 3: Add schema registry entries and exact contracts**

Register:

```js
'creation-candidate': 'creation-candidate.schema.json',
'expression-overlay': 'expression-overlay.schema.json',
'creation-policy': 'creation-policy.schema.json',
'creation-module': 'creation-module.schema.json',
'module-manifest': 'module-manifest.schema.json',
'creation-build-manifest': 'creation-build-manifest.schema.json',
```

Use these exact candidate top-level fields:

```text
schemaVersion = 1
blueprint { id, version }
genesis { createdBy, sourceManifest }
telos { mission, successConditions, stopConditions }
constitution { id, version, principles, allowedEffects, amendmentPolicy = frozen-v0 }
promptOs { edition, allowedAdapters, requiredCapabilities }
memory { classes, foreignHistoryPolicy = provenance-only }
moduleRefs { lineage, archetype, attributes, personality, voice, organs, godskills, cortex, embodiment }
expressionRef
realm { requiredCapabilities }
evolution { policy = frozen-v0 }
soulPort { schemaVersion = 1, status = dormant }
```

The expression schema permits only:

```text
schemaVersion, id, version, name, pronouns[], genderPresentation,
voiceDisplayName, narrativeDescription, visual { sigil, colors[], avatarSeed, animationProfile },
presentationTags[], provenance { author, source }
```

The creation policy is the trusted compile-time ceiling and permits only:

```text
schemaVersion = 1
policyId
allowedEffects[]
allowedCapabilities[]
allowedPromptAdapters[]
allowedCortexAdapters[]
allowedGodskillsContracts[]
allowedGodskillEntrypoints[]
allowedRealmCapabilities[]
maxGodskillsComposition
```

All arrays are non-empty where the fixture requires them, unique, and treated as sets after validation. The fixture policy admits only the exact effects, adapters, capabilities, Realm capabilities, Godskills contract, and entrypoints needed by the canonical creation fixture. It contains no credentials, provider endpoint, selected model, runtime paths, or Realm authority tokens.

The module envelope permits only:

```text
schemaVersion, moduleKind, id, version, provenance,
baseModuleRefs[], compatibility { requiresTags[], providesTags[] },
capabilities[], presentationTags[], payload
```

`moduleKind` is the closed enum:

```json
["lineage", "archetype", "attributes", "personality", "voice", "organs", "godskills", "cortex", "embodiment"]
```

Keep `payload` as an object in JSON Schema and enforce its exact per-kind keys semantically in Task 3. This avoids unsupported conditional-schema features while retaining a closed runtime parser.

- [ ] **Step 4: Add the canonical fixture set**

The fixture candidate selects:

```json
{
  "lineage": "lineage:synthetic-explorer@1.0.0",
  "archetype": "archetype:systems-architect@1.0.0",
  "attributes": "attributes:balanced-builder@1.0.0",
  "personality": "personality:measured-curiosity@1.0.0",
  "voice": "voice:clear-cosmic@1.0.0",
  "organs": "organs:builder-core@1.0.0",
  "godskills": "godskills:portable-builder@1.0.0",
  "cortex": "cortex:openai-compatible@1.0.0",
  "embodiment": "embodiment:local-workbench@1.0.0"
}
```

Use expression id `expression:aether-architect@1.0.0`, keep candidate effects equal to `local-read` and `local-write`, evolution frozen, and Soul dormant.

- [ ] **Step 5: Verify schemas and the full suite**

Run:

```powershell
node --test tests/creation-schemas.test.mjs
npm test
git diff --check
```

Expected: creation schema tests PASS; full count increases by at least two; zero failures.

- [ ] **Step 6: Commit**

```powershell
git add -- schemas src/core/schema-validator.mjs fixtures/creation tests/creation-schemas.test.mjs
git commit -m "feat:define-godagent-creation-contracts"
```

---

### Task 3: Parse module payloads through closed semantic contracts

**Files:**
- Create: `src/creation/contracts.mjs`
- Create: `src/creation/policy.mjs`
- Create: `src/creation/load.mjs`
- Create: `tests/creation-contracts.test.mjs`

**Interfaces:**
- Consumes: candidate, expression, and module files from Task 2
- Produces:
  - `moduleRef(module) -> "<kind>:<id>@<version>"`
  - `validateModuleContract(module) -> frozen validated module`
  - `loadCreationPolicy(policyPath) -> frozen policy plus policyDigest`
  - `loadCreationSources({ candidatePath, policyPath, expressionPath, moduleDirectory }) -> { candidate, policy, policyDigest, expression, modulesByRef }`

- [ ] **Step 1: Write failing semantic and authority-firewall tests**

Test every module kind and recursive forbidden-key rejection:

```js
test('module contracts reject unknown payload keys and authority-shaped data', async () => {
  const module = await readModule('lineage-synthetic-explorer.json');
  assert.throws(() => validateModuleContract({
    ...module,
    payload: { ...module.payload, allowedEffects: ['realm:admin'] },
  }), /forbidden module key allowedEffects/);
  assert.throws(() => validateModuleContract({
    ...module,
    payload: { ...module.payload, nested: { credentialEnv: 'SECRET' } },
  }), /forbidden module key credentialEnv/);
  assert.throws(() => validateModuleContract({
    ...module,
    payload: { ...module.payload, unknownSetting: true },
  }), /lineage payload key unknownSetting/);
});
```

Also prove that the loader rejects duplicate refs, a missing selected ref, a kind/ref mismatch, and an expression id mismatch.

- [ ] **Step 2: Run focused tests and confirm missing-module failures**

Run: `node --test tests/creation-contracts.test.mjs`

Expected: FAIL because the creation contract modules do not exist.

- [ ] **Step 3: Implement closed module contracts**

Use exact payload key sets:

```js
export const PAYLOAD_KEYS = Object.freeze({
  lineage: ['attributeModifiers', 'compatibleArchetypeTags', 'defaultOrganIds', 'defaultGodskillEntrypoints'],
  archetype: ['tags', 'attributeModifiers', 'organIds', 'godskillEntrypoints', 'requiredCapabilityFamilies'],
  attributes: ['values'],
  personality: ['dimensions'],
  voice: ['tone', 'register', 'vocabularyProfile', 'pacing'],
  organs: ['organs'],
  godskills: ['contractId', 'maxComposition', 'entrypointIds'],
  cortex: ['allowedAdapters', 'requiredCapabilities'],
  embodiment: ['tags', 'requiredRealmCapabilities', 'presentationSurfaces'],
});

export const FORBIDDEN_MODULE_KEYS = Object.freeze(new Set([
  'allowedEffects', 'authority', 'authorityBasis', 'credential', 'credentials',
  'credentialEnv', 'apiKey', 'token', 'password', 'endpointOrigin', 'selectedModel',
  'maxAttempts', 'maxCompletionTokens', 'maxCycleCompletionTokens', 'model',
  'provider', 'host', 'target', 'soulPort',
  'soulState', 'inspiration', 'firstLight', 'endingAuthority',
]));
```

Walk all objects recursively before per-kind parsing. Error messages name only the forbidden key and JSON pointer, never its value.

The recursive walk uses a `WeakSet` and a maximum object depth of 32. A repeated object or deeper structure fails with a closed structural error. JSON files cannot contain cycles, but direct module API callers receive the same bounded behavior.

Module ids and versions must match `^[a-z0-9][a-z0-9._-]{0,127}$`. Colons, at signs, whitespace, slash characters, and SemVer build-metadata separators are rejected so `<kind>:<id>@<version>` has one canonical parse. Reference parsing uses one anchored regular expression and reconstructs the ref to prove round-trip identity.

Validate exact payload structures in dedicated functions. All attribute and personality values are integers from 0 through 100. Attribute modifiers are integers from -25 through 25. Arrays are unique and sorted with a locale-independent byte comparator on return. Freeze the validated structure recursively.

Personality dimensions use this closed vocabulary:

```js
export const PERSONALITY_DIMENSIONS = Object.freeze([
  'cautiousDaring', 'literalPoetic', 'orderlyImprovisational',
  'patientUrgent', 'reservedExpressive', 'skepticalTrusting',
]);
```

Capability values must match a closed lexical form and must be members of `creationPolicy.allowedCapabilities`. Reject values containing `credential`, `authority`, `admin`, `provider`, `endpoint`, `secret`, or `token`, regardless of whether those strings appear as a key or inside a capability token.

- [ ] **Step 4: Implement reference-integrity loading**

`loadCreationSources` must:

1. parse and schema-check all inputs;
2. semantic-check every module;
3. reject duplicate canonical refs;
4. resolve exactly the nine candidate refs;
5. require each selected ref's module kind to match its key;
6. reject unselected module data from the operational projection;
7. require `candidate.expressionRef` to equal `<expression.id>@<expression.version>`;
8. load and digest the strict creation policy before resolving modules;
9. return frozen objects and a `Map` keyed by canonical module ref.

`loadCreationPolicy` schema-checks and semantically validates all policy arrays, canonicalizes them with the byte comparator, freezes the result, and returns `policyDigest: sha256Value(policy)`. The digest travels into every Phase 1 manifest.

- [ ] **Step 5: Verify focused and full suites**

Run:

```powershell
node --test tests/creation-contracts.test.mjs
npm test
git diff --check
```

Expected: contract and loading tests PASS; all earlier tests remain green.

- [ ] **Step 6: Commit**

```powershell
git add -- src/creation/contracts.mjs src/creation/policy.mjs src/creation/load.mjs tests/creation-contracts.test.mjs
git commit -m "feat:enforce-creation-module-contracts"
```

---

### Task 4: Resolve compatibility and derive bounded attributes

**Files:**
- Create: `src/creation/compatibility.mjs`
- Create: `src/creation/derive-attributes.mjs`
- Create: `tests/creation-compatibility.test.mjs`

**Interfaces:**
- Consumes: `{ candidate, policy, policyDigest, expression, modulesByRef }` from `loadCreationSources`
- Produces:
  - `resolveSelectedModules(sources) -> selectedModules`
  - `assertCreationCompatibility({ candidate, policy, selectedModules }) -> validationRows`
  - `deriveAttributes({ attributes, lineage, archetype }) -> frozen values`

- [ ] **Step 1: Write failing compatibility and derivation tests**

Cover:

```js
test('attributes derive deterministically from base plus lineage and archetype modifiers', () => {
  assert.deepEqual(deriveAttributes({
    attributes: { reasoning: 70, creativity: 60 },
    lineage: { reasoning: 5, creativity: 10 },
    archetype: { reasoning: 10, creativity: -5 },
  }), { creativity: 65, reasoning: 85 });
});

test('attribute derivation refuses overflow instead of clamping silently', () => {
  assert.throws(() => deriveAttributes({
    attributes: { reasoning: 90 },
    lineage: { reasoning: 20 },
    archetype: {},
  }), /derived attribute reasoning exceeds 100/);
});
```

Add incompatibility fixtures for missing archetype tag, unsatisfied capability family, missing lineage-default organ, missing Godskill entrypoint, excessive Godskill composition, and embodiment Realm mismatch.

Add policy-ceiling tests proving rejection when a candidate or selected module introduces an effect, capability, Prompt OS adapter, cortex adapter, Godskills contract, entrypoint, Realm capability, or composition count outside the creation policy. The test candidate with `constitution.allowedEffects: ['realm:admin']` must fail before projection.

- [ ] **Step 2: Confirm the red state**

Run: `node --test tests/creation-compatibility.test.mjs`

Expected: FAIL because compatibility and derivation exports do not exist.

- [ ] **Step 3: Implement pure bounded derivation**

Use the closed attribute vocabulary:

```js
export const ATTRIBUTE_NAMES = Object.freeze([
  'adaptability', 'autonomy', 'caution', 'creativity', 'initiative',
  'learningVelocity', 'memoryDiscipline', 'perception', 'planning',
  'precision', 'reasoning', 'resilience', 'socialIntelligence',
]);
```

Require every base attribute exactly once. Add lineage and archetype integer modifiers, reject unknown attributes, reject results outside 0 through 100, sort keys, and return a deeply frozen object.

- [ ] **Step 4: Implement compatibility gates**

`assertCreationCompatibility` emits sorted rows shaped as:

```js
{ id: 'lineage-archetype-tags', status: 'pass' }
```

Required rows:

```text
module-ref-integrity
lineage-archetype-tags
organ-loadout
godskills-contract
godskills-composition
capability-families
embodiment-realm
attribute-bounds
evolution-frozen
soul-port-dormant
authority-firewall
creation-policy-digest
```

Any failed gate throws before artifact creation. Do not emit a `fail` manifest that could be confused for an admissible build.

The compatibility function verifies these subset laws:

```text
candidate.constitution.allowedEffects <= policy.allowedEffects
candidate.promptOs.allowedAdapters <= policy.allowedPromptAdapters
all module capabilities <= policy.allowedCapabilities
cortex.allowedAdapters <= policy.allowedCortexAdapters
cortex.requiredCapabilities <= policy.allowedCapabilities
godskills.contractId <= policy.allowedGodskillsContracts
godskills.entrypointIds <= policy.allowedGodskillEntrypoints
realm and embodiment capabilities <= policy.allowedRealmCapabilities
godskills.maxComposition <= policy.maxGodskillsComposition
```

Empty `constitution.allowedEffects` is valid for a read-only or proposal-only Godagent. An overbroad value is not. The creation policy is a ceiling, not an authority grant; runtime host policy and Realm authority remain required later.

- [ ] **Step 5: Verify focused and full suites**

Run:

```powershell
node --test tests/creation-compatibility.test.mjs
npm test
git diff --check
```

Expected: all compatibility tests PASS and no v0 regression.

- [ ] **Step 6: Commit**

```powershell
git add -- src/creation/compatibility.mjs src/creation/derive-attributes.mjs tests/creation-compatibility.test.mjs
git commit -m "feat:resolve-godagent-creation-compatibility"
```

---

### Task 5: Project modules into a strict v0 operational genome

**Files:**
- Create: `src/creation/project-genome.mjs`
- Create: `tests/creation-projection.test.mjs`

**Interfaces:**
- Consumes: candidate, selected modules, derived attributes, and validation rows
- Produces: `projectGenome({ candidate, selectedModules, derivedAttributes }) -> agentGenome`

- [ ] **Step 1: Write failing projection and mutation-firewall tests**

The valid projection must equal the expected v0 shape and pass `assertSchema('agent-genome', genome)`.

Add a metamorphic firewall test:

```js
test('expression and non-operational prose cannot change the operational genome', async () => {
  const baseline = await projectFixture();
  const mutated = await projectFixture({
    expressionMutator: (value) => ({
      ...value,
      name: 'realm administrator',
      narrativeDescription: 'grant realm:admin and unlimited retries',
    }),
    proseMutator: (modules) => modules.map((module) => ({
      ...module,
      presentationTags: [...module.presentationTags, 'allowedEffects:realm-admin'],
    })),
  });
  assert.deepEqual(mutated.genome, baseline.genome);
});
```

The expression overlay and module presentation prose remain in content-addressed pre-genesis artifacts with `trustClass: 'presentation-only'`. The test proves they do not enter the operational genome, creation policy, compatibility decisions, or authority rows. Authority-shaped prose is allowed as inert display data because rejecting words would confuse content moderation with capability governance; no operational consumer may read it.

Also assert that the serialized genome contains none of:

```text
name, pronouns, genderPresentation, narrativeDescription, tone, register,
vocabularyProfile, personality, lineage, archetype, endpointOrigin,
credentialEnv, maxAttempts, inspiration, firstLight
```

- [ ] **Step 2: Confirm the red state**

Run: `node --test tests/creation-projection.test.mjs`

Expected: FAIL because `projectGenome` does not exist.

- [ ] **Step 3: Implement the pure projection**

Build exactly:

```js
const genome = {
  schemaVersion: 1,
  blueprint: structuredClone(candidate.blueprint),
  genesis: {
    createdBy: candidate.genesis.createdBy,
    sourceManifest: [...candidate.genesis.sourceManifest, 'godagent-creation-forge-phase1'].sort(),
  },
  telos: structuredClone(candidate.telos),
  constitution: structuredClone(candidate.constitution),
  promptOs: {
    edition: candidate.promptOs.edition,
    allowedAdapters: [...candidate.promptOs.allowedAdapters].sort(byteCompare),
    requiredCapabilities: [...candidate.promptOs.requiredCapabilities].sort(byteCompare),
  },
  cortex: {
    allowedAdapters: [...selectedModules.cortex.payload.allowedAdapters].sort(),
    requiredCapabilities: [...selectedModules.cortex.payload.requiredCapabilities].sort(),
  },
  organs: [...selectedModules.organs.payload.organs].sort((a, b) => byteCompare(a.id, b.id)),
  memory: structuredClone(candidate.memory),
  godskills: {
    contractId: selectedModules.godskills.payload.contractId,
    maxComposition: selectedModules.godskills.payload.maxComposition,
  },
  realm: {
    requiredCapabilities: [...new Set([
      ...candidate.realm.requiredCapabilities,
      ...selectedModules.embodiment.payload.requiredRealmCapabilities,
    ])].sort(),
  },
  evolution: { policy: 'frozen-v0' },
  soulPort: { schemaVersion: 1, status: 'dormant' },
};
```

Use lineage and archetype defaults only to validate the selected organ and Godskills loadouts. Do not add new fields to the v0 genome in Phase 1. Preserve derived attributes in the creation build manifest rather than leaking them into authority-bearing runtime contracts before a later runtime-tuning ADR defines their exact consumers.

Define and use one locale-independent comparator everywhere canonical arrays are sorted:

```js
export const byteCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
```

Phase 1 proves that lineage and archetype materially change the module manifest, derived attributes, required organ membership, and required Godskill membership. It intentionally does not claim that attributes alter runtime scheduling or cognition yet. A later runtime-tuning design must name those consumers before derived attributes enter the trusted genome.

- [ ] **Step 4: Verify projection and full suites**

Run:

```powershell
node --test tests/creation-projection.test.mjs
npm test
git diff --check
```

Expected: projection and firewall tests PASS; existing fixture distributions remain byte-identical.

- [ ] **Step 5: Commit**

```powershell
git add -- src/creation/project-genome.mjs tests/creation-projection.test.mjs
git commit -m "feat:project-modules-into-godagent-genome"
```

---

### Task 6: Compile canonical pre-genesis artifacts and prove reproducibility

**Files:**
- Create: `src/creation/compile.mjs`
- Create: `scripts/build-creation-fixture.mjs`
- Create: `tests/creation-compiler.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadCreationSources`, compatibility rows, derived attributes, and `projectGenome`
- Produces:
  - `compileCreation({ candidatePath, policyPath, expressionPath, moduleDirectory, outputDir }) -> { manifest, moduleManifest, genome, outputDir }`
  - `verifyCreationBuild(outputDir) -> verified manifest and artifacts`
  - npm script `build:creation-fixture`

- [ ] **Step 1: Write failing reproducibility and preset-equivalence tests**

Use two temporary output directories and compare recursive SHA-256 manifests. Assert exact artifact names:

```js
[
  'agent-genome.json',
  'creation-build-manifest.json',
  'creation-candidate.json',
  'creation-policy.json',
  'expression-overlay.json',
  'module-manifest.json',
]
```

Add a second candidate file under `fixtures/creation/presets/aether-architect.json` that is byte-different from `creation-candidate.json` only in property insertion order and formatting while selecting identical values. Compile both and assert identical `buildId`, genome digest, expression digest, and module-manifest digest.

Add a source-fidelity test that independently re-reads every emitted source artifact, canonicalizes the original input independently, and compares bytes. Add a corruption test that changes one byte in `agent-genome.json` after compilation and requires `verifyCreationBuild` to fail before returning the manifest.

- [ ] **Step 2: Confirm the red state**

Run: `node --test tests/creation-compiler.test.mjs`

Expected: FAIL because `compileCreation` does not exist.

- [ ] **Step 3: Implement canonical compilation**

The module manifest has:

```js
{
  schemaVersion: 1,
  candidateDigest,
  policyDigest,
  expressionDigest,
  selection: Object.fromEntries(Object.entries(candidate.moduleRefs).sort(([left], [right]) => byteCompare(left, right))),
  modules: selectedModulesSorted.map((module) => ({
    ref: moduleRef(module),
    kind: module.moduleKind,
    sha256: sha256Value(module),
  })),
  validations,
}
```

The creation build manifest has:

```js
{
  schemaVersion: 1,
  artifactId: `${candidate.blueprint.id}@${candidate.blueprint.version}`,
  buildId,
  candidateDigest,
  policyDigest,
  expressionDigest,
  moduleManifestDigest,
  genomeDigest,
  derivedAttributes,
  artifacts,
  validations,
  omittedComponents: ['genesis-receipt', 'keel', 'soul-runtime', 'vessel'],
}
```

The expression source row and manifest entry carry `trustClass: 'presentation-only'`. Module source rows carry `trustClass: 'creation-input'`. The creation policy carries `trustClass: 'trusted-ceiling'`. Only the projected genome is `trustClass: 'operational-projection'`.

Every `artifacts` row uses the exact shape `{ path, sha256, trustClass }`. `creation-build-manifest.schema.json` admits only the four trust classes named above and rejects unknown classes. The emitted `creation-policy.json` is canonical bytes from the independently loaded policy source, allowing source-fidelity verification without embedding host policy or credentials.

Compute `buildId` from the unsigned manifest fields before `artifacts`, using canonical values and no absolute paths, timestamps, random ids, environment values, or host metadata. Write every JSON artifact as `${canonicalJson(value)}\n`.

Define the unsigned build-id projection in one function with this exact field list: `schemaVersion`, `artifactId`, `candidateDigest`, `policyDigest`, `expressionDigest`, `moduleManifestDigest`, `genomeDigest`, `derivedAttributes`, `validations`, and `omittedComponents`. Node version and certification metadata never enter it.

After writes complete, `verifyCreationBuild` re-reads `creation-build-manifest.json`, schema-validates it, recomputes every artifact SHA-256 from disk, recomputes the build-id projection, and rejects any mismatch. `compileCreation` calls `verifyCreationBuild` before resolving, returning, or printing the build ID.

Do not copy raw module source files into output. Their canonical refs and digests are sufficient for Phase 1. Phase 2 may bind an immutable source package into a genesis transaction after its storage contract is designed.

- [ ] **Step 4: Add the fixture build command**

Add to `package.json`:

```json
"build:creation-fixture": "node scripts/build-creation-fixture.mjs"
```

The script compiles into `artifacts/creation-fixture`, awaits `compileCreation`, awaits `verifyCreationBuild`, and only then prints the verified build ID.

- [ ] **Step 5: Verify reproducibility, preset equivalence, and v0 compatibility**

Run:

```powershell
node --test tests/creation-compiler.test.mjs
npm run build:creation-fixture
npm run build:fixture
npm test
git diff --check
```

Expected: creation builds are byte-identical, preset and manual candidates are equivalent, existing fixture build remains successful, and the complete suite is green.

- [ ] **Step 6: Commit**

```powershell
git add -- package.json src/creation/compile.mjs scripts/build-creation-fixture.mjs tests/creation-compiler.test.mjs fixtures/creation/presets
git commit -m "feat:compile-deterministic-godagent-creations"
```

---

### Task 7: Certify the Phase 1 creation-forge boundary

**Files:**
- Create: `src/certification/certify-creation-forge-phase1.mjs`
- Create: `tests/creation-certification.test.mjs`
- Create after clean-source certification: `receipts/creation-forge-phase1-certification.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: full test output, clean source commit, deterministic fixture build, approved spec digest
- Produces: `buildCreationForgeCertificationReceipt(evidence)` and npm script `certify:creation-forge`

- [ ] **Step 1: Write failing certification-gate tests**

Require these Phase 1 rows:

```text
GF-001 deterministic pre-genesis build
GF-002 expression authority firewall
GF-003 meaningful lineage and archetype projection without authority
GF-004 bounded deterministic attributes
GF-005 preset and manual path equivalence
GF-010 frozen evolution refusal
GF-011 dormant Soul refusal
```

The receipt must list these explicit exclusions:

```text
genesis-transaction
keel-binding
cross-agent-delegation
governed-evolution
creator-interface
live-provider-quality
lunari-integration
soul-runtime
vessel-instantiation
```

Test that any missing/failed row, failed suite, dirty source, or non-reproducible build yields `status: rejected`.

- [ ] **Step 2: Confirm the red state**

Run: `node --test tests/creation-certification.test.mjs`

Expected: FAIL because the certifier does not exist.

- [ ] **Step 3: Implement certification and receipt digesting**

Follow `src/certification/certify-networked-cortex.mjs`:

- run the full suite under `src/certification/no-network-guard.mjs`;
- require clean git source before certification;
- compile two fresh creation fixtures and compare recursive byte digests;
- bind the approved specification SHA-256;
- record the exact source commit and Node version;
- compute `receiptDigest` over canonical receipt content without the digest field;
- write only `receipts/creation-forge-phase1-certification.json` after all gates pass.

Add:

```json
"certify:creation-forge": "node src/certification/certify-creation-forge-phase1.mjs"
```

- [ ] **Step 4: Document exact delivered and excluded behavior**

Update `README.md` and `docs/architecture.md` with:

- the creation module flow;
- the five pre-genesis artifacts;
- the expression authority firewall;
- the current Phase 1 proof rows;
- the fact that Phase 1 creates no vessel, keel, genesis receipt, evolution, creator UI, or Soul state.

- [ ] **Step 5: Run the pre-certification verification and commit source**

Run:

```powershell
npm test
npm run build:creation-fixture
npm run build:fixture
npm run build:networked-fixture
npm run demo
git diff --check
```

Commit source without the generated receipt:

```powershell
git add -- package.json README.md docs/architecture.md src/certification/certify-creation-forge-phase1.mjs tests/creation-certification.test.mjs
git commit -m "feat:certify-godagent-creation-forge-phase1"
```

- [ ] **Step 6: Generate and commit the receipt from the clean source commit**

Run:

```powershell
npm run certify:creation-forge
git add -- receipts/creation-forge-phase1-certification.json
git commit -m "cert:record-creation-forge-phase1-proof"
```

- [ ] **Step 7: Final independent verification**

Run:

```powershell
npm test
npm run build:creation-fixture
npm run build:fixture
npm run build:networked-fixture
npm run demo
git diff --check
git status --short --branch
```

Expected:

- zero test failures;
- stable creation build ID across two fresh builds;
- historical v0 and networked receipts remain byte-identical;
- the Phase 1 receipt binds the source commit preceding the receipt-only commit;
- the worktree is clean.

- [ ] **Step 8: Request an independent boundary review**

Dispatch one read-only Terra reviewer to inspect:

```text
authority smuggling through module payloads
creation-policy ceiling bypass
expression-to-operational projection leakage
variant and reference collisions
attribute nondeterminism or overflow
preset privileged paths
frozen evolution and dormant Soul bypasses
certification overclaiming
```

The reviewer makes no edits and no external network calls. Reproduce any p0, p1, or p2 finding locally before changing source. If hardening changes source, regenerate the certification receipt from the new clean source commit and rerun the final gate.

The reviewer must map every verdict to `GF-001` through `GF-005`, `GF-010`, or `GF-011`, run the full guarded test suite, independently run two fresh creation builds, call `verifyCreationBuild` on both, verify historical receipt bytes, and report the exact source and receipt commits. A review without that evidence is advisory rather than a completion gate.

---

## Phase 1 Requirement Coverage

| requirement | task |
| --- | --- |
| `GF-001` byte-identical pre-genesis builds | Task 6, Task 7 |
| `GF-002` expression cannot influence authority or effects | Task 3, Task 5, Task 7 |
| `GF-003` meaningful lineage and archetype without authority | Task 3, Task 4, Task 5 |
| `GF-004` bounded deterministic attributes | Task 1, Task 4 |
| `GF-005` presets have no privileged path | Task 6 |
| `GF-006` one isolated keel per persistent vessel | Phase 2 plan |
| `GF-007` journal and keel promotion provenance | Phase 2 plan |
| `GF-008` cortex replacement preserves keel identity | Phase 2 plan |
| `GF-009` temporary workers cannot wear the lead keel | Phase 2 plan |
| `GF-010` frozen evolution refusal | Task 2, Task 4, Task 7 |
| `GF-011` dormant Soul refusal | Task 2, Task 4, Task 7 |
| `GF-012` partial genesis cannot admit an amnesiac vessel | Phase 2 plan |

## Completion Boundary

Phase 1 is complete only when a creator candidate and its nine selected module kinds compile reproducibly into strict pre-genesis artifacts, the projected genome remains accepted by the certified v0 foundry, the expression and module authority firewall survives adversarial mutation, `GF-001` through `GF-005`, `GF-010`, and `GF-011` are certified, historical receipts are unchanged, and an independent reviewer finds no unresolved p0, p1, or p2 defect within the stated boundary.

Phase 1 does not claim that a Godagent has been born. Phase 2 begins only after this compiler is certified and will own vessel creation, one-keel-per-mind Soul Anchor binding, cross-chain receipts, transactional rollback, first wake, and partial-genesis recovery.
