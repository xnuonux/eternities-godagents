# Host-owned workspace revisions

This internal utility captures explicitly selected files and produces immutable-by-
contract successor revisions. It does not run code, edit the original project,
grant an actor permission, or turn the current artifact host into a coding agent.
It is deliberately absent from the public SDK exports.

Implementation: `src/workspace/revision-store.mjs`. Requirements and limitations:
[design](superpowers/specs/2026-09-08-workspace-revisions-design.md) and
[implementation plan](superpowers/plans/2026-09-08-workspace-revisions.md).
The plan records verification status; this API reference is not a release receipt.

## Use from a trusted host

The host supplies an existing empty dedicated directory, an explicit bounded file
list, and independently chosen raw-byte SHA-256 preimages. Do not point the store
at the source project. A matching initialized store may be reopened with exactly
the same limits.

```js
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';

const store = await createWorkspaceRevisionStore({
  root: dedicatedStoreDirectory,
  limits: {
    maxFiles: 16,
    maxFileBytes: 1_048_576,
    maxTotalBytes: 4_194_304,
    maxRevisions: 8,
    maxStoreBytes: 33_554_432,
  },
});
const parent = await store.capture({
  sourceRoot: selectedProjectDirectory,
  files: [{ path: 'src/app.js', sha256: independentlyPinnedSourceDigest }],
});
const child = await store.revise({
  parentDigest: parent.revisionDigest,
  changes: [{
    path: 'src/app.js',
    expectedSha256: independentlyPinnedSourceDigest,
    bytes: new TextEncoder().encode(proposedReplacement),
  }],
});
const verified = await store.inspect(child.revisionDigest);
const bytes = await store.read({ revisionDigest: verified.revisionDigest, path: 'src/app.js' });
const usage = await store.describe();
```

These names are host-provided inputs, not environment-variable discovery or a
suggestion to execute source files. File paths in requests are canonical relative
POSIX paths. Absolute store paths stay outside model proposal protocols.

## Interfaces and identity

All methods are asynchronous. Objects have exact closed field sets.

| Operation | Result and checks |
| --- | --- |
| `capture({sourceRoot,files})` | Copies one or more pinned regular files. No scan, source write, or automatic file selection. |
| `revise({parentDigest,changes})` | Verifies the complete parent, checks each admitted path's expected preimage, replaces selected bytes, and copies unchanged siblings. No adding or deleting paths. |
| `inspect(revisionDigest)` | Rechecks exact canonical manifest, policy, file set, directory set, identities, bounds, hashes and actual bytes. |
| `read({revisionDigest,path})` | Verifies the complete revision and returns a fresh `Uint8Array` for one admitted path. |
| `describe()` | Returns frozen `{protocolId,storePolicyDigest,limits,openedAs,completedCount,pendingCount,storedBytes}`. Inventory is not full content certification for every stored revision. |

Capture, revise and inspect return a frozen projection containing
`{revisionDigest,parentDigest,manifestPath,filesRoot,files,totalBytes}`.
Revision identity hashes canonical metadata binding the exact policy, parent,
ordinally sorted paths, raw-byte digests and byte lengths. It does not depend on
the store location or file timestamps. Capture has a null parent. A child binds
its exact parent even if a replacement has the same bytes as before.

The handle and returned metadata are frozen, but operating-system files are not
made read-only or sealed by a sandbox. External tampering causes later verification
to reject. Do not write directly into published revision roots. A future executor
must independently protect and verify the bytes it uses.

`bytes` accepts a `Uint8Array`, including a Buffer. Revision input views are copied
before the first asynchronous boundary, including shared-memory-backed views.
Zero-byte files and binary content are supported. No text re-encoding or newline
normalization occurs in file payloads.

## Bounds, publication and interrupted state

All five limits are mandatory positive safe integers, no larger than:

| Limit | Hard ceiling |
| --- | ---: |
| `maxFiles` | 64 selected files per revision |
| `maxFileBytes` | 16,777,216 bytes per file |
| `maxTotalBytes` | 67,108,864 payload bytes per revision |
| `maxRevisions` | 64 completed and pending directories combined |
| `maxStoreBytes` | 1,073,741,824 logical bytes under completed and pending directories |

Smaller host limits are enforced without truncation or widening. Stored-byte
accounting includes revision manifests and partial staging files. It excludes
the separately bounded store policy (8 KiB) and transient lock (4 KiB), and does
not estimate filesystem allocation blocks. Source and stored-file reads use
bounded buffers; directory enumeration stops at its first excess entry.

One owned file lock serializes operations. A contender may receive a live/recent
owner rejection; there is no implicit retry queue. Initialization decides whether
it can adopt an empty root under the lock and writes the policy marker last.
Partial initialization is preserved and rejected, not silently repaired.

Before creating a new `pending/<uuid>` directory, the store accounts for existing
contents and reserves a revision slot plus the intended payload and manifest
bytes. It writes files exclusively, verifies the complete pending tree, renames
it to `revisions/<digest>`, and verifies the published result. An occupied digest
is reusable only when it verifies as the intended complete revision.

Interrupted staging remains inert and consumes its observed bytes and one slot.
No operation deletes, collects, or promotes abandoned pending contents. A known
complete revision can be replayed at a full slot budget without creating another
copy. A partial or corrupted completed destination is not repaired or overwritten.
Reopening a handle does not itself certify every revision: use `inspect` on the
specific expected digest before consuming it. Inspection binds the selected
revision, not a recursive certificate of the entire ancestor history.

Reject traversal, ambiguous spelling, case collisions, device names, alternate
data streams, source/store overlap, symlinks, junctions and multiple hard links.
Regular files require available bigint identities and a single link, checked
before/open/after reads. These checks reduce substitution races. They do not
provide adversarial same-user OS isolation or a power-loss durability guarantee.

## Remaining host integration

Before an agent can use this as a coding workspace, the host must supply:

1. An explicit Workspace Realm admission binding actor, selected files, effects,
   budgets and permitted operations. Neither a skill nor this store issues it.
2. A qualified executor policy and concrete trust boundary. Existing fixture and
   artifact profiles must not be relabeled as permission to run arbitrary code.
3. Edit and test outcome receipts bound to exact verified revision bytes and the
   pinned executor, plus governed recovery of interrupted external actions.
4. A fresh end-to-end task and matched native baseline with equal tools, model,
   evidence, history and budgets before making a quality claim.

No model/provider, credential, package installation, execution, Soul or Lunari
integration is introduced by this component.
