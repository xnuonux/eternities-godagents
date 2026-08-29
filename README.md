# Eternities Godagents

Eternities Godagents is the provider-neutral vessel and foundry layer around replaceable model cortexes, governed Godskills, persistent continuity, and bounded Realm Contracts.

Version `0.2.0` preserves the certified local v0 vessel and separately proves a networked-cortex boundary, a modular Phase 1 creation forge, a Phase 2 transactional genesis boundary, and a headless Phase 3 creator protocol. The protocol turns manual choices or reusable presets into the same immutable reviewed draft and Phase 1 creation build. Transactional genesis remains a separate operation that binds one verified creation build and distribution to one journal, one isolated personal keel, and one canonical admission receipt before a persistent vessel may run. Evolution and Soul activation remain excluded.

The canonical architecture is [ADR-0002](C:/dev/eternities-canon/.worktrees/godagents-inspiration-covenant/architecture/ADR-0002-godagent-v0-runtime-and-foundry.md).

## What v0 proves

- one genome and Realm Contract compile into a byte-reproducible distribution;
- identity, constitution, journal, and receipts remain outside the replaceable cortex;
- concurrent organs can propose, but only one constitutional arbiter commits intent;
- every Realm mutation requires a declared hand and explicit authority;
- expected and observed consequences close through a typed action receipt;
- idempotency and reconciliation prevent duplicate effects after interruption;
- imported or inferred content cannot become lived history;
- instruction-like Realm content remains untrusted observation data;
- the portable Eternities Godskills compiler is consumed through its selected-only file boundary;
- the Soul compatibility port is frozen, dormant, and exposes no activation function.

## Commands

```powershell
npm test
npm run build:fixture
npm run build:creation-fixture
npm run build:creator-fixture
npm run build:genesis-fixture
npm run build:networked-fixture
npm run demo
npm run creator:local -- <command> <options>
npm run certify
npm run certify:creation-forge
npm run certify:networked-cortex
npm run certify:transactional-genesis
npm run certify:creator-protocol
```

`npm run demo` operates only on a repository-local counter Realm. It performs no network mutation, spending, publication, production operation, account change, or model API call.

`npm run certify` requires a clean worktree. It reruns the complete suite, rebuilds the fixture distribution twice in a verified temporary directory, compares exact artifacts, and writes `receipts/godagent-v0-certification.json`.

`npm run certify:networked-cortex` preserves the historical v0 receipt, runs the complete suite under a fail-closed Node-process-tree network guard, verifies credential-canary containment, and writes a separate `receipts/networked-cortex-certification.json`. It does not claim OS-level isolation for arbitrary non-Node child processes.

## Modular creation forge

The Phase 1 forge accepts one strict candidate, one independently pinned creation-policy ceiling, one presentation-only expression overlay, and exactly nine selected module kinds: lineage, archetype, attributes, personality, voice, organs, Godskills, cortex, and embodiment. The compiler and verifier both require the expected policy SHA-256 from a trust path separate from the policy file; calculating a digest after accepting an arbitrary policy is not sufficient.

```text
candidate + creation policy + expression + selected modules
  -> closed semantic parsing and authority firewall
  -> compatibility and bounded attribute derivation
  -> strict operational-genome projection
  -> canonical artifact writes
  -> independent on-disk verification
```

The output contains five content artifacts plus the build manifest: `creation-candidate.json`, `creation-policy.json`, `expression-overlay.json`, `module-manifest.json`, `agent-genome.json`, and `creation-build-manifest.json`. The build ID excludes timestamps, host paths, randomness, provider routing, and environment state.

Expression, pronouns, presentation, personality prose, and visual identity remain content-addressed presentation data. They cannot modify authority, effects, adapters, Realm capabilities, retries, credentials, evolution, or Soul state. Lineage and archetype affect compatibility, required organs, required Godskill entrypoints, module identity, and bounded derived attributes, but those attributes do not yet tune runtime cognition.

`npm run certify:creation-forge` requires clean source, runs the full suite under the Node process-tree network guard, compares two fresh byte-identical builds, verifies both historical receipts, and certifies only `GF-001` through `GF-005`, `GF-010`, and `GF-011`.

