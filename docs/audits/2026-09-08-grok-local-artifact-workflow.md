# Grok subscription local artifact workflow

## Scope

Base: `1978cac08421fc144ec281b6196c3334731267dc`.
The existing Grok portable host is now selectable as
`grok-cli-subscription-v1` in the native-only effect-bound v2 local workflow.
No kernel, provider phase protocol, Godskills body, admission rule or authority
policy changed. V1 explicitly rejects this family before creating a workspace.
Both HTTP families retain their existing paths.

## Verification

- Test-first: five scenarios failed at the missing family boundary before the
  production change. Fixture corrections accounted for the existing immutable
  effect assessment and the artifact writer's explicit `replayed` flag.
- New controlled tests: 5/5, 3344.8275 ms, exit 0.
- Combined workflow, CLI, process-recovery and Grok phase-transport tests:
  24/24, 63510.4778 ms, exit 0. The two actual process-death tests retained their
  30-second dead-owner lock grace periods.
- Independent read-only review by Banach
  `01a07e22-93d9-7c82-981e-91ea6f493e98`: no important boundary defect or blocking
  missing test. Reviewed source wiring and tests, not live model quality.
- `git diff --check` passed.

The new test uses real creation/admission, an issued portable host, a real Node
child returning synthetic provider data, effect routing, persistent mission
completion, checked artifact publication and fresh-process CLI replay. It proves
that absent effect authority causes no child call, uncertain dispatch is not
repeated, modified prepared policy fails before dispatch, and replay works without
an auth file or another child. Test-only configuration customization remains in
the fixture, not the public production interface.

## Limits and next gate

These are controlled workflow results, not a useful-task live qualification,
cross-model comparison, adaptive review qualification or product completion.
The previous live Grok result exercised only a native phase with synthetic outer
authority/vessel inputs. A full admitted useful-task call is still separate.
Full integration verification and the live attempt below report their own exact
source, outcome and limits without rewriting historical receipts.

## Integration and live follow-up

Runtime commit: `61251c758dc3e69a6ccf73f22ba5ee254b2d9ea3`.
Full suite: **1,314/1,314**, zero failures, cancellations, skips or todos,
638484.4032 ms, exit 0. TAP top-level plan is 1,308, with 1,314 total nested tests.
Log: `D:/00-INDEX/operations/2026-09-08-grok-workflow-integration/61251c7-full-suite.log`.
SHA256: `f12826b8314af87b0b5f87233a736588f7cbb21f93b82fc79cf0f98aeb2129e8`.

One independently reviewed, source-pinned live qualification at the same commit
completed the full prepared/admitted v2 workflow. It used fresh identity
`grok-admitted-scheduling-20260908` and reused first-party compiled creation inputs,
not an existing admission. The development task was the same 16-job scheduling
problem from the unsuccessful MiniMax trial, not a held-out benchmark or a matched
cross-provider comparison.

- Requested Grok `grok-4.6`, reported deployment pinned `grok-4.6-build`, low
  reasoning, native OIDC subscription. No OpenRouter or paid fallback.
- One allowed local dispatch, 8,192 completion-token ceiling, 90-second provider
  timeout, zero retries. Elapsed run including preflight: **25,181 ms**.
- The independent exhaustive oracle accepted jobs A, D, F, H, J, L with total
  weight **74**, the optimum. Artifact bytes and accepted receipt digest match.
- Usage: input 15,390, including 128 cached; completion 1,424, including 1,378
  reasoning and 46 visible-output tokens. Actual subscription charge is unknown.
  These are provider-reported counters, not independent physical-call telemetry.
- Fresh-process replay returned the same completion receipt and artifact, with
  only `artifact.replayed` changing to true. A local process witness observed
  **zero Grok executable attempts** through the wrapped execFile/spawn APIs.

Immutable operation root:
`D:/00-INDEX/operations/2026-09-08-grok-workflow-integration/live-workflow`.

| Evidence | SHA256 / receipt digest |
| --- | --- |
| `intent.json` | `8bd4aa1cf99581bd5c526789a197583ee2b2813334a873e4f03c1f5584af6121` |
| `result.json` | `3d4fcc893bc89c9ea96d50d92ec39483c879848af854fb6fb776aaf178debb1c` |
| `fresh-process-replay.json` | `4546c9a9074988ce19b3a729315a934cb09528307d531a4982d3e42fc63c1c98` |
| accepted artifact | `0b4228e930433fff265d8a534b2d1b911847aeb98a2b7ba8a84fe1f974a411fa` |
| v2 completion receipt | `264f60624215699cf158328a2d8424117c7331afd885f8ffba4042f576622de7` |

This closes one real useful-task operator-path qualification with a fixture-derived
identity. It does not prove improved quality over plain Grok, broad reliability,
live review/revision, unrestricted tool use or a finished product. The next bounded
comparison must freeze equivalent settings/resources and a true native baseline;
do not call a Godagent identity-wrapped phase a raw-model baseline.

## MiniMax remains a candidate

The separate preserved MiniMax experiment at
`D:/00-INDEX/operations/2026-09-08-godagents-minimax-effect-task-v2/result.json`
stopped at `answer-envelope` after one baseline call: input 577, cached 128,
completion 6,943, reasoning 6,894, 56,076 ms. The Godagent arm was never called.
The separate changed-observation diagnostic at
`D:/00-INDEX/operations/2026-09-08-godagents-minimax-answer-diagnostic/result.json`
stopped at `response-envelope` after one call, 58,202 ms, with no observed message
content and unknown usage. These exhaust that two-call envelope. No quality was
scored, unknown usage is not zero, and no credit, outage or model-quality cause is
inferred. Both failures and the inert first preparation remain unchanged.
