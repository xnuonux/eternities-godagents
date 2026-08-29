# Networked Cortex and Local Host Design

**Date:** 2026-08-29  
**Status:** approved direction, implementation pending  
**Scope:** the first post-v0 production-generalization slice for Eternities Godagents

## Purpose

Godagents v0 proves that identity, constitution, continuity, authority, action, and consequence awareness can remain outside a replaceable model cortex. The next slice connects that neutral vessel to a networked model without allowing provider transport, credentials, stochastic output, or host configuration to become part of the agent's identity or authority.

This slice adds one provider-neutral cortex protocol, one OpenAI-compatible implementation, and one local command-line host. It does not create a hosted service, integrate Lunari, activate Soul, or certify a commercial provider.

## Design decision

The system will use a four-part boundary:

1. `CortexAdapter` defines the provider-neutral inference contract.
2. `openai-compatible-v1` implements that contract through injected HTTP and secret-resolution capabilities.
3. the local host derives authority and Godskills constraints from a trusted local policy file.
4. a receipt-safety gate projects all inference events into a fixed, credential-free durable form before they reach the journal.

The compiled genome continues to identify allowed adapter capabilities only. Endpoint, model, credentials, retry policy, and host policy remain runtime concerns and cannot enter deterministic distributions.

## Trust boundaries

### Trusted

- the compiled genome and distribution digests
- the exact Realm Contract
- the local host policy loaded through its declared path
- the receipt-safety projection code
- the constitutional arbiter and action gateway

### Untrusted

- mission text
- provider responses and provider error bodies
- HTTP headers and transport exceptions
- model-generated proposal fields
- environment contents other than the single credential value returned through the secret closure
- endpoint and model selections until validated by host policy

The host must never derive authority from mission text, model output, command-line convenience flags, or provider metadata.

## Components

### Provider-neutral cortex protocol

An adapter exposes immutable metadata and one inference operation:

```text
adapterId
profile
capabilities
infer(cortexContext) -> accepted proposal | sanitized failure
```

`cortexContext` contains the mission, mission ID, frozen observation, state epoch, current time, and an attempt descriptor. It contains no Realm object, hand invoker, action gateway, journal writer, host secret object, or authority-granting function.

The adapter returns either a strictly validated `organ-proposal` or a typed failure with a closed reason code. Raw provider envelopes and exception text never cross the adapter boundary.

### OpenAI-compatible adapter

The first implementation uses the OpenAI-compatible chat-completions request shape because it can be exercised through a fake transport and later mapped to multiple providers without modifying the vessel.

The adapter:

- receives an injected transport and credential closure;
- creates a bounded request with one response choice and a fixed structured-output profile;
- applies byte and token ceilings before parsing;
- rejects tool calls, multiple ambiguous choices, non-text content, unknown fields, invalid JSON, stale epochs, expired proposals, and semantic authority expansion;
- assigns `adapterId`, `organId`, proposal identity, source epoch, and evidence references from trusted runtime context rather than trusting provider-supplied values;
- emits only the final typed proposal or a sanitized failure.

The adapter does not retry Realm actions and cannot invoke one.

### Local host

The local host is a thin composition root, not a second agent runtime. It:

- loads one explicit local policy file;
- validates the allowed endpoint origin, model identifiers, adapter profile, retry ceiling, timeout, authority, Realm, and Godskills host context;
- resolves one credential from an environment variable named by trusted application configuration;
- rejects API keys in command-line arguments, config files, mission text fields, and interactive prompts;
- requires HTTPS for network transports;
- permits local HTTP only through an injected test transport, never through the production command path;
- prints only a fixed result summary to stdout and closed reason codes to stderr.

The local policy is not copied into the deterministic agent distribution. Its digest and non-secret policy ID may appear in the inference receipt.

### Receipt-safety gate

Every networked inference event passes through one projection before append. The durable projection may include:

- attempt ID and ordinal
- adapter ID and profile
- non-secret model identifier
- host policy ID and digest
- request semantic digest
- response semantic digest
- state epoch and mission correlation ID
- attempt status
- closed reason code
- coarse usage counters when returned as integers

It must exclude:

