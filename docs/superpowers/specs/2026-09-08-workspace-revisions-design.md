# Host-owned workspace revisions

Baseline: `12d5d70c3e497f53a1e347c57b26fa8f910f7ca8`.
Decision under Dom's standing autonomous development authority.

## Place in the actual product path

The [workspace preflight](../../audits/2026-09-08-workspace-capability-preflight.md)
proved that fixture arithmetic and artifact publication do not provide coding
tools. The target remains a freshly created actor doing selected-file edits,
real tests and recovery. This slice supplies actual staged file bytes, a necessary
dependency of that path, not a smaller replacement for it. The execution provider,
Workspace Realm admission and actor integration are separate uncompleted gates.

Choose a host-only immutable revision store. It operates on host-selected inputs,
contains no model/provider or executor, and grants no authority. Do not change the
fixture Realm, artifact profile, actor identity, constitution or SDK public surface.

## Alternatives and decision

1. **Immutable full selected-file revisions (selected).** Each revision is an
   ordinary bounded directory plus a canonical manifest. A future test executor
   can consume exact bytes without inventing its own materializer. Publication
   is one directory rename under an owned store lock. Small selected workspaces
   make copy cost measurable and bounded.
2. **Content-addressed blob store plus materializer.** Saves unchanged-file copies
   but adds another mapping/publication layer before tools can run. Reconsider
   only if measured revision-copy cost materially limits useful tasks.
3. **Edit original project files in place.** Avoids staging copies but adds conflict,
   rollback and user-data risk before the new authority boundary exists. Excluded.

The strongest objection is copy overhead and retention of incomplete staging
directories. Explicit budgets and reporting must expose both. Do not implement
automatic garbage collection or claim filesystem isolation against hostile code
running as the same Windows account.

## W-1: API and ownership

Create `src/workspace/revision-store.mjs` with:

```js
createWorkspaceRevisionStore({ root, limits })
// returns a frozen, host-only handle:
// capture({ sourceRoot, files: [{ path, sha256 }] })
// revise({ parentDigest, changes: [{ path, expectedSha256, bytes }] })
// inspect(revisionDigest)
// read({ revisionDigest, path })
// describe() -> {protocolId, storePolicyDigest, limits, openedAs,
//                completedCount, pendingCount, storedBytes}
```

All methods are asynchronous except construction validation may throw. `bytes`
is a Uint8Array (Buffer accepted), snapshotted before awaiting. Capture requires
exact predeclared raw-byte SHA-256 values, not a directory discovery scan. Files
may be binary; revision changes replace bytes only at already admitted paths.
Adding/removing files and in-place promotion are explicit later capabilities.

Limits are mandatory positive safe integers:
`maxFiles <= 64`, `maxFileBytes <= 16777216`,
`maxTotalBytes <= 67108864`, `maxRevisions <= 64`,
`maxStoreBytes <= 1073741824`.
These are conservative implementation bounds for this staged-workspace version,
not empirical performance claims. No silent truncation or automatic widening.
Each listed file and the sum must fit the provided smaller limits.

The returned handle is an internal host utility, not an identity or permission
receipt. Absolute roots never belong in the model proposal protocol. Future
Realm admission must independently authorize and bind use of this handle.

## W-2: disk and exact revision identity

The root must be an existing, empty, real dedicated directory for first creation,
or an existing store whose exact canonical `store.json` matches these limits.
Reject source/store overlap in either direction. Never adopt a user directory by
writing a marker over unrelated content. No recursive deletion or overwrite API.

Initialization has one atomic owner boundary: the existing `acquireFileLock`
opens `store.lock` exclusively. Resolve/check the existing real root and reject
obvious unrelated contents first, then acquire the lock and repeat the adoption
decision under that lock. No creator may act on an earlier empty-directory read.
Revalidate the root's canonical path and directory identity after lock acquisition
and before any operation; the lock file and root cannot become accepted aliases.
When store.json is absent, the locked root must contain only this owner's lock.
Create revisions/pending directories exclusively, then publish complete store.json
last. A contender follows ordinary live/recent lock rejection. An interrupted
initialization with missing/invalid marker or directories is rejected and
preserved, never automatically adopted. A valid initialized root has exactly
store.json, revisions and pending, plus its transient checked lock. `openedAs` is
`created` or `reopened` for this handle, not part of persistent revision identity.

Layout:

```text
store.json                 protocol/version/limits, canonical
store.lock                 existing acquireFileLock semantics
revisions/<digest>/
  manifest.json            canonical revision record
  files/<relative paths>   exact materialized file bytes
pending/<random uuid>/     unpublished staging, inert after interruption
```

The unsigned revision record is:

```js
{ schemaVersion: 1, protocolId: 'eternities-workspace-revision-v1',
  storePolicyDigest, parentDigest: null /* or exact parent SHA-256 */,
  files: [{ path, sha256, bytes }], totalBytes }
```

