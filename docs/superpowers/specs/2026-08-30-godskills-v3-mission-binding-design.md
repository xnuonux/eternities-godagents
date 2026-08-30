# godskills system v3 mission binding design

- **status:** architecture ready for implementation
- **recorded:** 2026-08-30
- **implementation repository:** `C:\dev\eternities-godagents`
- **external capability repository:** `C:\dev\eternities-godskills`
- **parent design:** `docs/superpowers/specs/2026-08-30-godagent-cortex-binding-protocol-design.md`
- **integration form:** provider-neutral, versioned, receipt-bound external adapter

## decision

godagents will consume the certified Eternities Godskills System v3 through a host-pinned adapter. the repositories remain separate. godagents will not vendor, merge, rewrite, or persist copies of godskill bodies.

for every bound mission cycle, routing occurs after the mission, current realm observation, genome capability policy, and host authority envelope are known, but before any cortex inference or constitutional proposal selection. the adapter verifies the release, selects no more than three capabilities, verifies their exact entrypoints and operational contracts, and compiles only that bounded mission stack into the cortex envelope.

godskills can alter method, evidence requirements, proposal shape, and termination conditions. they cannot grant identity, authority, credentials, budget, realm access, evolution rights, constitutional power, or personal-keel ownership.

ordinary unbound codex operation does not depend on this adapter and remains unchanged.

## verified source boundary

the architecture was prepared against the current local certified artifacts, not branch names or an assumed latest state.

| artifact | required identity | verified sha256 |
| --- | --- | --- |
| system certification | `eternities-godskills-system-v3` | `228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57` |
| agent-native router receipt | `agent-native-router-v8` | `b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3` |
| intent compiler receipt | `intent-compiler-v3` | `1ca40ec9138c1d0583068ee4dc3db58f0b77b07f631a2b38d9c47eb28ccce49a` |
| portable manifest receipt | `portable-capability-manifest-v1` | `f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d` |
| portable manifest file | `portable-capabilities-v1` | `ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a` |
| portable manifest logical digest | `portable-capabilities-v1` | `df646600e601dae7208d460135773f5d436b75117c45a3acad85fae6ff91c3c8` |

the portable manifest contains exactly 44 capabilities: 22 top-level godskills and 22 operational specialists. its certified composition ceiling is three selected entrypoints. the host pin must also name and digest the executable intent compiler boundary because a valid router receipt alone does not prove that an unchanged program invoked it.

these values are evidence for the current release descriptor fixture. production code must verify the descriptor and its linked artifacts rather than hard-code trust in this document.

## non-goals

- merging the godagents and godskills repositories;
- copying skill bodies, the cold quarry, third-party sources, or the complete catalog into godagents;
- letting a model choose or certify its own authority;
- treating a godskills release upgrade as an identity mutation;
- allowing specialization preferences to lower general capability quality;
- retrofitting ordinary codex tasks into bound godagents;
- proving consciousness, inspiration, or soul through capability routing.

## four-layer model

### 1. genome capability policy

the genome stores identity-bound capability policy, not release paths or skill text.

```json
{
  "protocolId": "eternities-godskills-adapter-v1",
  "profile": "all-rounder",
  "preferredFamilies": [],
  "prohibitedFamilies": [],
  "prohibitedCapabilities": [],
  "maxComposition": 3
}
```

`profile` is either `all-rounder` or `specialist`. an all-rounder begins eligible for the complete certified catalog, subject to host limits. a specialist supplies ranking preferences. preferences may improve selection priority but never make non-preferred capabilities lower quality or unavailable. only an explicit prohibited family or capability removes eligibility.

changing preferences is governed evolution because it changes persistent specialization. changing prohibitions or the maximum permitted capability envelope is also governed evolution. no release digest belongs in the genome.

### 2. host-pinned release

the host policy binds one immutable operational dependency release:

```json
{
  "adapterProtocol": "eternities-godskills-adapter-v1",
  "repositoryRoot": "C:/dev/eternities-godskills",
  "systemReceipt": { "path": "receipts/godskills-system-certification-v3.json", "sha256": "228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57" },
  "routerReceipt": { "path": "receipts/agent-native-router-v8.json", "sha256": "b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3" },
  "compilerReceipt": { "path": "receipts/intent-compiler-v3.json", "sha256": "1ca40ec9138c1d0583068ee4dc3db58f0b77b07f631a2b38d9c47eb28ccce49a" },
  "portableReceipt": { "path": "receipts/portable-capability-manifest-v1.json", "sha256": "f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d" },
  "portableManifest": { "path": "artifacts/portable-capabilities/manifest.v1.json", "sha256": "ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a", "manifestDigest": "df646600e601dae7208d460135773f5d436b75117c45a3acad85fae6ff91c3c8" },
  "semanticEffectBindings": { "read": ["local-read"], "write": ["local-write"] },
  "maximumSelected": 3,
  "maximumPackageBytes": 32768
}
```

paths are repository-relative and must resolve under the verified real path of `repositoryRoot`. junction, symlink, traversal, absolute-path, and case-folding escapes fail closed. receipt status, protocol version, identity, linked artifact digests, manifest counts, composition limit, and no-authority-expansion declarations must all verify before the adapter becomes usable.

