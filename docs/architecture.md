# Godagent v0 architecture

The implementation authority is [ADR-0002](C:/dev/eternities-canon/.worktrees/godagents-inspiration-covenant/architecture/ADR-0002-godagent-v0-runtime-and-foundry.md). The certified v0 local single-agent proof remains intact. The post-v0 networked-cortex boundary is specified in [the networked cortex and local host design](superpowers/specs/2026-08-29-networked-cortex-host-design.md).

The [Godskills System v3 mission-binding design](superpowers/specs/2026-08-30-godskills-v3-mission-binding-design.md) adds a separate operational capability boundary. A host-pinned release is verified before mission use, capability policy remains genome-owned, and each mission receives only its receipt-bound selected stack before cortex inference. Godskills can shape method, evidence, proposal requirements, risk obligations, preconditions, and termination conditions, but cannot grant authority or alter identity, constitution, Realm hands, evolution, credentials, budgets, or personal-keel ownership. Compatible release changes use body-free migration receipts; capability-envelope expansion requires governed evolution. The exact integrated proof is the [Godskills v3 receipt](../receipts/godskills-v3-integration.json).

The optional [trusted adaptive activation design](superpowers/specs/2026-08-31-trusted-adaptive-activation-adapter-design.md) keeps activation ownership in Godskills. Godagents verifies a host-pinned executable receipt and its exact first-party dependency closure, gives a host classifier only the minimal mission and selected-identity projection, and passes the resulting classification with the unchanged authority projection to a provider-neutral transport. The external compiler selects `native`, `guardrail`, `method`, or deferred `review`; Godagents validates every echoed identity, digest, decision, disclosure boundary, and authority field before loading the permitted package. Routing and activation occur after mission, genome, Realm, and host ceilings are known but before cortex inference. Recovery revalidates the stored activation result without routing, classification, an external activation-compiler call, or process execution, then rereads the exact digest-pinned selected artifacts and requires its deterministic package reconstruction to match the durable stack and package digests. Partial adaptive configuration fails closed, while old release pins retain the historical binding path. The exact cross-repository proof is the [adaptive activation receipt](../receipts/godskills-adaptive-activation-v1.json).

The model proposes. The constitutional arbiter commits. The Realm Contract governs effects. The journal preserves causal continuity. The Soul port remains dormant.

## Implemented components

| component | responsibility |
| --- | --- |
| foundry | verifies the genome, Prompt OS artifact, Realm capabilities, source hashes, and deterministic distribution |
| vessel | admits one mission and owns the observation, proposal, decision, action, consequence, and recovery lifecycle |
| cortex adapter | produces typed proposals without receiving a hand or continuity writer |
| scheduler | runs organs concurrently against frozen state and returns canonical proposal order |
| constitutional arbiter | selects one admissible proposal using constitution, authority, preconditions, epoch, expiry, cost, and priority |
| Godskills adapter | verifies release and optional activation roots, routes within genome and host ceilings, validates externally compiled activation, and discloses only the selected bounded package before cortex inference |
| Realm adapter | exposes typed observation, idempotent invocation, reconciliation, and inspection surfaces |
| action gateway | checks committed authority and closes expected outcomes against observations |
| continuity store | writes hash-chained JSONL, immutable snapshots, verified replay, and quarantined tails |
| memory admission | preserves source class and forbids foreign content from entering as lived history |
| Soul port | returns only the frozen state `{ "schemaVersion": 1, "status": "dormant" }` |
| creation forge | validates nine modular selections against a separately digested ceiling and compiles deterministic pre-genesis artifacts |
| genesis coordinator | binds one verified creation and distribution to one journal, one isolated keel, and one admission receipt through an idempotent state machine |
| keel reference backend | maintains isolated append-only personal-keel namespaces with hash-chain verification, ownership uniqueness, quarantine, and crash-safe locks |
| persistent vessel wrapper | refuses partial genesis, re-verifies both continuity chains on wake, and preserves identity across cortex replacement |
| temporary-worker boundary | projects bounded external context and proposal authority without exposing a personal-keel capability |
| creator protocol | exposes a headless catalog, immutable commands, preset replay, pure preview, review sealing, and reviewed finalization through the existing creation compiler |
| local creator shell | maps strict local operator arguments to bounded catalog, preset preview, and explicitly digest-approved finalization output |
| visual creator shell | presents fixed presets and exact review evidence over a token-gated loopback boundary, then confines approved finalization below one configured workspace |
| local admission shell | snapshots one verified creation and compatible local distribution, then composes transactional genesis beneath one exact-bound workspace without starting runtime execution |

