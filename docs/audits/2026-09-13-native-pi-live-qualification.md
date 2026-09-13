# Native Pi subscription qualification, September 13, 2026

Base: `e1625f61cdecd49734e8b3766ca471b6b7039375`. The installed host is Pi
0.85.1, using its native xAI OAuth subscription provider and `grok-4.6`.
No API-key, OpenRouter or alternative-model fallback was used. The operator
approved the official xAI device login; tokens remain in Pi's normal local
credential store, not in the repository or these receipts.

## First live attempt and confirmed defect

Private operation: `D:/00-INDEX/operations/2026-09-13-native-pi-live-qualification`.
The actor was compiled and admitted through production creation/genesis APIs,
using the first-party `superagent-engineer.generic` Prompt OS artifact with
SHA-256 `6305d9c6193332a540ecd496310bb4c1bfba663740d8aa2d5dae486b0c3d7545`.
This pins the distribution artifact; the native adapter appends its selected
identity/continuity/mission projection, not the whole Prompt OS body or personal
Grok keel. Pi retains its own core prompt and tool loop.

The Realm Contract remains explicitly `fixture-local` / `test-only`, with no
pretend counter hands. Native filesystem and process effects are separately
authorized by a fresh host grant. This does not certify a production Realm,
OS sandbox, Godskills activation, Soul, billing ledger or user product launcher.

Baseline: four existing Node checks passed; three new filter checks failed for
the absent export. The independent browser checker failed for the absent search
input. The source was verified identical to the canonical example.

At 09:37:41Z, the first live attempt started. Its first directory-read call had
a Responses composite ID containing `|`. `beforeTool` incorrectly applied the
actor/session identifier regex to this opaque provider correlation ID and
rejected it. Native action records remained empty; all four source hashes stayed
unchanged. Result: **failed**, not a successful coding trial. The attempt is
preserved and was not retried in place.

Reported usage: input 3,644; output 341; cached input 512; total 4,497 tokens.
These are Pi/provider-reported counters, not measured hidden reasoning or cash
charges. The native transcript and `result.json` retain the exact association.

## Targeted correction and review

`src/host/native-host-binding.mjs` now treats tool IDs as opaque strings with
bounded UTF-8 size and excluded whitespace/control characters. It preserves
their exact value for duplicate checks, result correlation and persistence.
Actor/session grammar, host grants, effects, expiry and model pins are unchanged.

Three regression checks were observed RED before the change:

- `tests/native-host-binding.test.mjs`: distinct composite IDs, duplicates and
  exact resume; malformed/type/oversize rejection before recording an action.
- `tests/pi-native-session.test.mjs`: the exact observed composite-ID shape
  reaches a real native write and survives clean session resume.

The complete native binding/Pi suite then passed **26 tests, zero failures,
zero skips**, in 6,281ms with the installed real SDK and scripted inference.

An independent Grok 4.6 review used a separate native Pi session, subscription
OAuth, read-only tools and no discovered memory/skills/extensions. It read the
diff and four relevant files. Its source pins were unchanged afterward.
Verdict: **ready to merge, yes**, no critical or important findings.
Private evidence: `call-id-review/{start.json,review-source.diff,verdict.md,result.json}`.
Review usage: input 16,261; output 6,223; cached input 1,024; total 23,508.
Minor notes retained: rejection shares the `tool-denied` category; the existing
8MB state cap can be reached before the largest possible 10,000-call grant.

## Corrected live attempt

A fresh actor, workspace and attempt were prepared under
`D:/00-INDEX/operations/2026-09-13-native-pi-live-qualification-callid2`.
The corrected runtime/test bytes are pinned in `runtime-pins.json`; the initial
source, unchanged evaluation tests, browser checker and prompt artifact are
pinned in `prepared.json`. The original failed operation is untouched.

The mission is a real accessible path-filter feature in the existing export
inspector, using native retrieval, edits and PowerShell tests. Host limits:
80 tool calls, 15 minutes, 16,384 declared per-response output allowance, native
automatic compaction, no automatic provider retry. The 65,536 mission-token
field is a guideline, not a certified hard aggregate billing limit.

The corrected attempt ran from **09:42:25Z to 09:45:20Z**, about 176 seconds.
It settled cleanly, with nine native inferences, zero compactions, 14 completed
authorized actions and no pending action or warning. Native Pi also returned
four invalid edit attempts before effect dispatch; the model recovered using
its native write tool. Those rejected attempts are in the Pi transcript/events,
not misrepresented as completed Godagent actions. The host did not repair the
model's application code.

