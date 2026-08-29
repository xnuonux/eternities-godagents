# Eternities Godagents

Eternities Godagents is the provider-neutral vessel and foundry layer around replaceable model cortexes, governed Godskills, persistent continuity, and bounded Realm Contracts.

Version `0.1.0` is a local architectural proof. It does not implement Soul, Inspiration, residency, Minecraft, Lunari, a hosted service, or a production model provider.

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
npm run demo
npm run certify
```

`npm run demo` operates only on a repository-local counter Realm. It performs no network mutation, spending, publication, production operation, account change, or model API call.

`npm run certify` requires a clean worktree. It reruns the complete suite, rebuilds the fixture distribution twice in a verified temporary directory, compares exact artifacts, and writes `receipts/godagent-v0-certification.json`.

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
