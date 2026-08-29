# Godagent deterministic creator protocol design

- **Status:** implementation design derived from the founder-approved Phase 3 creator direction
- **Recorded:** 2026-08-29
- **Repository:** `C:\dev\eternities-godagents`
- **Depends on:** certified Phase 1 creation forge and certified Phase 2 transactional genesis
- **Does not implement:** a browser UI, hosted accounts, genesis admission, evolution, Lunari integration, Inspiration, or Soul activation

## Decision

Phase 3 begins with a headless, deterministic creator protocol. Visual, conversational, command-line, and agent-guided creators will all consume this protocol instead of duplicating creation rules in their own interfaces.

The protocol exposes a validated catalog, an immutable draft state, closed choice commands, a deterministic preview, preset replay through the same commands, and final materialization through the existing Phase 1 compiler. It is an interface over the compiler, not a second compiler.

This ordering preserves the founder-approved character-creator experience while preventing a future web shell from becoming an authority or identity boundary.

## Governing distinctions

```text
catalog card != module contract
recommendation != selection
selection != authority
preset != privileged build path
preview != admission
finalized creation != persistent vessel
creator protocol != Soul activation
```

## Goals

1. Support manual, preset, and future agent-guided creation through one deterministic command stream.
2. Let a consumer discover validated options without loading raw module bodies into its own trust logic.
3. Preserve the exact Phase 1 compiler and policy digest as the final creation authority.
4. Surface missing and incompatible choices before any output artifact is written.
5. Produce the same candidate, expression, build manifest, and build ID from semantically identical choices regardless of interface.
6. Keep presentation metadata unable to grant effects, capabilities, credentials, runtime policy, evolution, or Soul state.
7. Make every preview and finalized source projection content-addressed and independently replayable.

## Non-goals

- choosing a frontend framework or visual art direction;
- persisting drafts in a database;
- accepting natural-language output as a trusted choice command;
- recommending a model provider or spending policy;
- creating a vessel or personal keel;
- adding module inheritance;
- lifting `frozen-v0` evolution;
- activating or representing an Eternities Soul;
- claiming that creator attributes alter model weights or intrinsic intelligence.

## Architecture

```text
trusted policy pin + module library + expression library + preset library
  -> creator catalog loader
  -> frozen content-addressed catalog
  -> immutable draft + closed choice command stream
  -> deterministic preview and issue rows
  -> explicit review seal
  -> canonical candidate and expression materialization
  -> existing compileCreation()
  -> existing verifyCreationBuild()
```

The protocol has four components:

1. **catalog loader** validates source libraries and emits a bounded discovery projection;
2. **draft engine** applies closed commands to immutable, digest-linked draft revisions;
3. **preview engine** derives readiness, attributes, compatibility, and source projections without writing output;
4. **finalizer** requires an exact reviewed preview digest, materializes canonical source inputs, and invokes the existing compiler.

No component receives a Realm hand, runtime credential, host policy, keel writer, or Soul capability.

## Catalog

### Inputs

The loader receives:

- one creation-policy path;
- one independently supplied expected policy digest;
- one module-library directory;
- one expression-library directory;
- one optional preset-library directory.

Every JSON file in a declared library is part of the trust evaluation. Unknown entries, duplicate references, malformed contracts, digest mismatch, forbidden module keys, path-shaped references, and invalid presets fail catalog loading rather than disappearing from discovery.

The loader returns the serializable frozen catalog separately from a host-only frozen source resolver. The resolver can return validated module, expression, and preset values by exact canonical reference and catalog digest. Raw source bodies and resolver functions do not enter the catalog projection or catalog identity. Preview and finalization receive the resolver explicitly, so catalog discovery data cannot masquerade as trusted source material.

### Module projection

Each validated module becomes a frozen catalog row containing only:

- canonical module reference;
- module kind;
- content digest;
- provenance author and source;
- compatibility requirements and provisions;
- bounded capability names;
- presentation tags;
- a safe kind-specific summary derived from validated fields.

