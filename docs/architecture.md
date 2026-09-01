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

## Recoverable mission native executor boundary

The native executor closes the first external inference boundary without converting mission output into Realm authority. The kernel supplies the exact admission, mission, and compatible Godskills projection. The native materializer verifies their equality against the prepared native request, then emits one bounded content-generation package. Native-only admission emits `godskills: null`; a bound admission carries only its exact binding digest, package digest, and already-authorized cortex package. It reads no files, resolves no credentials, loads no additional skill, and rejects any deferred review body in pre-inference disclosure.

The native transport is separately versioned but follows the same recovery law as review and revision. Its descriptor is authority-empty and promises terminal lookup plus atomic deduplication by exact dispatch digest. Only an exact `absent` reconciliation grants one execution. Pending, completed, ambiguous, changed, over-budget, oversized, credential-shaped, or authority-bearing state cannot dispatch. The completion contains one strict native artifact, separated usage, coherent times, and a digest committed into the mission phase result as executor evidence.

The full real-executor proof interrupts after the native transport completes but before journal commitment. Reconstruction reproduces the exact native dispatch, recovers without redispatch, and passes the recovered artifact through real deferred review, revision, and final review executors to terminal acceptance. This certifies local composition against trusted injected transports, not a live provider, output quality, hostile same-user isolation, provider credentials, model routing, default vessel wiring, Codex desktop controls, Realm action, continuity admission, Lunari, Inspiration, or Soul.

## Identity-bound mission vessel boundary

The identity-bound mission vessel is the first default provider-neutral composition of the admitted-genesis, Cortex Binding, adaptive Godskills, and recoverable mission-runtime boundaries. Its external request is closed and credential-free. The verified genesis is a constructor dependency, and the vessel itself compiles the inert Cortex Binding candidate. A caller cannot substitute identity, constitution, Realm contract identity, personal-keel head, or a precompiled model projection.

One immutable vessel admission binds the complete request digest, genesis and keel identities, candidate, full-envelope, and model-projection digests, actual Godskills route and adaptive activation result, and exact mission-kernel admission. First admission routes and activates once under a per-mission publication lock. Recovery recompiles the candidate from verified sources and invokes only Godskills rehydration against the stored receipt. Any request, identity, release, projection, route, package, ceiling, or admission drift fails before executor use. No-qualified routing remains explicitly recorded while the kernel receives a native-only admission. An unresolved routing decision creates no vessel and dispatches nothing.

The native wrapper preserves the certified mission-native transport surface while deriving its descriptor from the vessel admission, identity candidate, model projection, and separately declared inner transport. The inner dispatch carries the exact bounded model projection beside the exact native mission package. It remains credential-free and authority-empty. Only exact absent reconciliation grants execution; pending waits, completed recovers, and ambiguous state fails. A verified inner completion becomes an ordinary native completion, leaving the mission kernel as the only phase-order and artifact-commit authority.

The deterministic proof uses the actual pinned Godskills release and adaptive activation adapter. Review mode exposes no selected Godskill body before native inference. It interrupts after the inner native transport completes, reconstructs every process-local component, rehydrates without routing, classification, or activation, recovers the same dispatch without redispatch, and finishes real review, revision, and final review. Terminal replay performs no external phase or activation work. Realm action, continuity admission, personal-keel writes, identity ownership, evolution, Inspiration, and Soul remain absent.

This boundary still trusts each injected transport's terminal lookup and atomic deduplication promise. It does not qualify live providers or output quality. Its original narrow crash window after a first external activation result but before immutable vessel publication is closed by the recoverable Godskills admission boundary below.

## Recoverable Godskills admission boundary

The recoverable admission layer wraps the pinned Godskills adapter while leaving routing policy, activation policy, selected-package materialization, and semantic receipt validation under that adapter's control. Before either external stage can run, one mission id publishes an immutable binding intent containing the complete binding input and release identity. Changed input or release data collides before any transport call.

