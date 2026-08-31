# provider phase host sdk v1 design

## decision

Add one explicit provider-family factory for the common certified native, review,
and revision transport surface. The caller must choose exactly one registered
family. The SDK never reads an ambient default, chooses a model, translates one
provider policy into another, or weakens either provider's direct constructor.

The common host surface contains only:

- `describe()` for one immutable credential-free capability manifest;
- `assertCredentialAbsent(value)` for outer-host preflight;
- `native`, `review`, and `revision` durable phase ports.

Provider-specific advanced features remain on direct imports. In particular,
signed ambiguity resolution stays an OpenAI-compatible extension until a
provider-neutral resolution protocol is independently certified.

## registered families

| family id | wire | durable engine | cache evidence | signed resolution |
|---|---|---|---|---|
| `openai-compatible-chat-completions-v1` | Chat Completions | sealed OpenAI implementation | normalized completion usage | available only through direct module |
| `anthropic-messages-v1` | Anthropic Messages | provider-neutral operation engine | completion-bound provider sidecar | unavailable |

Capability differences are data, not hidden behavior. The manifest states the
local dispatch semantics, phase set, wire profile, provider-evidence profile,
and whether a separately certified signed-resolution extension exists. It does
not contain endpoints, models, credentials, environment values, paths, fetch
handles, clocks, locks, or mutable provider state.

## trust boundary

Factory input is a closed object containing the family and the existing direct
constructor options. Unknown fields fail before policy loading. The family is
not inferred from a policy file, URL, credential name, model, or environment.
The selected direct constructor remains responsible for canonical policy pins,
descriptor derivation, secret lifetime, request and response ceilings, durable
state, and network behavior.

The SDK copies only the already frozen ports and credential preflight into its
common wrapper. It cannot grant Realm, continuity, identity, evolution,
Inspiration, Lunari, or Soul authority. Describing a host performs no credential
resolution or provider work.

## conformance

One shared conformance harness executes equivalent native, review, and revision
missions against both families using wire-real fake responses. It verifies:

- identical public surface and phase ordering;
- exact descriptor and policy binding in the data-only manifest;
- existing trusted completion contracts for all three phases;
- completed replay with zero credential and provider access;
- credential preflight and returned-surface containment;
- honest capability differences rather than fabricated parity;
- no change to either direct provider fixture or receipt.

## alternatives

1. A normalized universal wrapper exposing every provider extension was rejected
   because nullable recovery methods would imply false parity and encourage
   capability probing at runtime.
2. Ambient selection from policy shape or environment was rejected because it
   makes model routing implicit and permits configuration drift to change the
   provider family.
3. A common-intersection explicit factory was selected because it is additive,
   reversible, and preserves each certified provider boundary unchanged.

## proof limits

The SDK proves deterministic construction and common contract conformance under
fake provider responses. It does not qualify live availability, model quality,
cost, latency, provider equivalence, automatic failover, signed Anthropic
resolution, default host adoption, or external exactly-once execution.
