# universal Godagents gap audit v4

Date: 2026-09-05

This audit refreshes the v3 ledger against the current merged Godagents and
Godskills heads. v3 remains historical evidence for the pre-profile and
pre-forensics state. No current claim below treats a structural fixture as a
live provider, model-quality, hosted, or Lunari certification.

## verification anchor

- Godagents `main` and `origin/main`: `f9696b3d966439234e50c1f49abba4776706f1dd`
- Godskills `main` and `origin/main`: `3501f20baedc95a7ec25a6535278f463b7f98c19`
- current-head certificate: `integrations/cross-repository-current-head-v2.json`
- current-head receipt digest: `bc0f6587a19e261b852b209f05c6ab41c4a85cd55df854ea852eb357423c7207`
- current-head implementation source tip: `9e73f7e31acf4aab5a6563323e9e784f627da985`
- append-only certificate commit: `f9696b3d966439234e50c1f49abba4776706f1dd`
- current-head tests: 66 focused and 1,018 full Godagents tests, plus 12
  focused Godskills integration tests
- certification ledger: 60 receipts, digest
  `552e0742b3aeedda20b38d36a0e7b599e8370aced805ca2072991094696b6fd5`
- release-lineage digest after the current certificate:
  `f232b0caf3cc44160c04ff7d0af749277c52f4fb4fd209109f8ec90aa255463d`
- mission-program forensics receipt:
  `d016ae5f8b659ddf9dbe91df0e0d5bb344804383c476922124380263974ddafe`
- Godagent profile receipt:
  `4a66c7149f20e0e224eb604629e746fa57e31e30456870cc6dd3ecdef7ddd298`
- preserved local-only file: untracked `package-lock.json`; it is not part of
  any release or certificate

The current-head artifact binds the implementation source tip `9e73f7e` and
the exact Godskills head above. The final commit changes only the
content-addressed certificate artifact, so the append-only migration boundary
is explicit rather than a stale-source exception.

## gap ledger

