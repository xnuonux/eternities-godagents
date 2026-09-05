# Realm consequence mission-operation adapter v1 plan

## goal

attach the certified recoverable Realm consequence host to one exact
mission-program operation while preserving the host's effect and recovery
ownership.

## steps

1. write red tests for source binding, body-free requests, exact ceilings,
   host-state recovery, descriptor and contract drift, compact projection,
   crash recovery, and terminal replay;
2. implement the adapter over the branded recoverable host and add only the
   smallest source descriptor support required for stable host verification;
3. build a deterministic fixture with a fixed local Realm, fixed proposal,
   fixed clock, and no external connector;
4. add a source-bound certification receipt, ledger registration, current-head
   evidence, command surface, and release-lineage assertions;
5. run focused tests, the full suite, direct receipt reconstruction, current-
   head verification, certification-ledger verification, and release lineage;
6. merge the fully verified branch into main, refresh the cross-repository
   current-head artifact, push, and rerun all post-push gates.

## non-goals

do not change the default vessel, add a live connector, duplicate Realm
policy, create generic rollback, add delegation or scheduling, copy
Godskills, write keel or memory, mutate identity or evolution, activate
Soul, or integrate Lunari.
