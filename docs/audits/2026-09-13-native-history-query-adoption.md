# Native history-query adoption, September 13, 2026

## Scope and provenance

Adoption base: `2940c07ef768e673a6ca0c56d450f3e2092d97c8`.
This integrates the completed native Pi/Grok coding candidate from
`D:/00-INDEX/operations/2026-09-13-native-generation-diagnostic/workspace`.
The original candidate was based on `ee0f942`, before the response-recovery
implementation in `2107b99`. The operator, configuration and documentation were
merged selectively to preserve that newer recovery behavior.

The original live task completed 36 native tools and 21 successful responses,
with 20 frozen independent acceptance checks and 35 candidate regressions
passing. Its scope verification covered 506 original files, five changed
existing paths and two new tests; existing tests were unchanged. Candidate
verification SHA-256:
`690234e1f9e59440fd9fd2942a1527fc1f3438766a7f542ddaf8d07f0d1cb8b3`.

This adoption is owner-reviewed and owner-refined. It must not be described as
an untouched model patch or as a matched Godskills quality win. The original
failed comparison remains inconclusive.

## Useful capability

The actual native operator's offline `history` command now accepts `--only`,
`--after` and `--limit`. Embedders can supply `historyQuery` to the operator or
`query` to `readNativeRunHistory`. The selected report includes status counts,
provider-reported usage and explicit selection counts. The unfiltered report
remains compatible.

Selection validates every record first, including excluded records. It applies
status and strict start-time filters, keeps the latest matching records up to
the limit, then returns them in ascending start-time/run-ID order. Usage is only
for returned rows; missing values remain unknown rather than estimated. An
incomplete returned run makes all usage totals unknown.

No model or credential load, session mutation, configuration-pin change, tool
grant, identity change, new dependency or replacement agent loop is introduced.
The previous optional bounded response-recovery setting, native progress,
cancel handling and failure evidence remain in place.

## Owner findings and regression proof

Before adopting production code, the two candidate test files were added to the
unchanged base: 14 checks, two passed and 12 failed for the absent query feature.
After selective adoption the original 14 passed.

Owner inspection reproduced two validation defects in the candidate:

- A non-string `only` value could coerce to an allowed object key. The reader
  now requires a primitive string before looking up the stored status.
- A regex-shaped but impossible date could throw `RangeError` from
  `toISOString`. The reader and CLI now check for a finite parsed time before
  exact ISO round-trip validation. Invalid stored dates also remain screened
  timestamp errors, even when a query would exclude them.

Four additional regression tests failed before these fixes and passed afterward.
A fifth added check confirms offline queries accept the current recovery-enabled
pinned configuration. No pre-existing test was weakened or replaced.

## Verification

- Query tests: 19/19; frozen independent acceptance: 20/20.
- Combined native-host regression: 110/110, including recovery, resume, native
  tools, Godskills binding, authority rejection and ordinary unbound Pi behavior.
- The actual offline CLI selected the previously completed live coding run from
  its two-run saved history. It returned the expected run ID and exactly the
  recorded usage, without another model request.
- Independent Codex review found no concrete correctness defects and independently
  passed the 19 query tests and `git diff --check`. The earlier Grok review hit
  its 180-second deadline mid-response; partial favorable text is not approval.
  Its unknown usage and aborted status are preserved, not converted to success.

## Completion checkpoint

Full regression passed **1,623 tests, zero failures, nine existing optional
skips**, in 687,082.9422 ms. The full run included the 69-record historical
certification lineage. No historical receipt or Godskills trust root changed.
Full log SHA-256:
`f11c3afe9ab2eef85793fdfe1bcb057b536285639f8b5c7d6d64263e92aae44b`.

All seven reviewed source/test/operator-documentation hashes still matched after
review and full verification. Subsequent owner edits were checkpoint/README
documentation only. The user-owned untracked `package-lock.json` was not changed
or staged. Merge and post-push reference verification follow this source gate.

## Evidence and next boundary

Private adoption evidence:
`D:/00-INDEX/operations/2026-09-13-native-history-query-adoption`.
Relevant records: `validation-red.log`, `acceptance-green.log`,
`native-regression.log`, `real-recorded-history.json`, `review/`, `codex-review.md`, and
`full-regression.log`. Raw transcripts and credentials are not published.

This closes adoption of the previously completed coding task. A subsequent
Godskills quality comparison needs a new registered task or untouched baseline,
fresh trial slots, matched native permissions and the same explicit recovery
allowance. Do not compare an arm that already contains the answer, reuse the
failed September 13 slots, or infer skill effectiveness from this offline feature.