Provider-reported aggregate usage: input **72,218**, output **12,605**, cached
input **60,928**, total **145,751** tokens. These sums cover nine responses;
they are not the peak context size. The catalog's 500k context window was not
stress-tested. The provider output counter is not a measurement of visible prose
alone or an independently separated reasoning count.

Independent verification after the native handoff:

- All **seven** supplied Node tests passed, with their exact source digest
  unchanged. The independent browser checker was likewise unchanged.
- Real Chromium checks passed for matching/selection, no-match clearing, Clear,
  new-bundle reset, invalidation, inert literal markup and mobile width.
- The host viewed both 1366x900 desktop and 390x844 mobile screenshots and
  inspected the source diff. The filter is labeled, fits the existing layout,
  and the parser/hash-validation implementation is unchanged.
- A separate process reopened the actual saved live session with `resume: true`.
  It verified the same actor association, all 14 completed action records,
  transcript bytes, unchanged application files and idle state. Inference was
  explicitly prohibited and **zero** inference attempts occurred. This qualifies
  reopening existing live evidence, not a second live continuation mission.

Evidence: `result.json`, `events.jsonl`, `final-response.md`, `verification.json`,
`independent-node.log`, `independent-browser.log`, `native-filter-{desktop,mobile}.png`,
and `resume-verification.json` in the corrected private operation. Candidate
files remain in its `workspace/`, not silently copied into the canonical example.

**Outcome:** one bounded coding mission completed with the real subscription,
native tools and admitted Godagent binding. This is not a baseline comparison,
general quality superiority claim, 500k stress test or whole-product completion.

## Integration gate

The full serial regression run was stopped after its duration exceeded the
expected envelope; its partial `merged-regression.log` is preserved and does not
count as a passing suite. The four-way full regression completed with 1,534
passes, four failures and nine skips in 516,919ms, logged separately in
`regression-concurrency4.log`. All four failures were the current-head SDK-map
drift described below. This failed run is preserved, not relabeled as green.
The historical certification ledger was independently verified unchanged at
`3d86253cb5947ca2f4c3a578de178642053487b6a8da6a67cdf037b210f0bdb4`.

The previous Pi milestone added the optional `./native-pi` package export, but
the current-head v2 verifier still expected the two-entry pre-Pi map. The prior
milestone's broad run had checked committed pre-Pi refs before that integration,
so it did not establish the merged current-head map's validity.

`src/integration/current-head-certificate.mjs` now selects an additive native-Pi
source-era profile only when the entrypoint exists and introduction commit
`671abab12d14e12565a466844c6693b36d4373b5` is an ancestor. It retains a closed
export map, pins the optional entrypoint/runtime/tests, and leaves root exports,
certified supported-adapter protocols and historical profiles unchanged. This
does **not** recertify native Pi as a Godskills-capable portable adapter.

The changed current-head test was observed RED before this correction. All 11
cross-repository tests subsequently passed in 54,660ms, including existing
snapshot/receipt tests and a new pre-Pi source check in a throwaway local clone.
The canonical checkout's refs were not changed by that historical test.

Independent Grok review: `sdk-profile-review` reached the operator's read limit
without a verdict. Its completed native session was reused, with tools disabled
and the test-only clone correction supplied, under `sdk-profile-review-followup`.
The production source stayed identical. Final verdict: ready to merge, yes, no
critical or blocking important findings. The review did not execute tests; the
11-pass run is host evidence. A known future maintenance sensitivity remains:
the historical test's adaptive-review pin must still match its historical blob.

The final full run on the corrected source passed: **1,539 passed, zero failed,
nine skipped**, 1,548 total, in **543,871ms**. See `final-regression.log`.
The nine skips are the existing optional browser checks; the separate live
candidate browser verification above ran successfully. No historical receipt
was regenerated. Integration checks rerun the changed native surface and the
ref-aware cross-repository tests at the appropriate merged/ref-reconciled state.

## Next bounded product step

Replace the operation-specific caller with a thin operator command around the
**same** native SDK adapter: load an existing verified admission, take explicit
project/model/host-grant inputs, check readiness without inference, launch a
persisted native session, and reopen that exact session on demand. Keep auth in
Pi's credential store and keep private transcripts cold and addressable.

Acceptance must exercise the real command with an offline scripted provider:
valid launch/write/resume, auth-not-ready without fallback, mismatched actor or
history rejection, cancellation/uncertain-action preservation and no changes to
ordinary unbound Pi. Do not create a new model/tool loop, silently generate
permission grants from actor prose, add another memory system, activate Godskills
or Soul, or widen the test-only Realm schema as an incidental launcher change.