Rows sort by exact path using ordinal ordering. Revision digest is SHA-256 of
canonical unsigned JSON. `manifest.json` adds `revisionDigest` and one newline.
Identical capture in the same policy produces the same digest, independent of
source-root location and timestamps. `inspect`, `capture`, and `revise` return
`{revisionDigest, parentDigest, manifestPath, filesRoot, files, totalBytes}`.
`read` returns a fresh Uint8Array after full revision verification.

Store policy bounds recovery, including occupied destinations. Reopening with
different limits fails rather than changing policy under an existing revision.
The store does not record an actor, grant authority or create a provider journal.
The canonical store policy is `{schemaVersion:1,
protocolId:'eternities-workspace-revision-store-v1',limits}` plus one newline;
storePolicyDigest hashes the canonical JSON value without that newline.

## W-3: path, content and conflict checks

Require nonempty canonical slash-separated relative paths, NFC spelling, no empty,
dot or parent segments, absolute/drive paths, backslashes, control characters,
Windows device basenames, alternate-data-stream colons, or trailing dots/spaces.
Reject case-fold collisions and duplicate paths for portability. Paths have at
most 32 segments and 1024 UTF-8 bytes. No alias normalization into acceptance.

Every source and stored file must be a regular single-link file. Validate each
ancestor and real path under its independently resolved root. Reject symlinks,
junctions and hard links. Snapshot caller arguments before asynchronous work.
Require `stat.nlink === 1` on source and destination, not just realpath checks.
Compare device/inode identity using bigint stats before/open/after reads; reject
unavailable identities and duplicate identities within the selected set. Verify
the materialized destination identities too. Read from a checked file handle,
bound size before/after read and verify digest.
This reduces substitution races; it is not a hostile-same-user OS sandbox claim.

Inspect verifies canonical bounded manifest bytes, all path/limit/digest rules,
the exact materialized file set (including absence of unexpected files or
directories), and actual file bytes. A changed file, manifest, directory or root
fails closed. Cache no verified state across separate public calls.

Revise verifies the complete parent, requires one or more unique admitted changes,
and compares every expectedSha256 to the actual parent's row. Preserve all other
files byte-for-byte. Stale preimages, unknown paths and conflicting occupied
destinations fail before publication. It never repairs or mutates source files.

## W-4: publication and recovery

Reuse `acquireFileLock` for one store operation owner. Build a complete revision
under a unique pending directory, write files exclusively, verify its complete
manifest and bytes, then rename it to the digest-named destination. Occupied
destinations are accepted only after exact full verification of the intended
revision. A same-process concurrency test must prove no partial completed output.

Pending directories are never execution roots and are never returned as completed
revisions. Expose their count and storedBytes through describe. Every completed
or pending directory consumes one maxRevisions slot. `storedBytes` is the sum of
all observed regular file lengths under revisions and pending, including manifests;
it must not exceed maxStoreBytes. maxTotalBytes instead bounds payload bytes in
each intended revision. The fixed store policy (at most 8 KiB) and lock metadata
(at most 4 KiB) are separate; logical byte counts do not claim allocated-disk-block
accounting. Canonical revision manifests have an independent 128 KiB read ceiling.

Before creating pending state, count its exact planned payload plus manifest bytes
and reserve both one slot and those bytes under the store lock. Scan existing
owned pending/completed trees with bounded entry counts and no link traversal;
unknown root entries, excess files or aliased quota entries reject rather than
being ignored. Pending trees may be incomplete but have only the declared layout
and at most maxFiles payload files. They retain and consume their observed bytes.
Identical completed replay consumes no new slot/bytes but still checks existing
budget compliance. Crash leftovers remain inert and preserved, with manual
operator cleanup outside this API. No implicit cleanup or budget widening.

Reconciliation is inspection of the exact expected completed digest. Absent or
incomplete publication is not silently labeled complete. Repeating the same
capture/revision can publish its deterministic result when budget permits, or
verify/reuse the existing complete result. No process execution is repeated by
this component because it performs no process execution at all.

Do not claim power-loss durability from rename or process-death tests alone.
No production crash hooks are needed: tests may construct partial on-disk states
and exercise normal reopening; later integrated host tests own real process kills.

## W-5: acceptance and handoff

Actual temporary-directory tests must demonstrate capture with unchanged source,
binary preservation, exact one-file revision and unchanged siblings, deterministic
replay, reopen/recovery, stale and tampered rejection, extra files, alias attacks,
root overlap/adoption refusal, policy/budget limits, input mutation resistance and
concurrent operations. Test observed bytes, not only self-produced digests.

The next host consumes only verified completed revision roots. It must add its
own explicit actor/Realm authority and a pinned executor policy before running
tests, then bind outcomes to the exact revision. A model's success claim never
replaces independent test evidence. This store alone is neither a Godagent
workspace permission nor a delivered end-to-end coding agent.

## Exclusions and reversal

No provider calls, credential reads, model routing, sandbox installation, shell,
package installation, browser/project execution, original-file mutation, deletion,
GC, new identity, Soul or Lunari integration. Historical receipts stay unchanged.
The first implementation is internal and opt-in. If discarded, no existing
runtime route depends on it; retain user-created stores and experimental evidence.
