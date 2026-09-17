# Native operator explicit epoch continuation — September 16, 2026

Status: implementation candidate for a draft PR; not merged, release-qualified,
or live-model tested. Baseline: `5bcdcec72170fc07c416bd3887c6f91c4d5521f8`.

## Recovered gap and implemented slice

The September 14 preparation audit identifies a revoked actor that cannot be
used in a fresh native session: the operator always emits revocation epoch zero,
while the registry correctly requires the current epoch. The registry error is
also reduced to a generic operation failure.

This candidate adds an optional, explicitly host-pinned top-level
`revocationEpoch` to the existing operator configuration and preparation request.
Omission still emits the historical epoch-zero task. Present values must be
nonnegative safe integers, with no string coercion, null/default substitution,
negative zero, automatic discovery, or automatic increment. The configuration
pin covers the field; the generated task and saved metadata retain it.

The native operator now screens the typed registry mismatch as
`native-operator:revocation-epoch-mismatch`, without exposing the raw registry
message, private paths, or arbitrary error codes. Other existing safe error
categories remain unchanged.

The underlying registry, its exact-epoch check, writer lock, revocation history,
identity compiler, tool grants, model defaults, retries and native history
validation are unchanged. This is configuration plumbing and diagnostic repair,
not a new authority service or a redesign of the native tool loop.

## Operator procedure and limits

A trusted operator must first examine the prior failure and independently
reconcile any uncertain effects. Preserve the original admission, registry,
config, session, run results, and evidence. Do not guess an epoch or promote a
model's suggested epoch into an authorized configuration.

For a deliberately authorized **fresh task/session**, keep the same verified
admission, use a new unoccupied `sessionRoot`, explicitly set the registry's
current epoch, retain or separately review all grants, and calculate a new
caller-held configuration/request digest. `prepare` preserves this field in its
ordinary output. A stale or future epoch is still rejected by the registry at
binding acquisition; preparation/preflight alone does not prove a live binding.

The old session cannot be resumed by changing its config pin: its saved metadata
still requires the original config digest. This patch does not import old native
conversation into the fresh session, resume an interrupted tool, reset a revoked
association, or replay uncertain work. Identity continuity is not the same as
conversation continuity. Same-session post-revocation recovery remains open.

No old receipt, certification root, current-state historical count, package lock,
Godskills pin, global instruction, Luna resident, or deployed scheduler changed.

## Verification actually performed in this continuation

- `node --test tests/native-operator-binding-policy.test.mjs`: **43 passed,
  zero failures/skips**, Linux Node **v22.16.0**. These are pure policy and error
  screening tests, not native session integration tests.
- Syntax checks passed for both modified operator modules, the new policy module,
  and the new Pi integration test.
- Before editing, the local operator and config bytes matched Git blob hashes
  `ddb88f8680518b2291f489b7c09f7d99f258cf02` and
  `8a7926ba37ac5c15d3571f003b2db28c89b8829c` respectively.
- `tests/native-pi-operator-reauthorization.test.mjs` adds a real registry/Pi
  fixture test covering revocation, rejected stale/future epochs without provider
  inference, wrong pins, preparation, new-session launch and ordinary resume,
  unchanged prior registry events and retained evidence. **This test was written
  and syntax-checked, NOT executed here.** Its provider/authentication seam is
  scripted; it is not a live subscription trial.

This environment had neither a complete checkout nor the qualified Pi SDK;
private GitHub reads/writes were available through the connector, not `git clone`.
No full-suite count from September 14 is claimed as a result of this candidate.

## Gates before promotion

Run the new integration case and existing native operator/config/preparation
cases with the qualified Pi SDK. Independently review the fresh-session
reauthorization boundary, including attempts to reuse an old session directory,
expired grants, concurrent acquisition, and unresolved-effect handling. Then run
the repository's four-worker full release gate on its supported environment and
verify historical certifications unchanged. Retain failing runs. Only afterward
consider a bounded live subscription trial under the existing project policy.
