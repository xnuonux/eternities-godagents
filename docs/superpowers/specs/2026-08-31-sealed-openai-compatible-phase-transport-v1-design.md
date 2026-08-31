# sealed OpenAI-compatible phase transport v1 design

## status

- date: 2026-08-31
- Godagents parent: `b255b659f215c5b7520674c86c47f9b8702be6cd`
- Godskills parent: `7aad930bdb5408ba65e03acf8a56d1978021bcaf`
- scope: additive concrete model transport for identity-bound native work,
  deferred Godskills review, and mission revision
- the certified admitted host, legacy host, launch defaults, Realm, continuity,
  personal keel, evolution, Inspiration, Lunari, and Soul remain unchanged

## problem

The admitted sealed identity host can now run one exact identity-bound mission
through native generation, an optional Godskills review, revision, and final
review. Every admission, descriptor, package, artifact, budget, and terminal
replay is bound and recoverable. Its three cognition transports are still
injected fixtures, however. The host proves orchestration and trust boundaries,
not that an actual model can inhabit them.

The existing OpenAI-compatible cortex cannot be reused directly. It produces
governed Realm action proposals for the legacy vessel, not mission phase
artifacts. Reusing it would conflate cognition with action authority and bypass
the native, review, and revision contracts already certified by the new host.

## decision

Add one policy-pinned OpenAI-compatible Chat Completions transport suite with
three adapters:

- identity-bound native transport;
- deferred Godskills review transport;
- mission revision transport.

The suite consumes each existing dispatch contract and returns each existing
completion contract. It does not change those contracts. The model supplies
only the minimum untrusted phase payload:

| phase | model-supplied fields | trusted adapter assigns |
|---|---|---|
| native | `content` | artifact type, schema version, identity and dispatch binding |
| review | `recommendation`, `findings`, `summary` | subject digest, artifact type, schema version |
| revision | `content`, `addressedFindingIds` | native digest, review digest, artifact type, schema version |

The existing completion builders then verify all semantic constraints and
assign completion identity, authority, timestamps, usage, and digests.

## provider policy

One canonical JSON policy has protocol
`eternities-openai-compatible-phase-transport-policy-v1` and contains:

- a policy identifier;
- the exact HTTPS origin and query-free endpoint path;
- one exact model identifier;
- the environment variable name holding the bearer credential;
- request timeout, request-byte ceiling, and response-byte ceiling;
- native dispatch and completion byte ceilings;
- independent native, review, and revision completion-token ceilings;
- review and revision completion byte ceilings.

The policy carries no credential value. Its canonical SHA-256 must match the
external `GODAGENT_PHASE_TRANSPORT_POLICY_SHA256` pin before a descriptor,
credential, durable operation, or network request is created.

Each transport descriptor embeds the complete policy digest in its transport
identifier. The admitted identity-host policy already pins those exact
descriptors, so changing endpoint, model, credential variable, or any transport
ceiling changes the provider policy digest, all three descriptor digests, and
the host dependency binding.

## request protocol

The request profile is non-streaming OpenAI-compatible Chat Completions with:

- one exact model;
- one completion choice;
- no tools or function calls;
- `max_completion_tokens` copied from the admitted phase dispatch;
- `response_format.type = json_schema`;
- strict phase-specific JSON Schema;
- one stable phase-specific system message followed by one canonical JSON user
  package;
- storage disabled where the compatible endpoint honors the standard field.

The stable system prefix and response schema precede changing mission data to
preserve normal provider-side prompt-cache opportunities without weakening any
local binding. No provider-specific response cache is enabled by this
milestone. Exact local replay is already served from the durable completion.

Current protocol references:

- OpenAI recommends JSON Schema structured outputs over legacy JSON mode:
  <https://platform.openai.com/docs/api-reference/chat/create>
- OpenRouter exposes the same Chat Completions shape and strict structured
  outputs for compatible models:
  <https://openrouter.ai/docs/guides/features/structured-outputs>
- OpenRouter documents prompt, cached-input, completion, and reasoning usage
  fields:
  <https://openrouter.ai/docs/cookbook/administration/usage-accounting>

Models that do not support strict structured outputs fail closed. A weaker
JSON-mode fallback is not silently selected.

## response protocol

The response must contain exactly one choice at index zero, one assistant
message with string content, no tool or function call, no refusal, and a `stop`
finish reason. The response model must equal the pinned request model.

The content is parsed as JSON, checked against the phase projection, converted
into the trusted artifact shape, and passed through the existing phase
completion builder. Unknown, missing, duplicate, unsorted, contradictory, or
authority-shaped model fields fail closed.

Usage is mapped as follows:

- `prompt_tokens` becomes `inputTokens`;
- `prompt_tokens_details.cached_tokens`, when present, becomes
  `cachedInputTokens`, otherwise zero;
- `completion_tokens` becomes `completionTokens`;
- `completion_tokens_details.reasoning_tokens`, when present, becomes
  `reasoningTokens`, otherwise zero;
