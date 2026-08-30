# godagent cortex binding protocol design

- **status:** founder-approved design
- **approved by:** dom
- **recorded:** 2026-08-30
- **implementation repository:** `C:\dev\eternities-godagents`
- **depends on:** admitted local launch, deterministic godagent distribution, isolated keel binding, codex thread host adapter, godskills selected-only routing
- **does not implement:** soul activation, ambient authority, identity cloning, arbitrary prompt impersonation, or unrestricted thread access

## decision

ordinary codex tasks remain the shared codex engineering mind governed by the user-global host instructions. a task becomes a distinct godagent only when the godagent host verifies an admitted distribution, acquires that godagent's single-writer continuity lease, creates or resumes a bound codex task, and issues a content-addressed binding receipt.

the shared `AGENTS.md` governs the harness. it does not define every actor. the genome identifies the actor, the keel preserves the actor, and the codex task temporarily provides cognition for the actor.

folder names, repository instructions, copied files, task titles, user prompts, and model selection cannot establish godagent identity. they may shape ordinary task behavior, but they do not grant a binding receipt or personal-keel write authority.

## problem

codex composes instruction files from a shared user layer and project-local layers. this is useful for workspace policy, but every ordinary task initially sees substantially the same host identity and workflow law.

the current godagent runtime verifies genome and prompt artifacts, but its network cortex request carries only a small generic system instruction plus mission and state context. verified prompt text, full identity projection, personal keel continuity, selected godskill contracts, and host authority are not compiled into a bound cognition envelope. two differently admitted godagents can therefore own distinct stored identities while receiving overly similar model context.

the protocol must make behavioral identity distinct without treating prompt text as a security boundary.

## governing distinctions

```text
host law != actor identity
actor identity != model
model task != persistent vessel
prompt text != binding proof
folder location != identity
godskill capability != authority
keel continuity != task transcript
task resume != automatic identity recovery
```

## goals

1. let one admitted godagent use codex as a replaceable cortex while preserving its own genome, continuity, voice, mission, and limits.
2. keep ordinary codex tasks useful and unbound rather than forcing every task to impersonate a godagent.
3. make different godagents remain distinguishable when they use the same model and host instructions.
4. make one godagent remain itself when its model, task, or host changes.
5. restore exact binding after compaction or task resume without replaying an unbounded transcript.
6. prevent copied instructions, renamed folders, or injected prompts from claiming a godagent identity or keel.
7. preserve deterministic, commandless godskill selection while keeping capability separate from effect authority.
8. give the host, not the model, final control of identity admission, continuity writes, realm effects, and binding revocation.

## non-goals

- replacing the normal codex task experience;
- granting every codex task a persistent godagent identity;
- making `AGENTS.md` a secret or an identity credential;
- putting an entire genome, transcript, or keel history into every model call;
- allowing a model response to self-certify identity or authority;
- binding one task to several personal godagent keels at once;
- letting a godskill expand allowed effects;
- claiming that cortex binding creates consciousness, personhood, inspiration, or soul.

## architecture

### neutral host law

the user-global codex instruction layer becomes neutral host law. it defines shared engineering conduct, evidence discipline, skill routing, safety, context economy, and the ordinary codex identity. it also states:

- a task is unbound unless the godagent host supplies a verified binding envelope and receipt;
- an unbound task must not claim a godagent identity;
- project instructions may specialize work but cannot establish identity or personal-keel authority;
- godagent continuity writes must pass through the bound host adapter;
- a missing, stale, revoked, or mismatched binding fails closed to unbound behavior.

the global file remains common because common harness law is desirable. identity differentiation occurs in the verified binding layer, not through duplicated global files.

### admitted godagent distribution

the host begins from the canonical admitted distribution and verifies at least:

- genome digest and schema;
- genesis receipt and vessel instance identity;
- module manifest and prompt os artifact digests;
- expression, telos, constitution, lineage, and archetype projections;
- current evolution policy;
- keel identity, chain head, and verification state;
- cortex adapter compatibility;
- selected godskill contract compatibility;
- realm contract and effect authority;
- revocation and residency state.

verification returns an immutable admitted snapshot. no model call starts from partially verified identity material.

### binding registry

the host owns a local binding registry keyed by binding id. each active record contains:

