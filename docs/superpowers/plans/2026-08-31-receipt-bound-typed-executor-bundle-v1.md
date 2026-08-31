# Receipt-Bound Typed Executor Bundle v1 Implementation Plan

**Goal:** remove caller-selected executor implementations from a new admitted
typed-host path by verifying and loading exact receipt-bound module bytes.

**Architecture:** a native verifier loads a canonical receipt, checks exact
self-contained module bytes with an ECMAScript parser, then executes the
verified function body through a JSON-only restricted VM context. Privately
branded frozen executor handles pass through a closed sibling launcher to the
certified admitted host.

**Spec:** `docs/superpowers/specs/2026-08-31-receipt-bound-typed-executor-bundle-v1-design.md`

## constraints

- preserve every existing certified source, fixture, policy, and receipt byte
- expose no caller I/O, loader, import, lock, cache, clock, registry, or runner hook
- execute the bytes that were verified, not a later filesystem read
- certify mechanism only and retain all existing exactly-once proof limits

### task 1: close the bundle receipt and verifier

- [ ] write failing tests for canonical receipt verification and exact-byte loading
- [ ] implement native path, file, digest, descriptor, and closed-module checks
- [ ] compile the verified function body in restricted per-call VM contexts and
  privately brand frozen handles
- [ ] reject changed bytes, paths, imports, exports, duplicates, aliases, and symlinks
- [ ] run the focused verifier tests green and commit

### task 2: add the closed admitted sibling launcher

- [ ] write a failing end-to-end Muse-to-Forge launch test
- [ ] implement the six-field launcher with no executor or runtime hooks
- [ ] prove policy descriptor mismatch and forbidden fields fail before execution
- [ ] prove persisted-node recovery and zero-work terminal replay
- [ ] run host, runner, and historical certification regressions and commit

### task 3: freeze deterministic evidence

- [ ] build a deterministic bundle and host fixture twice
- [ ] add an exact-source receipt builder and certification test
- [ ] append the new receipt to ledger and release lineage expectations
- [ ] run focused and full suites from the exact source candidate
- [ ] obtain one exact-diff Terra review with zero critical or important defects
- [ ] reproduce the receipt, merge by fast-forward, push main, and verify clean parity

### task 4: select the next coherent trust boundary

- [ ] reassess remaining proof limits after release
- [ ] prefer a reconcilable executor protocol if evidence still identifies the
  return-before-publication repeat window as the highest-leverage boundary
