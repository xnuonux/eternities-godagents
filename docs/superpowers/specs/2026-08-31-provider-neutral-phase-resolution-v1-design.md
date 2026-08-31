# provider-neutral signed phase resolution v1 design

## status and scope

- date: 2026-08-31
- parent: `6fffd8b3fb5c99ce75b81ccfb2e8de219bdd352c`
- decision owner: Eternities Godagents
- scope: additive signed ambiguity resolution for the neutral durable phase engine and Anthropic Messages transport
- excluded: provider retry, provider-side exactly-once claims, private-key custody, automatic routing, and edits to released OpenAI resolution behavior

## evidence map

- verified: the sealed OpenAI transport already supports externally pinned Ed25519 decisions for `adopt-response` and `abandon`.
- verified: the neutral durable engine publishes an immutable attempt before HTTPS and leaves ambiguous outcomes pending without redispatch.
- verified: Anthropic completion publication requires a completion-bound `provider-evidence.json` sidecar.
- verified: the provider phase host SDK advertises signed resolution for OpenAI and explicitly advertises its absence for Anthropic.
- assumption: the portable authority and state protocol should be provider-neutral while each provider retains its own strict response inspector and evidence profile.
- unknown and out of scope: whether any externally recovered response truthfully represents the remote outcome.

## requirements

| id | requirement | acceptance signal |
|---|---|---|
| `PNR-001` | load one canonical externally pinned resolution policy bound to the exact provider transport policy | policy tests reject pin, transport, key, lifetime, and byte-ceiling drift before state inspection |
| `PNR-002` | verify one Ed25519 decision bound to phase, dispatch, request, attempt, disposition, lifetime, nonce, and exact response witness | decision tests reject tampering, wrong key, expiry, future time, and cross-operation replay |
| `PNR-003` | admit only `adopt-response` and `abandon`; never retry or replace a request | no resolution surface can invoke the network or construct a new attempt |
| `PNR-004` | publish one immutable signed resolution before its terminal record | checkpoint tests recover accepted abandon and exact adopted response after interruption |
| `PNR-005` | preserve provider-specific completion verification and evidence | Anthropic adoption invokes its existing response inspector and publishes provider evidence before completion |
| `PNR-006` | preserve terminal immutability and exact replay | changed decisions, witnesses, terminal records, unknown files, and symlinks fail closed |
| `PNR-007` | expose signed resolution through an explicit optional host extension without ambient provider selection | common phase methods remain unchanged; family capability and extension are exact and verified |
| `PNR-008` | preserve every released OpenAI and Anthropic trust-boundary byte | certification compares protected file hashes to the parent release |

## options

### option a: refactor the sealed OpenAI implementation into a shared core

This maximizes code reuse immediately, but changes already certified source and would require proving that a broad structural rewrite preserved every historical behavior. Its rollback and review surface are large.

### option b: add a provider-neutral sibling protocol to the neutral durable engine

This duplicates a small amount of validation logic, but leaves the sealed OpenAI protocol byte-identical. The new protocol can use neutral names and records, then prove Anthropic parity independently before any later consolidation.

## decision

Choose option b. Add a provider-neutral resolution-policy and signed-decision module, extend the neutral durable engine with an optional explicit operator port, and wire only the Anthropic suite to it in this release. The existing OpenAI transport remains the already-certified implementation for its family.

The decisive evidence is the existing release boundary: additive isolation gives stronger historical proof and simpler reversal than refactoring trusted bytes. Reconsider shared-core extraction only after both implementations have independently certified equivalent behavioral matrices and a byte-preserving migration can be shown.

## trust and ownership model

- the host owns provider family selection, policy paths, external digest pins, runtime roots, and credentials.
- the external operator authority owns the Ed25519 private key and signs decisions outside Godagents.
- Godagents loads only the pinned public policy, verifies the signature, and owns immutable local state transitions.
- the provider adapter owns request compilation, strict response inspection, completion construction, and provider evidence verification.
- the model receives no signing key, retry authority, endpoint override, routing authority, or direct resolution port.

