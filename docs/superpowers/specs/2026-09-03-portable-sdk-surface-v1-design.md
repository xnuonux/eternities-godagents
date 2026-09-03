# portable Godagents SDK surface v1 design

## purpose

Expose one small, stable import root for the provider-phase host and admitted
provider-backed launcher that already exist in Godagents. The surface lets a
future Codex, Claude Code, local-model, or MCP adapter depend on named
protocol entrypoints without importing private file paths or gaining a new
authority path.

This is an experimental SDK surface over existing certified mechanisms. It is
not a live-provider qualification, a new adapter, or a claim that all hosts
are already interchangeable.

## package contract

The package root is `@eternities/godagents` and is mapped to
`src/sdk/index.mjs`. The package remains private and has no runtime
dependencies. The root export set is closed to these names:

- `GODAGENT_SDK_PROTOCOL_ID`
- `GODAGENT_SDK_VERSION`
- `describeGodagentSdk`
- `createProviderPhaseHost`
- `verifyProviderPhaseHostDescription`
- `assertProviderPhaseHostInstance`
- `createAdmittedProviderBackedIdentityLauncher`
- `verifyAdmittedProviderBackedIdentityLauncherDescription`

`describeGodagentSdk()` returns a new deeply frozen descriptor with protocol
version, status, the two supported provider-phase families, and explicit
proof limits. It contains no credential, endpoint, model value, filesystem
path, provider response, identity, Realm handle, continuity handle, keel
writer, evolution operation, Inspiration operation, Lunari handle, or Soul
operation.

The public root intentionally does not export raw transport constructors,
credential resolvers, admission internals, vessel constructors, Realm hands,
continuity writers, or model-routing controls. Existing direct source imports
remain available to the repository's internal tests and are not silently
changed by this slice.

## authority boundary

The SDK is a naming and packaging boundary only. It must preserve the current
rules:

- provider family is explicit and limited to the two registered families;
- policy and credentials remain selected by the existing provider policy;
- provider-backed launch remains opt-in and does not change `launch:local`;
- Godskills release and activation roots remain caller-pinned and verified by
  the existing launcher;
- no SDK descriptor field creates or expands authority;
- no SDK call silently selects a provider, model, retry policy, Realm hand,
  identity mutation, continuity write, evolution, Inspiration, Lunari, or
  Soul operation.

## acceptance

1. Node self-reference import from `@eternities/godagents` resolves through
   the package `exports` map.
2. The root export names are exactly the closed list above, and internal
   implementation helpers are not exposed accidentally.
3. The descriptor is deterministic, deeply frozen, credential-free, and
   honest about its experimental status and proof limits.
4. Both current provider families can be constructed through the root export,
   expose the existing verified host description, and perform no provider
   call during construction.
5. The admitted provider-backed launcher can be constructed through the root
   export without widening its existing closed configuration or launch
   contract.
6. Existing tests and certification roots remain unchanged except for the
   package surface, its direct tests, and documentation of the surface.

## explicit non-goals

- no new provider or host adapter;
- no live network call in automated tests;
- no change to default launch behavior;
- no public publication or package release;
- no provider quality, latency, pricing, cache, or cross-model claim;
- no Codex, Claude Code, local-model, or MCP implementation;
- no Godskills body copy, routing change, or release-pin change;
- no Realm, continuity, keel, evolution, Inspiration, Lunari, or Soul change.