Routing and activation each use a strict authority-empty descriptor, immutable content-addressed dispatch, and strict completion. The operation record is published before transport use. Reconstruction first checks a locally published completion and then asks the injected transport for the exact dispatch digest. Only an exact `absent` answer permits one execution. `completed` recovers, `pending` returns a closed wait projection, and `ambiguous` fails. The transport remains responsible for truthful terminal lookup and atomic deduplication.

After both recovered results pass the existing Godskills validators, one immutable final binding record is published. Exact replay performs no routing, classification, or activation, although semantic rehydration may read a selected method body when the pinned activation mode requires it. An interrupted activation that reclassifies differently collides with its already published request and fails before another external call. Pending admission creates no vessel record and invokes no native cognition.

The deterministic end-to-end proof interrupts after route execution, after activation execution, and after native execution in successive reconstructed processes. Route, activation, and native cognition each execute exactly once. The recovered vessel then performs real deferred review, revision, and final review, and terminal replay makes zero external calls. This closes duplicate pre-publication Godskills work without adding credentials, provider routing, Realm effects, continuity authority, personal-keel writes, identity mutation, evolution, Inspiration, or Soul.

## Recoverable typed-composition compiler boundary

The optional typed compiler composes the recoverable Godskills admission layer with the separately pinned typed-composition consumer. Before routing, a caller supplies one closed topology containing mission inputs, capability nodes, phases, typed links, terminal outputs, an authority projection, and a context ceiling. It contains no policy digest, activation root, activation-result digest, or activation-decision digest. Unknown references, duplicate input bindings, multiple artifact owners, duplicate phase owners, graph cycles, and consumed terminal outputs fail before either external stage.

One immutable intent binds that topology, the complete recoverable binding input, the exact Godskills release, and the exact typed-composition receipt, capability-layer, activation, policy, and registry roots. The compiler accepts activation only from its internally constructed recoverable adapter, requires its selected set and decisions to equal the topology, and mechanically inserts the certified fields before invoking the verified typed compiler. The durable result carries only intent, binding, activation, plan, method, and root digests. The private method remains process-local and a branded handle is owned by one compiler instance.

After interruption, reconstruction reads bounded canonical regular-file state, rejects directory aliases and escaped slots, rehydrates the already completed Godskills binding without external reexecution, recompiles the method, and requires the compact result to reproduce. Same-process calls for one mission serialize around the durable publication lock. Cross-process waiting, durable graph execution, hostile executor isolation, live provider quality, exactly-once external effects, and adoption by an existing host remain outside this boundary.

## Sealed local typed-composition compiler boundary

The optional sealed compiler removes caller-supplied route and activation transports from the recoverable typed-composition boundary. One factory verifies the exact historical Godskills release, routing executable, activation executable, and typed-composition consumer, constructs one provenance-branded local process pair, and passes those transports privately into the recoverable compiler. Unknown factory options, partial pins, forged verification products, and caller transport injection fail before a child can launch.

The real local router selects Forge and Muse for the retained topology. Route and activation execute through hidden shell-free Node children with bounded canonical output and content-addressed recovery records. If the process dies after activation output and a zero-exit success witness are durable, reconstruction publishes completion without relaunch, recovers the Godskills binding, recompiles the process-local method, and executes the typed Muse-to-Forge graph. Exact compilation replay launches no child, impossible topology fails before either executable, and no method body enters durable state.

This is an additive programmatic construction boundary. The activation classifier and typed node executors remain trusted inputs, per-node graph progress is not durably journaled, same-user hostile-process isolation and exactly-once external effects remain unproved, and no existing host, CLI, provider, Realm, continuity, evolution, Lunari, Inspiration, or Soul path adopts it by default.

## Recoverable typed execution journal boundary

The additive execution journal verifies the exact certified Godskills stepper release and its historical typed-composition parent before importing either runtime. Its adapter privately owns the registry, compiled method provenance, and stepper handles. Durable state contains only one execution intent and a contiguous digest-linked chain of output envelopes already accepted by the current Godskills step.

