# Effect-only SDK certificate profile repair

The controlled-comparison integration gate on
`d5a3dfd12e6ef56c266e6c191b6e3f71916d519c` failed: 1261 passed, 4 failed,
1265 total, no cancelled/skipped/todo, 674908.399 ms, exit 1.
Preserved log:
`D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/godagents-d5a3dfd-full-suite.log`.
SHA-256: `18c73db46d8531133eb98f0515f5beffcec383e3ae97c4ec5a92f85b7927b37b`.

## Cause

The public `createAdmittedEffectOnlyIdentityLauncher` export entered main in
`8a621826ddf92420e52f4bcd20837daa7522e567`. The cross-repository current-head
certificate's closed SDK export profile still represented the earlier surface.
All four failures were SDK root export-set mismatches. The comparison branch
itself introduced no runtime src/ changes before this repair.

The affected tests build against reconciled `main` and `origin/main`, not the
working feature HEAD. A pre-merge test of a newly exported SDK function therefore
does not establish post-merge certificate compatibility. Gate reports must state
which refs were exercised; future SDK changes need prospective-source coverage
as well as committed-main verification.

## Repair and scope

- Preserve the historical current-v2 export list and all earlier profiles.
- Select an additive profile only when the committed target contains the
  effect-only launcher and descends from its exact introduction commit.
- Require the qualified current-v2 base profile before selecting that addition.
- Add exactly one SDK export and bind the facade source and focused SDK tests
  as explicit boundary files. Exact export equality remains required.
- Do not rewrite stored certificates, ancestor receipts or failed-run evidence.

The new current-head regression failed with the original mismatch before the
fix. Focused current/historical checks passed afterward. A copied source tree
attached to a pre-introduction parent is rejected. The full affected test family
then passed: 15 tests, zero failures/cancellations/skips/todo, 84711.819 ms.
Independent review approved the source-era distinction and ancestry check.

This repairs source/profile compatibility. It does not issue a new behavioral
certificate for the facade, prove live model quality, or make the overall product
complete.

## Integrated verification

Runtime/test commit `eeb0c9c5bf91173c52d3e32b374816db065c8fc7` subsequently passed
the full repository suite: 1267 tests, zero failures/cancellations/skips/todo,
649529.9339 ms, exit 0. Log:
`D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/godagents-eeb0c9c-full-suite.log`.
SHA-256: `4fe6eb2842b8c87ef448b6350a65549a161569c952c33ba9679b0cf35f608510`.

Main fast-forwarded from `700ea830db05b8b9dc3a1ade25235d2bec94953c` to that exact
tested commit. All 61 merged evaluation/historical tests passed (32091.0739 ms).
The SDK entrypoint, facade source and focused SDK test bytes were unchanged
between the pre-merge main and the tested commit, explicitly checked before merge.
After pushing and confirming main/origin-main agreement, all seven current-head
certificate tests passed against the reconciled refs (71693.8566 ms). Stored v1
artifacts remained byte-identical and historical v2 verification remained intact.

These are fresh integration results, not amendments to the failed d5a3dfd run.
This closeout is documentation-only after the tested code commit. The retained
feature branch preserves the development history. The unrelated user-owned
untracked package-lock.json was not changed or committed.
