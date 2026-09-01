# provider resolution profile v1 implementation plan

1. add failing host-description tests for exact family profiles, shared invariants, explicit differences, deep freezing, and cross-family substitution after outer rehash.
2. add closed resolution profiles to the host registry and bind them through existing description verification.
3. add controller-surface tests proving both families still return the same policy-digest, authority-key, inspect, and resolve shape without translating signed payloads.
4. update the deterministic host fixture to record profiles and their exact digests while preserving provider conformance metrics.
5. add a source-bound deterministic receipt, certification test and document, ledger row, lineage count, README, and architecture notes.
6. preserve the OpenAI and provider-neutral signed-resolution source, policy schemas, and receipts byte-for-byte.
7. run focused tests during development, then one complete suite and release gate at certification. reconstruct the final receipt twice before fast-forward integration and push.