Phase 1 explicitly excludes genesis transactions, keel binding, cross-agent delegation, governed evolution, a creator interface, live-provider quality, Lunari integration, Soul runtime, and vessel instantiation.
Module inheritance is also closed in Phase 1: non-empty `baseModuleRefs` are rejected rather than silently accepted without inheritance semantics.

## Transactional genesis and personal keel

Phase 2 requires caller-supplied pins for the creation-policy digest and creation-build ID. It verifies the creation build and distribution, derives the distribution and genome digests from those artifacts, and checks their cross-artifact consistency. A deterministic coordinator then derives the genesis and keel identities, advances one digest-linked transaction state machine, initializes one isolated keel namespace, appends mutually bound journal and keel genesis records, writes a canonical receipt, and independently re-verifies the complete boundary before returning an admitted genesis result. Constructing a runnable persistent wrapper is a separate step that also requires runtime dependencies and the keel adapter.

```text
verified creation + verified distribution + caller pins
  -> deterministic genesis and keel identity
  -> isolated keel and journal preparation
  -> mutually bound genesis evidence
  -> canonical admission receipt
  -> independent wake verification
  -> persistent runnable vessel
```

Every durable interruption boundary is resumable without duplicate genesis rows. Existing admitted genesis is reopened only after full verification. Mismatched or quarantined evidence fails closed. Empty, truncated, dead-owner, and stale lock recovery preserves a grace period and uses atomic reclaim, while a live or recent owner remains protected.

The persistent wrapper keeps vessel identity, journal continuity, and keel identity stable across cortex replacement. Checkpoint promotion records exact cross-chain provenance. Temporary workers receive bounded context and proposal authority only; they cannot receive a personal-keel writer. Phase 2 certifies `GF-006` through `GF-009` plus `GF-012` and still excludes creator UI, governed evolution, hosted multi-tenant durability, live-provider quality, Lunari integration, collective team memory, and Soul activation.

`npm run certify:transactional-genesis` must run from its clean source commit. It executes the guarded complete suite, creates two byte-identical fresh genesis roots, verifies failure-injection coverage and historical receipts, and writes `receipts/transactional-genesis-phase2-certification.json`. The committed receipt pins that exact source commit; verify a merged receipt by reproducing the command at the pinned source commit and comparing canonical receipt bytes.

## Headless creator protocol

Phase 3 provides one interface-neutral protocol for future visual, conversational, command-line, or agent-guided creators. A catalog contains validated, content-addressed modules, expressions, and presets. Every user or software choice becomes an ordinary immutable command against an exact draft digest. Presets have no privileged execution path: they replay the same commands in the same order and must produce the same draft and preview identity as equivalent manual choices.

```text
validated catalog
  -> digest-linked creator commands or preset replay
  -> pure incomplete, blocked, or ready preview
  -> review seal over catalog + draft + preview
  -> source freshness check
  -> existing Phase 1 creation compiler and verifier
```

Finalization materializes only reviewed pre-genesis inputs and a verified creation build. It captures policy and selected-module bytes from the reviewed catalog, rechecks live source freshness, and compiles only from the transaction-owned immutable snapshot, closing post-review source races. It does not admit genesis, instantiate a vessel, bind a personal keel, call a model, grant runtime authority, or activate Soul. The creator draft fixes evolution to `frozen-v0` and the Soul port to `dormant`; catalog and presentation data cannot change those states.

`npm run build:creator-fixture` rebuilds two reviewed presets through isolated finalization roots and prints their catalog, draft, preview, parity, and creation-build digests. `npm run certify:creator-protocol` requires a clean source commit, runs the complete suite under the network guard, compares two byte-identical fixture roots, verifies all historical receipts, and writes `receipts/creator-protocol-phase3-certification.json` for only `GC-001` through `GC-008`.

Phase 3 does not certify a browser interface, recommendation intelligence, hosted multi-tenant persistence, accessibility, localization, analytics, genesis admission, governed evolution, Inspiration, Lunari integration, or Soul activation.

### Local creator shell