## Phase 1 creation boundary

Creation is a compiler boundary, not a birth event. A strict candidate selects one lineage, archetype, attribute set, personality, voice, organ loadout, Godskills bundle, cortex class, and embodiment. The loader resolves canonical references, rejects collisions and kind mismatches, and recursively blocks authority, credentials, provider routing, retry controls, Inspiration state, and Soul state from module payloads.

The creation policy is a compile-time ceiling pinned by an expected SHA-256 supplied independently from the selected policy path. The loader rejects a missing or mismatched pin before using the ceiling. The policy can reject candidate effects, adapters, capabilities, Godskills contracts, entrypoints, composition counts, and Realm requirements, but it cannot grant runtime host authority. Compatibility then verifies generic module tags, lineage-archetype tags, organ and Godskill membership, capability families, embodiment requirements, frozen evolution, dormant Soul, and bounded deterministic attributes. Phase 1 rejects module inheritance instead of preserving unresolved base references.

Only the strict v0 operational projection enters `agent-genome.json`. Expression and presentation remain in `expression-overlay.json`; selected module references and digests remain in `module-manifest.json`; creator input and the policy ceiling remain separate canonical artifacts. The build manifest binds all five content artifacts, derived attributes, validation rows, and the exact omitted components.

Phase 1 proof rows are:

- `GF-001`: deterministic pre-genesis build
- `GF-002`: expression authority firewall
- `GF-003`: meaningful lineage and archetype projection without authority
- `GF-004`: bounded deterministic attributes
- `GF-005`: preset and manual path equivalence
- `GF-010`: frozen evolution refusal
- `GF-011`: dormant Soul refusal

No Phase 1 artifact is a vessel, keel, genesis receipt, creator interface, evolution engine, or Soul runtime. Those remain later boundaries with separate admission and rollback designs.

## Phase 3 headless creator boundary

The creator protocol is the deterministic input layer above the Phase 1 compiler. It does not duplicate creation semantics. It validates direct catalog sources, gives the catalog a content identity, and exposes modules, expressions, and presets only through closed projections and resolving methods. Source freshness is reverified after review and before filesystem writes.

Creator drafts are immutable digest-linked revisions. Every command must name the exact current draft digest, so stale or reordered interaction fails without mutation. Presets are validated ordered choice streams replayed through the same command function as manual choices. A future visual shell, conversational guide, or autonomous designer remains a replaceable client of this protocol and receives no alternate authority path.

Preview is pure and has three closed states: incomplete, blocked, or ready. A ready preview contains the exact candidate, expression, derived attributes, and operational genome that finalization will use. Review seals bind the catalog, draft, and preview digests. Finalization captures the reviewed policy and selected modules, reloads the source library for freshness, requires the independent creation-policy digest pin, rejects occupied targets, and writes a transaction-owned immutable snapshot containing candidate, expression, policy, and selected modules. The existing Phase 1 compiler reads only that snapshot. Finalization reports no success unless the compiled module rows equal the reviewed source digests and the finalized genome digest equals the reviewed preview.

The boundary ends at a verified creation build. It does not perform genesis admission, create a persistent vessel, bind a keel, contact a model, choose runtime policy, grant Realm authority, evolve an agent, or activate Inspiration or Soul. Phase 3 certifies `GC-001` through `GC-008` with manual/preset parity, fail-before-write substitution tests, two isolated byte-identical fixture roots, the guarded complete suite, and unchanged historical receipts.

The first local shell consumes this boundary through a reusable operator workflow. It accepts fixed library paths and the separate policy digest, exposes only the bounded catalog or review projection, and requires the exact current preview digest before finalization. Its parser rejects unknown and command-inapplicable options, while its process boundary emits canonical success values or closed failure codes without raw exception text. The shell has no privileged preset path and no access to genesis, cortex, Realm, keel, evolution, Inspiration, or Soul capabilities.

The visual shell consumes that same operator workflow rather than reimplementing creation. A loopback-only server serves fixed self-contained assets, issues a random per-launch token, requires that token on every API route, and derives transaction paths only beneath an operator-configured workspace. The browser receives closed catalog and preview projections, never source paths or mutable source access. Any selection or identity change clears review acknowledgement. The server mints one-use confirmation only for the exact recomputed ready preview, then finalization builds inside an unpredictable atomically created staging directory and publishes to the reviewed digest path. Real-path and reparse-point checks prevent a known digest or junction from redirecting writes. Browser-facing errors remain closed and the server exposes no genesis or runtime capability.

