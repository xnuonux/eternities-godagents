# Godagent v0 architecture

The implementation authority is [ADR-0002](C:/dev/eternities-canon/.worktrees/godagents-inspiration-covenant/architecture/ADR-0002-godagent-v0-runtime-and-foundry.md). The certified v0 local single-agent proof remains intact. The post-v0 networked-cortex boundary is specified in [the networked cortex and local host design](superpowers/specs/2026-08-29-networked-cortex-host-design.md).

The [Godskills System v3 mission-binding design](superpowers/specs/2026-08-30-godskills-v3-mission-binding-design.md) adds a separate operational capability boundary. A host-pinned release is verified before mission use, capability policy remains genome-owned, and each mission receives only its receipt-bound selected stack before cortex inference. Godskills can shape method, evidence, proposal requirements, risk obligations, preconditions, and termination conditions, but cannot grant authority or alter identity, constitution, Realm hands, evolution, credentials, budgets, or personal-keel ownership. Compatible release changes use body-free migration receipts; capability-envelope expansion requires governed evolution. The exact integrated proof is the [Godskills v3 receipt](../receipts/godskills-v3-integration.json).

The optional [trusted adaptive activation design](superpowers/specs/2026-08-31-trusted-adaptive-activation-adapter-design.md) keeps activation ownership in Godskills. Godagents verifies a host-pinned executable receipt and its exact first-party dependency closure, gives a host classifier only the minimal mission and selected-identity projection, and passes the resulting classification with the unchanged authority projection to a provider-neutral transport. The external compiler selects `native`, `guardrail`, `method`, or deferred `review`; Godagents validates every echoed identity, digest, decision, disclosure boundary, and authority field before loading the permitted package. Routing and activation occur after mission, genome, Realm, and host ceilings are known but before cortex inference. Recovery revalidates the stored activation result without routing, classification, an external activation-compiler call, or process execution, then rereads the exact digest-pinned selected artifacts and requires its deterministic package reconstruction to match the durable stack and package digests. Partial adaptive configuration fails closed, while old release pins retain the historical binding path. The exact cross-repository proof is the [adaptive activation receipt](../receipts/godskills-adaptive-activation-v1.json).

The optional [specialist preference design](superpowers/specs/2026-08-31-specialist-preference-adapter-v1-design.md) adds a narrower ranking-only extension. A specialist forwards the exact preferred capability ids already derived from its genome and the verified portable manifest only when the host pins the separate Godskills preference receipt and complete executable closure. All-rounders and legacy releases emit no preference field. Non-preferred capabilities remain eligible and win every stronger ordinary comparison. The source envelope and cycle receipt bind the preference root, supplied ids, disposition, and selected identity; recovery validates that binding and never reroutes. The exact cross-repository proof is the [specialist preference receipt](../receipts/godskills-specialist-preference-v1.json).

The [Cortex Binding Protocol design](superpowers/specs/2026-08-30-godagent-cortex-binding-protocol-design.md) defines how a replaceable Codex task can later host one persistent Godagent without treating shared instructions or prompt text as identity. Phase 1 verifies one admitted genesis, immutable creation and distribution snapshots, and the current personal-keel head, then compiles a full identity envelope plus a deterministic byte-bounded model projection. Phase 2 admits that inert candidate into one atomic digest-chained binding registry and holds the admission-owned launch lock as its exclusive personal-keel writer lease. Active receipts remain credential-free and grant no Realm effects.

The model proposes. The constitutional arbiter commits. The Realm Contract governs effects. The journal preserves causal continuity. The Soul port remains dormant.

## Implemented components

| component | responsibility |
| --- | --- |
| foundry | verifies the genome, Prompt OS artifact, Realm capabilities, source hashes, and deterministic distribution |
| vessel | admits one mission and owns the observation, proposal, decision, action, consequence, and recovery lifecycle |
| cortex adapter | produces typed proposals without receiving a hand or continuity writer |
| scheduler | runs organs concurrently against frozen state and returns canonical proposal order |
| constitutional arbiter | selects one admissible proposal using constitution, authority, preconditions, epoch, expiry, cost, and priority |
| Godskills adapter | verifies release plus optional activation and preference roots, routes within genome and host ceilings, validates externally compiled activation and ranking receipts, and discloses only the selected bounded package before cortex inference |
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
| cortex binding compiler | derives one inert, content-addressed identity candidate and bounded model projection from a verified admission without task mutation, authority, or continuity writes |
| cortex binding registry | serializes task and personal-keel ownership, issues credential-free active and lifecycle receipts, re-verifies renewal sources, records revocation and expiry, and shares the admitted-launch writer lock |
| Codex bound-turn host | reserves or identifies one task, acquires a per-turn binding lease, dispatches one sealed task-scoped envelope through a trusted transport, verifies exact response bytes, and chains host receipts without transcript replay |
| recoverable Codex turn journal | preserves one bounded digest-chained transaction per operation, separates untrusted response blobs from trusted metadata, and reconstructs the next legal recovery action without performing it |

