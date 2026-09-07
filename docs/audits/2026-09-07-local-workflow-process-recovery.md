# local workflow process-recovery evidence

Date: 2026-09-07. Base `1b71135b00fe5d9f98004f22b45a1b0fdd1534d9`.
This batch adds test and documentation evidence only. Production source, schemas,
Godskills pins, historical fixtures and certification receipts remain unchanged.

## observed boundaries

The [test](../../tests/local-workflow-process-recovery.test.mjs) constructs a
unique synthetic creation and prepares a real workflow. The [child](../../tests/helpers/local-workflow-recovery-child.mjs)
uses production `runLocalWorkflow` and `createProviderPhaseHost` with existing
test seams for fetch and checkpoint delivery. The parent kills only that owned
child after IPC proves the selected boundary and the real lock names its PID.

| killed boundary | fresh-process evidence |
| --- | --- |
| native fetch dispatched, response never supplied | recent lock rejects execution; after the actual dead-owner grace period the result is pending, with no artifact or network attempt; supplying a synthetic credential still does not repeat it |
| native completion persisted, before artifact publication | recent lock rejects execution; after the actual grace period, credential-free execution recovers the completion and publishes its checked artifact; subsequent credential-present replay returns the exact receipt and artifact bytes without network attempts |

Every successful recovery checks that the workflow lock has been released and
the pinned manifest and three input files are byte-identical. The [network witness](../../tests/helpers/local-workflow-network-witness.mjs)
reports only fetch/socket-attempt type over IPC before invoking the existing
deny-all guard. An intentional-attempt canary proves both channels report and
block attempts. No real credential is inherited by test children. Cleanup checks
the generated temporary root and exact identity residency record after child exit.

## verification

```powershell
node --test --test-reporter=tap --test-concurrency=2 tests/local-workflow-process-recovery.test.mjs tests/local-artifact-workflow.test.mjs tests/local-artifact-workflow-cli.test.mjs tests/file-lock-recovery.test.mjs
```

Observed: **15 passed**, zero failed/cancelled/skipped/todo, exit 0,
63,502.4059 ms. This includes both actual process kills, the witness canary,
existing accepted/rejected/pending/permission workflow cases, CLI checks, and
lock recovery cases. TAP log:

`D:\00-INDEX\operations\2026-09-07-godagents-process-recovery\focused.tap`

SHA-256: `5c32d033b3aaf3c5643ffce81b5fb554cf7b566574f5c9375a3d9dc389aa4078`.

Independent reviewer Noether (`01a07c35-f5a3-7a62-9124-7859c794c0db`)
identified insufficient direct observation of fresh-process network attempts.
The witness, credential-present replay, and explicit lock-release assertions
closed that local proof gap in follow-up review. The plan was then aligned with
the actual persisted-completion checkpoint. Final follow-up inspected the canary
and aligned claims and reported no remaining blocking claim or code defect.
Review is source inspection, not a
second independently executed fault run.

## limits

This is bounded local process-death characterization, not provider-side
exactly-once execution, remote duplicate suppression, every interruption
checkpoint, OS power-loss durability, adversarial same-account isolation, or
live model quality. Controlled fetch/checkpoint seams are explicit. The test
depends on successful OS termination and exit delivery; it does not establish
recovery from a kernel-level failure to terminate the child.

The previous 1,131-test full integration result remains attributed to the previous
production milestone. This test/doc-only batch uses a fresh focused gate rather
than relabeling that historical result as a new full-suite run. No new certificate
is issued. MiniMax's separate live compatibility probes are documented in
[the provider preflight](2026-09-07-minimax-provider-preflight.md), not counted here.
