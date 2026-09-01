# provider resolution authority outbox v1 implementation plan

1. add failing tests for absent preparation, immutable request publication,
   awaiting-signature replay, signed submission, and exact terminal recovery.
2. add interruption tests after request publication, signed-return publication,
   controller acceptance, and terminal publication.
3. add hostile-state tests for changed records, unknown entries, unsafe roots,
   concurrent submissions, contradictory responses, and credential canaries.
4. implement the smallest canonical operation records, lock discipline, and
   controller reconciliation over the certified handoff protocol.
5. freeze a deterministic fixture and source-bound receipt, register receipt 43,
   run focused, full, release, and merged-main gates, then push and clean.

No provider retry, private key, signature generation, raw response persistence,
ambient family selection, policy translation, or Realm, continuity, identity,
evolution, Inspiration, Lunari, or Soul authority enters this milestone.

