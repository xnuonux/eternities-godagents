# Control diagnosis: journal recovery

## Reproduction

From the immutable fixture root, I ran `npm test` without changing the fixture.

- Result: 4 tests total, 1 passed, 3 failed.
- The failing cases were the latest-admitted recovery case, the unknown-completion-after-invocation case, and the interleaved-package case.
- The terminal-state case for the active mission passed.

## Hypotheses, ranked before confirmation

1. **Active mission selection uses the oldest admission.** High likelihood: recovery selects the first admission, so completed history can mask a later active mission.
2. **Binding lookup crosses mission boundaries.** High likelihood: recovery searches the entire journal backwards for a binding, which can select an unrelated request's package.
3. **An unclosed invocation is treated as safe to replay.** High likelihood: recovery returns `retry` with `shouldInvoke: true` immediately after finding a start event, despite no completion record.
4. **Terminal-state handling itself is wrong.** Low likelihood: the active terminal test already succeeds, and the observed stale-terminal result is explained by hypothesis 1.

## Confirmed root cause

All three failures follow directly from the implementation's selection scope and its replay decision:

- It takes the first `mission.admitted` record rather than the latest one.
- It takes the latest binding from all events rather than from the selected mission's events.
- It interprets an invocation-start record with no terminal record as a retry instruction. That can replay work whose completion state is unknown.

The patch changes only those decisions. It selects the latest admission and the selected mission's latest binding, and converts an unclosed invocation into a non-invoking `paused-unknown` state while retaining the invocation and package identifiers.

## Patch rationale and scope

`control.patch` changes only `src/journal-recovery.mjs`, with paths relative to the fixture root. It does not change tests, journal input, or recovery data.

The patch assumes the existing event ordering demonstrated by the sealed test: a binding record precedes an invocation-start record for an admitted mission. No behavior is proposed for malformed journals beyond preserving the existing absence of validation.

## Evaluator verification

1. Copy the immutable fixture to a disposable directory.
2. From that copy's root, apply `control.patch` with `git apply` (or `patch -p0`, adjusted for the patch format).
3. Run `npm test`.
4. Confirm the four named journal-recovery cases pass and that the fixture copy contains no changes beyond the recovery source.

I did not apply the patch to the immutable fixture and therefore do not claim that the patched fixture passes.

## Rollback

In the disposable copy, reverse the patch with `git apply -R control.patch`, or restore only `src/journal-recovery.mjs` from the fresh fixture copy. No journal records or tests need recovery.

## Uncertainty and termination condition

The sealed tests confirm the three causes above. They do not establish policy for malformed sequences such as an invocation start without an earlier binding, or multiple terminal records for one request; this patch deliberately does not invent such policy.

This control task terminates when the evaluator applies the supplied patch to a fresh fixture copy and runs the sealed tests. Further changes require a newly observed failure or an explicit policy decision for malformed journals.