the verified release is cached by a digest of the canonical descriptor plus all root artifact digests. path or modification time is never a cache identity.

### 3. ephemeral mission stack

each cycle derives an immutable stack of zero to three selected capabilities. zero is valid only for a verified `no-qualified-route` result. `needs-decision` is unresolved and aborts before cortex inference.

the stack contains only:

- selected capability id, tier, and owner relationship;
- exact entrypoint path, digest, byte count, and verified text;
- exact operational contract path, digest, byte count, and parsed contract;
- capability, effect, risk, evidence, and precondition vocabulary from the portable manifest;
- applicable method, proposal-shape, evidence, and termination constraints;
- the intersected host ceilings;
- deterministic stack and package digests.

the stack is discarded after the cycle. stable entrypoint bytes, contracts, and parsed manifest rows may be cached by digest, but only the selected package enters the model context.

### 4. exact cycle receipt

the journal persists a body-free binding receipt before `cortex.requested`:

```json
{
  "schemaVersion": 1,
  "protocolId": "eternities-godskills-adapter-v1",
  "requestId": "...",
  "sourceEnvelopeDigest": "...",
  "releaseDigest": "...",
  "routerReceiptDigest": "...",
  "selectionStatus": "selected",
  "selected": [
    {
      "id": "eternities-forge",
      "entrypointSha256": "...",
      "contractSha256": "..."
    }
  ],
  "authorityCeilingDigest": "...",
  "stackDigest": "...",
  "packageDigest": "..."
}
```

the receipt binds selection, contracts, effects, preconditions, source envelope, release, and compiled package without storing bodies in the journal.

## runtime order

the required cycle is:

```text
mission admitted
  -> realm observed
  -> source envelope compiled
  -> certified release verified or digest cache hit
  -> godskill route compiled and validated
  -> selected entrypoints and contracts verified
  -> mission stack intersected with genome and host ceilings
  -> godskills.bound receipt journaled
  -> cortex envelope compiled with selected mission stack
  -> cortex inference
  -> proposal validation
  -> constitutional proposal selection
  -> realm action gateway
  -> consequence receipt
  -> cycle receipt
```

realm observation may precede routing because it is evidence in the source envelope. no cortex call or constitutional proposal commitment may precede `godskills.bound` for a bound godagent cycle.

the current order in `src/runtime/vessel.mjs`, where routing follows `decision.committed`, is rejected.

## provider-neutral adapter boundary

the host-facing interface is independent of OpenAI, Anthropic, OpenRouter, local inference, and codex task transport:

```js
const adapter = await createGodskillsAdapter({ releasePin, transport, artifactCache });

const binding = await adapter.bindMission({
  mission,
  observation,
  genomePolicy,
  hostEnvelope,
  sourceStateEpoch,
});
```

`bindMission` returns one of:

```js
{ status: 'bound', receipt, cortexPackage }
{ status: 'no-qualified-route', receipt, cortexPackage: emptyPackage }
{ status: 'needs-decision', unresolvedDecisions, receipt: null, cortexPackage: null }
```

an unsupported or malformed result throws a closed adapter error. provider adapters consume the canonical `cortexPackage`; they do not read godskills files or reinterpret route receipts.

## source envelope

the source envelope is canonical and includes only inputs known before inference:

- request id and exact mission text;
- current observation digest and state epoch;
- genome capability policy digest;
- constitution allowed-effect digest;
- host authority, effect, precondition, risk, evidence, context, and composition ceilings;
- realm hand contract digest;
- pinned release digest.

the full source envelope is retained by the host. its digest enters the route request, mission-stack receipt, cortex request, proposal admission, and cycle receipt.

## authority and constraint intersection

the two systems do not currently use one ontology for every field. Godskills capability effects are the semantic classes `read` and `write`, while Godagents realm effects are concrete host permissions such as `local-read` and `local-write`. Godskills risk and precondition vocabularies are descriptive obligations, while Godagents `maximumRisk`, `minimumEvidenceConfidence`, and `availablePreconditions` are host enforcement values.

the host policy therefore owns a closed, one-way semantic effect binding, initially `read -> local-read` and `write -> local-write`. this binding is used only to establish eligibility and can never synthesize a permission. an unmapped semantic effect fails closed. descriptive risk, evidence, and precondition vocabulary is carried into the method envelope as additional requirements and is never interpreted as proof that a host precondition is satisfied or that a host evidence floor may be lowered.

selection is eligible only when all of the following hold:

```text
selected capability is present in certified manifest
selected capability is not genome-prohibited
selected capability is not host-forbidden
every selected semantic effect has an explicit host-owned effect binding
every bound concrete effect is present in constitution and host permitted effects
route-request authority is a subset of mission and host available authority
route-request preconditions are a subset of observed and host available preconditions
route-request risk does not exceed host maximum risk
the compiled method envelope preserves or raises the host evidence floor
selected descriptive risk, evidence, and precondition obligations are preserved as unsatisfied requirements
selected count <= min(genome limit, host limit, release limit, 3)
selected bytes <= host package and context ceilings
```

