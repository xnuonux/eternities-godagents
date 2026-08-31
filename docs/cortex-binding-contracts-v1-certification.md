# cortex binding contracts v1 certification

## disposition

certified as a deterministic inert compiler boundary at source commit
`31be3e056bd781fbc5cdb2235603bec6a4fc4001`.

the canonical receipt is `receipts/cortex-binding-contracts-v1.json`:

- logical receipt digest:
  `9249597c7af6d2fa68fb760e596f59aa6f10919f9b1ba8d99f6f053d848312a0`
- receipt file sha-256:
  `a015867746db453556e1339d834fc07dc11abde89db7b0787c1adce918a35320`
- deterministic fixture logical digest:
  `0f2600c2c4c291c7d300be9dd869bedcd25d42bb30741cad957fa8dfe70e5d6f`
- deterministic fixture file sha-256:
  `f879eddea1b7fc44de8a3c82f5cf9a8a25b73e4f1f6ce879b5a6e832dc91a90f`
- protocol: `eternities-godagent-cortex-binding-v1`
- requirements: `CBP1-001` through `CBP1-010`, all pass

## verified boundary

one compiler now accepts the full verification inputs for an admitted local
Godagent plus a strict task-and-mission request. it independently verifies the
genesis receipt, creation build, distribution, journal binding, and current
personal-keel chain before projecting identity. the creation verifier now
returns one deeply immutable source snapshot, while its historical
manifest-only API remains compatible.

the compiled artifact contains a canonical full envelope, a byte-bounded model
projection, independent section digests, an envelope digest, a projection
digest, and a complete candidate digest. its binding candidate id includes the
verified admitted identity, current keel head, target task surface, host adapter,
and revocation epoch. mission text does not participate in identity derivation.

the artifact is always `compiled-inert` and `active: false`. it grants zero
effects, carries no continuity body, exposes no writer or launcher, and records
the constitutional and exact Realm-contract ceilings only as blocked boundaries.
a copied artifact therefore carries no activation power.

## deterministic fixture

the fixture builds and admits two identities at a fixed clock through the real
creation, distribution, genesis, journal, and keel paths. both target the same
Codex task surface. the result proves:

- repeated compilation is byte-identical;
- Aether Architect and Quiet Architect retain distinct binding, genesis, and
  identity digests on the same task surface;
- an impersonating mission changes the mission and envelope digests but cannot
  change the admitted identity or binding candidate id;
- active bindings: zero;
- granted effects: zero;
- imported keel-history entries: zero;
- every full-envelope section digest re-verifies;
- path-shaped task ids and impossible budgets fail closed;
- expression is removed as one whole section and replaced by its exact digest
  when the model-projection budget is one byte below the uncompressed result.

## test evidence

- focused creation, admission, binding, schema, persistent-vessel, and launch
  tests: 47 passed, 0 failed
- complete repository suite: 387 passed, 0 failed
- deterministic fixture rebuild: byte-for-byte exact
- receipt rebuild: canonical and digest-exact
- certification ledger: eleven canonical receipts with exact historical links
- release lineage: every certification source is an ancestor of the release
  head

## inline adversarial review

no subagent or independent reviewer was used because the user required inline
execution. the inline review found and retained regression coverage for these
boundaries:

1. accepted request fields originally needed an additional opaque-identifier
   and lowercase hexadecimal digest check beyond structural length checks;
2. compact projections now prove a fixed prefix removal order, preventing a
   re-signed artifact from discarding a higher-priority section before a lower
   one;
3. each envelope section and the complete Realm contract now carry independent
   digests for exact cache reuse and later host rehydration;
4. changed full envelopes, model projections, creation artifacts, and keel state
   all fail before a candidate can be accepted.

no unresolved critical defect remains in the certified phase-1 surface.

## proof limits

this receipt does not certify a live Codex task binding, binding registry,
exclusive writer lease, cortex-request integration, active Godskill contract,
continuity-body admission, compaction recovery, Realm effect, personal-keel
write, cross-model behavioral quality, independent review, Lunari integration,
or Soul activation. these remain subsequent Cortex Binding Protocol phases.