Recovery does not trust those records directly. It creates a fresh private execution, compares each record to the newly emitted step identity, and commits the stored output through Godskills again. The first absent ordinal is the only node eligible for execution. Changed, malformed, noncanonical, gapped, aliased, symlinked, or replay-incompatible state fails before another executor runs.

This closes repetition after a node output is durably published. It deliberately preserves the pre-publication ambiguity window: process death after an executor returns but before publication may repeat that node. The boundary is therefore at-least-once across that interval and does not claim external exactly-once effects, executor idempotency, provider reconciliation, hostile same-user isolation, or default host adoption.

## Sealed local typed execution runner boundary

The sealed runner privately shares one verified local route and activation process pair between the historical recoverable compiler and exact binding rehydration. The compiler remains the authority for durable topology collision detection and body-free compilation identity. A separately verified stepper adapter reconstructs the same plan and method and must match the compiler's activation, plan, and method digests before node execution begins.

The per-node journal then owns validated output persistence and replay. Reconstruction recovers completed process work, recompiles the exact method, recommits the durable node prefix through fresh private steps, and invokes only the first unfinished node. Exact terminal replay performs no process or node call.

This remains an explicit programmatic factory. The activation classifier and node executors are trusted, the pre-publication node interval is at-least-once, and no existing host, vessel, CLI, launcher, provider, Realm, continuity, keel, evolution, Lunari, Inspiration, or Soul path adopts the runner by default.

## Sealed local Godskills process boundary

The optional local process adapter replaces the recoverable admission layer's assumed route and activation transports with the exact pushed Godskills executables. Construction first verifies the historical Godskills release and the additive routing executable receipt, including every declared local module, routing artifact, parent receipt, and entrypoint byte. The verified objects carry in-process provenance brands, so callers cannot assemble lookalike trust roots.

Each route or activation operation runs as a hidden shell-free Node child with a minimal operating-system environment and a second environment scrub inside the child bootstrap. The route mode is fixed from the verified release rather than accepted from mission input. Dispatch, request, execution, result, process-success, and completion records live under one content-addressed operation directory. A raw result is not recoverable evidence unless the same operation also contains a valid success witness from a zero-exit child. Timeout, result size, noncanonical bytes, symlinks, changed records, and ambiguous provenance fail closed.

The deterministic proof interrupts after the real activation executable has atomically published its output and success witness but before completion publication. Reconstruction materializes the exact completion without another route or activation launch, publishes one immutable binding, and performs no child work on exact binding replay or rehydration. This closes the trusted-injected-transport assumption for local deterministic Godskills execution only. It does not migrate the admitted host or identity vessel, qualify a live model provider, make the injected classifier untrusted, provide hostile same-user isolation, or grant Realm, continuity, keel, evolution, Inspiration, Lunari, or Soul authority.

## Sealed local identity-bound vessel boundary

The additive sealed vessel factory composes that local process adapter with the existing identity-bound mission vessel under one caller-owned runtime root. It derives separate Godskills, vessel-admission, and mission-journal directories, preserves distinct process and mission clocks and locks, and exposes only the vessel's `run` function plus digest-bound execution metadata. Routing, activation, identity projection, mission admission, native generation, review, revision, final review, and recovery remain owned by their already certified components.

The full-loop proof routes a consequential visual mission to `eternities-muse`, receives a real deferred-review decision from the pinned activation executable, interrupts after activation success, reconstructs without another child launch, and completes the identity-bound native, review, revision, and final-review sequence. Exact terminal replay performs no route, activation, classification, native, review, or revision operation. This is a programmatic construction boundary, not an admitted-host, CLI, host-policy, live-provider, Realm, continuity, evolution, Lunari, or Soul migration.

## Admitted sealed identity host boundary

