# Receipt-Bound Typed Executor Bundle v1 Implementation Plan

**Goal:** remove caller-selected executor implementations from a new admitted
typed-host path by verifying and interpreting exact receipt-bound declarative
program bytes.

**Architecture:** a native verifier loads a canonical receipt and exact
canonical JSON programs. Host-owned code supports only a bounded delay, a fixed
typed output template, and one exact mission-id projection. Privately branded
frozen executor handles pass through a closed sibling launcher to the certified
admitted host. No guest code, module loader, VM, evaluator, or external program
dependency exists.

**Spec:** `docs/superpowers/specs/2026-08-31-receipt-bound-typed-executor-bundle-v1-design.md`

## constraints

- preserve every existing certified source, fixture, policy, and receipt byte
- expose no caller I/O, executable source, loader, import, lock, cache, clock,
  registry, or runner hook
- interpret only the immutable bytes verified from the pinned receipt
- certify mechanism only and retain all existing exactly-once proof limits

### task 1: close the bundle receipt and verifier

- [x] write failing tests for canonical receipt and exact-byte verification
- [x] implement native path, file, digest, descriptor, and program grammar checks
- [x] build privately branded handles with the host-owned interpreter
- [x] reject changed bytes, paths, fields, projections, aliases, and symlinks
- [x] reject credential keys, prototype keys, deep templates, and excessive delay

### task 2: add the closed admitted sibling launcher

- [x] write an end-to-end Muse-to-Forge launch test
- [x] implement the six-field launcher with no executor or runtime hooks
- [x] prove policy mismatch and forbidden fields fail before executor work
- [x] prove persisted-node recovery and zero-work terminal replay
- [x] run host, runner, and historical certification regressions

### task 3: freeze deterministic evidence

- [ ] build the declarative bundle and host fixture twice
- [ ] add exact-source receipt reconstruction and certification checks
- [ ] append the new receipt to ledger and release-lineage expectations
- [ ] run focused and full suites from the exact source candidate
- [ ] obtain one exact-diff Terra review with zero unresolved defects
- [ ] reproduce the receipt, merge by fast-forward, push main, and verify parity

### task 4: select the next coherent trust boundary

- [ ] reassess remaining proof limits after release
- [ ] prefer the highest-leverage boundary supported by current evidence