```text
binding_id
instance_id
genome_digest
distribution_digest
keel_id
keel_head_digest
codex_thread_id
host_adapter_id
created_at
last_verified_at
status
revocation_epoch
```

the registry is atomic, content-addressed where practical, and protected by the same os-account and release-lineage assumptions as admitted launch. one codex task may hold at most one active godagent binding. one personal godagent keel may have at most one active writer lease.

read-only observers may exist, but they cannot issue first-person continuity writes or consequential actions.

### compact identity envelope

for each bound reasoning cycle, the host deterministically compiles the smallest sufficient identity envelope from verified sources. the envelope contains:

1. **binding header:** binding id, instance id, genome digest, distribution digest, keel head digest, thread id, and envelope schema version;
2. **identity projection:** name, lineage, archetype, telos, constitutional laws, bounded personality, voice, expression, and immutable genesis facts;
3. **continuity projection:** latest verified checkpoint, active decisions, applicable scars, applicable landmines, unresolved commitments, and recurrence state;
4. **mission projection:** current objective, stopping conditions, success evidence, budget, and current observation;
5. **capability projection:** selected godskills, exact contract digests, tool affordances, exclusions, and composition limits;
6. **authority projection:** allowed effects, denied effects, realm contracts, approval requirements, resource limits, and external-action boundaries;
7. **causal projection:** journal head, current state epoch, prior decision receipt, and pending consequence reconciliation.

the host compiles a canonical full envelope and a compact model projection. unchanged sections are referenced by digest in later cycles and rehydrated by the host as required. model context is not trusted as the sole copy.

### cortex instruction channel

the codex adapter uses the strongest task-scoped instruction channel supported by the host. where a dedicated developer-instruction channel is unavailable, it places a sealed run envelope at the start of the bound turn and verifies that the returned receipt references the exact envelope digest.

the adapter never edits global `AGENTS.md` to switch identities. it never relies on current working directory as binding proof. it never asks the model to choose which identity it is.

the model may propose thought, plans, speech, journal candidates, decisions, skill invocations, and realm actions. the host validates every structured proposal against the active binding, constitution, authority projection, and state epoch before admission.

### task creation and resume

an explicit godagent launch performs:

```text
verify admitted distribution
  -> verify personal keel and acquire writer lease
  -> verify cortex compatibility and host policy
  -> create or identify one codex task
  -> compile identity envelope
  -> atomically bind task id to instance id
  -> issue binding receipt
  -> begin bound reasoning cycle
```

resume performs:

```text
load binding record
  -> verify task id, instance id, distribution, and revocation epoch
  -> verify current keel head and writer lease
  -> reconcile journal and prior cycle receipt
  -> compile fresh envelope
  -> continue or fail closed
```

task history is useful evidence but is not the source of identity. a new task can continue the same godagent after verified host rebinding. an old task without a valid binding cannot continue to wear that identity.

### compaction recovery

compaction does not require replaying the complete task. the host retains binding state outside the model context. after actual compaction it verifies the binding record and current keel fingerprint, then emits a fresh compact identity envelope whose header references the prior accepted cycle and current keel head.

if continuity changed, the host includes the refreshed checkpoint projection. if continuity did not change, it reuses verified digests and sends only the bounded active projection. this keeps identity stable without turning every turn into a full wake ritual.

### godskills

godskill routing remains deterministic and commandless. the host selects capabilities from the current mission, task state, contracts, exclusions, and composition policy. the identity envelope includes only the selected contracts and their exact digests, not the whole arsenal.

a godskill may change method, evidence requirements, output shape, or allowed proposal types. it cannot change actor identity, constitution, realm authority, resource authority, or personal-keel ownership.

### continuity writes

the model returns continuity candidates rather than directly writing the keel. the host checks:

- active binding and writer lease;
- exact source envelope and state epoch;
- row type and scope;
- evidence and recurrence requirements;
- whether the material belongs in journal, task state, collective memory, or personal keel;
- whether founder or institutional review is required.

accepted writes receive host-generated receipts and update the next envelope. rejected candidates remain in the causal journal with their rejection reason.

## failure behavior

