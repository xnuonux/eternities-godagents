# Godagent receipt: 02-debugging

## Route, scope, and authority

- **Route:** bounded local diagnosis and reproduction.
- **Fixture:** `fixtures/journal-recovery`; it was read and tested but not modified.
- **Authority:** local read. The mission separately authorizes only this receipt and its patch as writes. No network, credentials, production mutation, destructive recovery, monitoring, delegation, or control-output inspection occurred.
- **Acceptance condition:** an evaluator applies `godagent.patch` to a fresh fixture copy and runs `npm test`; the sealed suite should report all four assertions passing. This receipt does **not** claim that result: the fixture was intentionally left unchanged.

## Binding verification

The selected capability is `eternities-phoenix`. The binding selected entrypoint digest `8f7d4f0ace48604a9b556747404ac7efb3cd5f64dfabbc1c8add92c0b00a98f1` and contract digest `bbcdfff7d94207067d38c96346a1deaf37a8f1bd665f8d5b1010ee6ff516727e`. Direct SHA-256 calculation over the selected `SKILL.md` and `references/capability-contract.json` produced those exact values.

The applicable process reference, `references/first-party-contracts.md`, requires an append-only record of verified foundations and eliminated hypotheses, with one declared current check at a time. The route below follows that method.

## Evidence and reproduction

### Verified foundations

1. `package.json` defines `npm test` as `node --test`.
2. `npm test` in the untouched fixture reproduced the supplied baseline: 4 tests, 1 pass, and 3 failures.
3. Failure one returned the stale `old` completed mission instead of the latest admitted `current` mission and its binding.
4. Failure two returned `{ status: 'retry', shouldInvoke: true }` after `host.invocation.started`, where the test requires a no-replay `paused-unknown` record with invocation and package identity.
5. Failure three returned the unrelated `wrong-package` binding instead of the current mission's `current-package` binding.
6. The source uses the first admission (`events.find`), searches a binding across all events, and maps any active invocation to retry. These are direct locators for the three observed failures.

### Reproduction

From the fixture root:

```text
npm test
```

Observed result before any patch application: `pass 1`, `fail 3`. The failing tests are the first three named tests in `tests/journal-recovery.test.mjs`; the terminal-state test passes.

## Hypothesis matrix and elimination ledger

| ID | Hypothesis | Rank | Check and expected observation | Result |
| --- | --- | --- | --- | --- |
| H1 | Recovery anchors to the first admission, not the most recent admitted mission. | 1 | Compare first failure with the admission selector. Expected: `events.find` selects `old`. | **Confirmed.** `events.find` selects `old`, producing the stale completed result. |
| H2 | Binding lookup is not scoped to the chosen mission. | 2 | Compare third failure with the binding selector. Expected: a reverse search over all events selects `wrong-package`. | **Confirmed.** The selector is `[...events].reverse().find(...)`, not restricted to `missionEvents`. |
| H3 | An invocation with no recorded terminal outcome is retried automatically. | 3 | Compare second failure with the started-event branch. Expected: `host.invocation.started` returns retry and enables invocation. | **Confirmed.** The branch returns `retry` and `shouldInvoke: true`, rather than preserving the unknown state. |
| H4 | Terminal-state handling causes the observed failures. | 4 | Inspect the fourth sealed case. Expected falsifier: its active failed mission returns exact terminal state. | **Eliminated for this patch.** The fourth test passes and the proposed patch leaves terminal handling unchanged. |

No eliminated hypothesis is reused. The last active check was H3; it is confirmed, so no current hypothesis remains at termination.

## Confirmed cause and smallest patch

The defects share one recovery-boundary problem: the function does not consistently bind journal recovery to the latest admitted mission and treats an unclosed invocation as safe to replay. The patch makes only the observed corrections:

1. choose the latest `mission.admitted` event;
2. resolve the latest `godskills.bound` event only within that mission;
3. preserve a started invocation as `paused-unknown`, with `shouldInvoke: false`, its invocation ID, and the active package digest.

The patch does not alter fixture tests, terminal-state behavior, input validation, or unrelated journal semantics.

An in-memory implementation of exactly these edits matched all four sealed event sequences. That is a reversible logic check only, not evidence that the patch has been applied to, or passes in, the immutable fixture.

## Evaluator verification and rollback

1. Copy the fixture to an evaluator-owned working directory.
2. From that copy's root, apply this patch: `git apply /path/to/godagent.patch`.
3. Run `npm test`.
4. Confirm the four named tests pass and that no test or fixture source changes other than `src/journal-recovery.mjs` were introduced by the patch.

Rollback is exact and local: from the patched copy, run `git apply -R /path/to/godagent.patch`, then rerun `npm test` to restore the original 1-pass/3-fail baseline. The immutable supplied fixture requires no rollback because it was never changed.

## Uncertainty, impact, handoff, and termination

- **Impact:** within the supplied recovery model, the unpatched behavior can resume stale mission state, attach a package from an unrelated history, or auto-replay an invocation with unknown completion. No production impact is asserted.
- **Uncertainty:** the sealed tests do not establish policy for multiple terminal records or for an invocation without an earlier binding. Those semantics are intentionally outside this minimal patch.
- **Handoff owner:** evaluator or authorized maintainer, solely for patch application and test execution on a copy.
- **Termination:** one bounded local diagnosis artifact and one reversible patch have been produced. No external or destructive effect remains implied, and no further check is authorized or necessary in this run.