Modular composition treats a validated preset as a sealed foundation rather than a privileged alternate compiler. The operator supplies one final expression and exactly one module reference for each closed module kind. The workflow replays the foundation, applies only necessary replacements through ordinary digest-linked commands in canonical order, and then uses the same preview and finalization path. Default composition is therefore identical to preset replay, click order cannot affect identity, and incompatible mixtures remain blocked. Foundation-controlled telos, constitution, Prompt OS, memory policy, Realm requirements, evolution, and dormant Soul state are not browser-editable.

## Visual creator shell v1 certification boundary

The visual certificate is append-only and separate from the immutable Phase 3 protocol receipt. It proves the local shell as a deterministic transport and review client: loopback binding, per-launch token enforcement across every fixed API route, operator-workflow parity, exactly nine kind-matched module selections plus one expression, one-use acknowledgement of the exact ready preview, workspace and junction confinement, fixed self-contained assets, closed errors, and two byte-identical pure-handler finalizations of the certified Aether build.

The certificate does not elevate the browser into an authority boundary. It does not certify hosted deployment, accounts, multi-user persistence, accessibility conformance, localization, analytics, recommendation quality, genesis admission, model routing, Realm action, keel continuity, governed evolution, Inspiration, Lunari integration, or Soul activation. Those require independent designs and receipts.

## Local creation admission boundary

The local admission shell is the first operator-facing composition of the frozen creation, foundry, and transactional-genesis layers. It verifies and snapshots a reviewed creation build plus exact Prompt OS and Realm inputs before creating a dedicated workspace. The verified genome must require exactly the capability set supplied by the Realm contract. A canonical binding then owns the immutable creation and distribution snapshots, transaction, journal, and local keel paths beneath one workspace.

Only an exact retry may reuse that workspace. Transactional genesis retains its crash-safe recovery and independent receipt verification. The shell returns a bounded admission projection but does not construct or start a persistent vessel, load runtime host policy, contact a model, invoke a Realm hand, lift frozen evolution, activate Inspiration, integrate Lunari, or activate Soul.

The separate `local-admission-shell-v1` receipt certifies this exact trusted-local boundary through two byte-identical fixed-clock admissions, all publication and genesis interruption tests, the complete guarded suite, source and test manifests, and unchanged historical receipts. It explicitly excludes concurrent hostile path manipulation under the same Windows user rather than presenting Node path checks as OS isolation.

## Admitted local launch boundary

The admitted launcher composes, but does not replace, the local admission and networked host boundaries. A separately pinned host policy must resolve its distribution, journal, snapshot, and instance references exactly to one admission binding. An OS-account-local residency registry, rooted from account information supplied by the operating system rather than launch environment variables, claims one canonical admission root per persistent instance and rejects ordinary copied roots; a future explicit relocation protocol must transfer that claim rather than duplicate it. The launcher rejects current reparse points and unexpected entry kinds, verifies the complete genesis admission before constructing provider or Realm runtime components, and then constructs only through the persistent-vessel wrapper. That wrapper repeats admission verification on wake and before every cycle.

The launch boundary holds one live-owner admission lock across request projection, recovery, inference, and action, preventing a concurrent process from mistaking active work for a crash. Its local reference Realm stores state and idempotency outcomes canonically beneath the admission-owned vessel directory so process restart does not erase governed effect state. The boundary executes one mission per process and returns only bounded identity and action references. Provider policy remains runtime authority rather than agent identity. The shell does not certify provider quality, background operation, hostile same-user OS isolation, cross-machine residency, general Realm durability, evolution, Inspiration, Lunari, or Soul activation. A separate append-only certification is required before describing this implementation as certified.

## Phase 2 transactional genesis boundary

Phase 2 converts a verified pre-genesis build into an admitted genesis result only after one deterministic transaction binds every immutable identity and continuity surface. The caller independently pins the creation-policy digest and creation-build ID. The coordinator derives the distribution-build and both genome digests from verified artifacts and checks their cross-artifact consistency. Genesis derives stable `genesisId` and `keelId` values from those verified values plus the instance and creator references; identity reuse with different bound data is rejected.

The coordinator advances one closed state chain:

```text
prepared -> keel-prepared -> journal-prepared -> mutually-bound -> admitted
    \-------------------------------------------------------> aborted
    \----------------------------------------------------> quarantined
```

