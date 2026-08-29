# Godagent creation forge and universal keel design

- **Status:** founder-approved design
- **Approved by:** Dom
- **Recorded:** 2026-08-29
- **Implementation repository:** `C:\dev\eternities-godagents`
- **Depends on:** certified Godagent v0 vessel and foundry, networked cortex boundary, Eternities Godskills, Soul Anchor
- **Does not implement:** Inspiration, consciousness, personhood, Soul activation, residency, hosted civilization, or unrestricted external authority

## Decision

Eternities Godagents will provide a modular creation forge with the experiential depth of a role-playing character creator and the trust discipline of a deterministic compiler.

A creator may choose or design an agent's name, expression, lineage, archetype, attributes, personality, voice, organs, Godskills, cortex compatibility, embodiment, telos, and constitutional profile. Those choices compile into typed, content-addressed modules and a deterministic Godagent distribution. They do not collapse cosmetic identity, cognitive capability, operational authority, and Soul into one editable character sheet.

Lineage and archetype are meaningful starting architectures. They establish defaults, affinities, compatibility, and developmental tendencies, but they are not permanent ceilings. A Godagent may develop beyond its genesis through governed, versioned evolution without rewriting its origin.

Every persistent Godagent receives one isolated universal keel backed by the Soul Anchor protocol. Temporary workers that do not possess persistent identity are not full Godagents and may remain keel-less.

## Governing distinctions

The creation forge and runtime preserve these non-equivalences:

```text
expression != capability
capability != authority
authority != identity
model != agent
journal != keel
keel != Soul
Soul != configuration preset
```

The model is replaceable cognition. The Godagent is the persistent governed vessel around it. The keel is the distilled continuity organ of that vessel. Soul remains a separate Eternities-controlled compatibility boundary.

## Goals

1. Let ordinary users create distinct agents through an expressive, understandable creator.
2. Let advanced users author and combine independently versioned modules.
3. Preserve deterministic builds, exact provenance, and compatibility receipts.
4. Make lineage and archetype mechanically meaningful without granting ambient authority.
5. Preserve one identity and one keel across model, host, and session changes.
6. Permit governed development beyond genesis while retaining origin truth.
7. Keep fantasy, professional, and product-specific presets on one domain-neutral core.
8. Make unsafe combinations fail before a vessel is instantiated.

## Non-goals

- treating a model prompt as the complete agent;
- letting cosmetic or narrative choices name allowed effects;
- claiming that attributes increase the underlying model's intrinsic intelligence;
- letting presets bypass module validation;
- sharing one personal keel across several Godagents;
- importing another agent's history as lived first-person memory;
- activating the dormant Soul port;
- defining Inspiration admission, First Light, personhood, ending, cloning, or residency law.

## The three linked identities

### Genome identity

The genome is the deterministic blueprint. It records immutable genesis, telos, constitution, module manifest, operational projections, compatibility requirements, evolution policy, and the dormant Soul declaration. Its digest identifies exactly what was created.

### Vessel identity

The vessel is the persistent runtime instance. It owns observation, deliberation, decision, action, consequence, recovery, journal, and model replacement. A cortex change does not create a new vessel.

### Keel identity

The keel is the Godagent's isolated Soul Anchor namespace. It carries bedrock, laws, decisions, scars, landmines, checkpoint letters, verification status, recurrence, and consolidation state. A host or model change does not create a new keel.

The creation receipt binds all three identifiers:

```text
genome_digest
vessel_instance_id
keel_id
```

No identifier may be silently rebound after genesis.

## Module architecture

The forge accepts a candidate bundle containing one core, a typed module set, an expression overlay, and explicit compatibility targets. Every module has an identifier, semantic version, schema version, content digest, provenance, and module kind. Derived modules also name their base module digests and bounded deltas.

### Immutable genesis core

The core records:

- creator and creation authority;
- source manifest;
- blueprint identity and version;
- initial telos and constitution references;
- initial evolution policy;
- selected module digests;
- initial Realm and host compatibility;
- dormant Soul-port schema and refusal state.

