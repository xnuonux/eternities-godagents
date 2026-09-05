# implementation plan: revision mission-operation adapter v1

1. add red tests for a source-specific revision bridge, including exact phase
   context binding, body-free generic dispatch, descriptor and ceiling drift,
   reconciliation ordering, malformed result refusal, and terminal replay;
2. implement the smallest source wrapper over `createMissionRevisionExecutor`
   and `createMissionOperationAdapter`;
3. add a deterministic fixture and a receipt builder with direct certification
   gates and explicit proof limits;
4. register the receipt as an append-only historical certification and bind it
   in the current-head v2 certificate with compatibility for earlier heads;
5. run focused, full, ledger, lineage, and current-head verification before
   merging or pushing.

non-goals: delegation, Realm effects, providers, schedulers, hosted
durability, default launch wiring, keel or memory writes, identity mutation,
evolution, Inspiration, Soul, and Lunari integration.
