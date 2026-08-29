# Godagent v0 architecture

The implementation authority is [ADR-0002](C:/dev/eternities-canon/.worktrees/godagents-inspiration-covenant/architecture/ADR-0002-godagent-v0-runtime-and-foundry.md). The certified v0 local single-agent proof remains intact. The post-v0 networked-cortex boundary is specified in [the networked cortex and local host design](superpowers/specs/2026-08-29-networked-cortex-host-design.md).

The model proposes. The constitutional arbiter commits. The Realm Contract governs effects. The journal preserves causal continuity. The Soul port remains dormant.

## Implemented components

| component | responsibility |
| --- | --- |
| foundry | verifies the genome, Prompt OS artifact, Realm capabilities, source hashes, and deterministic distribution |
| vessel | admits one mission and owns the observation, proposal, decision, action, consequence, and recovery lifecycle |
| cortex adapter | produces typed proposals without receiving a hand or continuity writer |
| scheduler | runs organs concurrently against frozen state and returns canonical proposal order |
| constitutional arbiter | selects one admissible proposal using constitution, authority, preconditions, epoch, expiry, cost, and priority |
| Godskills adapter | preserves natural mission text, rejects authority expansion, and returns selected entrypoints without executing them |
| Realm adapter | exposes typed observation, idempotent invocation, reconciliation, and inspection surfaces |
| action gateway | checks committed authority and closes expected outcomes against observations |
| continuity store | writes hash-chained JSONL, immutable snapshots, verified replay, and quarantined tails |
| memory admission | preserves source class and forbids foreign content from entering as lived history |
| Soul port | returns only the frozen state `{ "schemaVersion": 1, "status": "dormant" }` |

## Networked cortex extension

The OpenAI-compatible adapter implements the same proposal-only cortex role through an injected HTTPS transport. It prepares a deterministic semantic request digest, returns only strict typed proposal results, and classifies malformed or failed provider responses into closed reason codes. Raw requests, raw responses, headers, exception messages, credentials, and free-form provider-authored prose cannot enter the accepted proposal. Reflected credentials and credential-shaped nested fields fail closed.

The local host loads one strict policy that defines non-secret provider configuration, bounded retry, prompt and completion budgets, authority, Realm identity, and Godskills constraints. Its canonical digest must match an operator-supplied `GODAGENT_POLICY_SHA256` pin before credential resolution. Authority is copied from this validated policy into the admitted mission; mission text cannot grant or expand it. Credentials are available only through an in-memory resolver closure.

Each Realm hand declares a strict input schema and expected-outcome derivation. The adapter checks these constraints before accepting a proposal, and the action gateway independently checks them against a fresh pre-action observation before invoking the hand. For the fixture Realm, `counter.increment` permits exactly `{ "amount": 1 }` and exactly the observed counter plus one.

Inference attempts form a separate durable lifecycle before constitutional decision:

```text
cortex.requested -> cortex.accepted + proposal | cortex.failed(reasonCode)
```

Recovery after durable acceptance reuses the journaled proposal. Recovery after an unresolved request may spend only the next policy-authorized attempt. Prompt bytes, completion tokens per attempt, and reserved completion tokens per cycle are bounded before transport. This economic retry ledger is separate from Realm action idempotency.

## Trust order

The compiled constitution, exact distribution manifest, verified host context, and Realm Contract are trusted only through their declared loading paths and digests. Cortex output, Realm content, retrieved material, imported memories, and Godskill suggestions remain typed data. None can manufacture authority.

## Proof boundary

The two fixture cortexes prove replacement mechanics, not equivalent intelligence between commercial models. The networked adapter proof uses fake transports and does not establish live-provider compatibility, quality, latency, or cost. The counter Realm proves effect governance and recovery, not a general simulation platform. Project Sid informed the concurrency, bottleneck, and action-awareness tests but no Project Sid code or media enters this repository.
