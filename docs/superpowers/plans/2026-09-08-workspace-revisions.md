# Workspace Revisions Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. This is one shared store boundary; implement sequentially and use independent review at the real checkpoints.

**Goal:** Supply real, bounded immutable file revisions for the later governed edit/test host, without executing code or changing original projects.

**Architecture:** One host-only revision store, canonical manifests and materialized file directories. Reuse core digests, canonical JSON and the existing file lock; do not add a generic event journal or alter a Realm contract.

**Tech Stack:** Node 24+ ESM and built-in filesystem APIs; no new dependency.

**Spec:** [host-owned workspace revisions](../specs/2026-09-08-workspace-revisions-design.md).

## Global Constraints

- No provider calls, credentials, model routing, shell, browser/project execution, installation, deletion, GC, original-file changes, Soul or Lunari.
- Keep existing runtime routes, SDK exports, fixture/artifact profiles and historical receipts unchanged.
- Mandatory limits: maxFiles <= 64, maxFileBytes <= 16777216, maxTotalBytes <= 67108864, maxRevisions <= 64, maxStoreBytes <= 1073741824; all positive safe integers.
- Use only dedicated real store directories and explicit pinned source-file lists.
- Preserve user-untracked package-lock.json. No broad scan or full integration suite before the final integration gate.
- This component is not an authority issuer or a completed coding-agent claim.

## Task 1: capture and verified inspection

Task 1 verified on `feat/workspace-revisions`, design commit `ca29041`.
The initial four real-directory tests failed on the missing API, then passed
against the first capture/inspection implementation. A fifth test reproduced
acceptance of an unlisted empty directory; explicit expected-directory checking
corrected it. A controlled actual-file growth regression then demonstrated that
readFile delivered 4128 bytes past the 4096-byte policy ceiling. Checked reads now
use a loop bounded to the prechecked size plus one detection byte. A directory
enumeration regression demonstrated a whole three-entry listing before a one-slot
budget rejection; incremental opendir enumeration now rejects at the first excess
entry. Neither test injects substitute file contents.
Latest targeted result: 16 passed, exit 0, 629.2138 ms. Coverage includes source and
destination hard links, junctions, path/refusal checks, quotas, caller mutation,
concurrent adoption, canonical policy and manifest tampering, nested Unicode and
empty files, and preserved partial initialization. Independent reviewer Banach
cleared this exact capture/inspection slice with no critical or important findings.
This is not release evidence. Task-2 revision/recovery gates remain.
No store has been exposed to a model, actor, live executor or public SDK.

**Files:** create `src/workspace/revision-store.mjs` and
`tests/workspace-revision-store.test.mjs`. Keep helpers in that test until actual
reuse requires extraction.

**Interfaces:** `createWorkspaceRevisionStore({root,limits})` returns the frozen
host handle described in W-1; this task delivers `capture`, `inspect`, `read` and
`describe()` returning `{protocolId, storePolicyDigest, limits, openedAs,
completedCount, pendingCount, storedBytes}`. Task 2 adds `revise` without changing
those shapes.

- [x] Write the real-directory capture test first. It imports the missing module
  dynamically and asserts the missing API before using it. The production change
  this test detects is publishing bytes different from the pinned source or
  mutating the original. Minimal example body:

```js
const api = await import('../src/workspace/revision-store.mjs').catch(() => ({}));
assert.equal(typeof api.createWorkspaceRevisionStore, 'function');
const store = await api.createWorkspaceRevisionStore({ root: emptyStore,
  limits: { maxFiles: 4, maxFileBytes: 4096, maxTotalBytes: 8192,
    maxRevisions: 8, maxStoreBytes: 65536 } });
const revision = await store.capture({ sourceRoot, files: [
  { path: 'app.js', sha256: hash(originalBytes) },
] });
assert.deepEqual(await readFile(join(revision.filesRoot, 'app.js')), originalBytes);
assert.deepEqual(await readFile(join(sourceRoot, 'app.js')), originalBytes);
assert.equal((await store.inspect(revision.revisionDigest)).revisionDigest, revision.revisionDigest);
```

  `emptyStore` and `sourceRoot` are separate mkdtemp children owned by the test;
  create their files with fs APIs inside the test and clean only those known roots.
- [x] Run `node --test --test-concurrency=1 tests/workspace-revision-store.test.mjs`;
  observe the expected missing-API assertion, not an import/test syntax error.
- [x] Implement canonical policy/manifest validation, explicit file list and
  checked root/path/read helpers. Read `src/state/file-lock.mjs` and
  `src/core/digest.mjs` before reuse. Snapshot inputs before awaiting.
  Acquire the existing exclusive lock before the final root-adoption decision;
  publish the marker last and reject partial initialization. Require nlink=1 and
  compare bigint device/inode identities, not only realpath. Test created/reopened
  metadata, concurrent adoption and a real hard link to an outside owned test file.