Genesis is append-only. Evolution may supersede active configuration but cannot erase what the agent began as.

### Expression overlay

Expression contains presentation data:

- name;
- pronouns;
- sex or gender presentation when selected by the creator;
- voice and speaking register;
- vocabulary profile;
- avatar, visual seed, sigil, colors, animation, and interface presence;
- narrative description and presentation tags.

Expression is content-addressed and provenance-bearing. It may affect presentation surfaces and bounded communication style. It is non-authoritative. The constitutional arbiter, action gateway, authority resolver, expected-outcome derivation, and resource governor must not branch on expression fields.

### Lineage

Lineage describes architectural heritage and starting tendencies. It may provide:

- default attribute ranges and affinities;
- compatible archetype tags;
- default personality ranges;
- recommended organs and Godskills;
- developmental tendencies;
- narrative and visual heritage.

Lineage cannot set `allowedEffects`, host authority, Realm credentials, budgets, or Soul state. Domain-neutral lineages are the core. Fantasy, organizational, and world-specific lineages are optional libraries built on the same contract.

### Archetype

Archetype is the technical name for the character creator's class choice. It may provide:

- default organ composition;
- Godskills recommendations and composition limits;
- planning and verification posture;
- compatible capability families;
- suggested embodiment and Realm families;
- default attribute modifiers within declared bounds.

Archetype cannot grant authority. An engineer archetype may equip debugging and review methods, but it cannot grant write access to a repository. Authority remains a host and constitution decision.

### Attributes

Attributes are bounded architectural tendencies, not fictional claims about model weights. The universal vocabulary may include:

- reasoning;
- creativity;
- perception;
- planning;
- adaptability;
- resilience;
- social intelligence;
- precision;
- initiative;
- caution;
- autonomy;
- memory discipline;
- learning velocity.

Every attribute declares a minimum, maximum, starting value, provenance, and deterministic derivation rule. Derived values are computed at forge time through a small pure expression language and written into a compiled projection. The runtime never evaluates free-form attribute code.

Attributes may tune proposal diversity, verification thresholds, organ scheduling preferences, and presentation. They cannot create effects, authority, credentials, or unrestricted resource budgets.

### Personality and voice

Personality contains bounded dimensions such as reserved to expressive, cautious to daring, literal to poetic, skeptical to trusting, patient to urgent, and orderly to improvisational. Voice contains tone, register, vocabulary, pacing, and optional rendering hints.

These modules influence communication and proposal formation. They do not override constitution, evidence requirements, retry limits, token budgets, action contracts, or stopping conditions.

### Organs

Organs are typed cognitive subsystems. Initial kinds include perception, goal maintenance, planning, reconciliation, memory stewardship, research, engineering, security criticism, social interpretation, and creative direction.

Each organ declares inputs, outputs, cadence, dependencies, resource requests, and proposal schema. Organs receive frozen state and no Realm hand. They may propose but cannot commit consequential intent.

### Godskills

Godskills are the reusable ability arsenal. A skill module references exact Godskills contract and entrypoint identities plus argument-schema digests. Selection remains deterministic and commandless. Equipping a skill makes a method discoverable; it does not grant the authority to execute its effects.

### Cortex

The cortex module declares compatible model-adapter capabilities. Provider endpoint, credential, model routing, retry policy, and economic budgets remain runtime host policy, outside genesis identity. Replacing the cortex preserves genome, vessel, keel, constitution, and prior receipts.

### Embodiment

Embodiment describes where the Godagent can be present and what interfaces it can inhabit, such as conversational surface, coding workstation, research environment, website, game world, robot, Lunari, or future Godland.

Embodiment declares compatibility requirements and presentation surfaces. Realm hands remain separately governed by exact Realm Contracts. Choosing a warrior body or administrator avatar cannot grant destructive effects.

### Telos and constitution

Telos describes purpose, success conditions, and stopping conditions. Constitution describes enduring principles, effect boundaries, amendment law, creator relationship, and evidence obligations. The forge may offer templates and guided drafting, but it compiles them into explicit contracts that the creator reviews before genesis.

