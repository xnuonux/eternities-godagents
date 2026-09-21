# Godagents September20 upgrades integration

## Outcome

The local `integration/godagents-upgrades-20260920` branch combines the native
Pi truncation classification fix and the bounded local Godskills termination
fix on base `5bcdcec72170fc07c416bd3887c6f91c4d5521f8`. It also repairs the one
external release-gate failure observed on both isolated branches without
switching, cleaning or rewriting the active Godskills feature checkout.

The combined focused gate passes 88/88. The full four-worker release suite
passes 1,701 tests, with zero failures, zero cancellations and nine existing
optional skips out of 1,710 total. The full run used the installed Pi SDK
0.85.1 and completed in 604,436.4306 ms.

This is a verified local integration candidate. It is not merged, pushed,
deployed or a recertification of historical receipts.

## Integrated behavior

- A terminal Pi `length` stop becomes the screened
  `native-pi:response-truncated` outcome while preserving actor resumability.
  Pi recovery from a truncated tool proposal executes no incomplete tool call
  and retains the `native-response-truncated` warning.
- A timed-out recoverable local Godskills process receives a fixed one-second
  termination-observation grace. When close remains unobserved, a durable
  process guard and termination observation keep the dispatch pending across a
  separate host process and prevent duplicate launch.
- The historical specialist-preference receipt may obtain current-main evidence
  from an explicitly configured worktree while its runtime artifacts and
  release digest remain bound to the canonical Godskills root.

## Current-main repair

The historical specialist receipt is path-sensitive because the verified
Godskills release digest includes the canonical repository root. Pointing the
entire reconstruction at a clean alternate worktree therefore changes the
release digest, source envelope and derived fixture. It cannot reproduce the
checked receipt.

The repair separates two responsibilities:

1. `godskillsRoot` remains the canonical runtime root. The release verifier
   reads and digest-checks all pinned bytes there, so the historical fixture
   and path-bound release identity remain unchanged.
2. `godskillsCurrentMainRoot` supplies only Git currentness and ancestry
   evidence. Both roots must resolve to the same Git common directory. The
   currentness root `HEAD` must equal its local `origin/main`, and the historical
   Godskills source commit must remain an ancestor of that head.

The release test reads the second root from
`ETERNITIES_GODSKILLS_CURRENT_MAIN_ROOT`. On this workstation it used the clean
detached worktree at
`C:/dev/eternities-godskills/.worktrees/infrastructure-baseline`, commit
`f3966698d791c4c3082570c07660ce1a64e239a4`. The active canonical checkout
remained on `feat/infrastructure-evidence-candidate` with all existing untracked
corpus-reconciliation files preserved.

The first regression test failed before implementation because the configured
clean root was ignored and the active feature checkout failed the current-main
guard. A second regression required an unrelated repository to fail with the
new same-repository binding error. Both pass after the minimal separation.

## Verification

- focused integration command: the four native host test files, local
  recoverable process transport and outbox tests, and the specialist preference
  integration test;
- focused outcome: 88 passed, zero failed/skipped/cancelled;
- full command: `node --test --test-concurrency=4` with
  `GODAGENTS_PI_PACKAGE_ROOT` and
  `ETERNITIES_GODSKILLS_CURRENT_MAIN_ROOT` configured;
- full outcome: 1,710 total, 1,701 passed, zero failed/cancelled, nine skipped;
- full duration: 604,436.4306 ms.

The current-main statement is based on existing local refs. No fetch occurred,
so this evidence does not establish the live remote head. The termination fence
does not prove that an unconfirmed child stopped and supplies no automatic
clearance. The truncation result does not prove model quality. The integration
changes no provider, model, authority, automatic retry policy or historical
receipt bytes.