The row may reveal that a module requires a capability, organ, entrypoint, tag, or Realm surface. It cannot hide or add any authority-bearing field.

### Expression projection

Expressions remain presentation-only and content-addressed. A catalog row includes the canonical expression reference, content digest, name, pronouns when present, visual and voice tags, and other fields already accepted by the expression schema. Expression rows never enter compatibility, authority, effect, retry, credential, or Soul decisions.

### Presets

A preset is a canonical sequence of ordinary creator choices. It has no direct compiler call. Loading a preset validates every choice against the same closed kind-and-payload contracts used to construct manual commands. A stored preset choice has no revision claim of its own.

Applying a preset is defined as wrapping each stored choice in an ordinary command with the actual current draft digest, then replaying those commands in canonical order. A preset and an equivalent manual command stream must produce the same draft digest, preview digest, candidate, expression, creation artifacts, and build ID.

### Catalog identity

The catalog digest binds:

- policy digest;
- sorted module rows and source digests;
- sorted expression rows and source digests;
- sorted preset identities and choice-stream digests;
- schema version.

Host paths, timestamps, filesystem enumeration order, and formatting do not enter catalog identity.

## Draft protocol

### Draft state

A draft is an immutable value with:

- schema version;
- catalog digest;
- monotonically increasing revision;
- previous draft digest;
- creator provenance;
- blueprint identity and version when supplied;
- selected expression reference;
- exactly zero or one selected reference for each of the nine module kinds;
- telos, constitution, Prompt OS, memory, and Realm sections when supplied;
- fixed `frozen-v0` evolution and dormant Soul declarations;
- current draft digest.

The draft contains no runtime endpoint, provider credential, selected hosted model, retry policy, host authority, genesis ID, keel ID, Inspiration state, or Soul payload.

### Choice commands

Commands are closed, canonical values. Initial command kinds are:

- `set-blueprint`;
- `set-genesis`;
- `set-expression`;
- `select-module`;
- `set-telos`;
- `set-constitution`;
- `set-prompt-os`;
- `set-memory`;
- `set-realm`.

Every command names the expected current draft digest. Stale commands fail without changing the draft. Reapplying the exact command to the exact revision is deterministic; applying a conflicting command produces a new revision rather than rewriting history.

The engine deep-clones, validates, canonicalizes, and freezes all accepted values. Unknown command keys, unknown kinds, prototype-bearing objects, functions, non-JSON values, credential-shaped keys, active Soul state, mutable evolution, and authority outside the candidate constitution are rejected.

### Ordered guidance without ordered authority

The protocol reports a recommended creation order for interface ergonomics:

```text
identity -> expression -> lineage -> archetype -> attributes
  -> personality -> voice -> organs -> Godskills -> cortex
  -> embodiment -> telos -> constitution -> review
```

The command engine does not grant earlier choices more authority. A capable interface may let an advanced creator move between steps. Readiness depends on the final complete state, not the order in which equivalent commands arrived.

## Preview

Preview is a pure operation over one verified catalog and one draft. It emits:

- `status: incomplete | blocked | ready`;
- missing-field rows with closed codes;
- compatibility rows with closed codes;
- selected catalog identities;
- derived attributes;
- the exact candidate projection;
- the exact selected expression projection;
- the operational genome preview when ready;
- the fields excluded from operational authority;
- a preview digest.

Preview never writes files and never admits a vessel. It validates through the same module resolver, policy ceiling, compatibility checks, attribute derivation, and genome projection used by the compiler. A UI may decorate issue codes with prose, but prose is not part of the trust result.

Raw exception strings are not protocol issue identities. Compatibility failures must resolve to a closed code before being exposed through the creator boundary.

## Review seal and finalization

Finalization requires:

- a ready preview;
- the exact catalog digest;
- the exact draft digest;
- the exact preview digest explicitly accepted by the caller;
- output directories that contain no unexpected entries;
- the independently supplied policy digest pin.

