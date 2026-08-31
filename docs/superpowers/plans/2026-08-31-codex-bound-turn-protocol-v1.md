# codex bound-turn protocol v1 implementation plan

## milestone

Prove a host-side create, continue, and compaction-resume transaction that dispatches one exact verified compact identity envelope through a declared task-scoped channel and accepts a response only with a matching trusted transport receipt.

## test-first sequence

1. Define strict request, task reservation, sealed envelope, transport receipt, and host turn receipt schemas.
2. Pin a deterministic fixture transport that reserves without dispatch, records the exact envelope, and issues a receipt over exact response bytes.
3. Prove create reserves first, binds the returned task, dispatches only after the writer lease exists, and closes the lease afterward.
4. Prove continue chains from one verified host receipt on the same task and actor while allowing a new mission.
5. Prove compaction resume reconstructs from host receipts and verified source state without accepting transcript input.
6. Reject capability, reservation, task, channel, envelope, binding, cortex, response, and receipt substitution.
7. Reject identity, authority, transcript, path, credential, and model-routing additions before transport use.
8. Prove binding and dispatch failures release the writer lock, and failed create cancels only an undispatched reservation.
9. Prove model output cannot manufacture host receipt fields, continuity admission, or Realm authority.
10. Build a deterministic fixture and append-only certification receipt, run the complete suite, integrate into the ledger, merge, and push.

## implementation boundary

- add one provider-neutral host adapter and no app-specific credentials or endpoints;
- reuse the phase-1 compiler and phase-2 registry rather than recreating admission or lease logic;
- never edit global Codex instructions;
- never use task titles, current directories, transcript text, or model self-identification as binding proof;
- retain exact proof limits for the missing live Codex app transport guarantees.
