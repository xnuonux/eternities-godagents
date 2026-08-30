# round 03 research result

## receipt and scope

**question.** how ready are `eternities-godagents` and `eternities-godskills` for a live, session-scoped Codex, Claude Code, or Lunari host integration?

**scope.** read-only inspection of the two named local repositories and the bound trial artifacts. no repository code, tests, builds, model calls, network requests, paired result, or source-repository mutation was used. the stop condition was a source-labeled verdict, an explicit conflict, proof limits, and one bounded next validation.

**bound-method verification.** the binding selected `eternities-oracle` and pinned its entrypoint and capability contract at the two SHA-256 values below. `Get-FileHash -Algorithm SHA256` over the two bound paths matched both pins before their contents were used.

| artifact | expected and observed SHA-256 | binding citation |
| --- | --- | --- |
| `C:\dev\eternities-godskills\skills\eternities-oracle\SKILL.md` | `3c9851711492a276eaaac2672207774ea8da793d630a51b21623e2564a624d6c` | `C:\dev\eternities-godagents\evidence\field-trials\2026-08-30-crossed-suite-v1\bindings\03-research.json:117-122` |
| `C:\dev\eternities-godskills\skills\eternities-oracle\references\capability-contract.json` | `6bcf48f84e7d7c6b8416474bc1f72b6b7e137bcb8837ea23b81638b55be9e935` | `C:\dev\eternities-godagents\evidence\field-trials\2026-08-30-crossed-suite-v1\bindings\03-research.json:117-122` |

the selected method requires exact local provenance, separate observation from inference, explicit dispositions, and no source execution. `C:\dev\eternities-godskills\skills\eternities-oracle\SKILL.md:18-30`, `C:\dev\eternities-godskills\skills\eternities-oracle\references\operating-contract.md:15-49`.

## provenance matrix

| id | disposition | observation and bounded inference | authority and exact local citation | what it does not prove |
| --- | --- | --- | --- | --- |
| F1 | verified implementation | a bound vessel observes the realm, calls `bindGodskills`, journals a body-free `godskills.bound` receipt, and only then calls the cortex with the selected package and its digest. | direct implementation: `C:\dev\eternities-godagents\src\runtime\vessel.mjs:371-430` | a Codex, Claude Code, or Lunari host has supplied the mission, session identity, or host envelope. |
| F2 | verified implementation | the adapter verifies its pinned release before binding, intersects mission and host authority, routes the mission, loads selected packages, compiles a bounded package, and records source, release, stack, and package digests. recovery rejects changed source or selected artifact digests. | direct implementation: `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:162-223`, `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:225-265` | that a real host has exercised this path across an actual session interruption. |
| F3 | certified fixture evidence | the Godagents integration receipt is certified, reports zero authority expansions, zero unselected body loads, ordered binding before cortex, and package-digest reuse on recovery. it records 52 focused Godagents, 324 full Godagents, and 9 Godskills source tests as passing. | canonical receipt: `C:\dev\eternities-godagents\receipts\godskills-v3-integration.json:1` | arbitrary provider quality, unseen-mission routing correctness, multi-host activation, or model quality. those are explicit receipt limits. |
| F4 | certified fixture evidence | the Godskills portable manifest is certified as local artifacts with 44 capabilities, a one-to-three selected-entrypoint boundary, and no authority or effect expansion. | canonical receipt: `C:\dev\eternities-godskills\receipts\portable-capability-manifest-v1.json:3-35` | arbitrary live-agent routing or external-execution safety. |
| F5 | verified implementation | the local admitted launcher constructs the verified Godskills adapter from a locally pinned release, but its concrete cortex is `createOpenAICompatibleCortex`. it creates the mission from text, policy authority, and policy host context, then runs or recovers the persistent vessel. | direct implementation: `C:\dev\eternities-godagents\src\host\admitted-launch.mjs:164-200`, `C:\dev\eternities-godagents\src\host\admitted-launch.mjs:281-338` | a native Codex task transport, a Claude Code hook, or any Lunari adapter. |
| F6 | verified installation evidence | the Godskills release record says Oracle and the sovereign refinery are active through the reversible local profile, and the five release-two skills pass fresh Codex discovery. the ordinary Codex prompt remains cold with respect to the full catalog. | first-party repository record: `C:\dev\eternities-godskills\README.md:364-389` | a Godagent admission or session-scoped binding inside an ordinary Codex task. |
| F7 | verified design plus qualifying evidence | the declared boundary is provider-neutral and its interface is independent of Codex task transport. the design explicitly preserves ordinary unbound Codex operation and forbids retrofitting it into bound Godagents. | design record: `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:8-18`, `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:37-45`, `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:161-199` | that independence has been realized as a concrete host adapter for any of the three named hosts. |
| F8 | unverified host evidence | no audited source establishes a native Claude Code bridge or a session-scoped Claude Code run. this is an unknown, not evidence that no such bridge exists outside the bounded source set. | bounded source set: F1, F2, F5, F6, F7 | repository-wide absence or current Claude Code behavior. |
| F9 | deferred host evidence | Lunari is repeatedly named as excluded from certified Godagents phases, including the local admission and local launch boundaries. no live Lunari host evidence was inspected. | first-party repository record: `C:\dev\eternities-godagents\README.md:74`, `C:\dev\eternities-godagents\README.md:93`, `C:\dev\eternities-godagents\README.md:188`, `C:\dev\eternities-godagents\README.md:206` | whether a future Lunari bridge could satisfy the interface. |