- credential values and environment snapshots
- authorization headers
- raw request or response bodies
- endpoint query strings
- arbitrary provider metadata
- provider error messages and stack traces
- host filesystem contents

A recursive denylist rejects credential-shaped field names before append. A canary-secret test additionally scans all generated artifacts, journals, snapshots, receipts, captured output, and thrown errors.

## Inference lifecycle

```text
cortex.requested
  -> bounded HTTP attempt
  -> cortex.accepted
       -> proposal.collected
       -> constitutional arbiter
     or cortex.failed(reasonCode)
       -> no decision
       -> no Realm action
```

`cortex.requested` is durable before transport begins. Each attempt has a deterministic identity derived from the vessel instance, mission, state epoch, and attempt ordinal.

After `cortex.accepted`, recovery consumes the journaled proposal and never reinfers. If interruption occurs after `cortex.requested` but before a durable terminal event, recovery may make another billed inference only when the host policy allows it and the attempt ceiling has not been reached. The new attempt receives a new ordinal and durable receipt.

Provider inference is economically non-idempotent even when it is effect-safe. The journal therefore distinguishes retries from replay. Realm action idempotency remains separately governed by the existing action gateway.

## Retry and failure law

Retryable failures are limited to:

- connection establishment failure
- timeout
- explicitly transient server status
- provider rate limiting when the policy permits a bounded retry

Non-retryable failures include:

- authentication or authorization failure
- invalid request
- forbidden endpoint or model
- refusal
- oversized output
- invalid or ambiguous response shape
- schema or semantic rejection
- stale state epoch
- proposal authority or effect expansion

Every terminal failure produces a closed reason code. A failed cortex cycle cannot commit a decision or invoke a Realm hand.

## Determinism and continuity

The foundry remains byte-deterministic because runtime provider configuration is excluded from compiled artifacts. Networked inference is not expected to reproduce stochastic provider output. Deterministic replay means replaying accepted evidence from the journal without reinference.

Cortex replacement must preserve vessel instance ID, constitution digest, distribution artifact ID, continuity chain, and dormant Soul port. Provider identity is operational metadata, not agent identity.

## Test strategy

All automated tests use an injected fake transport. The suite must prove:

- exact request construction and strict response parsing;
- malformed, oversized, stale, unauthorized, and semantically invalid proposals yield no decision and zero Realm invocations;
- timeout then success, bounded retry exhaustion, and non-retryable status behavior;
- crash recovery before request, after request, after accepted proposal, and before decision;
- no reinference after durable acceptance;
- fixture-to-networked-to-fixture cortex replacement preserves identity and constitution continuity;
- host authority and Godskills context come from validated local policy;
- CLI secret flags and credential-bearing config fields are rejected;
- HTTP downgrade and arbitrary endpoint origins are rejected;
- a canary credential is absent from every durable artifact, output stream, and error surface;
- certification performs no external network request.

The historical v0 receipt remains immutable. A new versioned networked-cortex receipt will certify the interface, recovery, and secret-containment behavior while explicitly excluding live-provider compatibility, latency, cost, and model quality.

## Deferred work

- live provider evaluation
- hosted or multi-tenant service
- remote secret vault integration
- Lunari integration
- Constellation and Commonwealth runtimes
- Minecraft or other Godlands
- Inspiration
- Soul activation or personhood claims

These require separate authorization and evidence. None is implied by this slice.

## Post-review hardening

The independent adversarial review identified two unacceptable gaps in the first candidate: provider-controlled nested proposal values could enter continuity, and a declared hand could carry an unbounded payload. The implemented design therefore adds three mandatory controls:

- provider prose is normalized, reflected credentials and credential-shaped nested fields are rejected, and accepted intent and outcomes must satisfy a strict Realm hand contract;
- every hand declares an input schema and expected-outcome derivation that are checked both at adapter admission and immediately before Realm invocation;
- host policy bounds prompt bytes, completion tokens per attempt, completion tokens per cycle, response bytes, timeout, and attempts, and its canonical digest must match a separately supplied operator pin before credential resolution.

The certification network guard propagates through spawned Node processes. OS-level isolation for arbitrary non-Node child processes and signed policy identity remain explicit exclusions.
