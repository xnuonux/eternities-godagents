# Native response recovery, September 13, 2026

## Delivered change

Implementation: `2107b99b6d806579a1aacd8b853cc734447eabf0`, based on
`ee0f9421e5e5aa0402fe49bae1fac59b4b8bb99f`.

The native operator can now use the qualified Pi host's existing transient
response recovery. New ordinary coding configurations explicitly pin
`limits.maxProviderRetries: 1`; the accepted range is 0 through 2.
Omission remains no retry. Existing sessions, frozen trial configurations and
receipts were not repinned. No alternate model, paid API, personal Grok keel,
custom agent loop, installed SDK patch or global provider setting was added.

The count is per failed response, not a total mission spending guarantee.
The original deadline, tool budget, model and authority checks still govern.
Progress is screened; successful recovery adds `native-provider-recovered`.
Failed messages remain private session evidence and missing usage stays unknown.

## Diagnosis and limits of the evidence

The original pair remains an invalid basis for comparing skill quality. Its
skills arm ended with `terminated`; the control ended with
`Error Code null: Internal error during token generation`. Neither reached its
local run deadline or made source edits.

The installed Pi 0.85.1 Responses adapter constructs the second string when
processing a provider SSE `error` event, not a Godskills route rejection.
The first old record lacks the underlying socket cause; a dropped stream is
consistent with that message but is not proven retrospectively. No claim is
made to have repaired the provider's server internals.

The confirmed local behavior was unconditional
`retry: { enabled: false, maxRetries: 0 }` in the normal native operator. That
policy was intentional for the old matched experiment, but left ordinary coding
with no way to use Pi's existing transient-error recovery. Pi's pinned classifier
recognizes both observed messages. The fix exposes a bounded operator-pinned
allowance without changing the old experiment.

A fresh instrumented run completed all 21 actual responses with HTTP 200 and
terminal completion events. It reached 62,805 reported input tokens on its last
response, beyond the context present at the prior failures. This does not prove
all input sizes safe, but does not support treating the earlier failures as an
established context-size or skill-policy defect.

## Verification

- RED: 26 checks, 20 passing and 6 expected failures before implementation.
- Initial native integration gate: 89/89.
- Independent Grok review: returned “Ready to merge: yes”. Its substantive
  follow-up was an emitted-error default-off regression test, now added.
  The two-retry maximum also has an actual operator test. Follow-up gate: 28/28.
- Production source digests were unchanged after the review; follow-ups modified
  tests and documentation only.
- Full regression: 1,604 passed, zero failed, nine existing optional skips;
  683,383.825 ms at implementation commit 2107b99. Full log SHA-256
  `44eea6a8f13b585e4d5ba82f90f432701810daab701fff27bba2d980d7d9168e`.
- Merged verification: 91/91 native checks, then 8/8 post-push cross-repository
  checks at main/origin 2107b99. Godskills main/origin remained
  `d0781a91a82898cc808e7fc681f145fdd972dade`.

The real SDK tests exercise completed writes, a partial tool call carried by an
error response, both observed error messages, exhausted recovery, zero/omitted
allowance, quota/authentication failures, cancellation during backoff, unknown
usage, and operator state. The incomplete tool call is never executed and the
completed write is not repeated.

### Live interrupted-response test

Using the actual Pi/Grok 4.6 OAuth subscription, the host deliberately cut one
response body after a successful HTTP response and two completed native reads.
This was a labelled injected transport fault, not an observed server failure.

The normal Pi loop retried once, repaired a real local JavaScript function,
ran its tests and settled normally: 5 provider requests, 5 completed tools,
zero pending tools. Eight independently checked cases passed. The failed
response remained in history; all cumulative usage totals correctly remained
unknown. The successful result carried `native-provider-recovered`.

Session: `01a09ca4-af19-7163-8f9c-e8b3389fee78`.
Verification record SHA-256:
`43b54ac53945180ab524158423abfbaf90db545022d02a384a94987461779753`.

### Real history-query coding task

A separate fresh diagnostic run completed the previously failed multi-file
coding task without an owner code repair: 36 completed tools, 21 successful
inferences, zero pending tools, 366.981 seconds. All 20 frozen independent
acceptance checks and 35 candidate regression checks passed. All original
tests were preserved. Only the five allowed existing paths changed, with two
new test files.

This diagnostic happened without automatic retry; it demonstrates that the
real task can complete, not that recovery caused that particular success.
The first diagnostic invocation failed locally before HTTP because the new
diagnostic logger tried to hash undefined JSON fields. That private logger was
corrected, and a separately recorded invocation resumed the fresh diagnostic
actor. Original failed comparison trials were not rerun or modified.

The query implementation is preserved as a verified candidate, **not merged
into canonical source by this recovery repair**. Its next adoption must preserve
the newer recovery changes in the overlapping operator/config/documentation
files. Candidate verification SHA-256:
`690234e1f9e59440fd9fd2942a1527fc1f3438766a7f542ddaf8d07f0d1cb8b3`.

## Evidence locations and next action

Private evidence root:
`D:/00-INDEX/operations/2026-09-13-native-generation-diagnostic`.

Relevant records: `attempt-2/transport.jsonl`, `attempt-2/result.json`,
`recovery-live/verified.json`, `recovery-live/result.json`,
`candidate-verification.json`, `acceptance.log`,
`candidate-regressions.log`, `review/verdict.md`,
`recovery-red.log`, `review-followup.log`, and `full-regression.log`.
Raw request bodies, credentials and private transcripts are not published.

The next product task is a separate reviewed adoption of the completed
history-query candidate. A future matched Godskills comparison needs fresh
registered slots and matched recovery allowances; do not retrofit the old pair.

