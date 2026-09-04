# cross-repository issuance snapshot v1

- **status:** implementation contract
- **recorded:** 2026-09-03
- **implementation repository:** `C:\dev\eternities-godagents`
- **external dependency:** `C:\dev\eternities-godskills`
- **protocol:** `eternities-godagents-cross-repository-issuance-snapshot-v1`
- **artifact:** `integrations/cross-repository-issuance-snapshot-v1.json`

## decision

The active cross-repository artifact is an issuance-time reconciled-source
snapshot. It records the exact commits and ref values that were reconciled in
the staging evidence roots used to issue it. The recorded `main` and
`originMain` values are issuance evidence, not a claim that a repository's
moving refs will remain at those commits after the snapshot or its containing
commit is published.

The prior
`eternities-godagents-cross-repository-current-head-certificate-v1` artifact
and its bytes remain historical evidence in the `ddd1a231` Git history. It is
not rewritten or silently reinterpreted by this snapshot.

## two-stage verification contract

Issuance uses `buildCrossRepositoryIssuanceSnapshot` and is strict. The
Godagents and Godskills evidence roots must resolve `main` and `origin/main`
to the exact supplied commits. The builder verifies the resulting snapshot
with `requireExactRefs: true` before it can be written.

Committed-snapshot verification uses
`verifyCrossRepositoryIssuanceSnapshot` without exact-ref mode. It verifies:

1. the full recorded source commits resolve;
2. every source-bound SDK, host-policy, evidence, Beacon, trust-root, and
   integration blob matches its recorded digest;
3. the recorded issuance refs are full commits equal to the recorded source
   commits; and
4. the receipt bytes and test-run records are canonical and digest-bound.

It does not require the current checkout's `main` or `origin/main` to equal an
older issuance source. Passing committed-snapshot verification therefore
means that the attested source objects remain verifiable, not that the moving
branches are unchanged. Callers that need a live ref assertion must opt into
`requireExactRefs: true` against a staging or evidence root.

The snapshot has status `certified-issuance-snapshot`, making the distinction
visible to consumers. The underlying evidence boundary is unchanged: no
Godskills bodies are copied or executed, no authority is expanded, and the
optional adaptive activation path remains explicit and fail-closed.

## bound issuance

The follow-up snapshot is issued from:

- Godagents `ddd1a231f23ca341103009ff648de891527096cb`;
- Godskills `753db46dee767c167ce15ae7eb4129c3a2075689`; and
- test runs `33` focused Godagents, `894` full Godagents, and `12` focused
  Godskills tests.

## proof limits

This snapshot does not prove arbitrary provider or model quality, arbitrary
unseen-mission routing, live provider quality, multi-host distributed
activation, Soul or Inspiration activation, or that moving repository refs
remain at the issuance source after publication.

## acceptance

1. strict issuance verification passes in an evidence clone whose refs are
   exactly reconciled to the two bound commits;
2. committed snapshot verification passes against the real moving checkouts
   without requiring current ref equality;
3. strict verification against those moving checkouts fails when their refs
   no longer equal the issuance source;
4. source-bound tampering, stale commits, trust-root drift, evidence drift,
   malformed records, and receipt digest drift fail closed;
5. the receipt records exactly `33/894/12` passing test counts;
6. the old v1 artifact bytes and historical certification receipts remain
   unchanged in Git history; and
7. no Godskills working-tree files, skill bodies, or runtime authority paths
   are changed.

## non-goals

- no current-ref pin that becomes self-invalidating after the snapshot commit;
- no historical receipt rewrite;
- no Godskills edits or vendoring;
- no provider call or live model-quality claim; and
- no Lunari, Soul, Inspiration, or authority expansion.
