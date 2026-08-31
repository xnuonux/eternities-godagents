# Codex bound-turn protocol v1 certification

## disposition

Certified through the append-only `codex-bound-turn-v1` receipt. The phase-3 source is frozen at commit `82376fc9fb74c7f2c205e565ae9b5e74ec0476b2`.

## exact evidence

- receipt: `receipts/codex-bound-turn-v1.json`
- logical receipt digest: `1657dffd0b1e88458175c9fc3819ea46f176aff225f91c61970c0150359bfe8c`
- receipt file SHA-256: `f6efc0d81048ee966e4a3848cb5ed71ca4f9822be2f00438b04b2b6c5ec58011`
- deterministic fixture: `fixtures/codex-bound-turn-v1.json`
- fixture logical digest: `0883313cdb9cfc79fc50abc24a2c02d079c1fc6585e3e158ba4bd3bf0079b758`
- fixture file SHA-256: `8945ee9531db10f8c13142af258dc7aa09c009405ccedee2938ad60997c453e5`
- implementation manifest digest: `22512f925bb1b388b11c8b8eb14b75d060635437aab1459bb6d25b3e5808d8ae`
- test manifest digest: `784c087496cfbac3677932ce63d739f125db7ee559c83be8179edb7e16b84540`
- focused gate: 31 tests passed
- complete repository gate: 414 tests passed with no failures or skips
- requirement rows: `CBP3-001` through `CBP3-012`, all passed
- historical inputs: all 12 preceding certification receipts by exact file hash

## certified boundary

A provider-neutral host can create, continue, or resume-after-compaction one task-scoped Godagent turn over an injected trusted task transport. Create requires a suspended reservation that records `modelStarted: false`. The returned task is then admitted through the phase-2 task and writer lease, recompiled through phase 1, and dispatched only after its candidate, identity, task, and personal-keel head match the active binding receipt.

The sealed model-visible envelope binds the operation, parent host receipt, transport descriptor, active binding receipt, compact model projection, and fixed proposal-only host rules under one canonical digest. The transport receipt binds the exact task, channel, envelope, cortex id, response bytes, and response digest. The final host receipt binds the reservation for create, persistent actor, active and released binding receipts, transport receipt, and zero admitted continuity or Realm authority.

The deterministic fixture performs create, continue, and compaction resume on one task across two replaceable cortex ids. It uses three real phase-2 leases and six linked registry events, reproduces the parent receipt chain, accepts no transcript input, serializes no lease credential, and ends with zero active bindings.

## retained adversarial checks

- request-level identity, authority, transcript, path, credential, and model fields fail before transport use
- transport descriptor, reservation, task, channel, parent actor, envelope, response, and receipt substitution fail closed
- deeply recomputed inner receipt mutations still fail semantic verification
- binding and dispatch failure release the personal-keel writer lock
- pre-dispatch create failure cancels only the verified still-suspended reservation
- model response text cannot manufacture identity, continuity admission, Realm effects, or host receipt fields
- source contains no global `AGENTS.md` or `config.toml` mutation path

## explicit limits

This certification does not claim a live Codex app task transport. The current public app controls do not expose suspended task reservation or a trusted envelope-bound execution receipt. It also does not claim a signed or release-pinned transport implementation, prompt echoes as proof, provider credential handling, durable host-side retry storage beyond transport idempotency, continuity-content admission, Godskills activation, Realm effects, a long-lived multi-mission binding, Lunari integration, Soul activation, or independent review.
