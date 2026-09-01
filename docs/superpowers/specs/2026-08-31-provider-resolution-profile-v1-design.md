# provider resolution profile v1 design

## decision

Replace the host description's boolean-only signed-resolution capability with one exact data-only profile per provider family while preserving both certified decision protocols and controller implementations unchanged.

The host method name and controller result shape are already portable, but the signed payload is not. OpenAI-compatible decisions bind the witness under `responseDigest` and use the externally pinned `eternities-openai-compatible-*` protocol family. Anthropic decisions bind it under `responseWitnessDigest` and use the newly certified `eternities-provider-phase-*` family. Hiding that distinction behind `signedAmbiguityResolutionAvailable: true` forces callers to carry unverified family knowledge.

## profile contract

Each verified host description gains `resolutionProfile` with exact closed fields:

- policy, decision, response-witness, and durable-record protocol ids;
- external policy digest-pin variable;
- signed decision field that carries the response-witness digest;
- exact dispositions `adopt-response` and `abandon`;
- provider-evidence publication profile;
- `automaticRetry: false`;
- `providerCallsDuringResolution: 0`;
- `acceptedDecisionRecoveryAfterExpiry: true`.

The profile contains no credential variable, endpoint, model, private key, policy path, runtime path, Realm hand, continuity content, or routing default.

## trust boundary

The host registry owns the profile as an assertion about the exact certified provider-family constructor. Description verification requires exact equality with the registered family profile before accepting the outer digest. Cross-family profile substitution therefore fails even when an attacker recomputes the description digest.

The profile does not translate signatures, decisions, policies, or response witnesses. It does not make the two trust roots interchangeable. It tells a portable operator exactly which already-certified protocol to construct and verify.

## acceptance

- both family descriptions carry complete exact resolution profiles;
- protocol and witness-field differences remain explicit;
- the shared no-retry, zero-provider-call, and accepted-recovery guarantees are equal;
- cross-family profile substitution fails after outer rehash;
- the existing controller methods, provider transports, signed decisions, receipts, and historical release bytes remain unchanged;
- deterministic fixture and receipt evidence bind the new profile bytes and 40-receipt lineage.

## proof limit

This proves machine-readable protocol discovery and description integrity. It does not prove external evidence truth, normalize signatures, create remote exactly-once execution, or authorize any retry or provider routing.
