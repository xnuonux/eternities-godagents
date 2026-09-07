# bounded integrity repair, 2026-09-07

baseline: `38b332d9ea141039514b1a46ec7eaf1d96a8111c`, reconciled with origin/main before work. scope: historical v2 receipt compatibility and returned external-host dossier immutability. no new agent architecture, provider calls, skill routing changes, or third-party imports.

## reproduced causes

- historical profiles inherited the external-host qualification exports and protocol even for older source commits. the interval after adversarial qualification but before external-host qualification also selected a profile that omitted adversarial evidence.
- dossier verification cloned its input, then froze only selected outer objects. nested host authority and capability arrays remained writable after validation.

## repair and evidence

- `src/integration/current-head-certificate.mjs` now keeps the pre-external-host export set separate, gives that interval its own protocol and boundary profile, and selects it from the committed source. older profiles inherit that historical surface instead of the newer exports.
- `tests/current-head-historical-compatibility.test.mjs` reads actual unchanged receipts from commits `ae46906321983a7fe67511754a731b1a06877fad`, `b8354a3fd9f932aa3995e5a6d680220e39cd9de2`, and `07b1d53ff2ef6440ceaa3ad540c10cb7f48062cb`. the first two failed with `SDK root export set mismatch` before repair; the post-qualification control passed. after repair all three verify at their recorded sources. rehashed attempts to omit required adversarial evidence, add newer exports, or add a newer protocol still fail.
- `src/host/external-host-qualification.mjs` recursively freezes the validated private copy. it does not freeze caller-owned data or change serialized dossier values or digests.
- four new mutation tests failed before repair: authority and phase-list mutation through both construction and verification. two input-isolation controls passed before and after. all 18 dossier tests pass after repair.
- the combined targeted command `node --test --test-reporter=spec tests/current-head-historical-compatibility.test.mjs tests/external-host-qualification.test.mjs` passed all 24 tests, with zero failures, skips or cancellations, in about 45 seconds.

the adapter-protocol rejection case initially hit the earlier export mismatch instead of its intended check; after the export/profile repair it reaches and verifies the correct rejection boundary. it is defense coverage, not a separately reproduced protocol-acceptance exploit.

## release boundaries

all stored receipts and fixtures are preserved. the existing current-head certificate remains evidence for its recorded source commits, not automatic certification of this repair. historical compatibility mode does not disable source hashes, closed export maps, evidence checks or the separate current-ref freshness gate.

the sibling external-host receipt issuer's preliminary publication behavior remains an explicitly separate outstanding issue. do not run that issuer as a new certification path before its bounded repair. existing historically measured receipts are not rewritten.

full integration testing and independent review are tracked in the completion addendum when observed. the targeted results above are not a claim of live model quality, external-host qualification, remote exactly-once behavior, or a completed universal product.