## supported conclusion

**verdict: integration-ready as a receipt-bound, provider-neutral engine; not yet validated as a live session-scoped host integration for Codex, Claude Code, or Lunari.**

This is a source-supported inference, not a claim of product readiness. Godagents now contains the binding point, host-envelope intersection, selected-only package construction, journal ordering, and digest-checked recovery needed by such a host. Godskills supplies a certified selected-only capability release that preserves authority and effect ceilings. `C:\dev\eternities-godagents\src\runtime\vessel.mjs:399-430`, `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:167-223`, `C:\dev\eternities-godskills\runtime\portable-adapter.v1.json:10-18`.

Codex has the strongest adjacent evidence because the relevant Godskills profile is installed and discoverable there, but that is capability availability rather than a Godagent session bridge. The documented design further protects ordinary unbound Codex behavior, so installing or discovering skills must not be represented as admission into the Godagent runtime. `C:\dev\eternities-godskills\README.md:371-389`, `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:286-288`.

Claude Code has no verified host-bridge evidence in this bounded investigation. Lunari is materially less ready: the current first-party record explicitly excludes it from the certified launch boundary. `C:\dev\eternities-godagents\README.md:206`.

## unresolved conflict

The mission-binding design, dated 2026-08-30, labels itself "architecture ready for implementation" and says the then-current `src/runtime/vessel.mjs` routed after `decision.committed`, which it rejects. `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:1-8`, `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:141-159`.

The current implementation instead binds and journals before inference, and the integration receipt reports that ordered property as certified. `C:\dev\eternities-godagents\src\runtime\vessel.mjs:399-430`, `C:\dev\eternities-godagents\receipts\godskills-v3-integration.json:1`.

Direct implementation has higher authority for current behavior, so the source and receipt control the readiness verdict. The design is a stale or unreconciled historical record until its status and rejected-order statement are updated or explicitly superseded. This conflict does not establish a runtime fault, but it weakens documentation freshness and can misroute a host implementer.

## proof limits

- The certified receipts are local-artifact and deterministic-fixture evidence, not proof of arbitrary live-agent routing, external execution safety, or universal correctness. `C:\dev\eternities-godskills\receipts\portable-capability-manifest-v1.json:24-35`, `C:\dev\eternities-godskills\receipts\operational-capabilities-v1.json:211-221`.
- The Godagents integration receipt expressly excludes arbitrary provider or model quality, unseen mission routing, hostile same-user filesystem isolation, multi-host distributed activation, natural-language skill requirement fulfillment, and Soul or Inspiration activation. `C:\dev\eternities-godagents\receipts\godskills-v3-integration.json:1`.
- No code or certification command was run in this investigation. Thus, the listed records establish what their checked-in receipts and current source state say, not a fresh rerun of those certifications.
- No network or current vendor documentation was consulted. Accordingly, this result makes no claim about current Codex, Claude Code, or Lunari external product interfaces.

## single highest-value next validation

Run one bounded **Codex session-scoped admission trial** against the actual Codex task host, with a local read-only Realm and a fixed, non-production cortex response. It should:

1. map the real Codex task/session identity to the Godagent mission request and construct the explicit host authority, effects, preconditions, context, and composition envelope;
2. prove `godskills.bound` is journaled before the host invokes inference and that only the selected entrypoint and contract hashes enter the method envelope;
3. force one interruption after the binding receipt, resume the same Codex session, and prove rehydration preserves the original source, stack, and package digests without rerouting;
4. run the adjacent ordinary unbound Codex task unchanged as a regression control; and
5. emit an append-only receipt with the host-session mapping, policy and release pins, journal event order, selected-artifact hashes, recovery result, and the explicit non-claims.

This has the highest value because it closes the primary unknown shared by all three proposed hosts: whether a real session host can supply the required envelope and recover the exact receipt-bound package. It does not depend on model-quality claims, does not widen authority, and leaves Claude Code and Lunari as later adapter ports rather than speculative prerequisites. The existing engine already defines the exact acceptance shape: pre-inference binding, ceiling preservation, selected-only loading, and digest-stable recovery. `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:207-221`, `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:257-284`, `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:294-307`.

## source ledger and exclusions

The inspected evidence was limited to the bound mission and binding, the selected Oracle entrypoint and required operating contract, Godagents current runtime, mission binder, admitted local launcher, its v3 integration receipt and mission-binding design, and Godskills runtime manifest, receipts, and release-status record. The paired result, all external sources, all network access, source execution, and source-repository writes were excluded.
