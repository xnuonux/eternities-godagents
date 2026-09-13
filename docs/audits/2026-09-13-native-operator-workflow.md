# Native operator workflow and live self-development

Baseline: `9dfd9a7fac63f067294ed8ae0215f032d133e359`, main reconciled with origin.
Dom requested a larger productive batch instead of stopping at a thin launcher.
Source branch: `feat/native-operator-workflow`. This audit separates completed
behavior, verified release checks and remaining product gaps.

## Delivered behavior

The [native operator](../native-pi-operator.md) composes the existing admitted
actor and Pi0.85.1 SDK into `preflight`, `launch`, `resume`, `status`, `history`
and `--help`. It preserves the native coding loop rather than replacing it.
Configuration/model/mission/grant/history remain pinned; credentials stay in
Pi's normal store; paid-key fallback is refused. Offline commands avoid provider
creation. Per-run private records retain failures and unknown usage honestly.

Two isolated Codex implementation workers produced the config and summary
modules. The owner inspected and integrated them, corrected mutable-message
retention, restricted reported tool names, and made tests host-path portable.
Grok independently reviewed the initial production batch using the subscription.
Its findings reproduced a late-abort/publication race and `...host-state` path
escape from the intended separation check. Both were fixed test-first, including
the same path predicate in the existing native binding. Failed initial setup now
retains an explicit offline diagnostic. It is not automatically erased/adopted.

Initial integrated gate: **59 passed, zero failures, zero skips**, including the
actual optional Pi SDK with a scripted provider. Historical ledger: **69 receipts
verified unchanged**, digest
`3d86253cb5947ca2f4c3a578de178642053487b6a8da6a67cdf037b210f0bdb4`.
Full regression at implementation commit
`6efe4a9f0b10e862cae3040d7812910169d1fe52`: **1,572 passed, zero failures,
nine existing optional browser skips**, 555.134 seconds. The installed Pi SDK
was explicitly enabled. `full-regression.log` SHA-256:
`effba75f147ed577345f7f329972c103b58e70404e4453b2ff12019a96abeba9`.
Only documentation changed after that source snapshot. Main integration and
post-merge checks are recorded in the release closeout below.

## Two-stage live coding trial

Operation root: `D:/00-INDEX/operations/2026-09-13-native-operator-workflow`.
Real fresh creator/admission, first-party PromptOS artifact, fixture-local Realm,
native xAI OAuth subscription, model `grok-4.6`, max16,384 tokens per response,
160 tool calls across the association,15minute deadline per prompt. Mission token
fields are guidelines, not a certified provider spending cap. No personal Grok
keel, automatic skill activation, other-model fallback or API-key route.

Native session: `01a09be6-4c9e-7359-92f5-9434ba815545`.
Association digest:
`c8e02d6e3978d978a294ad6a74201fd690d1f7e62e04a08b077de00ce8e56cf1`.
Config digest:
`f650740e0ae729858eb338d720c1ba2ae9d782e133f2bbb8c393a7240a4106af`.

| Stage | Observed outcome | Native evidence |
| --- | --- | --- |
| 1: history reader | New reusable reader +9 tests; separate acceptance passed without source repair | 17 inferences,35 completed tools,5m42.813s |
| 2: actual CLI | New process resumed same actor/history; wired history/help,4 new CLI tests; separate acceptance passed | 28 more inferences,55 more completed tools,11m56.581s |

Final state: idle,2 turns,45 native inferences,0 compactions,90 completed actions,
0 pending actions,8 tool errors retained. Errors include expected red tests,
missing preparation dependencies, and a generated help-text test mismatch that
the model corrected. A completed action may have an error result; action counts
are not test-pass counts or outcome scores.

**Environment intervention:** the owner initially copied `src`, `tests` and
`fixtures`, but omitted `schemas` and the existing inspector fixture required by
test helpers. The transcript recorded missing-schema errors. At18:05:41UTC,
during stage2, the owner restored those unchanged first-party dependencies.
No generated source/test was repaired in the trial. Stage2 is therefore
**environment-assisted**, not an untouched end-to-end trial. The same attempt,
elapsed time and usage were preserved; no failed trace was replaced.

