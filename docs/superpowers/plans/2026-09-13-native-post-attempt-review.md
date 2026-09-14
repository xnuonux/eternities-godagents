# Native post-attempt host review implementation plan

> **For agentic workers:** Use `executing-plans` inline. Keep this coupled native integration local; use an independent reviewer before integration.

**Goal:** Run one real, read-only native review of a pinned post-attempt snapshot, preserve reported usage, and recover its result without duplicate inference.

**Architecture:** Reuse `runNativeOperator` and Pi0.85.1. Add an optional pinned host-review profile, backed by Pi's existing read tool with in-memory verified snapshot operations. A durable dispatch marker provides at-most-one automatic launch and terminal reconciliation; this is not a second agent loop.

**Tech Stack:** Node24, existing Pi SDK0.85.1, existing file locks/atomic publication, Grok4.6 OAuth for bounded live qualification.

**Spec:** The next milestone in `docs/audits/2026-09-13-native-godskills-recovery-pair.md`, plus the verified readiness response: no deferred selection exists, strict review-v1 requires unavailable usage splits, and native tool-class checks alone do not confine reads. Dom's `continue` authorizes this implementation under the existing inline/verified-merge direction.

## Design and global constraints

- This is **host review**, not a Godskills review. No roots, bodies, fixtures-as-evidence, strict historical contracts, or frozen study outputs change.
- Snapshot capture takes an explicit bounded set of text files and an exact completed native source-run reference. It hashes/retains the captured bytes and source result. Capturing later does not prove who authored the bytes. Never discover all files, load personal memory, or expose credentials.
- The snapshot is owner-pinned and separate from credentials/session state. Reject invalid paths, links, duplicate paths, oversize/binary content and digest drift. The reviewer sees the file manifest and can retrieve only those immutable bytes through Pi's normal `read` tool. No `write`, `edit`, shell or additional tool. This is a capability boundary, not an OS sandbox.
- A separately admitted review config pins snapshot path/digest and a completion-reservation ceiling. Reuse the native actor admission, model, lease, expiry and tool ceiling. Do not mutate the coding actor's saved mission or grant.
- Preserve native input/output/cache/unknown usage. No inferred reasoning split or zero-filled review-v1 conversion. Reserve the configured per-response maximum before every native or compaction inference, including retries. This is conservative admission accounting, not a billing guarantee.
- Start the review deadline before setup; preparation, reads, retries and inference use the original allowance. No quota/auth retry or provider substitution.
- Commit an exact dispatch identity before starting. Existing terminal result returns offline; pending/uncertain work never dispatches again. Reconcile the exact native terminal record if final review publication was interrupted. No automatic repair, second round, quality approval or completed-tool replay.
- Ordinary configurations without review keep existing behavior. Public review configs cannot bypass dispatch control through `launch` or `resume`.

## Task 1: Immutable read capability

Files: create `src/host/native-review-snapshot.mjs`, `tests/native-review-snapshot.test.mjs`.
Interfaces: `captureNativeReviewSnapshot({sourceRoot, files, sourceRun, destinationPath})`; `loadNativeReviewSnapshot({snapshotPath, snapshotDigest})` returns verified manifest plus `readOperations(cwd)` for Pi.

- [x] Write tests for exact captured content, source-run validation, safe relative paths, links, byte ceilings, tampering, outside/nonmember reads and disk changes after load.
- [x] Run the snapshot tests red, then green; retain evidence.
- [x] Implement bounded capture/load and immutable read operations using existing history validation and SHA utilities; no global cache or new dependency.
- [x] Verify the snapshot boundary. Integration is one coherent implementation commit with Task 2, rather than separate partial runtime commits.

## Task 2: Real native review dispatch and budgets

Files: create `src/host/native-review-dispatch.mjs`, `tests/native-review-operator.test.mjs`; modify `src/host/native-pi-operator.mjs`, `native-pi-operator-config.mjs`, `pi-native-session.mjs`.
Interfaces: optional `config.review={snapshotPath,snapshotDigest,maxCompletionTokens}`; `runNativeOperator({command:'review',...})`; trusted snapshot operations passed internally to the Pi session.

- [x] With real Pi and only the provider/auth seam controlled, test exact reads, denied outside reads/writes, immutable bytes, unknown usage, deadline/reservations, ordinary-session compatibility, duplicate/concurrent dispatch, pending uncertainty and terminal recovery.
- [x] Run the new tests with `GODAGENTS_PI_PACKAGE_ROOT` set; retain red output.
- [x] Implement optional profile validation, real native read override, conservative inference reservation and durable dispatch reconciliation. Keep the existing stream/retry/tool loop.
- [x] Verify new tests and existing native operator/binding/usage/history tests: 68 passed, zero failed or skipped, including the final CLI uncertainty regression.

## Task 3: Operator usability, independent review and live proof

Files: modify `src/host/native-pi-cli.mjs`, `src/sdk/native-pi.mjs`, `docs/native-pi-operator.md`, `docs/current-state.md`; add an audit under `docs/audits/`.

- [x] Test actual parser/CLI review command and offline result retrieval, including invalid pins and prohibited launch/resume bypass. Expose capture through the existing optional native SDK entrypoint.
- [x] Independently review source and failure behavior. The deadline concern was withdrawn after tracing the existing outer abort/guard and running real-SDK tests. The confirmed CLI uncertainty exit defect was reproduced and fixed test-first.
- [ ] Run one preregistered Grok4.6 subscription review on a separate copied snapshot of a completed prior candidate. No new coding or owner repair; preserve its findings whether useful or not. Reopen the completed review with provider access blocked and verify no inference, same result and unchanged subject bytes.
- [ ] Run the full suite once at the implementation release gate, preserve historical receipts, reconcile upstream, merge, verify the merged boundary and push. Distinguish native review execution from reviewer accuracy or general product completion.
