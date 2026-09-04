# portable phase-host conformance v1

## purpose

Define the smallest provider-neutral adapter boundary for a host that can
execute the already-certified native, review, and revision phase contracts.
The boundary is intended for future Codex, Claude Code, local-model, MCP, and
other host adapters without importing provider-specific constructors or
granting the host any Godagent authority.

This is a conformance and packaging boundary. It is not a live host adapter,
provider qualification, or mission launcher.

## contract

`createPortablePhaseHostAdapter` accepts one explicit, canonical description
and three descriptor-bearing phase ports. The returned instance exposes only:

- `describe()`
- `assertCredentialAbsent(value)`
- `createOperatorResolutionController(options)`
- `native`
- `review`
- `revision`

Each phase port exposes `descriptor()`, `reconcile(dispatch)`, and
`execute(dispatch)`. The factory calls each descriptor once, compares it to
the description, and retains the exact verified descriptor for the lifetime
of the returned instance. It does not call a provider or resolve credentials.

The description binds:

- the adapter identity and version;
- one non-secret host policy digest;
- the exact native, review, and revision transport descriptors;
- the common phase, durability, structured-output, dispatch, and credential
  preflight capabilities;
- an authority projection in which Realm effects, continuity admission,
  personal-keel writes, identity ownership, evolution, Inspiration, and Soul
  are all false.

The description is content-addressed. It has no endpoint, model, credential,
environment, path, function, provider response, Realm handle, keel handle, or
raw request/response body.

## trust and fail-closed rules

- the protocol id and schema version are exact;
- adapter id and version are bounded identifiers;
- policy and description digests are lowercase SHA-256 values;
- phase descriptors are verified by their existing first-party contracts;
- the phase set is exactly `native`, `review`, and `revision`;
- all advertised common capabilities are exact and non-negotiable;
- every authority field is false;
- unknown description or factory fields fail before a port is used;
- an SDK-issued brand is required for instance assertions;
- descriptor-equivalent lookalikes, changed descriptions, and changed phase
  descriptors fail closed;
- no adapter method can add authority, credentials, effects, Realm hands,
  continuity writes, identity mutation, evolution, Inspiration, Lunari, or
  Soul operations.

## compatibility

The existing OpenAI-compatible and Anthropic provider hosts remain unchanged.
The conformance tests wrap their already-issued ports and prove that the same
portable contract can describe them without exposing their credentials or
provider-specific extensions. The existing provider-backed mission bridge is
not changed in this slice; a later bridge may consume this branded boundary.

## proof limits

This protocol proves structural conformance, descriptor identity, authority
projection, and credential-free construction under injected test transports.
It does not prove live host behavior, model quality, remote exactly-once
execution, provider equivalence, Codex or Claude desktop controls, MCP
security, local sandbox isolation, default host adoption, Realm authority,
continuity, evolution, Inspiration, Lunari, or Soul activation.
