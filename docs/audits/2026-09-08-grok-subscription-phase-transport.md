# Grok subscription adapter implementation evidence

Base: `76960185e1d1dc1aea6ed0720c1c1a02148693fb`.
Branch: `feat/grok-subscription-phase-transport-v1`.

This batch adds the provider-specific codec, externally pinned policy loader,
opaque OAuth process boundary, durable three-phase suite and existing portable
host wrapper. It does not add a new host protocol, identity layer, or HTTP shim.
See the [spec](../superpowers/specs/2026-09-08-grok-subscription-phase-transport.md)
and [plan](../superpowers/plans/2026-09-08-grok-subscription-phase-transport.md).

## Targeted proof

`node --test tests/grok-cli-phase-policy.test.mjs tests/grok-cli-phase-process.test.mjs tests/grok-cli-phase-protocol.test.mjs tests/grok-cli-phase-transport.test.mjs`

Latest pre-integration run: **21 passed, 0 failed, cancelled, skipped or todo**,
7,893.1006 ms, exit 0. This is a targeted gate, not a full-suite certification.

Red evidence retained in the task execution record:

- Codec: seven failing stub tests before implementation; the initial import-only
  failure was replaced by executable stubs to expose the actual missing behavior.
- Policy: three failing tests before implementation.
- Process: five failing tests before implementation.
- Three-phase composition: three failing tests before implementation.
- Review regressions exposed unknown telemetry being dropped, absent explicit
  model-attribution labeling, JSON-escaped secret acceptance, contradictory
  returned status acceptance, and accessor/symbol-expanded bridge results.

Tests use real Godagent dispatches and a real local Node subprocess with
synthetic provider output. The test bridge reuses the canonical owned Perseus
invocation setup at `C:/dev/perseus-v2/perseus-grok-cli.js`; the actual inference
call is replaced. These integration tests therefore require that local bridge,
in addition to the existing canonical Godskills test dependency. They are not
standalone cross-platform or vendor-binary certification.

The actual owned `runProcess` implementation rejects nonzero close status,
signal/timeout, and spawn failures; only close status 0 resolves
`{stdout, stderrBytes}`. A real child producing valid stdout then exiting 7,
a real timed-out child, and a contradictory resolved envelope all reject.
The adapter validates that exact data-only return shape before reading it.
This is a trusted, byte-pinned bridge contract, not a hostile JavaScript sandbox.

Three-phase tests verify authenticated artifacts, accounting evidence,
credential-free terminal replay, no second child after uncertain dispatch,
and sanitized terminal handling of credential reflection. Existing signed
recovery is reused, not replaced. Program-file pins detect drift; they are not
a defense against a privileged attacker swapping executables during launch.

## Review and release boundary

Independent reviewer Banach identified telemetry closure/model attribution and
process-status contract concerns. The first two were fixed with red/green tests.
The status concern was reconciled against the actual bridge source, then closed
with exact result-shape validation and real-child regressions. Final independent
review approved the actual final scoped files with no concrete blocking defect.
The reviewer did not rerun tests or providers. Full integration proof is recorded
at release closeout, not inferred from the targeted count above.

No new live provider inference or paid API fallback occurred in this batch.
The earlier Grok readiness probe remains separate historical evidence. The new
adapter still needs bounded live qualification before matched performance tests.
Provider cost is reported telemetry, never proof of an actual charge or free use.
Model ledger counts are not a guarantee of physical exactly-once inference.

Godskills incremental-capability evaluation remains separate from Godagents
full-system native-versus-agent evaluation. Three-phase availability does not
authorize unequal calls or budgets across study arms. Its failed visual-judge
identity control is not repaired by these transport tests. Soul, Inspiration,
Lunari integration, and universal product completion remain excluded.

## Integrated gate closeout

Tested and fast-forwarded runtime commit:
`5d3d0ba2d4f54fb6b3cae79dbb5f5ce3da997e6c`.

- Initial full spec-reporter run reported one ledger failure at 28,779.540 ms.
  It was stopped before the reporter emitted its final failure stack, so the
  cause is **unresolved**, not classified as a harmless flake. The preserved
  incomplete log is
  `D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/godagents-5d3d0ba-full-suite.log`,
  SHA256 `3359faf618b22e70798151eafa2a44cb1b3c3ad66d134e2227125173e76a4db2`.
- The exact isolated 69-receipt ledger test passed unchanged: 1 test,
  123,535.0447 ms total, exit 0. No source repair or receipt regeneration followed.
- The diagnostic full TAP rerun passed **1,300/1,300**, zero failures,
  cancellations, skips or todos, 595,652.2659 ms, exit 0. This includes nested
  tests; its top-level TAP plan is 1..1294, not the total test count.
  Log: `D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/godagents-5d3d0ba-full-suite-tap-2.log`.
  SHA256: `9cbc2cdb03273a816b54786335bfabad56b85fbed1b2bb9a7b02483fbe7aa80c`.
  Its ledger test passed at 202,910.659 ms. Independent named-path inspection
  found no concrete shared mutation or deterministic receipt defect. This
  supports the successful gate, not an invented explanation for the first run.
- Fast-forward `main` preserved the exact tested runtime. Post-merge Grok,
  durable-process, and portable-host checks passed **37/37**, 7,660.0271 ms,
  exit 0. The runtime was pushed to `origin/main`.
- Published current-head-v2 verification passed **3/3**, 51,759.8055 ms,
  exit 0, including the unchanged v1 cross-repository artifacts.

The feature branch and all prior receipts remain preserved. The user-owned
untracked `package-lock.json` was not staged or changed. Documentation-only
closeout may follow this runtime commit; it is not a new runtime certificate.
Next: bounded live adapter qualification, then separately authorized and
preregistered matched useful-task studies with a qualified judging path.