godskills metadata can narrow these sets. it cannot add to them. realm hands, credentials, budgets, identity, constitution, evolution, and personal-keel ownership never enter the godskills grant surface.

## cortex mission package

the cortex receives a canonical `methodEnvelope` beside identity, mission, observation, and authority constraints:

```json
{
  "protocolId": "eternities-godskills-adapter-v1",
  "sourceEnvelopeDigest": "...",
  "releaseDigest": "...",
  "stackDigest": "...",
  "selectedCapabilities": ["..."],
  "methods": ["..."],
  "evidenceRequirements": ["..."],
  "proposalRequirements": ["..."],
  "terminationConditions": ["..."],
  "selectedPackages": [
    {
      "id": "...",
      "entrypointSha256": "...",
      "contractSha256": "...",
      "entrypoint": "verified selected first-party text",
      "contract": {}
    }
  ]
}
```

the compiler deduplicates and sorts scalar constraints while preserving selected capability order from the validated route. the resulting canonical package digest is recorded before inference. the model cannot request a different skill body during the cycle.

## recovery and retries

once `godskills.bound` is journaled, retries and crash recovery must reuse the exact package digest. they may rehydrate entrypoint and contract bytes only from matching digest-cache objects or from the same verified release. recovery never reroutes an already bound cycle.

if a crash occurred before `godskills.bound`, the host may recompute the source envelope and route only when its digest is identical. if the source envelope changed, the old cycle aborts and a new admitted cycle is required.

a stale, missing, mutated, or revoked release blocks bound inference. it does not rewrite or invalidate historical receipts.

## dependency migration versus evolution

a compatible Godskills release change is an operational dependency migration. it produces a migration receipt containing old and new release digests, protocol compatibility, manifest deltas, selected-contract compatibility, verification evidence, activation boundary, and rollback pin. it does not alter genome, genesis, actor identity, personal keel, or historical cycle receipts.

a release that requires broader permitted capability families, effects, authority, composition, or context ceilings cannot be adopted through dependency migration. those changes alter the agent's capability envelope and require governed evolution.

## failure semantics

bound godagent inference fails closed before cortex use on:

- unknown adapter or manifest protocol version;
- receipt status not certified or expected identity mismatch;
- stale or mismatched release-chain digest;
- artifact path escape, missing artifact, byte-count mismatch, or sha256 mismatch;
- manifest count other than 22 top-level and 22 operational capabilities;
- unresolved route or malformed route receipt;
- selected id, owner, contract, or entrypoint absent from the manifest;
- selection outside genome or host eligibility;
- composition above any applicable ceiling or above three;
- authority, concrete effect, host precondition, risk ceiling, evidence floor, or context expansion;
- selected package above its byte ceiling;
- recovery source-envelope, stack, or package mismatch.

`no-qualified-route` is not an unresolved route. it yields a receipt-bound empty method envelope and permits the cortex to use its native bounded reasoning. `needs-decision` is unresolved and aborts the cycle without inference.

unbound codex behavior remains available because this failure policy applies only after explicit godagent admission and binding.

## acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `GSV3-001` | exact system v3, router v8, compiler v3, portable receipt, and manifest chain verifies before adapter creation | release mutation matrix |
| `GSV3-002` | manifest must contain exactly 22 top-level and 22 operational capabilities | count and duplicate-id tests |
| `GSV3-003` | route occurs after mission and authority are known and before any cortex request | ordered journal assertion |
| `GSV3-004` | selected skill changes method, evidence, proposal shape, or termination input | metamorphic cortex-request test |
| `GSV3-005` | selected stack never expands authority, concrete effects, host preconditions, risk ceiling, evidence floor, or context ceilings | adversarial subset matrix |
| `GSV3-006` | all-rounder can use the complete eligible catalog | 44-capability eligibility test |
| `GSV3-007` | specialist preference affects ranking without blocking non-prohibited capabilities | preferred-miss fallback test |
| `GSV3-008` | only explicit prohibition removes specialist eligibility | genome policy test |
| `GSV3-009` | no more than three selected capability packages enter cortex context | overflow and request-body tests |
| `GSV3-010` | only manifest-pinned selected first-party entrypoints and contracts are loaded | filesystem spy and path-escape tests |
| `GSV3-011` | retry and recovery reuse exact source, stack, and package digests without rerouting | crash checkpoint matrix |
| `GSV3-012` | compatible release upgrade records dependency migration without identity change | old/new release fixture test |
| `GSV3-013` | capability-envelope expansion is rejected as migration and requires evolution | migration negative test |
| `GSV3-014` | ordinary unbound codex and existing generic cortex operation remain unchanged | unbound regression suite |

## implementation boundary

this design authorizes a test-first change inside `eternities-godagents` only. `eternities-godskills` remains an external certified dependency and is read for verification, routing, and selected runtime packaging only. no repository merge, skill-body copy, cold-quarry injection, source execution, profile activation, or godskills release mutation is part of this work.