Preparation creates one isolated keel namespace and one vessel journal. The journal's `vessel.created` and `genesis.bound` events and the keel's `binding` record cross-reference the same deterministic genesis identity. A canonical receipt binds their exact heads and transaction-state digest. The coordinator writes the receipt, advances durable state to `admitted`, and then independently re-reads and verifies the receipt, state file, creation build, distribution, journal, and keel before returning. A crash after the durable admission transition is safe: retry re-verifies the entire admitted boundary before exposing the result.

Recovery is exact-idempotent. A retry continues the next missing durable transition, an admitted transaction is reverified without duplicate rows, and an aborted or quarantined transaction is never silently revived. Committed evidence is preserved for audit. Dead or expired malformed lock files can be atomically reclaimed after a grace period; live and recent locks remain fail-closed.

The admitted wrapper wakes both continuity chains before every persistent run. Cortex replacement changes only the proposal source. Checkpoint promotion records reciprocal journal and keel provenance, while temporary workers have no personal-keel write surface. Phase 2 proves `GF-006`, `GF-007`, `GF-008`, `GF-009`, and `GF-012`; it does not prove creator UI, evolution, hosted durability, collective memory, Lunari integration, live-provider quality, or Soul activation.

## Networked cortex extension

The OpenAI-compatible adapter implements the same proposal-only cortex role through an injected HTTPS transport. It prepares a deterministic semantic request digest, returns only strict typed proposal results, and classifies malformed or failed provider responses into closed reason codes. Raw requests, raw responses, headers, exception messages, credentials, and free-form provider-authored prose cannot enter the accepted proposal. Reflected credentials and credential-shaped nested fields fail closed.

The local host loads one strict policy that defines non-secret provider configuration, bounded retry, prompt and completion budgets, authority, Realm identity, and Godskills constraints. Its canonical digest must match an operator-supplied `GODAGENT_POLICY_SHA256` pin before credential resolution. Authority is copied from this validated policy into the admitted mission; mission text cannot grant or expand it. Credentials are available only through an in-memory resolver closure.

Each Realm hand declares a strict input schema and expected-outcome derivation. The adapter checks these constraints before accepting a proposal, and the action gateway independently checks them against a fresh pre-action observation before invoking the hand. For the fixture Realm, `counter.increment` permits exactly `{ "amount": 1 }` and exactly the observed counter plus one.

Inference attempts form a separate durable lifecycle before constitutional decision:

```text
cortex.requested -> cortex.accepted + proposal | cortex.failed(reasonCode)
```

Recovery after durable acceptance reuses the journaled proposal. Recovery after an unresolved request may spend only the next policy-authorized attempt. Prompt bytes, completion tokens per attempt, and reserved completion tokens per cycle are bounded before transport. This economic retry ledger is separate from Realm action idempotency.

## Trust order

The compiled constitution, exact distribution manifest, verified host context, and Realm Contract are trusted only through their declared loading paths and digests. Cortex output, Realm content, retrieved material, imported memories, and Godskill suggestions remain typed data. None can manufacture authority.

## Proof boundary

The two fixture cortexes prove replacement mechanics, not equivalent intelligence between commercial models. The networked adapter proof uses fake transports and does not establish live-provider compatibility, quality, latency, or cost. The counter Realm proves effect governance and recovery, not a general simulation platform. Project Sid informed the concurrency, bottleneck, and action-awareness tests but no Project Sid code or media enters this repository.

The certification ledger verifier checks canonical receipt bytes, each receipt's internal digest, certified status, source-commit existence in the current Git object database, the exact registered receipt set, and each version's exact required historical file set and hashes. It does not rerun tests, builds, failure injection, external review, or prove that a resolving commit is an ancestor of the current branch. Proof reproduction still requires checking out each receipt's pinned source commit and running its certifier. The adaptive receipt additionally binds the exact pushed Godskills commit and executable closure. Its zero-valued boundary metrics are derived from exact named passing tests, not claimed as production runtime telemetry. It does not prove production observation, an executed deferred-review phase, model-quality improvement, arbitrary provider equivalence, public SDK readiness, specialist preference quality, or Lunari integration readiness.

The separate release-lineage gate binds that verified ledger to one resolved release head and requires every receipt source commit to be its ancestor. Its digest identifies the head and ledger relationship only. Current-head behavioral certification still requires a new certifier and append-only receipt rather than reinterpretation of historical evidence.
