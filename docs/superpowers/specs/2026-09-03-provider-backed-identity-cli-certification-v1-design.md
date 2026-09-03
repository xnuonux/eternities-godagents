# provider-backed identity cli certification v1 design

## purpose

The provider-backed identity CLI is implemented and regression-tested, but its
operator boundary is not independently represented in the append-only
certification chain. This phase certifies the boundary as a deterministic,
provider-neutral operator surface without claiming live provider quality.

The receipt is the 46th ledger entry and links directly to the existing
`admitted-provider-backed-identity-launcher-v1` receipt. All 45 historical
receipts remain byte-for-byte unchanged.

## evidence and decision

Verified starting evidence at `f84bca5`:

- the CLI parser accepts one exact closed option set and rejects credentials,
  unknown options, malformed values, and duplicate options;
- the mission loader requires canonical structured
  `IdentityBoundMissionVesselRequest` JSON and binds `--request-id`;
- admission, identity policy, provider policy, and dependency construction are
  ordered so integrity failures occur before host construction or launch;
- both registered provider families use their own canonical policy pin;
- the terminal projection verifies the linked mission receipt and verdict,
  digest links, empty authority expansion, and accepted artifact digest before
  emitting any output;
- `launch:local` and the existing 45-receipt chain are separate surfaces.

Decision: certify only the CLI's deterministic boundary and injected launch
result composition. The fixture runs both provider families with canonical
policy files, a real symlink-free admitted tree, the production identity-policy
loader and admission binding verifier, and SDK-issued provider hosts plus
launcher construction. The terminal launch result remains a fixed injected
completion, and a counting fetch guard fails the build if any provider request
is attempted. The child process is used only for the closed no-argument failure
path.

## proof boundary

The fixture must reproduce exactly twice and bind:

- both canonical provider-family policy digests and their distinct pin names;
- one canonical structured vessel request per family;
- one canonical identity policy digest and production admission binding per
  family;
- explicit review and revision materialization ceilings;
- the executor prefix derived from the paired identity policy descriptors;
- one SDK-issued host construction per family and zero provider calls;
- one safe canonical stdout projection per family;
- malformed-result rejection, identity/provider/request preflight rejection,
  child-process parser failure, empty failure stdout, and no path, credential,
  artifact, or raw provider-response disclosure.

The fixture reports only stable digests, counts, booleans, and closed codes. It
does not store temporary absolute paths, policy contents, credentials, raw
artifacts, provider responses, or model output.

## receipt contract

Certification id: `provider-backed-identity-cli-v1`

Protocol id: `eternities-provider-backed-identity-cli-certification-v1`

Direct parent:

```text
receipts/admitted-provider-backed-identity-launcher-v1.json
```

The receipt contains the source commit, direct parent receipt identity,
historical receipt file hashes for all prior entries, protected trust-root
hashes, implementation and test manifests, canonical fixture, requirements,
metrics, focused/full/release test runs, independent review attestation, and
explicit proof limits. Its outer digest is SHA-256 over canonical JSON without
the digest field.

The certifier reconstructs the receipt from the source commit, verifies the
parent and historical links, proves that the independent review commit differs
from the source only by the review artifact, and allows only the receipt and
certification markdown to be written afterward.

## requirements

- `APBIC-001`: both supported families pass the same closed CLI boundary with
  distinct policy pin variables;
- `APBIC-002`: canonical mission and identity digests bind the exact request
  and admission evidence;
- `APBIC-003`: admission, identity, provider, and request failures happen
  before host construction or launch;
- `APBIC-004`: explicit materialization ceilings and derived executor prefix
  are passed exactly to the certified launcher factory;
- `APBIC-005`: no provider call occurs in the injected deterministic fixture;
- `APBIC-006`: terminal projection accepts only linked, schema-valid,
  digest-valid, authority-empty completion evidence;
- `APBIC-007`: malformed result and child-process parser paths keep stdout
  empty and emit only closed failure codes;
- `APBIC-008`: credentials, paths, raw artifacts, and provider responses do not
  enter fixture output or terminal projections;
- `APBIC-009`: two builds, source manifests, parent receipt, protected roots,
  independent review, ledger, and release lineage reproduce exactly.

## metrics

The stable fixture metrics are:

```text
families = 2
hostConstructionCalls = 2
providerCalls = 0
deterministicRuns = 2
outputLeaks = 0
malformedResultAccepted = 0
failureStdoutBytes = 0
authorityExpanded = false
parentReceiptBound = true
```

## explicit exclusions

- live provider quality, availability, latency, pricing, or truth;
- credential possession or credential validity;
- remote exactly-once execution;
- new provider families;
- CLI model selection, retry, fallback, or ambient routing;
- certification of the programmatic raw-return helper beyond the CLI's verified
  output path;
- changes to `launch:local`, Godskills release roots, Realm, continuity,
  personal-keel, evolution, Inspiration, Lunari, or Soul authority.
