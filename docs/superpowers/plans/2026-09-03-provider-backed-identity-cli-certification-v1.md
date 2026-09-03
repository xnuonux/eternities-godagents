# provider-backed identity cli certification v1 implementation plan

**Goal:** add the 46th append-only certification receipt for the deterministic
provider-backed identity CLI boundary while preserving all existing receipts.

**Spec:** `docs/superpowers/specs/2026-09-03-provider-backed-identity-cli-certification-v1-design.md`

**Branch:** `feat/provider-backed-identity-cli-certification-v1`

**Base:** `f84bca5bd579b90608931e98c645b2536a793c6e`

## task 1: lock fixture metrics and certification contract with red tests

**Create:** `tests/provider-backed-identity-cli-certification.test.mjs`

Add tests for the deterministic fixture, exact canonical fixture file, direct
parent binding, receipt reconstruction, forged metrics/parent/review failure,
and the exported certifier functions. Before the receipt and certifier exist,
the certification-specific tests are expected to be red.

Run the non-certification CLI suite separately while the receipt is absent:

```text
node --test tests/provider-backed-identity-cli-contracts.test.mjs tests/provider-backed-identity-cli.test.mjs tests/provider-backed-identity-cli-integration.test.mjs
```

## task 2: build the deterministic CLI fixture

**Create:** `tests/helpers/provider-backed-identity-cli-certification-fixture.mjs`

Use the exported CLI runner with real admission-tree and identity-policy
preflight, the SDK host and launcher constructors, real canonical provider
policy loaders, real structured mission validation, and a fixed terminal
completion injected only at the launch-result seam. Cover both families,
failure paths, the child-process no-argument smoke, and a counting fetch guard
that fails closed on any provider call. Do not include temporary paths,
credentials, raw artifacts, or provider bodies in the returned fixture.

**Create:** `scripts/build-provider-backed-identity-cli-v1-fixture.mjs`

Write canonical fixture JSON to the requested path. Build twice and assert
canonical byte equality before committing the fixture.

## task 3: register the future receipt and source-bound certifier

**Modify:** `src/certification/verify-ledger.mjs`, `tests/certification-ledger.test.mjs`, `tests/release-lineage.test.mjs`, `package.json`

Register `provider-backed-identity-cli-v1.json`, preserve the historical link
sets of all existing receipts, add the new receipt's all-prior link set, import
its source reconstruction function, and update count assertions from 45 to 46.

**Create:** `scripts/build-provider-backed-identity-cli-v1-receipt.mjs`

Follow the existing source-bound certifier pattern. Verify canonical fixture,
closed requirements and metrics, parent receipt identity, all prior receipt
hashes, protected roots, manifests, independent Terra review, and exact source
ancestry. Allow only the receipt and certification markdown as post-source
outputs.

## task 4: generate and independently review the candidate

Commit the implementation, fixture, certifier, ledger registration, tests,
README, architecture, spec, and plan. Run focused CLI tests, fixture rebuilds,
`git diff --check`, and a read-only independent Godagents review. Add the exact
review attestation only after the candidate commit is fixed.

## task 5: generate the receipt and final certification evidence

Run:

```text
npm run certify:provider-backed-identity-cli
```

The builder writes the 46th receipt and certification note, then reruns the
focused, full, and release test sets. Verify two receipt reconstructions and
the exact fixture digest.

## task 6: merge and verify canonical main

Run the full suite, certification verification, release-lineage verification,
and `git diff --check` on the candidate and after merge. Refetch Godagents and
Godskills before integration. Fast-forward and push only the fully verified
Godagents branch, preserve the untracked canonical `package-lock.json`, keep
all historical worktrees untouched, and remove only this clean worktree and
branch after remote parity is confirmed.
