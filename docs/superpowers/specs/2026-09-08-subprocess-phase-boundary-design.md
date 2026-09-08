# Subprocess phase boundary

The live Grok probe demonstrated subscription access, not a Godagents adapter.
The existing portable host can serve Grok without a new host type if native,
review and revision ports genuinely implement the existing phase contracts.
Do not duplicate the runtime or disguise subprocess completion as HTTP 200.

## First implementation boundary

Extend `createDurablePhaseOperationSuite` with an optional `process` configuration
exclusive with `network`/`networkRequest`. Its closed fields are `invoke` and
`assertCredentialAbsent`. The owning policy must pin
`provider.transportKind: 'subprocess-json-v1'`. Legacy HTTP configuration and
record bytes remain unchanged.

`invoke({ policy, request, credential })` returns a closed result:
`{ kind: 'subprocess-json-v1', outcome: 'completed' | 'rejected', exitCode, bodyText }`.
Completed requires exit code zero. Rejected is an adapter-attested definite
rejection, never inferred solely from a nonzero exit. Throws or malformed
outcomes after invocation remain uncertain or fail closed, without redispatch.
The engine continues to own exclusive attempt publication, locks, reconciliation
and signed adoption/abandonment. No generic plugin registry is added.

The process credential resolver may return an opaque capability, not a fake
API token. `assertCredentialAbsent({ text, credential })` must synchronously
return true for serialized input and provider output or execution fails closed.
The capability is never serialized by the engine. The real provider adapter
owns credential resolution, reflection checks, timeout, process termination,
native tool disablement and temporary-home cleanup.

The engine snapshots and freezes process policy/descriptors and checks the policy
digest before creating state. Process results are closed plain data objects:
accessor properties are rejected, and one immutable copy is captured before
callbacks or awaits in response handling and response adoption. A credential
screen returning a promise cannot grant permission; rejected promises are
consumed while the operation is denied.

Process response witnesses use schema version 2 and protocol
`eternities-provider-process-response-witness-v1`, binding outcome, exit code,
body bytes and digest. HTTP v1 witnesses and signed decisions remain unchanged.
Adoption must reject cross-transport witnesses. Process failure records retain
`httpStatus: null`, not fabricated HTTP status.

## Proof and non-goals

Prove a real local subprocess artifact goes through the actual identity-bound
completion verifier, is persisted, and is replayed without invocation; prove
ambiguous interruption is not retried. Prove signed process-response adoption,
response tampering rejection, credential screening, and legacy HTTP behavior.

This first boundary does not qualify Grok usage semantics, a live mission,
source-closure certification, provider-level exactly-once delivery, or model
quality. The subsequent Grok adapter must retain raw telemetry and cannot turn
missing required counters into zero. The completed adapter will expose genuine
native/review/revision ports through the existing portable SDK, with native-only
effect execution making no review or revision call.