## Cortex binding phase 1 boundary

The compiler accepts two inputs: the complete verification arguments for one local admission and a strict request containing only an opaque task id, host-adapter id, revocation epoch, bounded mission projection, and maximum model-projection bytes. Identity is reconstructed from the admitted receipt, creation candidate, expression, module manifest, operational genome, distribution Realm contract, and current verified keel head. The caller cannot submit a name, lineage, archetype, personality, voice, constitution, authority, path, transcript, history, credential, or raw model prompt through this boundary.

The canonical full envelope contains binding, identity, expression, continuity, mission, capability, authority, and causal sections plus exact digests for each section. The continuity section carries only the verified keel identity, state, record count, admitted head, and current head. It does not copy the keel chain. The capability section names verified compatibility and module identities but selects no active Godskill contract. The authority section records the constitutional and Realm ceilings while keeping `grantedEffects` empty and every declared effect blocked until a later host-issued binding receipt, registry admission, and exclusive writer lease exist.

The model projection always keeps the binding header, identity, mission, inert authority, causal state, and section-digest map. If the declared byte budget requires compaction, expression, capability, and continuity are replaced in that order by exact digest references. A budget that cannot hold the mandatory projection fails closed. The candidate id excludes mission text, so a mission can change work without redefining the actor, while the current keel head and target task surface remain bound into the candidate identity.

Phase 1 has no task-control adapter, binding registry, writer lease, provider call, Realm invocation, continuity admission, or Soul activation. A copied candidate remains powerless.

## Cortex binding phase 2 boundary

The phase 2 registry is one canonical atomically replaced event chain protected by a short-lived registry lock. Replaying the verified chain reconstructs all active and terminal records, task collisions, personal-keel and instance writer collisions, and revocation floors without a secondary index that could diverge after interruption. Every mutation first records any newly expired durable lease. A bounded registry input is rejected before JSON parsing, and semantic replay verifies exact payloads, monotonic ordering, linked event digests, lifecycle transitions, lease identity, and epoch progression.

Acquisition verifies the inert candidate before taking the admission-owned `vessel/launch.lock`, claims the existing OS-account-local instance residency, then verifies the candidate again while holding that lock. Any changed candidate, identity, keel head, task claim, or epoch aborts before activation. The live handle alone retains the usable random lease credential and writer-lock capability. Registry state, active receipts, lifecycle receipts, and inspection projections expose only its digest or public lease identity.

Renewal extends only the same binding after fresh admission verification. Release and revocation durably close the binding before releasing the process lock, and transient lock-release failure remains retryable from the same terminal handle. Expiry releases a live handle when inspection or renewal discovers it; abandoned-process recovery still requires dead-owner and stale-grace reclamation by the shared file-lock primitive. An active receipt grants only a host-held lease marker and no Realm effect. Phase 2 still has no Codex task-control adapter, model invocation, context injection, Godskill activation, continuity-content writer, task-migration protocol, Lunari integration, or Soul activation.

## Codex bound-turn phase 3 boundary

The phase-3 host accepts a strict mission-shaped turn request with no identity, authority, transcript, path, credential, or model-routing fields. Create first asks a trusted task transport for a suspended reservation whose receipt states that no model started. Continue and compaction-resume instead verify one parent host receipt against the exact existing task and admitted actor. All three operations acquire a fresh phase-2 lease, compile the phase-1 candidate again, and require its candidate, identity, task, and keel-head digests to equal the active binding receipt before dispatch.

