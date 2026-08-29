# Eternities Godagents

Eternities Godagents is the provider-neutral vessel and foundry layer around replaceable model cortexes, governed Godskills, persistent continuity, and bounded Realm Contracts.

Version `0.2.0` preserves the certified local v0 vessel and separately proves a networked-cortex boundary and a modular Phase 1 creation forge. The forge compiles creator choices into deterministic pre-genesis artifacts. It does not instantiate a vessel, bind a keel, run evolution, or activate Soul.

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
npm run build:networked-fixture
npm run demo
npm run certify
npm run certify:creation-forge
npm run certify:networked-cortex
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
