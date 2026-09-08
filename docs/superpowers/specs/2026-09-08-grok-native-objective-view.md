# Grok native objective wire view

## Decision

Choose an opt-in, lossless, compiler-only objective reference. Baseline full
requests remain the default. Do not implement semantic field removal or a general
reference table. This is transport presentation, not a new mission, identity,
Godskills, or authority contract.

The exact offline reconstruction at
`D:/00-INDEX/operations/2026-09-08-godagent-context-profile/profile.json`
(SHA256 `671bd5f8ff6fc3f72c44cc88d781e8958e758de9aeb8ef006116be608c80e709`)
matched the recorded 14,592-byte request. The objective appeared twice (1,445
canonical bytes each). The matched live pair had equal optimal answers and
37.4% more input on the Godagent arm. Those observations justify measuring a
narrow presentation change, not claiming model improvement.

## Alternatives

- Full baseline: zero migration risk; retains observed duplication.
- Selected objective reference: exactly reversible, small surface; limited
  savings and an unqualified change in how a model reads the request.
- Strip or alias proof metadata: potentially larger savings, but changes exact
  citation and identity-link availability. Excluded until separately justified.

## Contract

Node >=24; no new dependencies. Optional digest-pinned provider field
`nativeContextProfile: "objective-reference-v1"` applies only to Grok native
request compilation. Unknown values fail closed. Absence preserves exact
request bytes. Review, revision, other providers and completion/replay contracts
are unchanged.

Build only from a verified provider-neutral native input. Keep the complete
original dispatch, package and receipts. Require the two objective strings to
be byte-identical. Replace only `input.missionPackage.mission.objective` with
`{"$ref":"/modelProjection/mission/objective"}`. The fixed reference is resolved
relative to `input`; no arbitrary pointer evaluation or external retrieval.

The closed wrapper has `schemaVersion: 1`,
`protocolId: "eternities-grok-native-objective-view-v1"`, `inputDigest`, `input`,
and `viewDigest`. The latter hashes the other four fields. Reconstruct and check
against a separately held original input digest before constructing the request.
Bound and deep-freeze the view. The final request digest binds its version,
content, reference, and digest. Never use the view as an admission or receipt.

Reject mismatched objectives, changed metadata, invalid references/versions,
incorrect digests, malformed structures, or byte overflow. No silent fallback.
The initial profile may increase bytes for short objectives; selection is
explicit, not advertised as universally cheaper.

## Proof and promotion

Require exact canonical round-trip, default wire compatibility, immutable source
dispatch, unchanged completion identities, malformed/tampered input rejection,
policy pin migration, targeted transport tests, independent review and merged
integration gates. Offline bytes are not tokens. Live matched quality and usage
are a separate promotion gate; do not make this the default without evidence.

Rollback: omit the optional field in a newly pinned policy for new missions.
Preserve old policies and journals so already-bound work still replays. Revisit
only if measured savings are material and live behavior does not regress.

Non-goals: hash stripping, dynamic context retrieval, cache redesign, extra model
calls, hidden prompt changes, credential changes, Godskills duplication, Soul
activation, or Lunari integration. Independent architecture review supported
this narrow boundary; operational quality remains unqualified.