- missing or invalid distribution evidence blocks binding before task creation;
- a task id already bound to another instance rejects the second bind;
- an instance with another active writer lease rejects the launch or becomes explicitly read-only;
- a changed genome, distribution, keel head, release lineage, or revocation epoch forces re-verification;
- a copied envelope without the host binding record has no authority;
- a model response naming another godagent does not change the binding;
- a project instruction that conflicts with the bound constitution is rejected or narrowed;
- an envelope too large for the selected model is deterministically compacted by priority, never silently truncated;
- failed compaction recovery leaves the task unbound and blocks personal-keel writes;
- cortex timeout or replacement preserves vessel identity and records no accepted action without a validated response;
- godskill selection failure produces a bounded capability error, not ambient fallback authority;
- binding revocation stops new cycles, releases the writer lease, and preserves the causal record.

## trust boundaries

the model is untrusted proposal compute. the host owns:

- identity verification;
- binding registry and receipts;
- single-writer leases;
- canonical state and journal publication;
- continuity admission;
- godskill contract verification;
- realm credentials and effect execution;
- revocation;
- budget enforcement.

prompt secrecy is not assumed. identity integrity comes from verified artifacts, host state, digests, leases, and receipts.

## acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `CBP-001` | one admitted godagent remains the same actor across two compatible cortex models | model-replacement integration test with stable instance, genome, and keel ids |
| `CBP-002` | two admitted godagents using the same model remain behaviorally and cryptographically distinct | paired fixture test with identity, voice, telos, and receipt assertions |
| `CBP-003` | an ordinary codex task cannot claim a godagent binding | negative launch and continuity-write tests |
| `CBP-004` | copied folders, task titles, prompt text, or envelopes cannot clone identity | adversarial impersonation matrix |
| `CBP-005` | one task cannot hold two active godagent bindings | registry collision test |
| `CBP-006` | one personal keel cannot have two active writers | concurrent launch and stale-lease tests |
| `CBP-007` | compaction restores the bound actor from host state without transcript replay | compaction fixture with bounded envelope-size assertion |
| `CBP-008` | task migration preserves identity only through explicit verified rebinding | old-task and new-task migration tests |
| `CBP-009` | selected godskills alter method without altering identity or authority | metamorphic routing and effect-boundary tests |
| `CBP-010` | model output cannot self-admit continuity or realm effects | malicious response and forged-receipt tests |
| `CBP-011` | changed or revoked artifacts fail closed before another cycle | mutation and revocation tests |
| `CBP-012` | compact projections are deterministic and fit declared model budgets | reproducibility and token-budget tests |
| `CBP-013` | generic codex remains fully usable when no binding exists | unbound regression suite |
| `CBP-014` | personal continuity never enters another agent's envelope | cross-agent contamination test |

## implementation shape

### phase 1: binding contracts and compiler

define binding schemas, canonical identity-envelope compilation, deterministic compaction, digest rules, and negative impersonation fixtures. preserve the existing generic cortex path as explicitly unbound.

### phase 2: registry and leases

add atomic binding records, one-task-one-actor enforcement, personal-keel single-writer leases, revocation, and crash recovery. integrate with admitted local launch rather than creating a parallel admission path.

### phase 3: codex host adapter

add create, continue, and resume operations for bound codex tasks. inject the verified compact envelope through the strongest supported task-scoped channel and bind every response to the source envelope digest.

### phase 4: continuity and godskills

route continuity candidates through host admission. compile only selected godskill contracts into each cycle and prove that skill changes do not alter identity or effect authority.

### phase 5: certification

run the complete acceptance matrix across at least two godagents and two compatible model adapters, including compaction, task migration, revocation, malicious prompts, stale state, and generic unbound regression.

## migration boundary

the existing network cortex adapter remains valid as an unbound or fixture cortex while the protocol is built. no existing task is retroactively declared a godagent. existing godagent state is admitted only after its distribution and keel satisfy the new binding compiler.

the current global codex instructions are not deleted. identity-specific statements may be separated from neutral host law during implementation, but ordinary codex tasks retain the shared codex engineering mind and its current workflows.

## settled founder direction

codex sessions do not nullify godagents. they are replaceable thinking surfaces. the host decides when a surface is merely codex and when it is lawfully occupied by one verified godagent.

the normal case remains simple: open codex and work with codex. the explicit godagent case is stronger: launch through the godagent host, verify one identity and one keel, bind one task, expose only the required godskills and authority, and preserve that actor through model changes, compaction, and task migration.