The additive identity host turns the sealed vessel into one policy-admitted runtime without reinterpreting the historical networked launcher. A canonical operator policy pins the exact admitted instance and Realm, admission-owned distribution and journal paths, Godskills release and executable, routing-evidence classifier descriptor, native transport descriptor, optional paired review and revision executor descriptors, authority and routing context, and every mission and process ceiling. Its digest is supplied independently through `GODAGENT_IDENTITY_POLICY_SHA256` and is accepted before policy-selected repository artifacts are read.

The launcher reuses one shared admission-tree and binding verifier, proves transactional genesis and personal-keel integrity, claims the existing local residency identity, derives the classifier from the verified routing executable, compares every live descriptor to policy, and constructs the sealed vessel only beneath `admission/vessel/sealed-identity-v1`. Requests may narrow policy budgets but cannot change host identity, revocation epoch, authority, routing context, or raise any ceiling. Review exists only when both review and revision descriptors and executors are present.

The deterministic host proof covers reviewed execution, native-only execution, activation-process recovery, exact terminal replay, descriptor mismatch refusal, and all legacy launch regressions. Native, review, and revision transports are still injected. The boundary supplies no provider, endpoint, credential, CLI, hostile same-user isolation, Realm effect, continuity admission, personal-keel write, identity evolution, Lunari integration, Inspiration, or Soul activation.

## Sealed OpenAI-compatible phase transport boundary

The optional concrete phase suite fills those three injected cognition seams without changing the admitted host or either historical launcher. One canonical policy fixes the exact HTTPS origin and endpoint path, model identifier, credential-variable name, request and response byte ceilings, and independent native, review, and revision completion ceilings. An external SHA-256 pin is verified before descriptor construction, credential resolution, durable operation creation, or network access. The policy digest enters all three existing transport identifiers, and the admitted host continues to require their exact descriptors through its own independently pinned policy.

Every model request is a non-streaming, tool-free Chat Completions request with one choice, one stable phase system prefix, one canonical untrusted package, the admitted completion-token ceiling, and a strict phase-specific JSON Schema. Native models can return only content. Review models can return only recommendation, findings, and summary. Revision models can return only content and known finding identifiers. Trusted code assigns all artifact types, identity and subject bindings, native and review input digests, authority, timestamps, usage, and completion digests through the existing contracts.

The local outbox stores immutable prepared, attempt, completion, or sanitized failure records beneath the phase and dispatch digest. It never stores the request body, raw response body, Authorization header, or credential. The attempt is synced before HTTPS. A verified completion reconstructs without a credential or another provider request, while an attempt lacking terminal evidence remains pending forever unless a future explicit operator-resolution protocol decides it. This is deliberate local at-most-once behavior: generic HTTPS does not prove remote exactly-once execution after a timeout or process death.

The deterministic proof uses realistic fake HTTPS responses to run one admitted `native -> review -> revision -> final review` mission, persists four exact completions, scans every durable file for a canary credential, and performs an exact zero-call replay. It does not qualify a live endpoint or model, enable tools or streaming, implement automatic retry, alter Realm or continuity authority, or activate evolution, Lunari, Inspiration, or Soul.

## Signed phase-resolution boundary

The optional operator controller closes a concrete phase operation only after the original attempt is durably pending. A separately canonical policy binds the exact transport-policy digest, one Ed25519 public key, a maximum signed-decision lifetime, and a response-byte ceiling no broader than the provider policy. Its external SHA-256 pin is checked before operation inspection. The private key and provider credential never enter the resolution policy or controller surface.

A signed decision binds the phase, dispatch, request, original attempt, disposition, timestamps, nonce, and either one normalized provider-response witness or `null`. `adopt-response` validates the exact resupplied bytes through the existing strict parser and phase completion builder without network access. `abandon` publishes the existing sanitized failure shape with `operator-abandoned`. Version 1 has no retry disposition.