## protocols

The canonical policy protocol is `eternities-provider-phase-resolution-policy-v1`. It binds a policy id, exact transport policy digest, Ed25519 key id and SPKI public key, maximum decision lifetime, and maximum adopted response bytes. Its canonical digest must equal `GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256`.

The response witness protocol is `eternities-provider-phase-response-witness-v1`. It binds HTTP status, normalized content type, UTF-8 body byte count, raw body SHA-256, and a self-digest. The body remains memory-only.

The signed decision protocol is `eternities-provider-phase-resolution-decision-v1`. It binds the policy digest, authority key id, phase, dispatch digest, request digest, attempt id, disposition, response-witness digest or `null`, issued and expiry times, nonce, and a self-digest. The Ed25519 signature covers the complete canonical decision.

The durable resolution record protocol is `eternities-provider-phase-resolution-record-v1`. It stores the exact signed decision, response witness or `null`, acceptance time, operation identity, and a self-digest. It stores no request body, response body, credential, endpoint, provider output, or private key.

## state and recovery

Each neutral operation slot may additionally contain `resolution.json`. Resolution acquires the same operation lock as execution and requires a verified attempted pending operation.

1. verify policy, state, operation identity, signed decision, and optional response witness.
2. for adoption, inspect the response and build provider evidence plus completion in memory before mutation.
3. publish `resolution.json` exclusively.
4. for abandonment, publish a sanitized `operator-abandoned` failure.
5. for adoption, publish provider evidence and then completion using the existing neutral ordering.

An accepted exact decision may finish after its signature lifetime using its recorded acceptance time. A previously unaccepted expired decision fails before mutation. Ordinary execution and reconciliation never choose or finish a resolution. Abandon recovery needs no response. Adoption recovery requires the exact previously bound response bytes.

## host surface

The Anthropic suite gains `createOperatorResolutionController({ policyPath, env })`. The provider phase host keeps its current common native, review, and revision surface and conditionally exposes a separate `createOperatorResolutionController` extension only when the selected family supports it. Capabilities continue to describe the exact family behavior, not an aspirational common denominator.

## failure and reversal

- malformed authority, policy, state, response, or signature fails before mutation.
- a provider rejection adopted by an operator still passes through the existing strict response path and closes under its existing sanitized reason.
- network calls are structurally absent from the resolution port.
- rollback removes the new optional controller and neutral resolution support; existing durable operations and every OpenAI operation remain unchanged.

## protected parent bytes

The release gate must preserve these parent hashes exactly:

- `src/transports/openai-compatible-phase-resolution.mjs`: `c3d31c71deb42bfda1d109502d5a4d586e8808572c845b203e156384dccfaed3`
- `src/transports/openai-compatible-phase-transport.mjs`: `c990cda4724ab3912a51005f7b13fa481e3365223278acc37950291969191550`
- `schemas/openai-compatible-phase-resolution-policy.schema.json`: `a6060a3ab36971230d5ab8bafcc0a2c806fd7234f2e9031d73b4c11ea04b9c2c`
- `receipts/signed-openai-phase-resolution-v1.json`: `6a0f548c8099dbb4ff43655a77ea6f84d783d3bcb1ae89a529a541a155a5f90c`
- `receipts/durable-anthropic-messages-phase-transport-v1.json`: `fbcdae60755b78c81eaff48a46ca93d1003816d21831991036a9f8ee746aba8b`
- `receipts/provider-phase-host-sdk-v1.json`: `9f5b11c89a7fe338bba7adbe8abf37ec8473dd212e8dd78661740a70721a3822`

## proof limit

This release can prove exact local authority, immutable state transitions, no network call during resolution, provider-specific completion verification, crash recovery, and historical byte preservation. It cannot prove provider-side execution truth, remote exactly-once behavior, or the wisdom of an operator's signed choice.
