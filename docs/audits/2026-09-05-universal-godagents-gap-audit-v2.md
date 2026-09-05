# universal Godagents gap audit v2

Date: 2026-09-05

This is the current evidence-backed audit of `eternities-godagents` as a
provider-neutral architecture. It supersedes neither the historical receipts
nor the older audit. It corrects the older audit where later certified work
changed the disposition.

## verification anchor

- Godagents `main` and `origin/main`: `beb6dbd2b4b2397cf0e925ba3a7c345c29d3a27e`
- Godskills `main` and `origin/main`: `3501f20baedc95a7ec25a6535278f463b7f98c19`
- current-head cross-repository certificate: `integrations/cross-repository-current-head-v2.json`
- current-head certificate status: `certified`
- current-head receipt digest: `a0d77814b49e250495062c4d508ae4b29bebaa207f6a0b2364336c05c5d30c28`
- certificate-bound Godagents source commit: `b2230d7f64b0f9f9f4ab43d8eb053383ef1ea600`
- Godagents focused/full proof counts: `36` / `988`
- Godskills focused proof count: `12`

The append-only certificate artifact was refreshed by `beb6dbd`; its source
section intentionally retains the exact source commit used to produce the
certificate. The untracked `package-lock.json` is a pre-existing local file
and is not part of the certified source.

## classification rule

“certified and genuinely complete” means complete for the exact declared
contract and proof limits, not complete as a product or as a live model.
“implemented but not certified” means a usable source surface exists without a
current independent release receipt. “structurally present but dormant” means
the shape is reserved or inert. “partially implemented” means a meaningful
slice exists but the requested universal behavior is incomplete. “specified but
absent” means the repository names the boundary but has no runtime. “intentionally
excluded” means the absence is a deliberate safety boundary. “stale or
contradictory” means historical evidence must not be treated as current truth.
“blocked by an unresolved architectural decision” means the next step depends
on a material choice that the current contracts do not settle.

## gap ledger

