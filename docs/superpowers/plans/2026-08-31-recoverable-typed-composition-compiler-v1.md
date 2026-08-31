# Recoverable typed-composition compiler v1 implementation plan

1. freeze Godagents main, the new typed-composition consumer receipt, and all
   existing recoverable Godskills contracts.
2. define closed schemas and validators for topology, compiler intent, compact
   compilation receipt, and pending projection.
3. write failing tests for intent-before-route ordering, exact topology
   persistence, activation-bound field materialization, and branded handles.
4. implement the durable compiler around an internally constructed
   recoverable Godskills adapter and pinned typed-composition adapter.
5. write failing recovery tests for interruption after durable Godskills
   binding and after compilation publication.
6. reconstruct from stored intent without caller replay, rehydrate without
   external route or activation work, recompile the private method, and compare
   the exact compact receipt.
7. write adversarial tests for changed topology, binding input, release root,
   activation identity, record bytes, symlinked state, forged handles, missing
   executors, malformed inputs, and malformed outputs.
8. retain one deterministic Muse-to-Forge execution fixture and prove that no
   capability method or reviewer body enters compiler state.
9. issue one append-only certification receipt from the exact source commit,
   update the certification ledger from 29 to 30 receipts, and run focused,
   full, and release-lineage gates.
10. fast-forward canonical main, push, and remove only the verified clean
    feature worktree.

## stop conditions

- the compiler must infer any semantic topology field;
- a caller-supplied activation result can enter the plan;
- the compiled private method must be serialized;
- changed intent can reuse one mission slot;
- recovery requires another route or activation execution;
- an existing default path or historical receipt must change;
- any unresolved critical or important defect remains.
