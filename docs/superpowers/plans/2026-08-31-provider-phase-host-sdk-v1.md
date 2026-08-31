# provider phase host sdk v1 implementation plan

## goal

Expose both certified provider families through one explicit credential-free
common host factory and prove their shared phase contract without hiding feature
differences or changing direct provider implementations.

## sequence

1. add failing factory tests for exact family selection, closed configuration,
   common surface, data-only manifests, and zero-work description.
2. implement the minimal registry, manifest verifier, and common host wrapper.
3. add a shared three-phase conformance harness and watch it fail against missing
   cross-family behavior.
4. prove native, review, revision, replay, credential preflight, trusted
   completions, and explicit capability differences for both families.
5. add deterministic fixture, certification receipt, ledger row, lineage gate,
   architecture documentation, and package entrypoints.
6. reproduce evidence twice, run focused and full tests, review the exact diff,
   fast-forward main, push, and clean only this worktree and merged branch.

## exclusions

No automatic provider choice, failover, fallback, live credentials, model
quality claim, provider-specific resolution normalization, default host change,
or Realm, continuity, identity, evolution, Inspiration, Lunari, or Soul change.
