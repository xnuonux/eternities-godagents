# Godagent modular creator design

- **Status:** approved autonomous continuation after the hardened visual shell
- **Recorded:** 2026-08-29
- **Repository:** `C:\dev\eternities-godagents`
- **Depends on:** certified Phase 3 protocol and visual creator head `a555282`

## Decision

Turn the visual forge from a preset picker into a policy-bounded character creator without adding a second compiler or exposing authority-bearing free-form fields.

A **foundation** is one validated preset. It supplies the complete blueprint, genesis provenance, telos, constitution, Prompt OS, memory policy, Realm requirements, expression, and nine module choices. The operator may then replace only:

- the validated expression profile, including name, pronouns, gender presentation, voice display, and visual presentation;
- one validated module in each closed module kind: lineage, archetype, attributes, personality, voice, organs, Godskills, cortex, and embodiment.

Every replacement remains an ordinary immutable creator command. The final design is previewed, compatibility-checked, review-confirmed once, snapshotted, and compiled through the existing Phase 1 forge. The foundation cannot silently grant more authority, and the browser cannot edit constitution, effects, provider routing, Realm authority, evolution, Inspiration, or Soul.

## Deterministic composition

The composition request is one exact value:

```json
{
  "foundation": "preset:aether-architect@1.0.0",
  "creator": "creator:dom",
  "expression": "expression:aether-architect@1.0.0",
  "moduleRefs": {
    "lineage": "lineage:synthetic-explorer@1.0.0"
  }
}
```

`moduleRefs` must contain exactly all nine kinds. The workflow replays the foundation through the existing preset path, then compares the requested final expression and modules with the resulting draft. It emits only necessary replacement commands in one canonical order: expression first, then the established `MODULE_KINDS` order. Therefore:

- the same final selection is independent of click order;
- selecting every foundation default remains byte-identical to the ordinary preset path;
- changing one choice changes the immutable draft and preview identity;
- incompatible mixtures return a blocked preview and cannot be acknowledged or finalized.

## Browser protocol

Add three strict token-gated routes:

- `POST /api/preview-composition` accepts the exact composition value;
- `POST /api/acknowledge-composition` accepts the composition plus its exact preview digest and returns one-use confirmation;
- `POST /api/finalize-composition` accepts the same value, digest, and confirmation.

The confirmation binds a canonical digest of the whole composition and the exact recomputed ready preview. Finalization uses the already hardened random staging and atomic publication boundary. Existing preset endpoints remain supported and unchanged.

## Interaction

The foundation rail remains the first decision. Beneath it, the shell presents one expression selector and one selector for every module kind. Options come only from the validated catalog and show safe names, provenance, compatibility tags, and summaries where useful. Selecting a foundation resets every selector to that foundation's exact defaults. Any selector, foundation, or creator change clears preview and acknowledgement.

The concordance halo and review ledger render the composed result. The ledger names the foundation separately from the final expression and module references. The forge button follows the same exact-review flow and ends at a verified pre-genesis build.

## Acceptance

| id | requirement | proof |
| --- | --- | --- |
| `GMOD-001` | foundation defaults equal the existing preset draft and preview exactly | parity test for both fixtures |
| `GMOD-002` | click order cannot change final composition identity | permutation test |
| `GMOD-003` | only one validated expression and all nine validated module kinds are accepted | strict contract matrix |
| `GMOD-004` | one incompatible replacement blocks before acknowledgement or writes | negative compatibility test |
| `GMOD-005` | review confirmation binds the entire composition and is one-use | API mismatch and replay tests |
| `GMOD-006` | composition finalization preserves workspace and junction defenses | shared staging boundary tests |
| `GMOD-007` | the shell renders every closed choice category and clears stale review | asset contract and browser interaction |
| `GMOD-008` | default Aether composition preserves its certified creation build ID | end-to-end composition test |
| `GMOD-009` | historical builds and receipts remain byte-identical | guarded suite and digest gates |

## Exclusions

No free-form constitution, telos, effect, Realm, provider, model, memory-policy, evolution, Inspiration, or Soul editing. No genesis admission, vessel instantiation, recommendation model, remote hosting, account system, arbitrary uploads, inheritance graph, or catalog mutation.
