# Eternities Godagents

Eternities Godagents is the provider-neutral vessel and foundry layer around replaceable model cortexes, governed Godskills, persistent continuity, and bounded Realm Contracts.

Version `0.2.0` preserves the certified local v0 vessel and adds a separately certified networked-cortex boundary: one OpenAI-compatible adapter and one policy-bound local host. It does not certify compatibility, latency, cost, or quality against a live commercial provider and does not implement Soul, Inspiration, residency, Minecraft, Lunari, or a hosted service.

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
npm run build:networked-fixture
npm run demo
npm run certify
npm run certify:networked-cortex
```

`npm run demo` operates only on a repository-local counter Realm. It performs no network mutation, spending, publication, production operation, account change, or model API call.

`npm run certify` requires a clean worktree. It reruns the complete suite, rebuilds the fixture distribution twice in a verified temporary directory, compares exact artifacts, and writes `receipts/godagent-v0-certification.json`.

`npm run certify:networked-cortex` preserves the historical v0 receipt, runs the complete suite under a fail-closed network guard, verifies credential-canary containment, and writes a separate `receipts/networked-cortex-certification.json`.

## Networked cortex host

The networked extension keeps endpoint, model, timeout, retry policy, host authority, and credential-variable selection outside the deterministic distribution. Build the compatible fixture with `npm run build:networked-fixture`, copy `fixtures/host-policy.json` to an operator-controlled location, and adjust its non-secret runtime policy. The API credential itself belongs only in the environment variable named by that policy.

The host accepts only a policy path and a plain-text mission path:

```powershell
npm run host:local -- --policy C:\path\host-policy.json --mission C:\path\mission.txt
```

The host rejects credentials in command-line arguments, policy values, and mission text. Tests and certification use injected transports and make no provider request.

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