The sealed envelope binds the operation, parent receipt, transport descriptor, active binding, and exact compact model projection under one canonical digest. Fixed host rules identify the cortex as proposal-only and deny self-admission, continuity admission, and Realm effects. The trusted transport receipt binds that digest and the exact UTF-8 response bytes. The final host receipt additionally binds the reservation for create, task and actor identity, active and released lifecycle receipts, replaceable cortex id, and zero admitted authority. Model output remains untrusted text beside the receipt.

Version 1 closes its writer lease after every accepted or rejected dispatch. A later turn can therefore carry a different mission and cortex while preserving the actor through verified sources and the parent receipt chain. This avoids misrepresenting the phase-2 mission-specific candidate as a permanent multi-mission session. The current public Codex app task controls cannot satisfy the suspended-reservation and trusted execution-receipt contract, so live app wiring remains excluded rather than approximated with prompt echoes, task titles, current directories, or global instruction edits.

## Recoverable Codex turn journal boundary

The journal owns no external capability. It atomically records a closed transaction vocabulary under one operation-id slot and semantically replays the complete chain on every read. The opening event binds operation, turn, request, parent, task-transport descriptor, cortex, and optional existing task. A create task can enter only through a verified suspended-reservation receipt. Each ordinal attempt then binds one phase-2 active receipt and exact phase-3 dispatch.

An uncertain prepared dispatch remains distinguishable from a verified completion. Completion requires the phase-3 transport receipt, a trusted execution witness over the exact dispatch and response, and execution times contained by the active binding lease. The response itself is an untrusted content-addressed blob outside journal metadata. Acceptance additionally requires the exact released lifecycle receipt and phase-3 host receipt to agree on task, actor, binding, parent, envelope, transport, cortex, and response.

The recovery projection names only the next legal host action. It cannot execute that action, admit continuity, select a skill, write a personal keel, invoke a Realm hand, or establish that the current public Codex task controls implement the future reconciliation contract.

## Recoverable Codex turn coordinator boundary

The coordinator is the first executable composition of the phase-1 candidate compiler, phase-2 binding registry, phase-3 sealed turn, and recoverable journal. A task transport must supply both the strict task-control descriptor and a recovery descriptor promising terminal reservation lookup by operation, terminal dispatch lookup by canonical dispatch digest, and a lease-bounded execution witness. Their canonical binding digest enters the reservation intent, sealed envelope, journal opening, and accepted receipt.

Create always reconciles its suspended reservation before reserving. Every prepared attempt is journaled before dispatch, and every possible dispatch is preceded by exact reconciliation. An orphan active binding is retryable pending, never evidence that the dispatch was absent. Once an undispatched orphan is terminal, the coordinator records its lifecycle and abandonment before allocating a new ordinal. A journaled or reconciled completion cannot be abandoned.

Ordinary completion closes through a released lease. Reconstruction after process death may close through expiry only when the execution witness proves the exact response began and completed inside the original lease. Revocation quarantines. Acceptance cross-binds the pre-acceptance journal head and execution receipt with every existing task, actor, parent, binding, envelope, cortex, transport, and response digest. Exact accepted replay reads the content-addressed response without transport use. Output text remains proposal-only and cannot mint identity, continuity, Godskills, Realm, or receipt authority.

This is a provider-neutral injected contract, not a live Codex desktop integration. Terminal reconciliation and atomic dispatch deduplication remain responsibilities of a trusted adapter. The boundary handles no provider credential, task migration, continuity-content admission, Godskills activation, Realm effect, daemon lifecycle, cross-machine replication, or hostile same-user isolation.

## Resumable mission review kernel boundary

The mission review kernel is a separate durable state machine for one admitted mission. Its authority-empty executor descriptors, exact phase requests, canonical artifacts, phase results, verdict, and terminal completion are closed contracts. A native artifact must be committed before a deferred review can be materialized. The only review path is native, optional first review, optional one revision, and mandatory final review, with no branch that can exceed two reviews or one revision.

Each prepared request binds its ordered prior artifacts and reserved completion ceiling. The journal records preparation before dispatch and reconciles the exact request before every possible execution. Completed external work can therefore be recovered after process death without redispatch, while absent, pending, ambiguous, substituted, authority-bearing, or over-budget evidence fails closed. Exact terminal replay is read-only and performs no executor calls.

The kernel consumes a separately pinned body-free Godskills activation result but does not itself run a real evaluator package. Its deterministic certification uses trusted injected executors to prove ordering, crash recovery, deduplication, token accounting, authority non-expansion, and zero Realm effects. Provider credentials, model quality, hostile-executor isolation, default vessel integration, Codex task transport, continuity admission, personal-keel writes, Realm action, Lunari, Inspiration, and Soul remain outside this boundary.

