# cross-repository issuance snapshot v1 rebind plan

> **status:** executing after independent review

**Goal:** replace the self-invalidating current-head interpretation with an
explicit issuance-time snapshot while preserving the historical v1 artifact
at Godagents `ddd1a231f23ca341103009ff648de891527096cb`.

**Bound dependency:** Godskills `753db46dee767c167ce15ae7eb4129c3a2075689`.

**Rules:** strict refs only at issuance in a staging/evidence clone; committed
verification is source-commit and blob bound; no Godskills edits; no historical
receipt rewrites; fresh test counts must be `33/894/12`; independent review is
required before integration and push.

## task 1: make the reviewed distinction executable

- [ ] add a distinct issuance-snapshot protocol and status;
- [ ] keep the legacy current-head verifier available for historical v1 bytes;
- [ ] keep strict exact-ref verification in the builder and staging fixture;
- [ ] make the snapshot verifier's default mode source-bound rather than
      current-ref-bound;
- [ ] add a test proving strict moving-ref failure and committed-snapshot
      success.

## task 2: issue and wire the snapshot

- [ ] build `integrations/cross-repository-issuance-snapshot-v1.json` from the
      exact ddd/753 source commits;
- [ ] record `33/894/12` passing gates;
- [ ] update the build and verify CLIs and package scripts to the snapshot
      artifact;
- [ ] leave `integrations/cross-repository-current-head-v1.json` untouched;
- [ ] verify no historical receipts changed.

## task 3: gates and integration

- [ ] run focused snapshot tests and observe the expected red state before the
      generated artifact exists;
- [ ] run focused snapshot tests green;
- [ ] run the full Godagents suite and separate Godskills focused suite;
- [ ] run the snapshot verifier and `git diff --check`;
- [ ] obtain a fresh independent review of the corrected contract;
- [ ] reconcile upstreams, fast-forward local main, rerun release gates, push
      both commits as one unit, and verify the remote head.

## explicit non-goals

- no Godskills implementation or receipt changes;
- no skill-body copying or execution;
- no authority expansion;
- no runtime Godskills routing changes; and
- no Lunari integration.
