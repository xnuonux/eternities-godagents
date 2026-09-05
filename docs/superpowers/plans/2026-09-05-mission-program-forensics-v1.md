# mission-program forensic projection v1 implementation plan

## goal

Add one read-only, digest-bound forensic projection method to the authentic
mission-program coordinator, certify it locally, and update current-head
evidence without changing any execution path.

## task 1: define the public schema and constants

- add `schemas/mission-program-forensics.schema.json`
- register it in `src/core/schema-validator.mjs`
- export the protocol id from `src/runtime/mission-program.mjs`
- keep the schema exact-keyed and bounded

acceptance:

- the schema accepts only the canonical full and prefix projection shapes
- unknown fields, oversized summaries, non-contiguous sequences, and invalid
  digests fail closed

## task 2: add test-first projection cases

- add `tests/mission-program-forensics.test.mjs`
- create fixture programs with at least admission, prepared, committed, and
  terminal boundaries
- assert deterministic bytes and digest
- assert prefix state summaries and absent behavior
- assert no adapter calls, writes, or payload disclosure
- assert corrupted future events and artifacts still fail closed

acceptance:

- tests fail before implementation for the missing method
- each contract invariant in the design has a direct assertion

## task 3: implement the smallest read-only method

- factor no new execution authority out of the coordinator
- reuse the existing verified replay result
- derive event and step metadata only
- validate the serialized result against the new schema and digest it
- enforce the output ceiling before returning
- expose `forensics` only on authentic coordinators

acceptance:

- `execute`, `recover`, and `inspect` behavior is unchanged
- the method performs no adapter call, lock acquisition, or write
- all malformed and tampered inputs fail closed

## task 4: certify the bounded boundary

- add a deterministic fixture builder and certification receipt
- include focused and full test counts
- register the receipt in the append-only ledger
- update the architecture and README with exact proof limits
- update the current-head builder and tests to bind the new receipt

acceptance:

- focused tests, full suite, ledger, release-lineage, and current-head gates
  pass
- the receipt source commit is the implementation commit, and the final
  current-head artifact is an append-only certificate commit
- no Godskills files or source bodies are copied or modified
