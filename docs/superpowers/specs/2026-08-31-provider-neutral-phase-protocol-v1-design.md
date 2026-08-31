# Provider-Neutral Phase Protocol v1 Design

## purpose

Godagents already binds native, review, and revision work through provider-neutral
dispatch and completion contracts, but the concrete model protocol is implemented
only for OpenAI-compatible Chat Completions. This milestone extracts the shared
phase semantics into one provider-independent core and adds an Anthropic Messages
protocol adapter without changing the durable transport or any host default.

## shared semantic core

One module owns the behavior that must remain identical across providers:

- verification of native, review, and revision dispatches and descriptor binding
- the exact bounded model input projection for each phase
- the strict JSON output schema for each phase
- conversion of model-supplied JSON into trusted typed artifacts
- assignment and verification of subject, input, identity, authority, and digest fields
- construction of existing native, review, and revision completion contracts

Provider adapters may choose wire shape, authentication header, model identifier,
cache controls, and usage mapping. They cannot redefine phase artifacts, add
authority, disclose credentials, or weaken local validation.

## Anthropic Messages wire

The adapter targets one pinned HTTPS `/v1/messages` policy. Requests use the
Messages API's separate `system` field, one user message, non-streaming output,
one exact model, `max_tokens`, and `output_config.format` with `json_schema`.
No tools, thinking, web search, files, images, or arbitrary metadata are enabled.
The Anthropic wire compiler recursively removes structured-output constraints the
raw API does not accept, while the shared semantic core retains and enforces the
complete original schema after the response returns.

The static system block precedes changing mission data and carries one explicit
ephemeral cache breakpoint. The model input remains the same canonical JSON value
used by the shared core. The adapter records cache reads and writes from Anthropic
usage fields without treating a cache write as a hit.

Current official protocol references:

- <https://platform.claude.com/docs/en/api/messages>
- <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
- <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
- <https://platform.claude.com/docs/en/manage-claude/authentication>

## response and usage

Successful responses require one `message` envelope for the pinned model, role
`assistant`, stop reason `end_turn`, and exactly one text content block containing
the schema-constrained JSON value. Tool, thinking, refusal, redacted, server-tool,
or multiple content blocks fail closed.

Usage maps as follows:

- total input is uncached input plus cache-creation input plus cache-read input
- cached input is cache-read input only
- cache-creation input remains separately available as validated provider usage
  evidence instead of being collapsed into the normalized completion
- completion and visible output are `output_tokens`
- reasoning tokens are zero because this protocol enables no thinking mode
- every counter is a safe non-negative integer and completion remains within the
  admitted phase ceiling

## credential boundary

The canonical policy names only the credential environment variable. The current
protocol boundary resolves the secret lazily for response-reflection checks and
keeps it absent from request bodies, dispatches, errors, normalized usage,
artifacts, fixtures, and receipts. A future durable Anthropic transport must place
that secret only in its host-owned `x-api-key` header after every policy and
request preflight. Credential-bearing input or reflected output fails closed.

## compatibility and acceptance

- existing OpenAI-compatible request and completion bytes remain unchanged for
  the same inputs after the shared-core extraction
- both adapters consume the same three dispatch contracts and emit the same three
  completion contracts
- provider-specific envelope or usage fields cannot enter typed artifacts
- changed model, multiple content, tool/thinking content, malformed JSON, refusal,
  credential reflection, usage contradiction, and budget overflow fail closed
- Anthropic cache-read and cache-creation counters remain separately evidenced
- no live API call, provider quality, equivalence, SDK, host migration, or default
  adoption is claimed

## proof limits

- this proves protocol compilation and response validation with deterministic
  fixtures, not live Anthropic availability or model quality
- the existing durable OpenAI-compatible transport remains the only certified
  concrete network transport until the next milestone
- provider price, latency, rate-limit, cache-hit probability, and refusal quality
  remain unqualified
- no Realm effect, continuity write, identity mutation, evolution, Inspiration,
  Lunari, or Soul activation is added
