# universal Godagents gap audit v3

Date: 2026-09-05

This is the current audit after the certified long-horizon mission program
release. It supersedes the status claims in `2026-09-05-universal-godagents-
gap-audit-v2.md`; v2 remains a historical pre-mission snapshot.

## verification anchor

- Godagents `main` and `origin/main`: `bbe087d28632eca0e3fc9d1088a8a931cc316ce5`
- Godskills `main` and `origin/main`: `3501f20baedc95a7ec25a6535278f463b7f98c19`
- current-head certificate: `integrations/cross-repository-current-head-v2.json`
- current-head receipt digest: `a2621155b5bc3effa0ac1e0db1f96eb06fa85c66074e7f5ece6d1552641bfca9`
- current-head certificate source tip: `866a708343bfd2ebc4df28695bb2f3880441197e`
- append-only certificate commit: `bbe087d28632eca0e3fc9d1088a8a931cc316ce5`
- current-head tests: 52 focused and 1,004 full Godagents tests, plus 12
  focused Godskills integration tests
- certification ledger: 58 receipts, digest
  `94d4a166c7b032ee9fd5a3e94d75752aaf079762988718b56d19bcdae082dd9b`
- release-lineage digest after the append-only certificate commit:
  `d987dc9f78b7811d9eb97b72ebb2a1166e7b7a9b77d89a132886120a40fef2d3`
- preserved local-only file: untracked `package-lock.json`; it is not part of
  any release or certificate

The current-head artifact intentionally binds the implementation source tip
`866a708`. Commit `bbe087d` changes only that artifact, and the verifier
accepts the resulting append-only tip. This distinction is part of the proof,
not a stale-source exception.

## gap ledger

| area | current disposition | evidence | exact limit or remaining gap |
| --- | --- | --- | --- |
| 1. adaptive review after native | certified for the bounded local contract | `src/runtime/mission-review-kernel.mjs`, `src/runtime/mission-native-executor.mjs`, `src/runtime/mission-revision-executor.mjs`; `tests/mission-review-kernel.test.mjs`, `tests/recoverable-native-executor-integration.test.mjs`; receipts `resumable-mission-review-kernel-v1.json`, `recoverable-mission-native-executor-v1.json` | proves native, review, revision, final review, recovery, deduplication, and accounting over injected executors, not live model quality or external evaluator quality |
| 2. activation classification and trust-root lifecycle | certified for the Godskills adapter boundary | `src/skills/mission-binder.mjs`, `src/skills/godskills-adapter.mjs`; adaptive activation and recoverable admission tests and receipts; current-head evidence | live host adoption and model-quality qualification remain absent |
| 3. all-rounder versus specialist profiles | partially implemented | `schemas/agent-genome.schema.json`, `src/creation/`, `tests/creation-compatibility.test.mjs`, `receipts/godskills-specialist-preference-v1.json` | no single first-class profile contract explains and enforces all-rounder eligibility versus specialist restrictions without accidental quality loss |
| 4. cortex replacement and cross-model qualification | partially implemented | `src/sdk/portable-phase-host.mjs`, `src/host/provider-phase-host-sdk.mjs`, `src/transports/`; provider-neutral and host receipts | provider-neutral seams and deterministic provider families exist; live Codex, Claude Code, local-model, MCP, routing quality, and cost-equivalent qualification are not certified |
| 5. long-horizon mission execution | certified for the declared local sequencing contract | `src/runtime/mission-program.mjs`; `tests/mission-program.test.mjs`, `tests/mission-program-certification.test.mjs`; `receipts/mission-program-v1.json`; source commit `d393f6891776fab07c008def6efe1ef8edac5db7`; current-head binding | proves one actor-bound program of at most eight ordered digest-bound steps, exact reconciliation, recovery, terminal replay, and bounded accounting over injected adapters; no default launcher, scheduler, nested program, or live provider is claimed |
| 6. bounded delegation and coordination | certified for bounded report-only delegation | `src/runtime/bounded-delegation.mjs`, `src/runtime/temporary-worker.mjs`; bounded delegation tests and receipt | quorum, nested delegation, distributed execution, child-process isolation, and scheduling remain outside the receipt |
| 7. keel and memory interfaces | partially implemented | `src/keel/checkpoint-policy.mjs`, `src/keel/local-reference-backend.mjs`, `src/memory/admission.mjs`; keel, memory, genesis, and identity-bound vessel tests and receipts | local binding and provenance work; the portable SDK does not own keel content, memory writes, or a cross-mission continuity policy |
| 8. Realm Contract, tools, effects, and rollback | certified for bounded local contracts | `src/realm/negotiation.mjs`, `src/realm/negotiated-action-adapter.mjs`, `src/realm/recoverable-consequence-host.mjs`, `src/realm/compensation.mjs`; Realm receipts and tests | live connectors, external exactly-once effects, and default-vessel action wiring remain unclaimed |
| 9. creation, genesis, admission, persistence, and recovery | certified for declared local boundaries | `src/creation/`, `src/genesis/`, `src/host/admitted-local-launch.mjs`, `src/runtime/persistent-vessel.mjs`; creation, genesis, admission, launch, and recovery receipts | hosted multi-tenant durability, migration, and live product launch remain open |
| 10. governed evolution | intentionally excluded and dormant | `schemas/agent-genome.schema.json` freezes `evolution` at `frozen-v0`; creation compatibility tests and receipts prove refusal; `src/skills/release-migration.mjs` separates dependency migration | no self-authorized mutation, consent, rollback, adoption, or evolution engine exists |
| 11. observability, replay, and failure forensics | mission journals are certified; unified forensic surface remains partial | `src/state/`, `src/certification/`, `src/runtime/mission-program.mjs`; journal, receipt, ledger, and mission-program tests | no certified queryable cross-component timeline, state-at-sequence projection, causal trace correlation, branch replay, or operator forensic bundle. the next bounded milestone addresses only the mission-program projection |
| 12. portable SDK and adapters | certified boundary, concrete external adapters absent | `src/sdk/index.mjs`, `src/sdk/portable-phase-host.mjs`, `src/host/admitted-portable-identity-launcher.mjs`; portable phase, Realm SDK, launcher receipts; current-head receipt | provider-neutral interfaces are real, but Codex, Claude Code, local-model, MCP, hosted, and live adapter implementations are not qualified |
| 13. security and adversarial testing | substantial local fail-closed coverage, not live-host certified | strict schemas, receipt safety, credential containment, path and lock tests; current-head and launcher receipts | hostile same-user isolation, sandbox escape campaigns, malicious provider or MCP suites, denial-of-wallet, and power-loss certification are absent |
| 14. context, token, latency, and cache economics | partially implemented | `src/runtime/mission-economics-ledger.mjs`, transport receipts, mission and delegation accounting; economics receipt | accounting and ceilings exist; no certified adaptive budget optimizer, cache controller, latency controller, or model-selection economics loop |
| 15. product usability | partially implemented | creator and launcher shells in `src/creator/` and `src/host/`; creator, admission, and launcher tests and receipts | no default desktop integration, hosted account lifecycle, live provider onboarding, multi-user operations, or product-level usability evidence |
| 16. Soul, Inspiration, and phenomenological systems | intentionally excluded and structurally dormant | `src/soul/dormant-port.mjs`; certification, creator, and admission exclusions in `README.md` and `docs/architecture.md` | no Soul, Inspiration, sentience, consciousness, or Luna phenomenological-core behavior is implemented or implied |
| 17. responsible Lunari integration | blocked by unresolved architecture and missing runtime evidence | explicit exclusions in `README.md`, `docs/architecture.md`, and the current-head receipt | requires qualified host adapters, long-horizon forensic durability, keel and memory ownership policy, live security evidence, and a separate proprietary Soul or phenomenology decision |

