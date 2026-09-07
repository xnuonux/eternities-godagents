# local workflow process-recovery proof plan

> **For agentic workers:** Execute inline with `executing-plans`. Keep the tightly coupled fault harness and assertions together.

**Goal:** Characterize two actual process-termination boundaries: an uncertain dispatched operation is not automatically repeated, and a persisted provider completion is recovered before artifact publication in a fresh process.

**Architecture:** Reuse the committed local artifact workflow and real provider SDK. A test-only child controls the network response and signals exact boundaries over IPC. The parent terminates only that child, waits for the existing lock policy, and invokes the unchanged operator CLI in a fresh process.

**Tech Stack:** Node 24+, node:test, real local files, child_process, existing Godagents modules.

**Spec:** `docs/current-state.md` finite critical path and `docs/local-artifact-workflow.md` recovery boundaries.

## constraints

- Base main `1b71135b00fe5d9f98004f22b45a1b0fdd1534d9`; preserve user package-lock.json.
- No real credentials, provider spending, model choices, live workspaces, authority changes, or altered lock timestamps.
- Do not change Godskills, runtime contracts, historical receipts, or existing certification fixtures.
- Terminate only a child owned by the current test after a verified IPC checkpoint. Await exit before cleanup.
- Runtime changes require a reproduced defect and separate regression evidence. Passing existing behavior is characterization, not invented implementation.

## one bounded deliverable

Files: new `tests/local-workflow-process-recovery.test.mjs`, new test-only helpers
`tests/helpers/local-workflow-recovery-fixture.mjs`, `local-workflow-recovery-child.mjs`, and `local-workflow-network-witness.mjs`,
plus operator documentation and a proof report.

- [x] Prepare a unique synthetic identity/mission using existing fixture creation plus real prepare.
- [x] Child uses real `runLocalWorkflow` and `createProviderPhaseHost`, with existing fetch and checkpoint seams.
  On native dispatch send a provider-call event followed by `{event:'kill-boundary', boundary:'dispatch-uncertain', phase:'native'}` and stay alive without returning a response.
- [x] Parent waits for the checkpoint, verifies the child owns the workflow lock, sends SIGKILL, and waits for exit.
  Immediate fresh CLI run must fail closed while the owner's lock is recent. After the actual 30-second grace period, fresh CLI run must return `pending` with null artifact and no provider replay.
- [x] A separate case returns a controlled native answer, then pauses at the existing `after-openai-phase-completion-persisted` checkpoint, before artifact publication. Kill it; fresh CLI without credentials must recover the saved completion and publish its accepted artifact. A subsequent credential-present process must replay the exact receipt and artifact.
- [x] Fresh CLI processes have an IPC network witness above the existing deny-all guard. Assert zero fetch/socket attempts with and without a synthetic credential, unchanged manifest/input bytes, and released workflow lock. An intentional-attempt canary tests both witness channels without actual networking.
- [x] Bound normal child execution and clean up only UUID-owned temporary files and the exact matching test residency record after owned children have exited. OS kill/exit failure is outside the demonstrated boundary; cleanup never precedes the awaited exit.
- [x] Review the fault harness independently. Run targeted workflow/recovery/lock gates; fix only demonstrated runtime defects. No production defect was reproduced in these two recovery cases.
- [x] Document exact boundaries and limits. Release gate: reconcile upstream, integrate verified changes, rerun the focused merged-tree gate, then push. Record the exact merged result in the operational closeout. A test/document-only patch does not need another unchanged historical full-suite run; if production code changes, use the full final gate.

## live comparison preflight

Dom subsequently excluded OpenRouter and authorized the existing Grok route and
MiniMax M3 credential for a small live test. Keep that work separate from these
no-network tests. Perseus confirms its Clovapi Grok profile is a custom xAI API
route, not proof of subscription funding; its verified subscription transport is
the native Grok CLI. The current Godagents API policy requires HTTPS. Do not
weaken it for Clovapi's HTTP endpoint. Verify the direct MiniMax model spelling,
token limit and response envelope before a bounded comparison. Load only the
selected credential inside the calling process, never into logs or prompts.
Do not label controlled transport or bound receipts as live quality evidence.
