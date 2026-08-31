# durable Anthropic Messages phase transport v1 design

## decision

Add one policy-pinned Anthropic Messages transport suite for native, review, and
revision. Build it over a new provider-neutral durable operation engine while
leaving the certified OpenAI-compatible transport byte-for-byte unchanged.

The neutral engine owns local durability, concurrency, replay, bounded HTTPS
execution, immutable operation records, and closed failure state. The Anthropic
adapter owns only policy loading, descriptor identity, request compilation,
headers, response validation, completion construction, and validated provider
usage evidence.

This is the conservative migration route. Duplicating the complete OpenAI state
machine would create two independent durability implementations. Refactoring the
already certified OpenAI transport in the same release would enlarge the proof
surface and invalidate exact source evidence. A later equivalence milestone may
migrate OpenAI onto the neutral engine only after fixture parity is independently
proven.

## boundaries

The transport targets the already certified Anthropic protocol and policy:

- exact HTTPS origin and `/v1/messages` path;
- exact API version and model;
- non-streaming Messages requests with structured JSON output;
- no tools, thinking, files, search, or action authority;
- host-owned `x-api-key`, `anthropic-version`, and `content-type` headers;
- native, review, and revision use the existing trusted completion contracts.

The credential is resolved only after policy, dispatch, request, operation-slot,
and durable-state preflight. It may occur only in the in-memory `x-api-key`
header and response-reflection check. It is forbidden from request bodies,
dispatches, records, errors, receipts, and returned values.

## durable operation

Each operation is keyed by phase and dispatch digest:

```text
<runtime-root>/<phase>/<dispatch-digest>/
  prepared.json
  attempt.json
  provider-evidence.json
  completion.json
  failure.json
  execution.lock
```

`provider-evidence.json` is present on successful Anthropic operations and binds
validated cache creation, cache read, uncached input, output, and thinking
counters to the policy, dispatch, request, attempt, and completion digest. It is
published before the completion. A crash between those publications remains
pending and cannot redispatch. Exact completed replay requires both records.

The attempt record is durably published before HTTPS. One dispatch has at most
one local network attempt. A completed operation replays with zero credential or
provider access. A network ambiguity or interruption after attempt publication
remains pending and is never retried automatically. Closed provider rejection,
response overflow, malformed output, and credential reflection persist only a
reason code, status where known, and response digest.

## failure and recovery

- absent or prepared-only state reconciles as `absent`;
- exact completion plus exact provider evidence reconciles as `completed`;
- attempt without a terminal record reconciles as `pending`;
- evidence without completion also remains `pending`;
- a verified closed failure rethrows its stable local error;
- malformed, symlinked, substituted, contradictory, or unknown state fails
  integrity before credential or network access.

There is no exactly-once claim across HTTPS. This release proves local
at-most-once dispatch and exact durable replay. Signed operator resolution of an
ambiguous Anthropic response is deferred to a later provider-neutral recovery
protocol.

## acceptance claims

| id | claim |
|---|---|
| `AMT-001` | the pinned Anthropic policy deterministically binds all three transport descriptors before operation creation |
| `AMT-002` | native, review, and revision each send one exact bounded Messages request with host-owned headers |
| `AMT-003` | the credential reaches only the in-memory `x-api-key` header and never a durable or returned surface |
| `AMT-004` | validated responses produce the existing trusted typed completions with no provider authority |
| `AMT-005` | cache creation and cache read remain distinct in immutable provider evidence and normalized completion usage remains exact |
| `AMT-006` | completed reconstruction performs zero credential resolution and zero provider work |
| `AMT-007` | concurrent same-dispatch execution performs at most one provider request |
| `AMT-008` | interruption or network ambiguity after attempt publication remains pending and never redispatches |
| `AMT-009` | overflow, rejection, malformed output, and credential reflection close durably without raw content persistence |
| `AMT-010` | substituted, malformed, symlinked, contradictory, or unknown operation state fails before provider access |
| `AMT-011` | deterministic fixtures and receipts reproduce exactly while all historical receipts remain valid |
| `AMT-012` | the existing OpenAI-compatible transport and its certified fixture remain byte-for-byte unchanged |

## reversal and revisit

The change is additive. Removing the Anthropic suite and neutral engine restores
the prior system without a data migration. Reconsider the split implementation
when an exact OpenAI equivalence fixture proves that the neutral engine preserves
all historical behavior and bytes. Stop rather than migrate if any historical
OpenAI fixture, receipt, or failure classification changes.

## proof limits

Tests use wire-real fake responses. They do not claim live Anthropic availability,
quality, price, latency, provider equivalence, or exactly-once remote execution.
No host default, CLI, Realm, continuity, identity mutation, evolution,
Inspiration, Lunari, or Soul behavior changes.
