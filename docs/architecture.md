# Godagent v0 architecture

The implementation authority is [ADR-0002](C:/dev/eternities-canon/.worktrees/godagents-inspiration-covenant/architecture/ADR-0002-godagent-v0-runtime-and-foundry.md). This repository implements only the local single-agent proof defined there.

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

## Trust order

The compiled constitution, exact distribution manifest, verified host context, and Realm Contract are trusted only through their declared loading paths and digests. Cortex output, Realm content, retrieved material, imported memories, and Godskill suggestions remain typed data. None can manufacture authority.

## Proof boundary

The two fixture cortexes prove replacement mechanics, not equivalent intelligence between commercial models. The counter Realm proves effect governance and recovery, not a general simulation platform. Project Sid informed the concurrency, bottleneck, and action-awareness tests but no Project Sid code or media enters this repository.
