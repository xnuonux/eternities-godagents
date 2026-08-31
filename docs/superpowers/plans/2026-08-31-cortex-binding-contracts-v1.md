# cortex binding contracts v1 implementation plan

## milestone

compile one deterministic, inert cortex-binding candidate from a fully verified local admission. the result proves which identity envelope follows from the admitted bytes and target task surface without activating an identity, acquiring a writer lease, mutating a task, writing continuity, or granting realm authority.

## non-negotiable boundary

- identity comes only from the verified genesis receipt, creation build, distribution, expression, module manifest, and current personal-keel head.
- the caller may supply only a bounded task surface, a bounded mission projection, and a model-projection byte budget.
- task names, folder names, copied prompts, copied envelopes, and model claims are not identity evidence.
- the compiled candidate is always `compiled-inert`, reports `active: false`, grants no effects, and exposes no write or launch method.
- the existing generic cortex path remains unchanged and usable.
- phase 1 does not implement the binding registry, writer leases, codex task control, continuity admission, godskill contract activation, soul activation, or realm effects.

## implementation sequence

1. add a verified creation-build loader that returns one immutable snapshot while preserving the existing manifest-only verifier API.
2. expose that creation snapshot and the already-verified current keel snapshot from genesis admission verification.
3. define strict request, full-envelope, compact-projection, and inert-candidate schemas.
4. write adversarial compiler tests before production code:
   - deterministic output for identical verified inputs;
   - distinct admitted identities remain distinct on the same task surface;
   - mission changes cannot change identity or the binding candidate id;
   - identity-shaped, transcript-shaped, path-shaped, and credential-shaped request fields fail closed;
   - changed creation, distribution, receipt, or keel bytes fail before compilation;
   - compact projections replace lower-priority sections with explicit digest references and never silently truncate;
   - an impossible byte budget fails closed;
   - returned values are deeply immutable and contain no activation or write capability.
5. implement the smallest compiler that passes the tests.
6. perform an inline adversarial review, run focused tests, run the full repository suite at the release gate, build a reproducible certification receipt, merge, and push only if every gate passes.

## canonical projections

the full envelope contains binding, identity, expression, continuity, mission, capability, authority, and causal sections. the compact model projection keeps binding, identity, mission, authority, and causal sections inline. if required by the declared budget, it replaces expression, capability, then continuity with exact digest references in that fixed order. if the mandatory projection still does not fit, compilation fails.

the binding candidate id is derived from the protocol, verified admitted identity, target task id, host adapter id, and revocation epoch. mission text does not participate in identity derivation. the full-envelope, compact-projection, and complete candidate each receive independent canonical sha-256 digests.