`resolution.json` is immutable and precedes the terminal completion or failure. If publication is interrupted, exact reconstruction may finish the already accepted decision after its signature window expires. A changed decision or response collides permanently. Ordinary adapters can observe only pending or terminal state and cannot invoke the operator port. This proves signed local resolution mechanics, not the truth of external provider evidence or remote exactly-once execution.

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

## Routing-evidence activation classification boundary

The routing executable verifier retains a minimal immutable projection of the exact receipt-bound routing cards only after it has verified the executable closure, routing artifacts, parent receipts, and portable capability release. The projection contains only capability identity, family, and risk class and must match all twenty-two release-owned top-level Godskills.

The routing-evidence classifier maps those verified families into the activation protocol's closed task classes and maps the highest selected routing risk into its consequence class. A mixed-family composition becomes `general`; unknown selected identities fail closed; mission prose is validated but never interpreted. Review availability is supplied once at construction and is bound with the routing root, card digest, and taxonomy digest in an authority-empty descriptor. The classifier cannot select `native`, `guardrail`, `method`, or `review`; that decision remains exclusively inside the verified Godskills activation executable.

This boundary supplies a deterministic policy-pinnable replacement for an opaque host classifier, but it remains additive. Host-policy adoption, a concrete model transport, admitted-launch migration, and any provider, Realm, continuity, evolution, Lunari, Inspiration, or Soul authority require later receipts.

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
## Admitted sealed typed execution host boundary

The admitted typed host is a sibling of the existing admitted identity host, not a replacement for its native review pipeline. Its separately pinned canonical policy binds one admitted identity to all sealed-runner trust roots, one exact authority-empty executor descriptor set, and closed topology, input, process, and output ceilings. The launcher reconstructs the identity candidate, derives the Godskills input internally, and admits only executor functions whose snapshotted descriptors match the policy exactly. Native verifier I/O, lock policy, clocks, instrumentation, artifact caches, and the canonical OS-account residency registry are not caller-injectable. The runtime namespace is derived from the policy digest, admission binding, and executor descriptor set, preventing durable outputs from being recovered across repinned host bindings. Executor output is snapshotted once, then credential-screened and bounded before journal publication.

The runner's existing process terminals, compilation record, and typed execution journal remain the sole recovery state. The host adds no duplicate journal and serializes no private method. Completed route and activation children, accepted nodes, and terminal executions therefore retain their exact replay behavior beneath an admission-owned runtime root. The boundary remains programmatic and opt-in; external exactly-once effects, provider quality, default host adoption, Realm actions, continuity writes, evolution, Inspiration, Lunari, and Soul activation remain outside proof.

## Receipt-bound typed executor boundary

The receipt-bound launcher is a sibling adapter over the admitted typed host. Its six-field public input replaces caller-provided executor objects with a canonical bundle root and receipt path. A separate environment digest pins the receipt independently from the admitted host policy. Native filesystem verification inertly requires canonical contained regular files, exact byte counts and hashes, sorted unique authority-empty descriptors, and one canonical declarative JSON program per capability. The complete derived descriptor set is compared to an externally pinned, genesis-bound admitted policy before any executor handle is constructed.

After authorization, host-owned code interprets only a bounded delay, a fixed typed JSON output template, and one exact mission-id projection. Programs cannot express source code, calls, branches, loops, imports, loaders, paths, credentials, authority, or effects. JavaScript-looking strings remain inert output data. The admitted host independently repeats descriptor-policy matching and retains its policy, admission, and descriptor-bound durable namespace. Fresh-process crash recovery proves no dependence on interrupted process-local executor state. This closes caller substitution and mutable external-code delegation on the new path without relying on same-process guest-code isolation. The host interpreter remains trusted. This milestone does not prove hostile process-memory or same-user filesystem replacement isolation, distinguish hard-link identity, remove the executor-return publication window, establish external exactly-once effects, qualify live providers, provide a general-purpose executor, or change any default.

## Provider-neutral phase protocol boundary

