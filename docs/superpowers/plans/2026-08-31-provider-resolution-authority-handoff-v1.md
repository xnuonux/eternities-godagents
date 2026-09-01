# provider resolution authority handoff v1 implementation plan

## goal

Create one portable canonical signing request and signed-return envelope for
both provider resolution families without moving cryptographic authority,
provider access, raw response bytes, or durable mutation into Godagents.

## sequence

1. add failing tests for exact request construction across both verified host
   profiles, canonical signing bytes, witness binding, and immutability.
2. add rejection tests for unknown fields, changed host and policy bindings,
   cross-family substitution, malformed decisions, response witnesses, request
   digests, signatures, and signed-return envelopes.
3. implement the smallest pure request builder, request verifier, signature
   binder, and signed-return verifier over the certified preparer.
4. prove an external test authority can sign each request and both real existing
   controllers accept the unchanged signed decision without redispatch.
5. certify deterministic fixtures, protected trust-root bytes, source and test
   manifests, ledger registration, and release lineage.
6. reproduce evidence, run the complete suite, fast-forward main, push, and
   clean only the merged worktree and branch.

## exclusions

No private key, signing operation, public-key authentication, provider call,
retry, automatic family choice, policy loading, raw response persistence,
filesystem outbox, durable resolution mutation, or expansion of Realm,
continuity, identity, evolution, Inspiration, Lunari, or Soul authority.

