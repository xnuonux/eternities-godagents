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
complete. A fresh full repository gate is still required before integration.