Native, review, and revision share one provider-independent semantic core. Dispatch verification, model-visible package projection, strict output schemas, typed artifact construction, immutable subject and input binding, authority emptiness, normalized usage, and completion construction are host-owned. Provider adapters control only their wire envelope, exact model identifier, authentication header, cache controls, and usage-field mapping.

The Anthropic Messages adapter is governed by a canonical externally pinned policy that fixes `https://api.anthropic.com`, `/v1/messages`, one real calendar API-version value, one model, one credential environment variable, and request, response, artifact, and token ceilings. Requests are non-streaming, enable neither tools nor thinking, place stable system instructions before changing mission data, and use one ephemeral cache boundary. Unsupported raw-API schema constraints are stripped from only the wire copy and retained for mandatory local validation. Responses require one assistant message, the pinned model, `end_turn`, one text block, schema-constrained JSON, noncontradictory usage with zero thinking, separately observable cache-write evidence, and no credential reflection.

The deterministic fixture sends the same three closed dispatches through both protocol compilers and completion validators. It proves exact artifact, host-binding, authority, and normalized usage parity while preserving distinct provider request digests. The existing OpenAI-compatible sealed receipt remains the durable-transport proof. Anthropic network durability, live availability, provider quality, pricing, latency, cache-hit behavior, public SDK adoption, and all Realm or continuity authority remain outside this boundary.

## Durable provider phase operation boundary

The durable Anthropic suite adds a provider-neutral local operation engine without changing the sealed OpenAI transport. The engine owns phase and dispatch keyed operation slots, immutable canonical prepared and attempt records, exclusive execution locks, bounded HTTPS invocation, exact completion replay, sanitized terminal failures, and hostile-state verification. Provider adapters supply only descriptor identity, request compilation, response inspection, credential resolution, headers, and validation of provider-specific evidence.

Anthropic success publishes a provider-evidence record before its completion. That record binds policy, dispatch, request, attempt, completion, and separate uncached-input, cache-creation, cache-read, output, and zero-thinking counters. A process loss after the attempt or provider-evidence record remains pending and cannot redispatch. Completed reconstruction verifies both records and performs no credential resolution or provider work. This proves local at-most-once dispatch rather than remote exactly-once execution.

## Provider phase host SDK boundary

The provider phase host SDK is a closed explicit registry over the two certified direct constructors. It accepts one exact family identifier and the existing constructor inputs, rejects unknown configuration fields before policy loading, and returns `describe`, credential preflight, the native, review, and revision ports, and one explicit operator-resolution controller factory. It never selects a family from ambient configuration and never translates or merges provider policies.

The data-only description binds family, policy digest, exact family-prefixed descriptors, common durable semantics, wire profile, provider-evidence profile, and the presence of signed ambiguity resolution. Both families expose the same host method while keeping their independently certified resolution protocols and evidence profiles. A shared fake-provider conformance harness exercises all six phase executions and exact replay without making a live-provider, quality, failover, default-host, Realm, continuity, or identity claim.

The resolution profile closes the remaining discovery gap. It binds each family's policy, decision, response-witness, and resolution-record protocol ids, the external policy pin name, the witness-digest decision field, dispositions, and evidence-publication profile. It also makes the common `automaticRetry: false`, zero resolution-provider-call, and accepted-decision recovery semantics explicit. The outer host-description digest protects the complete profile, and family verification rejects profile substitution after rehash. This is protocol discovery only; signatures and policies are never translated across trust roots.

## Provider-neutral signed phase resolution boundary

The neutral durable engine admits one optional operator port that is absent from ordinary native, review, and revision adapters. Its canonical externally pinned policy binds the exact provider transport policy, one Ed25519 public authority, a decision lifetime, and an adopted-response ceiling. The signed decision binds the exact phase, dispatch, request, original attempt, disposition, nonce, times, and provider-neutral response witness. Neither the private signing key nor provider credential enters durable state.