| area | current disposition | evidence | exact limit or remaining gap |
| --- | --- | --- | --- |
| 1. adaptive review after native | certified for the bounded local contract | `src/runtime/mission-review-kernel.mjs`, `src/runtime/mission-native-executor.mjs`, `src/runtime/mission-revision-executor.mjs`; review, native, revision, recovery, and accounting tests; corresponding receipts | no live model or external evaluator quality claim |
| 2. activation classification and trust-root lifecycle | certified for the Godskills adapter boundary | `src/skills/mission-binder.mjs`, `src/skills/godskills-adapter.mjs`; adaptive activation and recoverable admission receipts; current-head evidence | live host adoption and model-quality qualification remain absent |
| 3. all-rounder versus specialist profiles | certified deterministic profile contract | `schemas/godagent-profile.schema.json`, `src/agent/profile.mjs`, `src/creation/contracts.mjs`, `src/skills/capability-policy.mjs`, profile tests and `receipts/agent-profile-contract-v1.json` | no live routing-quality or product-configuration evidence |
| 4. cortex replacement and cross-model qualification | partially implemented | `src/sdk/portable-phase-host.mjs`, `src/host/provider-phase-host-sdk.mjs`, `src/transports/`; provider-neutral and host receipts | Codex, Claude Code, local-model, MCP, routing quality, and cost-equivalent live qualification are not certified |
| 5. long-horizon mission execution | certified for the declared local sequencing contract | `src/runtime/mission-program.mjs`; mission-program tests and `receipts/mission-program-v1.json`; current-head binding | at most eight ordered steps over injected adapters; no default launcher, scheduler, nested program, or live provider |
| 6. bounded delegation and coordination | certified for bounded report-only delegation | `src/runtime/bounded-delegation.mjs`, `src/runtime/temporary-worker.mjs`, delegation receipt and tests | no quorum, nested delegation, distributed execution, child-process isolation, or scheduler |
| 7. keel and memory interfaces | partially implemented | `src/keel/`, `src/memory/`, genesis, identity-bound vessel, and recovery receipts | portable SDK does not own keel content, memory writes, or a cross-mission continuity policy |
| 8. Realm Contract, tools, effects, and rollback | certified for bounded local contracts | `src/realm/negotiation.mjs`, action, consequence, recovery, and compensation boundaries with separate receipts | live connectors, external exactly-once effects, and default-vessel action wiring remain unclaimed |
| 9. creation, genesis, admission, persistence, and recovery | certified for declared local boundaries | `src/creation/`, `src/genesis/`, `src/host/admitted-local-launch.mjs`, `src/runtime/persistent-vessel.mjs`; creation, genesis, admission, launch, and recovery receipts | hosted multi-tenant durability, migration, and live product launch remain open |
| 10. governed evolution | intentionally excluded and dormant | frozen `evolution` policy, compatibility refusal tests, and `src/skills/release-migration.mjs` | no self-authorized mutation, consent, rollback, adoption, or evolution engine |
| 11. observability, replay, and failure forensics | certified for one mission-program projection; cross-component surface remains partial | `src/runtime/mission-program.mjs`, `tests/mission-program-forensics.test.mjs`, `receipts/mission-program-forensics-v1.json`, current-head evidence | no cross-program timeline, causal trace correlation, branch replay, state index, or operator bundle |
| 12. portable SDK and adapters | certified boundary, concrete external adapters absent | `src/sdk/index.mjs`, `src/sdk/portable-phase-host.mjs`, portable phase, Realm SDK, and admitted portable launcher receipts | Codex, Claude Code, local-model, MCP, hosted, and live adapters are not qualified |
| 13. security and adversarial testing | substantial local fail-closed coverage, not live-host certified | strict schemas, receipt safety, credential containment, path and lock tests, launcher and current-head receipts | hostile same-user isolation, sandbox escape, malicious provider or MCP suites, denial-of-wallet, and power-loss campaigns are absent |
| 14. context, token, latency, and cache economics | partially implemented | `src/runtime/mission-economics-ledger.mjs`, transport receipts, mission and delegation accounting | no certified adaptive budget optimizer, cache controller, latency controller, or model-selection economics loop |
| 15. product usability | partially implemented | creator and launcher shells in `src/creator/` and `src/host/`; creator, admission, and launcher tests and receipts | no default desktop integration, hosted account lifecycle, live provider onboarding, multi-user operations, or product evidence |
| 16. Soul, Inspiration, and phenomenological systems | intentionally excluded and structurally dormant | `src/soul/dormant-port.mjs`, README and architecture exclusions, current-head proof limits | no Soul, Inspiration, sentience, consciousness, or Luna phenomenological-core behavior is implemented or implied |
| 17. responsible Lunari integration | blocked by unresolved architecture and missing runtime evidence | explicit exclusions in README, `docs/architecture.md`, and current-head proof limits | requires qualified host adapters, long-horizon forensic durability, keel and memory ownership policy, live security evidence, and a separate proprietary Soul or phenomenology decision |

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
[certified mission-program and forensic boundaries] -> operation bridge |
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

1. define one descriptor-bound operation adapter contract that can carry a
   mission-program step without copying a Godskill body or granting authority;
2. bind the existing review, bounded delegation, and Realm consequence
   boundaries through that contract as separate, source-bound receipts;
3. qualify at least one real host adapter under a separate security and live
   provider receipt;
4. unify bounded traces and define hosted durability and operator recovery;
5. only then design the Lunari bridge and any proprietary Soul or
   phenomenological service boundary.

## next bounded milestone

`descriptor-bound mission operation adapter v1` is the next implementation.
It must be a provider-neutral migration boundary, not a second coordinator.
The adapter will bind one operation kind, one exact source descriptor digest,
one empty authority projection, bounded request and result digests, and one
explicit reconcile-before-execute lifecycle. It may wrap an existing review,
delegation, or Realm operation, but it may not load Godskill bodies, persist
credentials, write a keel or memory, select a provider, or invoke a Realm
effect by itself.

Acceptance requires exact descriptor and source binding, deterministic
request and completion receipts, pending-versus-completed reconciliation,
changed-source and changed-authority fail-closed behavior, no duplicate
execution after a process boundary, bounded durable metadata, and explicit
non-integration with default vessel launch. The implementation must preserve
all current receipts and pass current-head, ledger, and release-lineage gates.

The milestone does not add live providers, a scheduler, a UI, cross-program
queries, nested delegation, Godskills body loading, new Realm authority,
keel or memory writes, identity, evolution, Inspiration, Soul, or Lunari.
