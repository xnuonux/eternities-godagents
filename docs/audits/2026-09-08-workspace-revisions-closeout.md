# Workspace revisions closeout

Date: 2026-09-08. Source: `a4cf1df05891d0b2e8eb0801689cb15bffa98cd0`.
Main was fast-forwarded from `12d5d70c3e497f53a1e347c57b26fa8f910f7ca8`
after upstream reconciliation, full verification and independent review.
The feature branch `feat/workspace-revisions` is preserved.

## Delivered boundary

The internal host-owned store provides capture, revise, inspect, read and describe.
It copies explicitly pinned selected files, derives a new materialized revision
without changing the source or parent, verifies canonical manifests and actual
bytes, and retains incomplete staging under explicit slot and logical-byte limits.
It accepts binary and empty files, rejects stale preimages, tampering, invalid
paths, aliases and hard links, and publishes exclusively under one store lock.

This is an actual filesystem substrate, not an agent execution host. No existing
Realm, SDK, actor, provider, identity, continuity or Godskills trust contract was
changed. There is no source promotion, deletion, garbage collection, shell/test
executor, isolation guarantee, Soul activation or Lunari integration.

See the [API and limitations](../workspace-revisions.md),
[design](../superpowers/specs/2026-09-08-workspace-revisions-design.md) and
[completed substrate plan](../superpowers/plans/2026-09-08-workspace-revisions.md).

## Test-first corrections and review

- Capture began with missing-API failures, followed by real pinned-file copying.
- An unlisted empty-directory acceptance regression led to exact directory-set
  verification rather than merely checking the file list.
- A controlled writer grew a real source file after its checked stat. The old
  read delivered 4128 bytes past a 4096-byte policy ceiling. The corrected loop
  bounds allocation and reads to the checked size plus one detection byte.
- A one-slot inventory test observed an entire three-entry directory listing
  before rejection. Incremental bounded enumeration replaces bulk listing.
- Revision began with an absent-revise assertion, then demonstrated an actual
  replacement with unchanged original, parent and sibling bytes.
- A digest-correct forged manifest with array-valued parentDigest reproduced a
  missing rejection caused by RegExp string coercion. Explicit string validation
  closes that structural gap while retaining valid parent behavior.
- Pending hard-link, junction and unknown-entry checks verify rejection and
  preservation. Exact-byte and slot accounting, concurrent calls, full-budget
  replay, mutation resistance and incomplete destinations are exercised.

Independent reviewer `01a07e22-93d9-7c82-981e-91ea6f493e98` cleared capture,
revision/recovery, the additional parent-type correction, documentation and final
integration closure with no remaining critical or important findings.

## Exact verification evidence

Operations root: `D:/00-INDEX/operations/2026-09-08-workspace-revisions`.

| Gate | Observed result | Log SHA-256 |
| --- | --- | --- |
| Full `node --test --test-concurrency=1` at frozen source | 1432 passed, zero failed/cancelled/skipped/todo; exit 0; 1550634.2236ms | `251433b00d1196707dc4cd05b9fcf6afb13104706cee1a7087fdf5021db315d2` |
| Four focused files after exact fast-forward merge | 42 passed, zero failed/cancelled/skipped/todo; exit 0; 2261.4915ms | `80647132d54cb8c85558791ab9f9690a72d941149d1429b7c52a6dbb042183e8` |

Logs are `full-suite-serial-a4cf1df.log` and `postmerge.log`. The full execution
handle 92101 is closed. The 69 historical certification-ledger receipts and all
release-lineage checks passed, including older-head rejection and ambient Git
control-variable resistance. Historical evidence was not regenerated or rewritten.

Focused command:

```text
node --test --test-concurrency=1 tests/workspace-revision-store.test.mjs tests/workspace-revision-recovery.test.mjs tests/file-lock-recovery.test.mjs tests/current-head-publication.test.mjs
```

Source SHA-256: `562ccdf2b5eec5171d69dffd58c100564592ed33718adb7d1ffdfd5e8166a271`.
Capture test SHA-256: `fe7eb899f8be00b8662f06d1f0782619c04470ccaac4f96005d0845d864fceb1`.
Revision/recovery test SHA-256: `feb0978cdf0385fb20ad1087d9e957f6e981e7facd14c9230f1d5cb47c66bc71`.

The new recovery tests construct interrupted filesystem states. They do not
constitute actual process-kill or power-loss durability evidence for this store.
Unrelated existing process-kill tests in the full suite retain their own scope.

## Next actual product outcome

An explicit workspace admission and authenticated operation source must connect
these bytes to the existing persistent actor and mission coordinator. A concrete
host-pinned test executor and its trust boundary must be chosen and qualified;
the old fixture Realm and earlier browser canary do not provide that authority.
The source must bind actor, policy, parent, replacements, completed revision and
independently owned test outcomes, then support interruption recovery and checked
diff export. Only afterward can a fresh matched task evaluate usefulness against
the same model operating without Godagents.

Neither this merge nor its test count establishes model-quality superiority,
universal coding-host completion or consciousness. The wider goal remains open.
