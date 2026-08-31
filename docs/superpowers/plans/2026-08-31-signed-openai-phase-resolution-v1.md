# signed OpenAI-compatible phase resolution v1 implementation plan

## milestone

Implement and certify one optional, externally pinned, Ed25519-authorized
controller that closes exact pending phase calls by adopting a recovered
response or abandoning the attempt, with no retry path.

## implementation sequence

1. add failing policy tests for canonical loading, external digest pinning,
   exact transport-policy binding, Ed25519 SPKI validation, response ceiling,
   decision lifetime, unknown fields, and stable failure codes.
2. add the resolution-policy schema and loader. Keep the public key and policy
   non-authoritative until the external digest pin matches.
3. add failing decision tests for canonical digest and signature verification,
   phase and operation bindings, disposition-specific response witness,
   timestamps, expiry, nonce, wrong key, tampering, and cross-operation replay.
4. implement the canonical response witness and signed-decision verifier using
   Node's built-in Ed25519 support. Never accept a caller-supplied verifier.
5. add failing durable-state tests for pending-only admission, exact response
   adoption, sanitized abandonment, terminal collision, malformed and
   symlinked resolution state, and concurrent resolution.
6. refactor the phase transport only enough to expose a sealed internal
   operator port while preserving the three existing adapter surfaces. Add
   `resolution.json` to the allowed immutable operation entries.
7. publish the signed resolution record before completion or failure. Reuse the
   existing response parser, completion builders, operation lock, and atomic
   publisher. Add `operator-abandoned` as one closed terminal reason.
8. add checkpoint failures after resolution publication. Prove exact abandon
   recovery without external input and exact adoption recovery only when the
   already-bound response is resupplied.
9. prove that accepted resolution survives later decision expiry, while an
   expired unaccepted decision fails before mutation.
10. run native, review, and revision adoption fixtures plus an admitted-host
    integration in which ambiguous native execution is adopted and the rest of
    the reviewed mission completes without a second native call.
11. scan every durable and emitted surface for request, response, credential,
    endpoint, model-output, Realm, continuity, and authority leakage.
12. add deterministic fixture, receipt builder, certification test and
    document, package command, 28th ledger row, release-lineage coverage,
    README, and architecture updates.
13. run focused tests, the complete repository suite, receipt and ledger gates,
    and two exact receipt reproductions. Perform inline adversarial review
    because subagents are prohibited.
14. fetch and reconcile both repositories, merge only the fully verified
    fast-forward branch, push, verify local and remote equality, and remove
    only the exact clean worktree and merged branch.

## test discipline

Every production behavior begins with a focused failing test. The first red
tests cover policy and signature boundaries before any operation mutation.
Fixture network calls remain injected and local. No test reads a real private
key or API credential, contacts a provider, or creates a retry path.

The full suite runs only at the final receipt gate. Source and release commits
remain separate so the receipt binds immutable source bytes without hashing
itself.

## proof limit

Passing this milestone proves local signed resolution mechanics and exact
recovery. It does not prove provider-side outcome truth, remote exactly-once
execution, operator judgment quality, or live model quality.
