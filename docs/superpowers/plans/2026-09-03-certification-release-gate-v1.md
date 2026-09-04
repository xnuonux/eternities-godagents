# certification release gate v1 implementation plan

## bounded milestone

Replace only the redundant post-receipt Realm release test bundle with a
versioned release-gate adapter. Keep the existing focused and complete suite
runs, receipt schema, certification ledger, release-lineage verifier, and
runtime behavior unchanged.

## implementation sequence

1. Add red tests for the exact frozen release-gate plan and unsafe focused test
   path rejection.
2. Implement the provider-neutral release-gate plan and runner. Use the
   existing test runner for the focused test, invoke the two existing verifier
   entrypoints directly, and compare their published ledger evidence.
3. Add the adapter and plan test to the Realm source and test manifests.
4. Change the Realm certifier's final release step to call the adapter after
   the final receipt is written. Keep the preliminary and complete suite runs.
5. Run the focused adapter test, the Realm certifier, the full test suite, the
   certification ledger verifier, and the release-lineage verifier.
6. Record exact commit, receipt, ledger, lineage, test-count, and file-hash
   evidence for independent review before integration.

## acceptance tests

- the plan has exactly three ordered steps and is deeply frozen;
- the plan names the focused certification test and both direct verifier
  entrypoints exactly;
- empty, traversal-shaped, backslash, control-character, and non-test paths
  fail closed;
- a successful release gate reports one focused result and two verified direct
  verifier results;
- the lineage receipt count and ledger digest match the direct ledger result;
- the Realm certifier no longer reruns the ledger and lineage suites in its
  final release step;
- the existing focused suite, full suite, certification ledger, and release
  lineage all pass after the change;
- the new Realm receipt reconstructs exactly from its pinned source commit.

## proof requirements

The release report must identify the adapter protocol, focused test count,
direct verifier scripts, ledger digest, release head, receipt count, and
release-lineage digest. The updated Realm receipt must bind the exact adapter,
plan, and test manifests. Historical receipt files and their provenance must
remain unchanged.

## explicit non-goals

- no new durable receipt schema or receipt-chain rule;
- no change to ledger or release-lineage verifier semantics;
- no removal of the full repository test suite;
- no live Realm connector, rollback, delegation, scheduler, public SDK,
  Godskills body, keel, memory, identity, evolution, Soul, or Luna integration;
- no merge or push from this worktree.