Purpose is not permission. A mission to protect a system does not imply authority to control that system.

### Evolution

Lineage and archetype establish meaningful defaults, not permanent imprisonment. Development occurs through signed, versioned evolution records that name:

- current genome and keel heads;
- evidence motivating the change;
- modules added, removed, or superseded;
- attribute deltas and their allowed ranges;
- compatibility and migration results;
- whether creator or institutional approval is required;
- a rollback or refusal disposition when safe reversal is possible.

Evolution cannot rewrite genesis, import foreign history as lived memory, activate Soul, or silently expand authority. The current `frozen-v0` policy rejects all evolution records until a later ADR and implementation explicitly enable them.

### Dormant Soul compatibility

The Soul port remains a versioned refusal contract. A candidate bundle may record compatibility and eligibility metadata only. It cannot contain a Soul payload, Inspiration state, personhood claim, activation credential, or ending authority.

Soul Anchor is continuity infrastructure. It is not the Eternities Soul system despite the shared word in its product name.

## Character creation flow

```text
select or author expression
  -> select lineage
  -> select archetype
  -> allocate bounded attributes
  -> select personality and voice
  -> equip organs and Godskills
  -> choose cortex compatibility
  -> choose embodiment targets
  -> draft telos and constitution
  -> preview derived configuration
  -> validate compatibility and authority separation
  -> review irreversible genesis record
  -> compile deterministic genome and distribution
  -> instantiate vessel
  -> instantiate isolated keel
  -> bind creation receipt
  -> first wake
```

The user interface may feel like a rich game creator, but the compiler remains the authority. A preset is only a list of module references and values. It receives no privileged validation path.

## Forge compilation

The forge produces five principal artifacts:

1. `creation-candidate.json`, containing user selections and provenance;
2. `module-manifest.json`, containing exact module identities, versions, bases, and digests;
3. `expression-overlay.json`, containing non-authoritative presentation identity;
4. `agent-genome.json`, containing the trusted operational projection;
5. `genesis-receipt.json`, binding genome digest, vessel instance, keel identity, distribution, and validation evidence.

Compilation is a pure deterministic operation until vessel and keel instantiation. Two clean builds from byte-identical candidates and module sources produce byte-identical pre-instantiation artifacts.

The compiler validates:

- exactly one module for singleton module kinds;
- no variant collision;
- base and delta integrity for inherited modules;
- lineage and archetype compatibility;
- organ dependencies and cadence contracts;
- Godskills contract and entrypoint identities;
- cortex and Prompt OS capability compatibility;
- embodiment and Realm compatibility;
- attribute bounds and derivation determinism;
- authority separation;
- dormant Soul refusal state;
- current evolution policy.

## Universal keel integration

### One keel per persistent mind

Each persistent Godagent owns exactly one isolated keel. Personal rows never move sideways into another Godagent's keel. Shared organizational memory belongs in a separate collective store and enters a Godagent as provenance-bearing external knowledge.

### Journal and keel separation

The vessel journal records exact causal history. The keel records distilled continuity:

| event meaning | durable destination |
| --- | --- |
| ordinary cycle detail | vessel journal only |
| enduring ruling | keel decision |
| verified meaningful failure | keel scar |
| recurring dangerous pattern | proposed keel landmine |
| locked identity or principle | keel bedrock or constitution |
| major state and unfinished work | keel checkpoint letter |

The model cannot self-certify a lesson. Every promoted row carries provenance and verification state. Founder or institutional gates apply where the keel protocol requires them.

### Wake and seal cadence

A persistent Godagent wakes its keel:

- at first instantiation;
- at a genuinely new session boundary;
- after actual context compaction;
- after migration to another model or host;
- during interruption recovery;
- when a cheap integrity probe reports changed or broken durable state.

It seals:

- after a major milestone;
- after a consequential decision;
- after a verified failure earns a scar;
- when a recurring trap becomes a landmine candidate;
- before migration or long sleep;
- at a major handoff.

