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