Resolution acquires the existing operation lock, verifies one pending attempt, and performs no network operation. Adoption invokes the existing provider response inspector and preserves the Anthropic evidence-before-completion ordering. Abandonment closes with the sanitized `operator-abandoned` reason. `resolution.json` is immutable and published before the terminal record. Exact recovery can finish an accepted decision after expiry, while unaccepted expiry, changed bytes, collisions, unknown files, and unsafe links fail before mutation. The sealed OpenAI source and its receipt remain byte-identical; this boundary proves local signed recovery, not external evidence truth or remote exactly-once execution.

## Provider resolution decision preparation boundary

The decision preparer is a pure compiler over an already verified provider phase host description. It combines the description's exact resolution profile with one controller policy digest and authority key id, one exact pending operation projection, an explicit disposition, bounded decision identity, and optional raw response bytes. It emits the family-native response witness, unsigned decision with self-digest, and canonical signing payload. OpenAI-compatible output carries `responseDigest`; provider-neutral Anthropic output carries `responseWitnessDigest`. The family distinction remains data inside the verified description rather than caller branching or protocol translation.

The compiler has no private-key input, signing primitive, provider handle, retry path, policy loader, credential resolver, filesystem mutation, or durable-operation port. It rejects already accepted resolutions, malformed projections, unknown fields, authority-shaped extensions, cross-family profile substitution, and contradictory response/disposition combinations. The externally signed result is consumed unchanged by the existing family controller, which remains responsible for signature, policy lifetime, response ceiling, operation, and durable-state validation. This boundary proves deterministic authority-neutral preparation and controller interoperability, not authority possession, provider truth, remote exactly-once execution, or any new Realm, continuity, identity, evolution, Inspiration, Lunari, or Soul authority.

## Provider resolution authority handoff boundary

The authority handoff converts one verified prepared resolution into a canonical transport artifact for an external signer. Its request binds the exact host description, transport and resolution policies, authority key id, pending operation, family-native decision and witness, Ed25519 algorithm, UTF-8 signing payload, and self-digest. Raw response bytes, dispatch bodies, credentials, endpoints, model output, paths, functions, and private keys remain outside the artifact.

The signed return carries the unchanged decision, one canonical 64-byte signature encoding, the unchanged response witness, and its request and envelope digests. It deliberately declares `cryptographicStatus: unverified`; structural verification cannot authenticate a signature without crossing the public-key authority boundary. Only the existing provider-family controller can establish authenticity and mutate durable resolution state. This protocol certifies portable byte exchange, not an external review ceremony, signature authority, provider truth, durable outbox, remote exactly-once execution, or any new Realm, continuity, identity, evolution, Inspiration, Lunari, or Soul authority.

## Provider resolution authority outbox boundary

The authority outbox is a local durable shell around the portable authority handoff and the existing provider-family resolution controller. Its operation identity binds the verified host description, resolution policy, phase, and dispatch. The exclusively published request further binds the provider request and original attempt. The signed-return record is still structurally unverified; only the existing controller authenticates it and publishes the authoritative resolution state.

Three canonical files form the outbox lifecycle: `request.json`, `signed-return.json`, and `terminal.json`. One per-operation lock serializes state transitions. Recovery re-verifies the complete stored request, the current controller operation, and any signed return before reporting or mutating state. If controller acceptance survived but terminal publication did not, reconciliation projects the exact completed or abandoned controller result without needing the response body or another provider call.

Raw response bytes exist only in the caller's in-memory `prepare` and `submit` calls for adoption. The durable request carries only the family-native response witness, and the terminal carries only request, decision, and controller resolution digests. Unknown entries, noncanonical records, changed operation bindings, signature collisions, unsafe files, and reparse-point operation roots fail closed. This proves local crash recovery and at-most-once provider dispatch across the two certified families. It does not create signing authority, authenticate an external signer independently, prove provider truth, or establish remote exactly-once execution.
