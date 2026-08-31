# Cortex binding registry and writer lease v1 certification

## disposition

Certified through the append-only `cortex-binding-registry-v1` receipt. The phase-2 source is frozen at commit `f8b2c1d6c2ff8f173e32d378af602c870350c588`.

## exact evidence

- receipt: `receipts/cortex-binding-registry-v1.json`
- logical receipt digest: `f5b4d346fddcd6227b54ec72eb8115f141588a06bae4c2c10f5f94ae2314fa3e`
- receipt file SHA-256: `b3451c15cc48aec6ab07d3fadf15101784d442b54e315ec6df9e6a9248dea4c5`
- deterministic fixture: `fixtures/cortex-binding-registry-v1.json`
- fixture logical digest: `de69bc63ef0f257c293969a038f2a6b33be5e26b34ed3d01826d64322c01dd86`
- fixture file SHA-256: `3eb59449293e0feadf172084200b381952f6472c4df5c6b57cb70b272f2d051d`
- implementation manifest digest: `2e4497f94b68d6a4e96b7599ae963ef3517e9ef98a3821c4ab17d0fc52d92933`
- test manifest digest: `638b50ce5addd70bb574211457219e2bd3bccbf41ffc8bdbda874e5931ad5814`
- focused gate: 32 tests passed
- complete repository gate: 402 tests passed with no failures or skips
- requirement rows: `CBP2-001` through `CBP2-010`, all passed

## certified boundary

One phase-1 inert identity candidate can become one credential-free active host receipt under an atomic digest-chained registry. The registry enforces one active admitted identity per task and one active writer per personal keel. Its live handle holds the same admission-owned launch lock used by admitted local launch, so the two execution paths cannot write concurrently.

Renewal re-verifies the admitted source and current keel head. Release, revocation, expiry, and dead-host recovery produce exact replayable lifecycle transitions. Revocation advances a monotonic task-and-instance epoch. Durable registry state, active receipts, lifecycle receipts, and inspection output contain no usable lease credential. Every active receipt grants only the host-held lease marker and explicitly grants no Realm effects.

The deterministic fixture performs real creation compilation, local admission, candidate compilation, task and writer collision rejection, renewal, release and replacement, revocation and stale-epoch rejection, expiry, recovery, and final cleanup. It leaves zero active bindings across eleven linked registry events. The integration test also proves that admitted local launch observes the same personal-keel writer lock.

## retained adversarial checks

- task and writer collisions fail before a second active binding exists
- changed admitted source bytes fail before lease renewal
- expiry discovered by inspection or renewal releases the held writer lock
- transient writer-lock cleanup failure remains retryable after durable closure
- canonical-state, event-chain, receipt, and oversized-input mutation fail closed
- source inspection confirms no model, Godskills, Realm, or continuity-writer import

## explicit limits

This certification does not claim Codex task creation or resume, model invocation, context injection, Godskills activation, continuity-content admission, Realm effects, task migration, long-horizon registry compaction beyond the v1 event ceiling, hostile same-account filesystem defense, Lunari integration, or Soul activation. Review was inline and adversarial, not independent.