| area | current disposition | evidence | exact limit or remaining gap |
| --- | --- | --- | --- |
| 1. adaptive review after native | certified and genuinely complete for the bounded local contract | `src/runtime/mission-review-kernel.mjs`, `src/runtime/mission-native-executor.mjs`, `src/runtime/mission-revision-executor.mjs`; `tests/mission-review-kernel.test.mjs`, `tests/recoverable-native-executor-integration.test.mjs`; `receipts/resumable-mission-review-kernel-v1.json`, `receipts/recoverable-mission-native-executor-v1.json`; commits `bdb425c`, `9eb9c7d` | proves native -> review -> revision -> final review, recovery, deduplication, and accounting with injected executors. it does not prove live model quality or an external evaluator's judgment. |
| 2. activation classification and trust-root lifecycle | certified and genuinely complete for the Godskills adapter boundary | `src/skills/mission-binder.mjs`, `src/skills/godskills-adapter.mjs`; `tests/godskills-adaptive-activation.test.mjs`, `tests/routing-evidence-activation-classifier-certification.test.mjs`; `receipts/godskills-adaptive-activation-v1.json`, `receipts/routing-evidence-activation-classifier-v1.json`, `receipts/recoverable-godskills-admission-v1.json`; current-head evidence in `integrations/cross-repository-current-head-v2.json` | routing occurs after the envelope is known and before cortex inference, with stale and partial tuples failing closed. live host adoption and model-quality qualification remain absent. |
| 3. all-rounder versus specialist profiles | partially implemented | `schemas/agent-genome.schema.json`, `src/creation/`, `tests/creation-compatibility.test.mjs`; Godskills specialist preference receipt `receipts/godskills-specialist-preference-v1.json` | capability policy and specialist preference exist, but there is no single first-class Godagent profile contract that admits, explains, and enforces all-rounder eligibility versus specialist restrictions without accidental quality loss. |
| 4. cortex/model replacement, routing, and cross-model qualification | partially implemented | `src/sdk/portable-phase-host.mjs`, `src/host/provider-phase-host-sdk.mjs`, `src/transports/`; `receipts/provider-neutral-phase-protocol-v1.json`, `receipts/provider-phase-host-sdk-v1.json`, `receipts/provider-neutral-phase-resolution-v1.json` | replaceable provider-neutral phase seams and two deterministic provider families exist. live Codex, Claude Code, local-model, MCP, routing quality, cost-equivalent comparison, and cross-model qualification are not certified. |
| 5. long-horizon mission execution and resumable phase transitions | specified but absent | `src/runtime/vessel.mjs` (`runCycle` is one mission and one action), `src/runtime/mission-review-kernel.mjs` (one mission), `src/runtime/scheduler.mjs` (concurrent proposal collection only); `README.md` bounded-launch and bounded-delegation limits | there is no durable mission program, sequential phase queue, resumable multi-step plan, or terminal replay spanning several mission operations. this is the smallest critical-path gap. |
| 6. bounded delegation and multi-agent coordination | certified and genuinely complete for bounded report-only delegation | `src/runtime/bounded-delegation.mjs`, `src/runtime/temporary-worker.mjs`; `tests/bounded-delegation.test.mjs`, `tests/bounded-delegation-certification.test.mjs`; `receipts/bounded-delegation-lifecycle-v1.json`; commit `f4ce4a7` | one to three independent worker adapters, durable local recovery, stable ordering, and terminal replay are proven. quorum, nested delegation, child-process isolation, distributed execution, and scheduling are intentionally outside the receipt. |
| 7. keel and memory interfaces | partially implemented | `src/keel/checkpoint-policy.mjs`, `src/keel/local-reference-backend.mjs`, `src/memory/admission.mjs`; `tests/keel-checkpoint-policy.test.mjs`, `tests/keel-reference-backend.test.mjs`, `tests/memory-provenance.test.mjs`; genesis and identity-bound vessel receipts | genesis and the local vessel can bind and reference a personal keel, and memory admission preserves provenance. the portable SDK does not own keel content, memory writes, or a cross-mission continuity policy, by design. |
| 8. Realm Contract, tools, effects, and rollback | certified and genuinely complete for bounded local contracts | `src/realm/negotiation.mjs`, `src/realm/negotiated-action-adapter.mjs`, `src/realm/recoverable-consequence-host.mjs`, `src/realm/compensation.mjs`; `receipts/realm-negotiation-v1.json`, `receipts/realm-action-adapter-v1.json`, `receipts/realm-consequence-executor-v1.json`, `receipts/recoverable-realm-consequence-vessel-v1.json`, `receipts/realm-compensation-v1.json` | contract negotiation, preconditions, local consequence recovery, and compensation boundaries exist. live connectors, external exactly-once effects, and default-vessel action wiring remain unclaimed. |
| 9. creation, genesis, admission, persistence, and recovery | certified and genuinely complete for the declared local boundaries | `src/creation/`, `src/genesis/`, `src/host/admitted-local-launch.mjs`, `src/runtime/persistent-vessel.mjs`; `receipts/creation-forge-phase1-certification.json`, `receipts/transactional-genesis-phase2-certification.json`, `receipts/local-admission-shell-certification.json`, `receipts/admitted-local-launch-v1.json` | deterministic creation, genesis, local admission, identity binding, residency, recovery, and one-mission launch are proven. hosted multi-tenant durability, migration, and live product launch remain open. |
| 10. governed evolution | intentionally excluded and dormant | `schemas/agent-genome.schema.json` and creation contracts pin `evolution.policy` to `frozen-v0`; `tests/creation-certification.test.mjs` and `tests/creation-compatibility.test.mjs` prove refusal | no self-authorized mutation or evolution engine exists. this is a required safety boundary until a separate governed-evolution design, authority model, rollback model, and receipt family exist. |
| 11. observability, receipts, replay, time travel, and failure forensics | implemented but not certified as one unified surface | hash-chained journals, restore/replay, append-only receipts, and release gates span `src/state/`, `src/certification/`, and runtime journals; `tests/journal-recovery.test.mjs`, `tests/receipt-safety.test.mjs`, `tests/certification-ledger.test.mjs` | each boundary has evidence, but there is no certified cross-component trace viewer, causal query surface, time-travel debugger, or single forensic bundle for a long-horizon mission. |
| 12. portable SDK and adapters | certified boundary, concrete external adapters intentionally absent | `src/sdk/index.mjs`, `src/sdk/portable-phase-host.mjs`, `src/host/admitted-portable-identity-launcher.mjs`; `receipts/portable-phase-host-conformance-v1.json`, `receipts/portable-realm-consequence-sdk-v1.json`, `receipts/admitted-portable-identity-launcher-v1.json`; current-head v2 receipt | the SDK is provider-neutral and body-free. actual Codex, Claude Code, local-model, MCP, and hosted adapters are not present or qualified, and the SDK does not change default launch behavior. |
| 13. security and adversarial testing | partially implemented | strict schemas, credential scans, descriptor branding, path and lock checks, and adversarial tests throughout `tests/`; `receipts/admitted-portable-identity-launcher-v1.json` and the current-head v2 receipt | local fail-closed behavior is substantial. hostile same-user process isolation, real sandboxing, supply-chain provenance for arbitrary adapters, network threat modeling, and live penetration evidence are absent. |
| 14. context, token, latency, and cache economics | partially implemented | `src/runtime/mission-economics-ledger.mjs`, provider cache evidence in transport receipts, bounded completion accounting in mission and delegation journals; `receipts/mission-economics-ledger-v1.json` | observation and accounting are present. no certified adaptive budget optimizer, cache policy, latency controller, or model-selection economics loop exists. |
| 15. product usability beyond deterministic fixtures | partially implemented | local creator shells and launch CLIs in `src/host/` and `src/creator/`; creator and launcher tests and receipts | usable local operator paths exist, but no default desktop integration, hosted account model, multi-user lifecycle, live provider onboarding, or product-level usability evidence exists. |
| 16. Soul, Inspiration, and phenomenological systems | intentionally excluded and structurally dormant | `src/soul/dormant-port.mjs`; `tests/certification.test.mjs`, creator/admission tests, and the explicit exclusions in `README.md` and `docs/architecture.md` | the port returns dormant state only. no Soul, Inspiration, sentience, consciousness, or Luna phenomenological-core behavior is implemented or implied. |
| 17. responsible Lunari integration | blocked by unresolved architectural decisions | portable and identity-bound receipts explicitly exclude Lunari; `README.md`, `docs/architecture.md`, and `integrations/cross-repository-current-head-v2.json` list the exclusion | responsible integration requires a live-host contract, long-horizon durability, keel/memory ownership policy, security model, and a separate decision about the proprietary phenomenological or Soul layer. it must not be inferred from deterministic local fixtures. |

