# cross-repository current-head certificate v2 implementation plan

## task 1: red gate

- add tests for exact reconciled heads and the v2 protocol;
- require the expanded SDK export set and supported adapter protocol;
- bind the portable conformance receipt and source ancestry;
- reject old heads, SDK drift, portable receipt drift, and ref movement;
- prove both v1 artifacts remain byte-identical;
- run the focused tests and preserve the absent-export failure.

## task 2: versioned verifier and builder

- preserve v1 behavior through an explicit legacy evidence profile;
- add only the v2 SDK and portable-receipt evidence profile;
- read exact source blobs, enforce canonical bytes, and fail closed on drift;
- add no Godskills code or runtime routing behavior.

## task 3: canonical artifact and gates

- add a v2 build/verify command and canonical integration artifact;
- record fresh exact test counts for both repositories;
- verify the ledger, release lineage, cross-repository artifact, and full suite;
- verify the historical artifacts are unchanged.

## non-goals

- no Godskills edits or capability-body copying;
- no live provider or external host adapter;
- no runtime mission, routing, authority, Realm, keel, Lunari, or Soul change;
- no rewrite of any existing receipt or historical integration artifact.
