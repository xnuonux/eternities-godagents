# mission economics ledger v1 implementation plan

## goal

Expose a certified, provider-neutral observation sidecar for completed mission
review evidence while keeping the existing root SDK, mission receipts, and
default launch behavior unchanged.

## tasks

- [x] write focused tests for a closed subpath, deterministic digest-bound
  ledger, exact review evidence aggregation, body exclusion, and fail-closed
  source or output mutation;
- [x] implement the runtime ledger and journal-evidence bridge;
- [x] add the schema-validator registration and the explicit sdk subpath;
- [x] document the boundary, metrics, and proof limits;
- [ ] run focused and full regression gates;
- [ ] perform an independent adversarial review of the output closure and
  source binding;
- [ ] certify from a clean source commit and rebind the release evidence.

## acceptance tests

1. the subpath exposes exactly the documented exports and no authority,
   credential, continuity, or provider controls;
2. one native plus one review result produces deterministic, deeply frozen,
   body-free rows and totals with exact integer arithmetic;
3. cache identity digests remain stable for the exact request and change when
   the request or executor descriptor changes;
4. the completion usage must equal the sum of the verified phase usage;
5. journal-shaped completed evidence yields the same ledger without emitting
   artifacts;
6. missing, extra, substituted, changed, or tampered source and ledger fields
   fail closed;
7. all pre-existing tests, certification receipts, ledger verification, and
   release-lineage checks remain green.

## explicit non-goals

This milestone does not wire the sidecar into the mission kernel, implement a
cache, estimate provider cost, compare model quality, call a network, add a
new host adapter, or change any authority-bearing system.