- `visibleOutputTokens` is completion minus reasoning.

Negative, non-integer, contradictory, or over-budget counters are rejected.
The adapter does not invent hidden reasoning usage when the provider omits it.

## credential boundary

The bearer credential is resolved only after policy, dispatch, prompt, and byte
checks succeed. It appears only in the in-memory Authorization header passed to
the HTTPS transport. It is never placed in the policy digest, descriptor,
request body, operation record, completion, failure record, error message,
fixture, receipt, or returned metadata.

If the exact credential occurs in the dispatch, canonical request, or raw
provider response, execution fails closed. Provider and parser errors expose
only stable local reason codes. Raw provider bodies are never persisted.

## durable operation protocol

Every operation lives beneath a caller-supplied runtime root in a phase and
dispatch-digest slot. The slot contains immutable canonical records:

```text
<runtime-root>/<phase>/<dispatch-digest>/
  prepared.json
  attempt.json
  completion.json
  failure.json
  execution.lock
```

Only applicable files exist. `prepared.json` records policy, descriptor,
dispatch, request digest, and byte count without persisting the request body.
`attempt.json` is published and synced immediately before the network call.
`completion.json` contains only the verified existing completion contract.
`failure.json` contains only a closed reason, optional HTTP status, raw-response
digest, and bound record digests.

The phase and dispatch digest determine the slot. Exact record verification and
an exclusive process lock prevent two callers from executing one dispatch.

Reconciliation is deterministic:

- no slot, or an exact prepared record without an attempt, is `absent`;
- an exact verified completion is `completed`;
- an attempt without a completion or closed failure is `pending`;
- a closed failure raises its stable terminal error;
- changed, malformed, symlinked, or contradictory state fails integrity checks.

## ambiguity rule

The attempt marker is durable before the network call. If the process dies or
the connection becomes ambiguous after that marker but before a verified
completion is published, reconciliation remains `pending` and execution is not
repeated. This may conservatively strand a call that never reached the provider,
but it prevents silently duplicating paid or externally observed cognition.

There is no generic exactly-once guarantee across an HTTPS boundary without a
provider-enforced idempotency contract. This milestone therefore proves local
at-most-once dispatch and durable successful replay, not universal exactly-once
remote execution. Operator resolution of an ambiguous call is a later explicit
protocol, never an automatic retry.

## public surface

The implementation exports:

- a canonical policy loader and verifier;
- a credential resolver whose value is available only through `resolve()`;
- `createOpenAICompatiblePhaseTransportSuite`;
- the suite's `native`, `review`, and `revision` transport objects;
- a credential-free descriptor projection and policy digest;
- an input preflight that a future host wrapper can run before outer journaling.

The suite does not expose the environment object, credential, request body, raw
response, filesystem paths, or mutable operation maps.

## acceptance claims

| id | claim |
|---|---|
| `OPT-001` | a canonical externally pinned provider policy binds endpoint, model, credential variable, and every ceiling before use |
| `OPT-002` | one policy digest deterministically binds three existing transport descriptors |
| `OPT-003` | native, review, and revision each emit one bounded strict structured-output request and one valid existing completion |
| `OPT-004` | the model supplies content and critique only; all identity, authority, subject, input, and completion digests are trusted assignments |
| `OPT-005` | the exact bearer credential reaches only the Authorization header and never any durable or returned surface |
| `OPT-006` | credential reflection and credential-bearing input fail closed without raw-value disclosure |
| `OPT-007` | request, response, artifact, completion-token, and transport-completion ceilings all fail closed |
| `OPT-008` | model mismatch, refusal, tool call, multiple choice, malformed JSON, invalid usage, and semantically invalid phase output fail closed |
| `OPT-009` | exact completion reconciliation survives process reconstruction and performs zero additional network calls |
| `OPT-010` | concurrent execution of one dispatch produces at most one network call |
| `OPT-011` | interruption after durable attempt publication reconciles pending and never redispatches automatically |
| `OPT-012` | malformed, substituted, symlinked, or contradictory operation state fails before network or replay |
| `OPT-013` | failures retain only closed reason, status, and response digest evidence, never raw provider content |
| `OPT-014` | the admitted host and all historical provider-neutral contracts remain unchanged and passing |
| `OPT-015` | certification reproduces exact fixture and receipt bytes and release lineage remains valid |

## explicit non-goals

- no default launcher or CLI migration;
- no live API credential or billable certification call;
- no JSON-mode fallback for models lacking structured outputs;
- no streaming, tools, function calls, web search, files, images, or audio;
- no automatic retry or operator resolution of an ambiguous remote call;
- no claim of model quality, Godskills superiority, or provider equivalence;
- no hostile same-user process isolation;
- no Realm action, continuity admission, personal-keel write, identity mutation,
  evolution, Inspiration, Lunari, or Soul activation.