## stale evidence that must remain provenance-only

`docs/audits/2026-08-30-universal-godagents-gap-audit.md` is historical. It
correctly identified the missing mission spine at its time, but its claim that
the review/native/revision kernel was absent is contradicted by the later
receipts listed above. It must not be used as the current implementation
status, and it remains useful only as a chronology record.

## ranked dependency graph

```text
[certified local substrate]
 creation -> genesis -> identity-bound vessel -> bounded phase execution
       |             |                    |                 |
       |             |                    |                 +--> [P1] provider/live-host qualification
       |             |                    +--> [P0] mission-program sequencer
       |             +--> keel reference and recovery                    |
       +--> profile/capability policy                                    +--> [P1] unified trace and forensic bundle
                                                                           |
 [certified Godskills release boundary] ----------------------------------+
                                                                           |
 [P0] mission-program sequencer -> resumable multi-step operation ---------+
       |                                                                    |
       +--> [P1] bounded delegation composition                            |
       +--> [P1] durable host adapters and product launch                   |
       +--> [P1] economics/cache controller                                 |
                                                                            |
 [P2] governed evolution and Soul decisions remain separate gates ----------+
                                                                            |
 [P0] Lunari integration is last: all required P0/P1 gates plus an explicit
      proprietary soul/phenomenology authority decision
```

## smallest critical path

1. implement and certify a provider-neutral mission-program journal and
   sequencer that owns a bounded ordered list of phase adapters, one active
   step at a time, exact reconciliation, and terminal replay;
2. attach existing mission-review, delegation, and Realm adapters only through
   explicit future receipts, without copying Godskills or giving the sequencer
   authority;
3. qualify one real host adapter under a separate security and live-provider
   receipt;
4. add a unified forensic projection and a deliberate hosted durability model;
5. only then design the Lunari bridge and any proprietary Soul or
   phenomenological service boundary.

## next bounded milestone

`long-horizon mission program v1` is the next implementation. It is a
provider-neutral sequencer, not an autonomous daemon and not a second vessel.
It will admit one actor-bound program with at most eight ordered, digest-bound
steps. Each step uses a descriptor-bound `reconcile` / `execute` adapter. The
coordinator records preparation before dispatch, never guesses an ambiguous
completion, resumes only the active step, and replays a terminal program with
zero adapter calls. Dispatches carry digests and bounded ceilings, not raw
credentials, Realm handles, personal-keel writers, or authority expansion.

Acceptance and proof requirements are recorded in
`docs/superpowers/specs/2026-09-05-long-horizon-mission-program-v1-design.md`
and its execution plan. Non-goals are live model quality, provider selection,
default launcher adoption, multi-machine scheduling, nested programs, quorum,
Soul, Inspiration, evolution, and Lunari.