The local creator CLI is the first operator shell over the certified protocol. It accepts only `catalog`, `preview-preset`, and `finalize-preset`. Every command uses explicit local library paths and an independently supplied policy digest. Output is one canonical JSON value, and failures expose only closed codes.

```powershell
npm run creator:local -- preview-preset `
  --policy C:\path\to\creation-policy.json `
  --policy-digest <trusted-sha256> `
  --modules C:\path\to\modules `
  --expressions C:\path\to\expressions `
  --presets C:\path\to\presets `
  --preset preset:aether-architect@1.0.0 `
  --creator creator:dom
```

Review the returned selection, issues, attributes, excluded-authority fields, and `previewDigest`. Finalization requires that exact digest plus empty transaction-owned source and output directories:

```powershell
npm run creator:local -- finalize-preset `
  --policy C:\path\to\creation-policy.json `
  --policy-digest <trusted-sha256> `
  --modules C:\path\to\modules `
  --expressions C:\path\to\expressions `
  --presets C:\path\to\presets `
  --preset preset:aether-architect@1.0.0 `
  --creator creator:dom `
  --expected-preview-digest <reviewed-preview-sha256> `
  --source-dir C:\path\to\empty-source-transaction `
  --output-dir C:\path\to\empty-build-transaction
```

The shell ends at a verified creation build. It does not run genesis, create a vessel or keel, contact a model, invoke a Realm hand, evolve an agent, or activate Inspiration or Soul.

### Visual creator shell

The visual forge is a loopback-only client of the same bounded operator workflow. It lists only validated presets, presents the exact expression, module ledger, exclusions, attributes, and preview digest, and keeps finalization disabled until the operator acknowledges that reviewed projection. The browser cannot supply filesystem paths: the server derives an isolated transaction below `--workspace` from the reviewed preview digest.

```powershell
npm run creator:web -- `
  --policy C:\path\to\creation-policy.json `
  --policy-digest <trusted-sha256> `
  --modules C:\path\to\modules `
  --expressions C:\path\to\expressions `
  --presets C:\path\to\presets `
  --workspace C:\path\to\creator-workspace
```

The server binds only `127.0.0.1`, generates a fresh launch token, serves no third-party assets, and accepts only fixed same-origin API routes. An optional `--port` may select a loopback port. The visual forge ends at the same verified pre-genesis build as the CLI and has no genesis, model, Realm, keel, evolution, Inspiration, or Soul capability.

## Networked cortex host

The networked extension keeps endpoint, model, timeout, retry policy, host authority, and credential-variable selection outside the deterministic distribution. Build the compatible fixture with `npm run build:networked-fixture`, copy `fixtures/host-policy.json` to an operator-controlled location, and adjust its non-secret runtime policy. The API credential itself belongs only in the environment variable named by that policy.

The policy is an operator-controlled trust root. Before launch, compute its canonical digest through a trusted terminal and pin that digest separately:

```powershell
$env:GODAGENT_POLICY_SHA256 = npm run --silent policy:digest -- C:\path\host-policy.json
$env:GODAGENT_MODEL_API_KEY = '<provider credential>'
```

Changing the policy path, endpoint, authority, model allowlist, retry budget, or Godskills root without updating the separate digest pin fails before credential resolution. The fixture policy also bounds prompt bytes, completion tokens per attempt, completion tokens per cycle, response bytes, timeout, and attempt count.

The host accepts only a policy path and a plain-text mission path:

```powershell
npm run host:local -- --policy C:\path\host-policy.json --mission C:\path\mission.txt
```

The host rejects credentials in command-line arguments, policy values, mission text, and reflected provider output. Accepted action payloads and expected transitions must satisfy the selected Realm hand contract before a Realm invocation. Tests and certification use injected transports and make no provider request.

## Causal loop

```text
mission
  -> Realm observation
  -> concurrent organ proposals
  -> constitutional decision commit
  -> commandless Godskills route receipt
  -> governed hand invocation
  -> expected-versus-observed consequence receipt
  -> hash-chained continuity event
```

The model is a proposal source. It cannot write the journal, invoke a Realm hand, grant authority, amend the constitution, or activate the Soul port.
