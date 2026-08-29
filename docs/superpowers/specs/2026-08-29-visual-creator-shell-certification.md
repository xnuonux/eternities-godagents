# Visual Creator Shell v1 Certification

## Status

Approved implementation design following the certified Phase 3 creator protocol, local creator CLI, and modular visual creator shell.

## Boundary

This certificate proves that the local visual shell is a deterministic, token-gated, loopback-only client of the existing creator protocol. It certifies transport hardening, closed composition selection, exact review acknowledgement, workspace confinement, reproducible pre-genesis output, fixed self-contained assets, and preservation of every earlier receipt.

It does not modify or supersede the immutable Phase 3 receipt. It does not certify hosted deployment, accounts, multi-user persistence, accessibility conformance, localization, analytics, recommendation quality, genesis admission, model routing, Realm action, keel continuity, evolution, Inspiration, Lunari integration, or Soul activation.

## Requirements

- `GVC-001`: the server binds loopback, uses a random per-launch token, and rejects host substitution.
- `GVC-002`: every API route rejects absent, wrong, and malformed session tokens.
- `GVC-003`: catalog, preset preview, and composition preview equal the bounded operator workflow.
- `GVC-004`: foundation defaults preserve preset parity and composition accepts exactly one available expression plus one available kind-matched module for all nine closed module kinds.
- `GVC-005`: incompatible, stale, unacknowledged, altered, and replayed compositions fail before publication.
- `GVC-006`: finalization remains confined below the configured workspace across builds-root, digest, junction, and staging boundaries.
- `GVC-007`: the default Aether web composition produces the certified Phase 1 creation build and two isolated handler runs produce identical canonical results and byte manifests.
- `GVC-008`: fixed assets, text-safe DOM construction, body and method limits, closed errors, and canary non-reflection remain enforced.
- `GVC-009`: all five preceding certification receipts retain their exact bytes and SHA-256 digests.

## Receipt

`visual-creator-shell-v1` is a new append-only receipt. Its identity binds the exact source commit, Node version, specification and plan digests, guarded test projection, test and source manifests, catalog and composition preview digests, certified Aether build ID, two-run web fixture digest, proof rows, exclusions, and historical receipt digests.

The certifier requires a clean source before and after proof execution, runs the complete suite under the inherited no-network guard, exercises `catalog -> preview-composition -> acknowledge-composition -> finalize-composition` through `createCreatorWebApp(...).handle(...)`, compares two isolated outputs byte for byte, and writes only the new receipt after every gate passes.
