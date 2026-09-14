# Native completion accounting: fresh task, review and adoption

Base: `2ef747f400c6c621a993a7084089c31c314ee083`. This bounded batch adds
conservative completion accounting to the existing Pi operator. It does not add
another agent loop, activate Godskills review, change authority or rewrite
historical records.

## What is implemented

- [The collector](../../src/host/native-session-report.mjs) keeps its legacy
  `snapshot()` unchanged and adds a separate version1 `breakdown()`.
- [The operator](../../src/host/native-pi-operator.mjs) persists the additive
  `completionBreakdown` in settled and failed run results. Each invocation has
  its own collector; setup failure without a run remains unchanged.
- [The operator guide](../native-pi-operator.md) explains known/unknown splits,
  SDK placeholder zeros, overflow, history compatibility and billing limits.
- [Collector tests](../../tests/native-completion-breakdown.test.mjs) and
  [real-SDK operator tests](../../tests/native-completion-operator.test.mjs)
  cover the behavior. The SDK tests substitute only the provider/authentication
  seam; admission, session, native tools, persistence and resume are real.

Reasoning is a subset of output, never an additional total. Non-reasoning output
can include tool arguments, not just visible prose. Missing/invalid information
stays unknown. This is an SDK-observed split, not a certified billing statement
or an automatic translation into a historical Godskills review contract.

## Fresh native implementation

Private evidence: `D:/00-INDEX/operations/2026-09-14-native-completion-breakdown`.
The task, 23 independent acceptance cases, current runtime/SDK pins and a
512-file self-contained first-party source manifest were frozen before dispatch.
The edit scope was two source files, two focused new test files and documentation.
The unrelated untracked root `package-lock.json` was excluded and preserved.

- Baseline: 27/27 existing checks passed; all23 new acceptance cases failed on
  the absent behavior, including actual operator result persistence.
- Pi0.85.1/Grok4.6 used the OAuth subscription through the existing native
  operator. The configured window was15minutes/100tools/one native recovery per
  failed response; model response allowance32768. These are not billing guarantees.
- The first attempt settled in335389ms, with20 responses,36 completed native
  tools, one tool error, no pending actions and no owner repair. Independent
  acceptance passed23/23; existing plus generated focused tests passed41/41.
- Only the five authorized files changed. The complete first-attempt manifest,
  source, transcript, response and scores remain untouched. This was a fresh
  implementation task, not a rerun of the earlier history-query candidate.

Initial freeze SHA256:
`7f2de57847720c1496aaf671b9e1d5c964677b52f8ddfab24d541e0aefef7893`.
Coding config pin:
`3ec2066b3f8589a5fc0b1a33a5823df6398cc524adc36a6c7829f92a04be3264`.

## Independent review and owner clarification

A separately admitted read-only actor received TASK.md and the five changed
files through the existing immutable-snapshot review command. No hidden
acceptance results or owner diagnosis were supplied. Review settled in483499ms,
with3 responses and6 read tools. Snapshot digest:
`93a7d71f83f34fa471b3c087c96c0ae1d66693c0866301312d5db353f58ab3cd`.
Review config pin:
`ac0f61631350133a4758579c0a94eef143d8a6acd7c1642a40950eca615c2ac4`.

The reviewer established no definite defect against the wording, but independently
flagged this exact ambiguity: `stopReason:error`, input4, output0 and reasoning0
was treated as a known empty split. The owner had separately reproduced that
case while review was running. The two supplemental error/aborted tests were
not part of the frozen23 and do not retroactively change that score.

The clarified integration rule is conservative: a failed or aborted zero output
cannot certify an empty split, even with nonzero reported input/cache usage.
The owner added a small guard, two failing-then-passing regressions and explicit
documentation. Existing legacy input/output totals were not changed. No further
model repair or repeated review was launched for this narrow clarification.

The review's other limitations were addressed by independent evidence: actual
SDK resume/persistence tests, direct comparison of legacy collector code, and
the unchanged CLI/history interfaces. Its verdict was advisory, not acceptance.
It reviewed the preserved first attempt, not the final owner clarification.
There is no blinded causal comparison or proof of a general review/Godskills win.

## Measured accounting, without another inference

Replaying saved assistant events through the candidate collector exactly matched
the original event-collected legacy totals before producing these splits. Raw
records were not rewritten. All messages in these two observations had positive
reported reasoning, so no placeholder-zero inference was necessary.

| Observation | Input | Output, inclusive | Reasoning subset | Other output | Cache read | Reported total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Coding,20 responses | 96825 | 20771 | 11920 | 8851 | 641664 | 759260 |
| Review,3 responses | 17539 | 27457 | 26422 | 1035 | 7296 | 52292 |

Cache write was0 and missing legacy usage messages0 in both observations.
These figures describe these runs, not a price, subscription quota estimate,
cross-model comparison or general performance advantage.

## Verification and remaining boundary

After owner clarification, the unchanged frozen acceptance passes23/23 and the
integrated focused regressions pass43/43, including the two added boundary
checks. Full release verification and merge are pending at this source checkpoint.

Historical receipt bytes, Godskills release/roots, model routing, personal keels,
Soul/Inspiration and Lunari integration remain outside this change. Offline
history intentionally retains its existing aggregate shape. Older stored runs
do not acquire a new breakdown merely by being reopened.
