# portable phase-host adversarial campaign v1

## intent

This milestone adds a separate, source-bound hostile-input campaign for the
existing provider-neutral portable phase-host SDK. It converts the local
security assertions that are currently mixed into conformance tests into an
explicit replayable evidence package.

The campaign is not a new adapter and does not widen the portable host
contract. It exercises only the SDK-issued host factory, its pinned phase
descriptors, its credential preflight, its empty authority projection, and
the two existing provider-host wrappers with inert transports.

## required properties

1. a forged plain object or shallow clone cannot pass the issued-host guard;
2. changed phase descriptors, protocol identity, capabilities, authority, or
   credential-shaped description fields fail before a host is issued;
3. source descriptor mutation after construction cannot alter the pinned host
   description or phase descriptor snapshots;
4. credential-shaped input is rejected at the portable preflight boundary and
   never appears in the public description;
5. the public surface is exactly the six documented portable host members;
6. wrapping the existing OpenAI-compatible and Anthropic host families makes
   zero provider calls during construction and preserves their exact phase
   descriptors;
7. no adversarial case can introduce Realm effects, continuity admission,
   personal-keel writes, identity ownership, evolution, Inspiration, or Soul;
8. the fixture and receipt are deterministic, canonical, body-free, and bound
   to the exact source and prior portable-host receipt.

## proof boundary

The campaign proves local fail-closed behavior for the named SDK boundary. It
does not prove a live provider, model quality, hostile same-user process
isolation, sandbox escape resistance, remote exactly-once effects, MCP safety,
Codex or Claude Code integration, hosted durability, or any Soul, Inspiration,
Lunari, or phenomenological behavior.

The campaign must not call a provider, load credentials, write a keel or
memory, invoke a Realm, mutate identity, or alter default launch behavior.