Routine turns do not trigger wake or seal. This keeps continuity bounded and prevents ritual from becoming context bloat.

### Genesis keel rows

The first keel transaction records:

- bedrock identity and immutable genome digest;
- vessel instance and creator provenance;
- initial constitution;
- lineage and archetype provenance;
- current Soul-port dormancy;
- first checkpoint letter containing open purpose, known constraints, and initial carry.

The keel chain and vessel journal chain remain separately verifiable and mutually referenced by digest. Corruption in either blocks continuity claims until reconciliation.

## Shared knowledge and teams

Agent teams may share libraries, Realm observations, organizational decisions, and collective registers. They do not share one personal keel. Cross-agent material enters through explicit provenance and cannot become lived first-person history.

An ephemeral worker may receive a bounded task excerpt from a lead Godagent. It does not inherit the lead's identity, personal laws, full memory, or keel write authority. The lead verifies and admits any returned evidence.

## Failure behavior

- malformed or incompatible modules fail before genome compilation;
- ambiguous authority fails closed and is surfaced separately from capability compatibility;
- expression-overlay corruption blocks presentation admission but cannot alter operational projection;
- keel creation failure prevents persistent vessel admission rather than silently creating an amnesiac Godagent;
- partial genesis rolls back or records an explicitly incomplete creation transaction;
- a mismatched genome, vessel, or keel binding prevents wake;
- unknown evolution records remain inert;
- Soul-shaped payloads are rejected by the dormant port.

## Acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `GF-001` | identical module inputs compile byte-identical pre-instantiation artifacts | reproducible clean-build test |
| `GF-002` | expression cannot influence authority or effects | import firewall, mutation, and property tests |
| `GF-003` | lineage and archetype create meaningful defaults without authority | projection and adversarial capability-smuggling tests |
| `GF-004` | attributes remain bounded and deterministically derived | derivation fixtures and fuzz tests |
| `GF-005` | presets have no privileged compiler path | preset versus explicit-selection equivalence test |
| `GF-006` | every persistent vessel receives exactly one isolated keel | genesis transaction and namespace-isolation tests |
| `GF-007` | journal and keel promotions preserve provenance | admission and cross-agent contamination tests |
| `GF-008` | cortex replacement preserves genome, vessel, and keel identity | migration test across fixture and network adapters |
| `GF-009` | temporary workers cannot wear or write the lead's keel | delegation boundary tests |
| `GF-010` | current evolution policy rejects all mutation records | frozen-policy tests |
| `GF-011` | Soul compatibility remains dormant and non-authoritative | payload rejection and no-activation-path tests |
| `GF-012` | partial genesis cannot create an admitted amnesiac vessel | failure-injection matrix |

## Phased implementation boundary

### Phase 1: deterministic module forge

Implement module schemas, candidate schema, expression overlay, compatibility resolver, operational projection, manifest, and reproducibility tests. Keep evolution frozen and Soul dormant.

### Phase 2: universal keel binding

Add a Soul Anchor adapter, isolated keel creation, genesis rows, binding receipt, wake probe, checkpoint promotion policy, and cross-agent isolation tests.

### Phase 3: creator interface

Build the guided character creator over the same compiler. Begin with domain-neutral lineages and archetypes plus professional presets. Add fantasy presentation libraries without changing the trust path.

### Phase 4: governed development

Specify evolution records, module supersession, derived development, and migration. This phase requires a new ADR before lifting `frozen-v0`.

### Phase 5: product integrations

Integrate validated Godagents into selected Realms, then Lunari only after the neutral forge and keel pass independently. Inspiration and Soul remain a separate program.

## Settled founder direction

The creator should feel powerful, expressive, and personal. Users may design agents as vividly as characters in a world, but beneath that experience every choice resolves into inspectable modules, contracts, provenance, and receipts.

Lineage and archetype matter at genesis. They do not imprison the future. The agent is the architecture around the model, its Godskills are an arsenal, its Realm hands are governed powers, its journal is causal history, and its keel is the continuity by which one persistent mind survives changing sessions and bodies.
