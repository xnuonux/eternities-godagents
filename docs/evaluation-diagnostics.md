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

Freeze a new preregistration and source digests; verify the exact runtime and
Godskills release pins; configure the bounded dispatch under the existing approved
spending envelope; bind the safety callback to real credential-reflection checks;
keep answer publication local/exclusive; persist per-arm elapsed time and reserved
call accounting separately from measured usage. Do not infer zero cost when usage
is unknown. Never silently retry an old attempt or replace a routing refusal with
native execution. A pending workflow is not evidence of a terminated provider call.

No production runtime, trusted release pins, Soul, Lunari integration or global
instructions are changed by these helpers. A fresh source-gated live runner,
full two-arm comparison and useful-task qualification remain separate work.

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