The finalizer replays preview from source, compares every digest, writes canonical `creation-candidate.json` and `expression-overlay.json` inputs to a transaction-owned source directory, and invokes `compileCreation()` with the original validated module library and policy pin. It then runs `verifyCreationBuild()` and returns its frozen manifest.

If the catalog, draft, policy, module bytes, expression bytes, reviewed preview, or output contents changed, finalization fails before claiming completion. Failed finalization leaves no accepted review seal and cannot call transactional genesis.

The first slice does not automatically call Phase 2 genesis. This keeps creation review reversible and genesis explicit.

## Authority and trust boundaries

- The creation policy remains the ceiling and is trusted only through its separate digest pin.
- Catalog projection cannot add or suppress authority-bearing source fields.
- A preset is data, not policy.
- A recommendation is data, not a command.
- Natural-language agents may propose commands, but the host must submit validated command objects.
- Expression and catalog decoration are presentation-only.
- Final authority projection remains `projectGenome()` inside the existing compiler.
- Runtime host authority and Realm hands remain outside creator identity.
- Soul remains dormant and has no creator command.

## Failure behavior

- malformed library content blocks catalog loading;
- a policy mismatch blocks catalog loading before module use;
- duplicate module, expression, or preset identity blocks catalog loading;
- stale choice commands fail without changing the draft;
- incomplete drafts preview as incomplete without writing files;
- incompatible complete drafts preview as blocked with closed issue codes;
- preset/manual divergence fails parity certification;
- changed reviewed state fails finalization;
- unexpected source or output entries fail closed;
- compiler or verifier rejection remains authoritative;
- no failure path creates a vessel, keel, evolution record, or Soul state.

## First implementation slice

The first certified slice includes:

1. strict catalog, draft, choice-command, preset, preview, and review-seal contracts;
2. deterministic catalog loading for modules, expressions, and presets;
3. immutable command replay and stale-revision refusal;
4. manual and preset paths through one command engine;
5. deterministic readiness and preview projection;
6. canonical source materialization through the existing compiler;
7. certification fixtures proving exact replay and authority separation.

It includes a small domain-neutral fixture catalog sufficient to prove real alternatives. It does not attempt a large content library or a production visual interface.

## Acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `GC-001` | catalog identity is byte-deterministic across formatting and enumeration order | two fresh catalog loads and shuffled-source test |
| `GC-002` | every draft revision is immutable, digest-linked, and stale-command safe | command replay and mutation tests |
| `GC-003` | preset and equivalent manual choices produce identical draft and preview identity | parity fixture |
| `GC-004` | catalog and presentation metadata cannot grant authority, credentials, runtime policy, evolution, or Soul state | adversarial source tests |
| `GC-005` | incomplete and incompatible drafts are blocked before source or build writes | filesystem-negative tests |
| `GC-006` | ready preview and finalized compiler inputs are byte-identical | preview-materialization comparison |
| `GC-007` | changed catalog, draft, preview, policy, module, expression, or output state invalidates review | substitution matrix |
| `GC-008` | finalized output verifies through the existing Phase 1 compiler and preserves historical receipts | end-to-end and historical-receipt gates |

## Certification boundary

The Phase 3 receipt will certify only `GC-001` through `GC-008`. It will bind the exact specification, plan, source commit, test-file manifest, deterministic test summary, fixture catalog digest, manual/preset parity digest, finalized creation build ID, and historical certification receipt digests.

Certification remains network-disabled and requires a clean source commit. Two isolated runs must produce byte-identical receipts. Creator UI quality, recommendation intelligence, hosted durability, accessibility, localization, product analytics, genesis admission, evolution, Lunari, Inspiration, and Soul remain excluded.

## Later shells

After the headless protocol is certified, a visual creator may present lineage, archetype, expression, attribute, organ, Godskill, cortex, and embodiment choices with game-like depth. A conversational creator may recommend combinations. A software agent may assemble a draft automatically. All remain replaceable consumers of the same catalog, commands, preview, review seal, and finalizer.

The protocol is the common creation language. The compiler is the authority. The interface is the experience.
