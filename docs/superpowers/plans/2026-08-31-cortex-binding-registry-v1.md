# cortex binding registry and writer lease v1 plan

## milestone

upgrade a verified phase-1 binding candidate into one host-held active binding receipt while preserving the existing admitted-local-launch path. enforce one active actor per Codex task and one active writer per personal keel, then provide renewal, release, revocation, and dead-host recovery without invoking a model or granting Realm effects.

## architecture

- store one canonical digest-chained registry event file below an injected or OS-account-derived root. publish every update through the existing atomic replacement primitive under one short-lived registry lock.
- reconstruct current records by replaying the complete verified event chain. do not maintain independent task and writer indexes that can diverge during a crash.
- acquire the admission-owned `vessel/launch.lock` for the lifetime of the returned host handle. this is the same lock used by admitted local launch, so the new path cannot write beside an existing vessel cycle.
- compile and verify the inert candidate before the writer lock, then compile it again after the lock. any source, keel-head, or request change between the two checks aborts and releases the lock.
- store only a digest of the random lease credential. keep the credential inside the host handle closure. active and lifecycle receipts contain no usable writer credential.
- derive the active binding id from the verified candidate identity, lease id, revocation epoch, and issue time. copied candidates or receipts do not own the live process lock or lease credential.
- treat revocation epoch as a monotonic floor across both the task and persistent instance. revocation increments it; stale candidates cannot bind again.
- reconcile expired durable leases before every mutation. a replacement writer must also reclaim the admission lock through the existing dead-process and stale-grace checks.

## test-first sequence

1. define strict registry-state, active-receipt, and lifecycle-receipt schemas.
2. write tests for canonical first acquisition, deep verification, no credential serialization, and exact active receipt reconstruction.
3. prove two different admitted identities cannot bind one task concurrently.
4. prove two tasks cannot acquire one personal-keel writer and that admitted local launch observes the same lock.
5. prove renewal requires the live credential and unchanged verified source.
6. prove release frees task and writer claims without incrementing revocation epoch.
7. prove revocation increments the task and instance epoch and rejects stale candidates.
8. prove a dead host can recover only after durable expiry plus process-lock stale recovery.
9. prove registry, event-chain, receipt, and candidate tampering fail closed.
10. run focused tests, perform an inline adversarial review, issue a reproducible append-only receipt, run the full suite, merge, and push.

## excluded

this phase does not create or control Codex tasks, inject envelopes into model context, invoke a cortex, activate Godskills, admit continuity rows, invoke Realm hands, integrate Lunari, or activate Soul. those remain later phases.
