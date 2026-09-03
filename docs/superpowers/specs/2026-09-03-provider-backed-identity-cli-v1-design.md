# provider-backed identity cli v1 design

## purpose

The provider-backed identity launcher is certified as a programmatic boundary,
but the repository has no narrow operator entrypoint for invoking it. This
phase adds one explicit CLI without widening the launcher, identity host, or
provider policy authority.

The CLI accepts a canonical structured mission request, verifies the admission
and identity policy before constructing provider services, constructs an
explicit provider-phase host from a family and policy path, and delegates only
through `createAdmittedProviderBackedIdentityLauncher`. It emits a compact,
credential-free terminal projection.

This is an operator surface, not a claim that a live provider is available,
that a mission will succeed, or that remote delivery is exactly-once. Those
properties remain dependent on the selected provider transport and the
existing certified runtime.

## evidence and decision

Verified repository evidence at `dd2466d`:

- `createProviderPhaseHost` requires an explicit supported family and a
  policy path, and returns an SDK-issued host.
- `createAdmittedProviderBackedIdentityLauncher` accepts only a certified host,
  a Godskills release pin, explicit review and revision materialization
  ceilings, and an executor prefix.
- `launchAdmittedSealedIdentityMission` rechecks admission, policy integrity,
  request ceilings, routing, dependencies, residency, and the sealed vessel.
- `IdentityBoundMissionVesselRequest` already defines all consequential mission
  fields. Synthesizing those fields from a plain text mission would invent
  authority, budgets, observations, or stop conditions.
- the existing `launch:local` CLI is a separate local-agent bridge and remains
  unchanged.

Decision: the provider-backed CLI uses a canonical JSON file containing the
  complete `IdentityBoundMissionVesselRequest`, not a plain text objective.
The request id is also passed explicitly and must equal
`request.mission.missionId`, making the invocation auditable and preventing a
request file from being launched under another id.

The provider policy digest is computed from its canonical bytes and pinned in
the in-memory environment using the family-specific policy pin variable. The
provider policy and mission request are operator-controlled named inputs and
may live outside the admission tree; only the identity runtime paths and the
host-owned provider runtime directory are admission-bound. No credential value
is accepted as an argument or printed.

The launcher dependency descriptors include the materialization limits in
their binding digests, but the identity policy schema does not expose those
limits separately. The CLI therefore requires explicit bounded review and
revision byte ceilings and derives the shared executor prefix from the
identity policy's paired executor ids. A mismatch or non-paired policy fails
closed.

## command contract

Package script:

```text
npm run launch:provider-backed -- --family <family> --provider-policy <path> --admission <root> --policy <path> --identity-policy-digest <digest> --mission <request.json> --request-id <id> --review-materialized-bytes <bytes> --revision-materialized-bytes <bytes>
```

Required options, each exactly once:

- `--family`, one of the provider-phase host SDK families
- `--provider-policy`, canonical provider transport policy JSON
- `--admission`, safe admission root
- `--policy`, canonical identity host policy JSON
- `--identity-policy-digest`, 64 lowercase hexadecimal digest of the identity
  policy bytes
- `--mission`, canonical JSON `IdentityBoundMissionVesselRequest`
- `--request-id`, safe identifier equal to the request mission id
- `--review-materialized-bytes`, integer from 128 through 16,777,216
- `--revision-materialized-bytes`, integer from 1,024 through 16,777,216

Unknown, duplicate, missing, malformed, or credential-shaped options fail
closed. In particular, the CLI has no api-key, token, secret, password,
authorization, or arbitrary environment option.

## preflight and authority boundary

Before host construction, the runner:

1. parses the closed option set and resolves only the named paths;
2. asserts the admission tree is a real, symlink-free tree and reads its
   canonical binding;
3. loads the canonical identity policy, checks the supplied digest with a
   timing-safe comparison, and checks policy paths against the admission;
4. verifies the mission request schema and requires its mission id to equal
   `--request-id`;
5. verifies the policy contains a paired review and revision executor
   descriptor, derives their common executor prefix, and checks the supplied
   materialization limits are safe integers within the existing limits;
6. canonicalizes and hashes the provider policy, sets only its family-specific
   pin in an in-memory environment, and constructs the SDK-issued host under
   a verified admission-owned runtime directory;
7. constructs the admitted provider-backed launcher using the identity policy's
   Godskills release pin and derived executor prefix;
8. calls `launcher.launch` with the structured request and identity digest.

The CLI supplies no provider choice to the launcher. The family is consumed
only by the host SDK, while the launcher receives the resulting certified host.
The launcher itself supplies the identity policy pin to the sealed identity
launch. Provider credentials are resolved only by the provider policy's named
environment variable and remain in process memory and transport headers.

## output contract

Success writes one canonical JSON object to stdout and nothing to stderr:

```json
{
  "acceptedArtifactDigest": "<digest or null>",
  "authorityExpanded": false,
  "missionCompletionReceiptDigest": "<digest>",
  "missionId": "<id>",
  "protocolId": "eternities-provider-backed-identity-cli-v1",
  "receiptDigest": "<digest>",
  "schemaVersion": 1,
  "status": "completed",
  "verdictDigest": "<digest>"
}
```

The projection is derived from the verified identity-bound vessel completion
and mission verdict. It deliberately omits raw artifacts, provider responses,
paths, policy contents, and credentials.

Failure writes only this canonical shape to stderr:

```json
{"code":"<closed-code>","schemaVersion":1,"status":"failed"}
```

Stdout remains empty on failure. Error messages never echo argument values,
paths, environment values, provider responses, or caught exception text.

## non-goals

- no changes to `launch:local`;
- no live provider call in automated tests;
- no new provider family;
- no provider retry, fallback, or ambient model routing;
- no changes to identity policy schema, sealed vessel authority, or certified
  release roots;
- no new certification receipt for live provider quality or availability;
- no receipt-ledger mutation unless a later bounded certification phase proves
  this operator surface as an independent certified protocol.

## acceptance

- parser accepts exactly the documented option set and rejects malformed,
  duplicate, unknown, and credential-shaped options;
- request loader accepts canonical structured vessel requests only, rejects
  noncanonical or credential-bearing JSON, and binds request id;
- runner preflights admission, policy digest, policy binding, executor pair,
  provider policy digest, and bounded limits before any host is constructed;
- injected-service integration tests prove the runner passes the exact family,
  policy, request, identity digest, and derived dependency configuration;
- terminal success output is canonical, compact, and credential-free;
- failure output is closed and does not leak paths or secrets;
- existing tests, certification ledger, release lineage, and protected roots
  remain unchanged except for documented source and test additions;
- full repository tests, certification verification, release-lineage
  verification, clean diff checks, and independent review pass before merge.