- [x] Add one failing test at a time for binary bytes, deterministic replay and
  reopening, changed file/manifest/extra file rejection, alias/hard-link/root
  overlap/refusal to adopt a nonempty directory, limits and caller mutation.
  Implement only the missing behavior and rerun this file after each correction.
- [x] Review the exact source/test diff, then commit the coherent capture slice.

## Task 2: revision and crash-state semantics

Implemented and independently reviewed. The absent-revise assertion failed before
implementation; the initial two tests then passed. Ten revision/recovery tests now
pass (846.0033 ms). A digest-correct forged manifest exposed RegExp coercion of an
array-valued parentDigest; the observed missing-rejection failure was corrected by
requiring a string before matching the digest. Independent review cleared that
follow-up and the API documentation. The final focused four-file gate passed all
42 tests (2521.7947 ms), including existing file-lock and publication checks.
These are real temporary-directory and constructed interrupted-state tests, not
process-kill, power-loss, executor-isolation or live model-quality evidence.

**Files:** extend the same module and test; add a separate
`tests/workspace-revision-recovery.test.mjs` only for publication/lock cases.

**Interfaces:** `revise({parentDigest,changes:[{path,expectedSha256,bytes}]})` returns
the same revision projection. `inspect` remains the only completion verification
primitive; no new generic operation journal or execution result is introduced.

- [x] Write the one-file replacement RED test against an actual two-file parent:

```js
const child = await store.revise({ parentDigest: parent.revisionDigest, changes: [
  { path: 'app.js', expectedSha256: hash(originalBytes), bytes: replacementBytes },
] });
assert.equal(child.parentDigest, parent.revisionDigest);
assert.deepEqual(await readFile(join(child.filesRoot, 'app.js')), replacementBytes);
assert.deepEqual(await readFile(join(parent.filesRoot, 'app.js')), originalBytes);
assert.deepEqual(await readFile(join(child.filesRoot, 'asset.bin')), assetBytes);
assert.deepEqual(await readFile(join(sourceRoot, 'app.js')), originalBytes);
```

- [x] Observe RED for the absent `revise` method, then add full-parent verification,
  exact preimage comparison, copied unchanged siblings and deterministic child
  publication. Reject duplicate or unknown change paths before any publication.
- [x] Add stale-preimage, changed parent, occupied-conflict and concurrent-invoke
  tests. Assert actual unchanged parent/source bytes on every rejected write.
- [x] Create partial pending directories and incomplete completed directories as
  owned test fixtures. Reopen normally: pending stays inert/counts against budget;
  incomplete digest destinations reject, never get overwritten or reported done.
  Verify no automatic removal. This is interrupted-state recovery, not a claimed
  real process-kill or power-loss test.
- [x] Test published identical replay at a full maxRevisions budget, and rejection
  of new work when pending/complete directories exhaust that budget. Use small
  fixture limits rather than generating hundreds of files.
  Independently sum actual pending/completed file lengths to check storedBytes;
  test byte exhaustion separately from slot exhaustion. Include manifest bytes,
  preserve partial staging files, and reject aliased or unexpected quota entries.
- [x] Run both targeted test files, independent review, correct evidenced defects
  test-first, and commit the coherent revision slice.

## Task 3: exact integration gate and host handoff

Complete for this plan's bounded substrate. Frozen source
`a4cf1df05891d0b2e8eb0801689cb15bffa98cd0` passed the serial full gate: 1432 tests,
zero failed/cancelled/skipped/todo, 1550634.2236ms. Independent final review cleared
the seven-file source closure, unchanged legacy runtime/schema/SDK and receipts,
and recomputed full-log hash. Main was fast-forwarded to that exact source, then
all 42 focused post-merge tests passed in 2261.4915ms. Branch and user lockfile were
preserved. Exact logs and scope are in the
[closeout](../../audits/2026-09-08-workspace-revisions-closeout.md).

**Files:** add `docs/workspace-revisions.md`; update this plan and current-state.

- [x] Document actual APIs and proof boundaries, including pending retention,
  no hostile-same-user isolation, no execution and no in-place project mutation.
  State the remaining actor/Realm/runner integration rather than calling this
  substrate a released coding agent.
- [x] Run targeted store and existing file-lock/publication tests selected from
  their actual filenames. Inspect the exact implementation diff and source closure.
- [x] At final integration, freeze the candidate and run the complete suite
  serially once. Preserve failures, all historical receipts and exact logs.
  Review, reconcile origin, merge only the verified branch, run focused merged
  checks and push under standing approval. No cleanup of the user's untracked file.
- [x] Record the next host integration requirements from W-5 with explicit trusted
  executor authority. Do not connect an unqualified runner or change old actors'
  permissions just to demonstrate the store.

## Coverage

W-1/W-2/W-3 capture and inspection map to Task 1; revision preimages and W-4 map
to Task 2; W-5 and exclusions map to Task 3. Completion of this plan does not
close the full workspace-host or Godagents product goal.
