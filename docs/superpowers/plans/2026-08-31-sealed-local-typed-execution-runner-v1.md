# Sealed local typed execution runner v1 implementation plan

1. Write failure-first end-to-end tests using the real pinned local routing and activation binaries.
2. Add the missing verified composition roots to the additive stepper adapter descriptor.
3. Implement one sealed factory that privately shares local process transports across the recoverable compiler and binding rehydration path.
4. Cross-check independently recompiled plan and method digests against the durable compiler record before journal execution.
5. Prove process reconstruction skips completed routing, activation, and persisted node work while executing only the unfinished node.
6. Freeze deterministic evidence, certify the new append-only receipt, update ledger lineage, review, merge, and push.
