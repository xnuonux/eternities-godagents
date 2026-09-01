# provider resolution decision preparer v1 implementation plan

## goal

Expose one pure profile-driven compiler for exact unsigned resolution decisions
and response witnesses while preserving external signing authority and both
certified provider trust roots.

## sequence

1. add failing tests for exact OpenAI-compatible and provider-neutral output,
   canonical signing bytes, immutability, and zero provider work.
2. add rejection tests for malformed descriptions, controller metadata,
   inspection state, dispositions, responses, timestamps, nonces, unknown
   fields, cross-family profile substitution, and authority-shaped input.
3. implement the smallest closed pure compiler and reuse existing family witness
   builders rather than duplicating response-byte semantics.
4. prove an external test authority can sign each prepared decision and each
   existing real controller accepts it without redispatch.
5. add deterministic fixture, receipt, certification, ledger, lineage, and
   package integration evidence without changing either provider trust root.
6. reproduce evidence twice, run focused and full verification, review the exact
   diff, fast-forward main, push, and clean only the merged worktree and branch.

## exclusions

No private key input, signature generation, provider call, retry, automatic
family choice, policy loading, policy translation, model routing, credential
access, durable-state mutation, or expansion of Realm, continuity, identity,
evolution, Inspiration, Lunari, or Soul authority.

