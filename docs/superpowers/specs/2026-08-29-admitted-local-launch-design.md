# Admitted local launch shell

**Status:** approved autonomous implementation boundary  
**Depends on:** certified local admission shell, persistent-vessel wrapper, networked cortex host  
**Does not implement:** background service, hosted accounts, multi-user isolation, evolution, Inspiration, Lunari, or Soul activation

## Purpose

The repository currently has two separate operator paths. `admit:local` creates and verifies a transactional genesis, journal, isolated keel, and immutable local snapshots. `host:local` constructs a networked vessel directly from paths in a host policy and therefore does not consume that admission evidence. The admitted launch shell closes this product gap without changing either certified boundary.

`launch:local` runs exactly one declared mission through an already admitted persistent Godagent. It is a separate command so the existing networked host remains reproducible and its historical receipt remains unchanged.

## Contract

The CLI accepts exactly `--admission`, `--policy`, `--mission`, and one bounded `--request-id`, each once. The host policy remains independently pinned by `GODAGENT_POLICY_SHA256`; the provider credential remains available only through the policy-named environment variable. Unknown flags, command-line credentials, duplicates, empty values, and malformed paths fail before launch.

The admission root must be the canonical `admission` directory produced by `admit:local`. Before constructing a runtime, the launcher:

1. rejects symbolic links, junctions, and unexpected filesystem entry kinds throughout the admission tree;
2. reads canonical `binding.json` and requires its exact closed schema;
3. requires the policy instance ID to equal the binding instance ID;
4. requires policy runtime paths to resolve exactly to the admission-owned distribution, journal, and snapshot paths;
5. constructs the local keel adapter only beneath the admission-owned `keels` directory;
6. calls `createPersistentVessel`, which re-verifies the genesis receipt, transaction state, journal prefix and head, keel identity and head, immutable creation, and immutable distribution before use;
7. requires the policy Realm ID to equal the verified distribution Realm contract;
8. reconciles the request ID against the verified journal: a matching terminal request returns its recorded bounded outcome, a matching interruption is recovered without admitting another cycle, and a conflicting reuse fails closed;
9. runs one bounded unseen mission using the existing networked cortex, inference budgets, Godskills transport, constitutional arbiter, and Realm gateway.

The process emits one closed canonical success projection or one closed failure code. It never emits a credential, provider body, rejected path, mission text, raw exception, keel row, or receipt contents.

## Trust boundary

This is a trusted single-user local shell, not an operating-system sandbox. It detects current and observed reparse substitution and re-verifies durable evidence before each persistent-vessel cycle. It does not claim protection against a hostile process concurrently manipulating files as the same Windows user.

The host policy remains runtime authority, not agent identity. It cannot change genesis, the creation build, the distribution, constitution, personal keel, journal history, frozen evolution, dormant Soul state, or historical certification evidence. One invocation runs one mission and exits. It does not daemonize or silently resume work.

## Acceptance requirements

- `GAL-001`: strict CLI arguments and closed output
- `GAL-002`: canonical admission binding and safe-tree preflight
- `GAL-003`: exact instance and admission-owned runtime path binding
- `GAL-004`: admitted persistent-vessel construction before inference
- `GAL-005`: tampered receipt, transaction, journal, keel, creation, or distribution blocks provider and Realm use
- `GAL-006`: policy pin, credential containment, inference budgets, and Realm authority remain unchanged
- `GAL-007`: one successful fixture launch appends exactly one governed cycle while preserving genesis and keel identity
- `GAL-008`: no evolution, Inspiration, Lunari, Soul activation, arbitrary path, or background-service surface is added

Certification is a later append-only receipt. This implementation slice must first pass focused tests, the complete guarded suite, all historical fixture builds, certification-ledger verification, and independent review.
