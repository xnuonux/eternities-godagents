# Bounded evaluation diagnostics

Experimental evaluation helpers live in `scripts/evaluation/`, with matching
`tests/evaluation-*.test.mjs`. They are not a live CLI, a provider credential
loader, a public SDK promise, or a new runtime authority layer.

The original 2026-09-07 comparison lost its failure details in a catch-all handler.
The helpers preserve exclusive attempt journals, bounded local error categories,
HTTP status, validated usage and distinct Godagent outcomes without logging raw
provider errors or responses. An existing attempt directory cannot be reused.
Filesystem persistence failure is not reported as successful recorded completion.

- `attempt.mjs`: flushed, exclusive event files; bounded JSON response reading;
  locally minted failure categories and explicit outcome recording.
- `baseline.mjs`: strict response/answer checks, measured reasoning accounting and
  mandatory caller-bound response safety check before publication.
- `dispatch.mjs`: explicit reasoning-split evaluation profile, exact endpoint and
  model, request size, call/total-token ceilings, redirect rejection and timeout.
  Failed physical calls retain their reserved budget; no automatic retries.
- `godagent.mjs`: observe an already-verified local workflow result; preserve
  pending, needs-decision, rejected and completed. Record aggregate mission usage
  once. It does not replace runtime receipt verification.

## Evidence

The 27 targeted tests cover those boundaries, a combined synthetic baseline with
an independent exhaustive scheduling oracle, and an actual admitted local host
using synthetic transport plus a network tripwire. A valid suboptimal answer can
complete transport validation while failing the task oracle. Neither result is
live model-quality evidence. Original operational receipts and the failed trial
remain unchanged; reusable code was ported from the operational diagnostics.

Two independent operational reviews identified and helped correct lost dispatch
categories and baseline/host content-type asymmetry. The final two corrections
have red-green regression evidence. Historical review does not certify a future
CLI or a new provider route.

## Caller obligations before a live trial

Cache telemetry is nullable in evaluation usage records: missing or null provider
cache detail is preserved as `cachedInputTokens: null`, while explicit zero stays
zero. `usageKnown` means a validated usage record exists, not that every optional
dimension was measured. Consumers must not subtract null from input tokens,
infer a cache hit, or turn it into zero cost. Core input/completion/reasoning
counts remain required. Invalid negative, fractional, string or over-input cache
counts still stop publication. Historical attempt records are not rewritten.

Freeze a new preregistration and source digests; verify the exact runtime and
Godskills release pins; configure the bounded dispatch under the existing approved
spending envelope; bind the safety callback to real credential-reflection checks;
keep answer publication local/exclusive; persist per-arm elapsed time and reserved
call accounting separately from measured usage. Do not infer zero cost when usage
is unknown. Never silently retry an old attempt or replace a routing refusal with
native execution. A pending workflow is not evidence of a terminated provider call.

No production runtime, trusted release pins, Soul, Lunari integration or global
instructions are changed by these helpers. A fresh source-gated live runner and
useful-task qualification remain separate work. Controlled two-arm development
execution is available as described below.

## Controlled two-arm comparison

`scripts/evaluation/comparison-preparation.mjs` exports `prepareComparison` for
an inert, digest-bound registration. `scripts/evaluation/comparison.mjs` exports
`runControlledComparison({ preparationPath, preparationDigest, fetchImpl })`.
It accepts only reserved test endpoints, uses a synthetic credential, and labels
every report `executionKind: "controlled"`. It is not a live account entrypoint.

The fixed oracle registry currently supports bounded weighted-interval scheduling.
The registry constructs one task contract for both arms and scores answers without
placing the optimum into either task payload. The Godagent arm goes through the
actual admitted local workflow, not a mock actor. The baseline and Godagent each
have independently fixed physical-call/token reservations and attempt journals.

Reports distinguish completion status, scored correctness or an unscored reason,
measured usage or null, reserved completion tokens, actual artifact identity, and
the normalized oracle-input digest. Malformed answers and uncertain dispatches
cannot receive successful quality scores. An existing run directory prevents
reuse; stale workflow bytes are rejected before dispatch. Unknown oracle IDs do
not load arbitrary modules.

These checks cover deterministic development behavior, not model superiority.
Declared sources are pinned but do not prove a complete executing import closure.
The injected test transport is trusted code, not sandboxed code. Live-provider
qualification, complete source binding, fresh held-out tasks, broader usable-task
coverage, and current resource/spending approval are still required before a live
quality claim. Grok's verified subscription CLI needs its own bounded adapter;
it is not an HTTP URL substitution.

## Native route boundary

The vessel integration tests now exercise three distinct routing outcomes through
the real pinned-release adapter, using synthetic routing and model transports:

- selected capability with native activation: the bound package reaches inference;
- receipt-backed `no-qualified-route`: exactly one native execution receives no
  Godskills package, and recovery returns the same completion without rerouting,
  reclassification, activation, or another model execution;
- `needs-decision`: unresolved intent returns without native inference.

This confirms existing vessel behavior, not semantic accuracy of the real intent
compiler. In particular, it does not authorize converting `intent-not-understood`
into an empty successful selection to get a comparison running. No new runtime
path or fallback was needed. Live evaluation must first qualify its actual route.

## Qualification issuance limitation

The external-host qualification issuer now constructs its receipt only after
both focused and full test runs return successfully, using their separate actual
counts. It no longer publishes a preliminary certified receipt with a fabricated
full-suite result. Three focused issuance tests cover ordering and failure;
reinstating premature construction makes two of them fail.

This is not transactional release publication: subsequent release gates still
run after the receipt write. Do not treat this repair as resolving failure/crash
handling for that later publication boundary, or as new qualification evidence.
Historical receipts remain unchanged.
