# Native Godskills consumer qualification

Baseline: Godagents `feaac2a8306bc878e8be9ac6e9dc411038573353`.
Implementation: `12470b1506b9ebc744bdde339446700206a58b8d` on
`feat/native-godskills-consumer`. This audit separates adapter behavior, release
integration and live benefit. No historical certification was rewritten.

## Delivered boundary

The [native consumer](../native-godskills-consumer.md) is opt-in through the
existing native SDK/operator. It reuses the release/routing verifiers,
routing-evidence classifier and local recoverable mission adapter. It derives
genome eligibility and constitution/Realm facts from the admitted actor, then
checks selected effects against the already validated native grant. One binding
record is hashed into the native association.

The selected package is delivered at Pi's existing stream boundary before model
inference. Native/guardrail/method/review modes retain their certified meanings.
Review is explicitly scheduled-only, not executed. Resume rehydrates rather
than rerouting. Native automatic compaction sees the same stable selection once;
neither catalog bodies nor personal-keel discovery are enabled.

Changed source, roots, record, grant or association fails closed. Unknown method
references, oversized disclosure and no-qualified-route also fail closed. The
native host's broader OS-user authority is unchanged; skills never add tools.

## Direct proof

- `tests/native-godskills-binding.test.mjs`: real pinned local verifier and
  routing/activation execution, exact immutable recovery, policy/effect/byte
  refusal, warm-cache root drift, undisclosed selected-entrypoint drift, unknown
  explicit reference and no-qualified-route refusal.
- `tests/pi-native-godskills.test.mjs`: actual Pi0.85.1 SDK with scripted provider,
  all four real policy-selected modes, unchanged tools, automatic compaction,
  same-state resume, stripping refusal, persisted-record tampering, read-only
  grant refusal and source drift between a completed native write and the next
  provider invocation. The completed write is retained and no next call occurs.
- `tests/native-pi-operator.test.mjs`: actual operator preflight/launch/resume,
  bound package reaching the model, offline status with credential loading
  disabled, plus the prior operator lifecycle regressions.
- Focused integrated gate: **80 passed, zero failures/skips**, 8.188 seconds,
  `focused.log` under the private operation root below.

RED/GREEN found the missing selected-entrypoint integrity check in guardrail
mode: the old binder intentionally omitted that undisclosed body, so the native
consumer now verifies it separately without injecting it. Drift tests mutate
only isolated copies of the pinned closure, never canonical Godskills files.

An initial test incorrectly expected Forge to choose review whenever review was
available. The certified evidence does not do that. The test was corrected to
use Muse's actual review-qualified mission; Athena exercises native mode and
Forge exercises guardrail/explicit method. No activation policy was weakened.

## Actual subscription preflight

`preflight-result.json` at 2026-09-13T19:18:08.848Z records Pi0.85.1 and the actual
xAI OAuth subscription for requested `grok-4.6`, max16,384 per response. The
catalog reports500,000 context; this is not a tested context-capacity claim.
Status: `preflight-ready`, skills `verified-not-selected`. No provider inference,
skill selection or session creation occurred, and the previous live actor was
not resumed or altered.

Observed release digest:
`c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f`.
This is bound to the explicit release pin including its local root, not a
path-independent global release identifier.

## Review and release evidence

Private operation root:
`D:/00-INDEX/operations/2026-09-13-native-godskills-consumer`.

One disjoint Codex worker implemented the optional config boundary; the owner
inspected and ran its tests with the full native consumer. A separate Grok
subscription review received exact numbered source and pins without tools or
personal context. Its first run emitted a positive partial verdict but was
aborted at its360second deadline. That is **not completed review approval**.
The abort event's zero usage counters do not establish zero real consumption.
A bounded follow-up in the same review conversation completed normally with
**ready to merge: yes**, no critical/important findings. All final source pins
matched. Its review scope is consumer/operator integration, not re-auditing the
existing verifier bodies or establishing model benefit. The owner checked the
named invariants against the real caller paths and direct tests.

Final review at 2026-09-13T19:23:28.958Z reported26,031 input,7,065 output,
640 cache-read and33,736 total tokens. This is the completed follow-up's usage,
not the unknown combined usage of both calls. `review-followup/verdict.md` SHA256:
`991d050605d7c06a7a9a929e6fa32ca0bac7d3ca142cb64d51bd23efda2a3fd9`.
Residuals retained: token-to-byte budgeting uses a4bytes/token heuristic alongside
the hard byte caps; offline views are observations rather than resume authority;
preflight does not create a real session id or prove route availability.

All **69 historical receipts** verify unchanged, ledger digest:
`3d86253cb5947ca2f4c3a578de178642053487b6a8da6a67cdf037b210f0bdb4`.
The ledger checker completed successfully without regenerating a receipt.
Full regression at implementation `12470b1` completed successfully:
**1,593 passed, zero failures, nine existing optional browser skips**, 658.813
seconds. The actual optional Pi SDK was enabled. No runtime/test/source change
followed this snapshot; only documentation closeout remained before integration.
`full-regression.log` SHA256:
`64d076e4167b6aa87097f709acc6b1846bba294e7026472dea072e1d1068400e`.
The focused log SHA256 is
`8942d1996be27dec9d91750091d749239005d6e9b429bc85ed0f50625bc734ff`.

Godskills main moved from `6aee69b` to
`d0781a91a82898cc808e7fc681f145fdd972dade` during this batch for a colleague's
documentation/data-only warehouse intake. Main/origin were independently
rechecked. No skill/runtime/policy/receipt root changed; native release
verification remains pinned rather than following arbitrary new main bytes.

## Main integration

The reviewed source and documentation were fast-forward merged and pushed to
`main` at `b58b65e2464f5f2638be6b8e4ddc9d4dad0aa342`. Both local and remote-tracking
main resolved to that commit. The post-merge native gate passed **80/80**, zero
failures/skips, in 9.219 seconds (`merged-focused.log`). No implementation changes
were made after the full-suite and review snapshot at `12470b1`.
The post-push ref-aware cross-repository gate also passed **8/8**, zero
failures/skips, in 57.043 seconds (`merged-current-head.log`). It used reconciled
Godagents `b58b65e` and Godskills `d0781a9` refs. Historical certificate fixtures
remain evidence for their recorded sources, not newly issued certification of
this consumer. The final closeout commit changes documentation only.

## Explicit remaining work

This proves a functioning native capability consumer, not a measured coding
advantage. Next is a preregistered matched live task using the same mature host,
model, tools, source and acceptance checks, recording outcome and overhead for
Godagent-without-skills versus the same Godagent-with-selected-skills conditions.
Keep the Godagent body in both arms to isolate the skill contribution. An ordinary
Pi baseline is a separate body comparison, not evidence for skill benefit.
Preserve prior negative Godskills findings;
do not convert structural success into a quality win.

Production Realm semantics, turnkey creation/onboarding, automated review-phase
execution, native spending guarantees, source-epoch migration, Soul/Inspiration,
Lunari and broad external-host qualification remain separate work. No global
model preference, personal keel, cold skill quarry or user package-lock changed.
