# portable admitted identity launcher v1 implementation plan

## preregistration

source boundary to coordinate before implementation: Godskills `main` and
`origin/main` at
`3501f20baedc95a7ec25a6535278f463b7f98c19`. no Godskills source change is
part of this milestone.

the implementation must remain isolated until every matrix row passes, the
source-bound receipt is generated, and the current-head cross-repository
certificate is refreshed.

## bounded deliverable

add a provider-neutral, explicit SDK factory that accepts an SDK-issued
portable phase host and launches through the existing admitted sealed identity
vessel. add the smallest provider-neutral dependency description needed to
derive the existing deferred review and revision executors from portable
phase ports. expose the factory through the root SDK only after its contract
and receipt are complete.

do not change default launch, provider policy schemas, Godskills source,
Lunari, Soul, Inspiration, Realm authority, personal-keel ownership, or the
existing provider-backed launcher.

## preregistered acceptance matrix

| id | acceptance condition | proof shape |
|---|---|---|
| PA-01 | only an SDK-issued portable host with the exact portable protocol and closed authority can construct | positive fixture plus unissued, forged, and authority-drift failures |
| PA-02 | all native, review, and revision descriptors are read and verified equal to the host description | descriptor call-count and descriptor-drift tests |
| PA-03 | the derived dependency description is canonical, deeply frozen, deterministic, and digest-bound | rebuild equality, freeze, digest, unknown-field, and mutation tests |
| PA-04 | the exact pinned Godskills release and activation trust-root digests are retained without copying skill bodies | release-pin verification and body-free description assertions |
| PA-05 | review and revision dependency descriptors bind their transport and materializer digests exactly | positive binding plus release, transport, and limit drift tests |
| PA-06 | portable host authority cannot expand mission, identity, Realm, continuity, keel, evolution, Inspiration, or Soul authority | authority projection and authority-shaped input rejection tests |
| PA-07 | the launch request is forwarded only through the existing admitted identity vessel and rejects policy, genesis, residency, request, and dependency drift | fixture launch and fail-closed integration tests |
| PA-08 | exact terminal retry and a process-boundary recovery perform no duplicate phase dispatch | recovery fixture with native/review/revision call counters |
| PA-09 | credentials, endpoints, models, raw provider settings, callables, and transport bodies do not enter the launcher description or durable state; caller-controlled executor prefixes are rejected | recursive secret/field scan and canonical durable-state assertions |
| PA-10 | root SDK export and description remain explicit, versioned, and backwards-compatible; default launch remains unchanged | SDK surface regression and default-path non-adoption tests |
| PA-11 | current-head integration binds the portable launcher entrypoint, tests, exact Godskills head `3501f20`, and updated test cardinalities | cross-head certificate, source manifests, and strict verifier |
| PA-12 | the release receipt records only the bridge claim and its proof limits | certification receipt reconstruction and ledger/lineage verification |

## test-first order

1. add contract tests and the fixture boundary for PA-01 through PA-06;
2. implement the provider-neutral dependency description and its exact
   transport pinning;
3. add launcher integration tests for PA-07 through PA-10;
4. implement the explicit SDK factory and root export;
5. add the fixture, source manifest, certification receipt, and receipt tests
   for PA-11 and PA-12;
6. refresh the current-head certificate against the reconciled Godskills head,
   run the full suite, verify the ledger and release lineage, then merge.

## risks and mitigations

- duplicating provider-specific assumptions: require the portable protocol and
  retain all host-specific behavior behind the portable phase ports;
- accidentally creating a second identity-vessel path: delegate launch to the
  existing admitted launcher and compare all descriptors to policy;
- treating a valid host description as authority: retain the empty portable
  authority projection and the existing host ceilings;
- certifying a fixture as a live provider: state fixture and quality proof
  limits in the receipt and documentation;
- changing a shared certificate from an isolated branch: rebuild only after
  the feature is merged and `main`/`origin/main` are reconciled.