The owner independently ran `accept-history.mjs` after each completed stage.
Its frozen SHA-256 was
`2768b1d5eaa4d67a3ed6f180a8a56348fd95c018dfed34e18e56c358c81ac1f2`.
Assertions cover failed/settled aggregation, incomplete unknowns, binding,
corruption refusal, private-field screening and actual CLI help/history parsing.
The owner separately ran the generated9-test reader suite, inspected all
contributed files and adopted only the approved new files and specific CLI hunks.
Parallel path/cancellation/setup fixes were not overwritten by the older trial
copy. Canonical help copy clarified the parsed-value pin; tests were made portable.
These integration edits are not attributed to the live model.

The new canonical `history` command also read the **actual live records** offline:
two settled runs, zero failed/incomplete runs. No inference was used for that
inspection. This is stronger consumer evidence than only fabricated parser data,
but still not an integrity certificate for arbitrary edited history records.

| Provider-reported field | Stage1 | Stage2 | Combined |
| --- | ---: | ---: | ---: |
| Input | 106,670 | 135,490 | 242,160 |
| Output | 21,349 | 24,484 | 45,833 |
| Cache read | 458,496 | 2,168,832 | 2,627,328 |
| Cache write | 0 | 0 | 0 |
| Total | 586,515 | 2,328,806 | 2,915,321 |

All supplied usage fields were present. These are reported transport categories,
not separate visible/hidden reasoning counts, cash charges or demonstrated
context capacity. Cached usage is retained, not discarded or added twice. The
host preparation omission increased work; this is not a clean efficiency study.

## Review and source preservation

Initial review: `review/result.json` and `verdict.md`, one independent Grok
inference,33,196 reported total tokens. It returned with-fixes, not approval.
The original review session was reused for final review with exact revised source,
avoiding a redundant full exploration. Final verdict: **merge approved**, with no
material remaining issue. All 11 supplied source/test pins matched the canonical
files after review. The owner checked the findings against the implementation
and regression tests rather than delegating acceptance to model confidence.
`review-followup/result.json` retains the pins and 77,337 reported total tokens;
`review-followup/verdict.md` SHA-256:
`943593c54be852253cf3914d034d0cba1e780f9afd2e56cf0044bcc4a197ab53`.
Both reviews used separate review context, not a distinct model family or proof
of universal adversarial coverage.

Accepted recovery limits: a hard kill before the first durable setup record
cannot manufacture a diagnosis; `resume` on a setup-failed root fails closed
while `status`/`history` explain recovery. History with metadata but no native
state also fails closed. No destructive root recycling was introduced.

No historical receipt, personal-keel store, global model default or
`package-lock.json` was modified. See the companion
[Godskills readiness note](2026-09-13-native-godskills-readiness.md): optional
native selected-skill binding still needs its own real consumer gate. The named
Godskills hashes were independently rechecked here; no root was rebound.

## Release closeout

The verified feature was fast-forward merged into `main` and pushed as
`9ed8b9ab6f2c9b7b9c86e9f3da46f0887b96bc00`. Main/origin matched before the
ref-aware gate. The production source, tests, fixtures, schemas, receipts,
integrations and package manifest are unchanged from the full-regression
implementation snapshot `6efe4a9`.

- Merged-source native gate: **59 passed, zero failures/skips**, 8.028 seconds,
  `merged-native.log`.
- Post-push current-head and historical-receipt gate: **8 passed, zero
  failures/skips**, 57.110 seconds, `merged-cross-repository.log`. No certificate
  was regenerated or historical source map expanded.
- The frozen independent live acceptance checker also passed against canonical
  merged source, including actual CLI help/history parsing.
- Final review source pins were rechecked before merge. No source correction
  followed that approved snapshot; this closeout is documentation only.
- The only untracked file remains the pre-existing user `package-lock.json`.
  Trial workspaces, failed traces and review evidence remain preserved privately.

## Remaining boundaries

- This delivers an operator workflow and real same-actor coding continuation,
  not a finished universal product or measured advantage over plain Pi/Grok.
- Creation/admission still need explicit input preparation; no consumer-grade
  forge/onboarding claim. The Realm schema remains fixture-local/test-only.
- Native OS-user access is not confinement or safe automatic shell rollback.
- Expired grants, mission/model changes and uncertain effects need governed
  reconciliation/new association; no automatic history rebinding.
- Godskills activation, Soul/Inspiration, Lunari and model replacement remain
  outside this batch. A next selected-skill consumer should reuse the existing
  release verifier/mission binder, not create another skill engine.
- No actual compaction occurred in this live trial. Real-SDK scripted-provider
  compaction coverage remains separate evidence.
