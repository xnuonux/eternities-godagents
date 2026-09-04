# cross-repository current-head certificate v1 implementation plan

> **historical note:** this plan produced the preserved v1 artifact. the
> active follow-up uses
> `2026-09-03-cross-repository-issuance-snapshot-v1-rebind.md` and the
> issuance-snapshot CLI.

> **status:** ready for execution

**Goal:** publish and verify a digest-bound current-head integration certificate
for Godagents `95a93f1a115d72f7b25a725e7da42ea4b684faae` and Godskills
`753db46dee767c167ce15ae7eb4129c3a2075689`, without changing Godskills or
rewriting historical receipts.

**Spec:** `docs/superpowers/specs/2026-09-03-cross-repository-current-head-cert-v1-design.md`

**Execution rules:** test first, use only Git blob reads for external evidence,
keep the certificate outside the Godagents historical receipt ledger, run
fresh focused and full gates, obtain independent review, then merge and push
only the fully verified branch.

## task 1: define the certificate contract and red tests

**Files:**

- create `src/integration/current-head-certificate.mjs`
- create `tests/cross-repository-current-head-certificate.test.mjs`

- [ ] write tests for canonical build/verify of both exact heads;
- [ ] test SDK export-map and root digest binding;
- [ ] test Beacon snapshot, historical receipt, and ancestor binding;
- [ ] test host release pin and optional activation trust-root binding;
- [ ] test no-implicit-activation and authority-narrowing evidence records;
- [ ] test exact-head mismatch, file drift, malformed rows, and outer digest
      tampering fail closed;
- [ ] run the focused test and observe failure because the implementation is
      absent.

## task 2: implement the pure verifier and bounded builder

**Files:**

- modify `src/integration/current-head-certificate.mjs`
- create `scripts/build-cross-repository-current-head-certificate.mjs`

- [ ] implement canonical JSON and SHA-256 receipt construction;
- [ ] resolve only full Git commits and read exact blobs with `git show`;
- [ ] validate sorted repository-relative artifact rows and SDK surface;
- [ ] verify the Beacon snapshot and its historical source ancestry;
- [ ] verify the host release pin, all linked Godskills roots, and optional
      adaptive activation rows without executing the external repository;
- [ ] verify evidence and proof-limit structure honestly;
- [ ] run the focused tests to green.

## task 3: build the canonical integration artifact

**Files:**

- create `integrations/cross-repository-current-head-v1.json`
- modify `package.json`
- create `tests/cross-repository-current-head-receipt.test.mjs`

- [ ] run the exact bounded Godagents and Godskills test gates;
- [ ] build the canonical receipt from the reconciled heads;
- [ ] verify the generated receipt against both repositories;
- [ ] verify historical Godagents receipts remain byte-identical;
- [ ] add a package script for explicit build and verify operations;
- [ ] run focused tests and the full Godagents suite.

## task 4: independent review and integration

- [ ] run `npm test` and the release-lineage gate with compact output;
- [ ] request an independent review of the branch and certificate boundary;
- [ ] resolve every important finding or document a real blocker;
- [ ] rerun fresh focused, full, certificate, and release gates;
- [ ] inspect the diff and verify branch cleanliness;
- [ ] merge the verified branch into Godagents main under standing user
      authorization;
- [ ] push Godagents main and verify local, origin, and remote heads match;
- [ ] send the exact commit and receipt digests to the Godskills coordinator.

## explicit non-goals

- no Godskills edits;
- no historical receipt rewrite;
- no skill-body copy;
- no runtime behavior change;
- no new provider adapter;
- no Lunari integration;
- no live model quality claim.
