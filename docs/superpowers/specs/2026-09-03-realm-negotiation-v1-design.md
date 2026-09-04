# Realm negotiation v1 design

## purpose

Realm Contract discovery is a read-only boundary between a host ceiling and a
declared Realm. It lets a future Godagent host learn which declared hands are
currently admissible without exposing an executable Realm object, credentials,
or an authority-granting negotiation path.

This is a provider-neutral adapter boundary. It is not a general Realm
protocol, a live external connector, or a Luna phenomenological interface.

## inputs

`buildRealmNegotiation` accepts exactly:

```js
{
  contract,
  authority: {
    availableAuthority,
    permittedEffects,
  },
}
```

The contract must pass the existing strict `realm-contract` schema and the
additional semantic checks below:

- capability, observation, hand, required-input, and compatible-distribution
  declarations are unique;
- every required input names a property in the hand input schema;
- every expected-outcome observation field belongs to a declared observation
  id or to a dot-separated prefix of that id;
- every expected-outcome input field is required by the hand;
- authority and effect ceilings contain unique non-empty strings;
- credential-shaped fields are rejected before projection.

The observation-prefix rule preserves the existing fixture contract, where the
stream id `counter.state` exposes the typed payload field `counter`, while
still preventing a hand from naming an undeclared observation namespace.

## output

The output is a deeply frozen, credential-free, content-addressed projection
with exactly these fields:

```text
schemaVersion
protocolId
contractDigest
realmId
version
trustModel
capabilities
observations
availableHands
omittedHandIds
resources
privacy
lifecycle
compatibleDistributions
authorityCeiling
negotiationDigest
```

`contractDigest` hashes the exact canonical source contract. `negotiationDigest`
hashes the complete unsigned projection. Capabilities, observations, hands,
omitted ids, and distributions are deterministic and sorted. An available
hand is an exact cloned declaration from the contract, not a synthesized
executor or callable handle.

## authority law

A hand is available only when its effect is present in
`permittedEffects` and every `requiredAuthority` item is present in
`availableAuthority`. The result can only remove hands from the contract. It
cannot add authority, effects, preconditions, credentials, resources, or
execution methods. An all-rounder or specialist profile is not interpreted by
this boundary; profile policy remains Godagent-owned.

`verifyRealmNegotiation` requires the exact source contract and authority
ceiling. It reconstructs the projection and compares canonical bytes, so a
forged digest cannot make changed content valid. Unsupported protocol versions,
source drift, schema violations, duplicate declarations, reference violations,
credential-shaped fields, and projection drift fail closed.

## migration boundary

This slice does not invoke `observe`, `invoke`, or any external tool. It does
not negotiate credentials, leases, compensation, rollback, delegation,
provider routing, Godskills, keel or memory writes, evolution, Inspiration,
Soul, Lunari, or a default host launch. A later Realm adapter may consume the
projection, but must earn separate contracts for invocation, reconciliation,
external effects, and rollback.

## proof

The focused suite proves deterministic reconstruction, strict authority
filtering, deep immutability, cross-reference validation, credential-field
rejection, executable-surface absence, and forged projection rejection. The
certification receipt binds the exact implementation and test manifests and
the fixture projection. Its metrics are deterministic fixture evidence, not
live Realm or model-quality telemetry.
