# Admitted local launch implementation plan

1. Add failing argument and service tests for the exact three-path CLI, closed failures, policy pinning, and secret containment.
2. Add failing launch tests that build a real local admission and require exact policy-to-admission path binding, persistent genesis verification, and one successful governed cycle.
3. Add adversarial tests for changed binding, receipt, journal, keel, distribution, instance, Realm, and reparse-shaped admission paths, proving inference and Realm invocation remain zero.
4. Implement a narrow admission loader, reuse the existing host policy and runtime components, and construct only through `createPersistentVessel`.
5. Document the command and explicit exclusions without changing historical certification receipts.
6. Run focused tests, `npm test`, all historical fixture builders, and `verify:certifications`; request independent P0/P1/P2 review.
7. Fetch and reconcile origin, fast-forward the verified branch into main, rerun merged gates, push, verify parity, and remove only this worktree and branch.