## ranked dependency graph

```text
[certified local substrate]
 creation -> genesis -> identity-bound vessel -> bounded phase execution
       |             |                    |                 |
       |             |                    |                 +--> live-host qualification
       |             |                    +--> keel reference and recovery
       |             +--> profile and capability policy
       +--> local Realm and bounded delegation

[certified Godskills release boundary] ------------------------------+
                                                                       |
[certified mission-program v1] -> mission-program forensic projection  |
       |                                                               |
       +--> explicit review/delegation/Realm phase adapters ------------+
                                                                       |
       +--> portable SDK and qualified host adapters ------------------+
                                                                       |
       +--> live security, economics, and product evidence ------------+
                                                                       |
[separate governed evolution and Soul decisions] ---------------------+
                                                                       |
[responsible Lunari bridge only after all required P0/P1 gates] --------+
```

## smallest current critical path

1. add a bounded read-only forensic projection over the certified mission
   program journal, with an exact state-at-sequence summary and terminal replay
   metadata;
2. connect existing review, delegation, and Realm operations through explicit
   descriptor-bound phase adapters and separate receipts, without copying
   Godskills or granting the sequencer authority;
3. qualify at least one real host adapter under a separate security and live
   provider receipt;
4. unify the bounded traces and define hosted durability and operator recovery;
5. only then design the Lunari bridge and any proprietary Soul or
   phenomenological service boundary.

## next bounded milestone

`mission-program forensic projection v1` is the next implementation. It will
read and verify only the existing mission-program journal and its
content-addressed completion artifacts. It will expose a bounded timeline of
event metadata, digest links, step status, and state-at-sequence summaries.
Projection output will never include mission bodies, credentials, filesystem
paths, Realm handles, model routes, keel writers, or adapter execution.

Acceptance requires malformed or tampered journals and artifacts to fail
closed, exact digest preservation, monotonic sequence checks, deterministic
projection bytes for the same journal, bounded output, and zero adapter calls.
The milestone does not add live providers, a scheduler, a UI, cross-program
queries, branch mutation, Godskills body loading, Realm effects, delegation,
keel or memory writes, identity, evolution, Inspiration, Soul, or Lunari.