## Deferred Godskills review materialization boundary

The review materializer is the first post-native disclosure boundary. It verifies the complete pinned Godskills release at construction but does not read deferred capability entrypoints or contracts. For each materialization it first verifies the mission admission, exact review request and descriptor, round-specific artifact context, release and activation roots, and every deferred capability descriptor. It opens no selected body until that full set passes, preventing a later invalid descriptor from leaking an earlier valid body.

Round one binds one canonical native artifact. Round two binds one canonical revision, its exact prior review, and the native digest carried through both. The output package records the mission, request, executor, completion ceiling, release, cycle, activation, capability, subject, and prior-review digests. Selected entrypoint and contract text remain exact source bytes represented as UTF-8. Package verification reparses the contract, checks both body hashes, checks the authority-empty projection, and recomputes the complete package digest and byte ceiling. The parsed contract is not duplicated into the package, avoiding repeated review context without sacrificing exact-byte verification.

The release cache is outside the trust boundary. Only verifier-issued entries held in an internal cache may be reused, and the capability map exposed to a caller is a defensive copy. Preloading a caller-owned cache or mutating a returned map therefore cannot replace the verified release state used by a later materialization.

This materializer alone is not the review transport. It selects no model or provider, resolves no credential, performs no model call, owns no durable journal transition, and grants no Realm, continuity, identity, evolution, Soul, or personal-keel authority. The mission review kernel remains the ordering authority.

## Deferred Godskills review executor boundary

The provider-neutral review executor composes the verified materializer with one injected transport. Its content-addressed executor identity binds the exact Godskills release, activation root, materializer, and closed transport descriptor. The transport descriptor promises terminal reconciliation and atomic deduplication by dispatch digest while carrying no provider, model, endpoint, credential, retry, Realm, continuity, identity, evolution, personal-keel, or Soul authority.

Review reconciliation and execution receive the same immutable admission and committed artifact context from the mission kernel. The executor rematerializes and verifies the selected package before either operation, then constructs one dispatch binding every request, package, executor, transport, token, and authority identity. Only an exact `absent` reconciliation permits execution. `pending` waits, `completed` recovers, and ambiguous states fail closed. A completion must bind the dispatch, contain one strict review artifact, preserve separated token accounting, fit its byte ceiling, and remain authority-empty. Its digest is committed as optional executor evidence in the ordinary mission phase result.

The deterministic recovery proof interrupts after the transport has completed but before the journal commits the review. A newly constructed executor independently reproduces the dispatch, recovers the existing completion, and closes the mission without another execution. This proves the adapter and local journal composition against a trusted injected transport, not the transport implementation itself, a live provider, review quality, hostile same-user isolation, a revision adapter, default vessel or Codex desktop wiring, Realm action, continuity admission, Lunari, Inspiration, or Soul.

## Recoverable mission revision executor boundary

The revision executor consumes the exact admission, native artifact, and first committed `revise` review. Its deterministic package carries only the mission, artifact references and bytes, compact required-finding ids, executor identity, and admitted artifact and completion ceilings. It does not reopen Godskill entrypoints or contracts. Package construction verifies the request roles and digests, the review-to-native subject link, the revise recommendation, sorted required findings, and both input artifact ceilings before any transport operation.

The separate revision transport protocol preserves the review-v1 wire bytes while applying the same recovery law: exact dispatch reconciliation precedes every possible execution, and only `absent` permits dispatch. A completion must bind every package and executor identity, contain one strict revision artifact, address all required and only known findings, fit the admitted artifact and transport byte ceilings, preserve separated token accounting, carry coherent times, and remain authority-empty. The completion digest enters the ordinary phase result as executor evidence, while the mission journal alone commits the revision.

The full-loop proof commits a native artifact and first Godskills review, interrupts after completed revision transport work, reconstructs the kernel and both real executors, recovers the revision without redispatch, and subjects that exact revision to the second Godskills review before terminal acceptance. This still trusts the injected transports' terminal lookup and atomic deduplication promises. It does not prove live model quality, hostile same-user isolation, a native executor adapter, default vessel or Codex desktop wiring, Realm action, continuity admission, Lunari, Inspiration, or Soul.

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
