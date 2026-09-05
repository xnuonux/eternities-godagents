# portable admitted identity launcher v1

## intent

the repository already has a certified `eternities-portable-phase-host-v1`
description and adapter, but the admitted identity vessel still accepts only
the provider-specific host path. this slice creates one provider-neutral
admission bridge. it consumes an SDK-issued portable phase host, derives the
review and revision dependencies from its exact phase ports, and delegates
launch to the existing admitted sealed identity vessel.

the bridge is an adapter boundary, not a second vessel implementation. it
must preserve the existing genesis, identity policy, local residency,
Godskills admission, mission journal, identity-bound cortex, and recovery
rules.

## boundary

the launcher accepts only:

- one SDK-issued portable phase host whose description and all three phase
  descriptors verify exactly;
- one exact Godskills release pin already accepted by the deferred review
  executor;
- the existing bounded materialization, cache, and filesystem options; and
- the existing admitted identity launch request.

executor identifiers are derived from fixed neutral adapter-owned prefixes. the
public configuration surface does not accept a caller-controlled prefix, so
endpoints, model names, credential-like strings, or arbitrary data cannot be
smuggled into durable executor identifiers.

the launcher must not accept a provider family, endpoint, model, credential,
raw transport, executor, classifier, Realm hand, continuity writer, personal
keel, identity prose, policy bytes, or precompiled vessel. the portable host
is allowed to implement transport, but its declared authority remains empty
for Realm effects, continuity admission, personal-keel writes, identity
ownership, evolution, Inspiration, and Soul.

the returned launcher description binds the portable host description, the
Godskills release and activation trust root, the native/review/revision
dependency descriptors, materializer limits, and a canonical binding digest.
launch passes only the pinned phase ports and derived executors to
`launchAdmittedSealedIdentityMission`. no portable host body or Godskills body
is persisted by this adapter.

## lifecycle

```text
portable host description
        -> exact host and descriptor verification
        -> provider-neutral mission dependency derivation
        -> digest-bound launcher description
        -> existing admitted identity-policy and genesis checks
        -> existing identity-bound vessel launch and recovery
```

construction is lazy with respect to provider or external model work. the
phase host's credential preflight is used at the adapter boundary; launch
continues to rely on the existing policy and transport checks. a portable
host may expose operator-resolution construction, but this launcher does not
invent retries or resolution authority.

## invariants

1. an unissued, malformed, drifted, or descriptor-incoherent portable host
   fails before a mission dependency is constructed.
2. the exact portable host description is the only source of phase transport
   identity. the adapter never rewrites a provider or host descriptor.
3. the Godskills release is verified through the existing first-party release
   verifier. this adapter does not copy a skill body or activation policy.
4. review and revision executors remain bounded, digest-linked, and authority
   empty. portable hosting cannot expand mission, identity, Realm, continuity,
   evolution, Inspiration, Soul, or keel ceilings.
5. the existing admitted identity policy must name the same native, review,
   and revision descriptors. stale policy or dependency drift fails closed.
6. exact retry and process recovery remain owned by the existing vessel and
   phase transports. this adapter performs no duplicate dispatch or hidden
   recovery.
7. ordinary `launch:local`, `launch:provider-backed`, and the existing root
   SDK behavior remain unchanged. adoption is explicit through the new
   provider-neutral factory.

## proof limits

the certification proves an in-process provider-neutral admission bridge over
the certified portable phase-host contract and the existing deterministic
identity-vessel fixture. it does not prove live provider or model quality,
external exactly-once execution, hostile same-user isolation, provider
equivalence, public distribution, default launch adoption, Realm authority,
continuity or keel ownership, identity evolution, Inspiration, Lunari, Soul,
or phenomenological-core behavior.
