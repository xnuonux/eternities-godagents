# Provider-Neutral Phase Protocol v1 Implementation Plan

**Goal:** centralize phase semantics and prove a second, genuinely different
provider wire without changing host authority or durable execution behavior.

### task 1: freeze shared behavior

- [ ] add direct tests for phase input, schemas, artifacts, completion binding, and authority emptiness
- [ ] capture exact OpenAI request and completion parity fixtures
- [ ] implement a provider-neutral semantic core
- [ ] refactor the OpenAI protocol to delegate only shared semantics

### task 2: add Anthropic Messages protocol

- [ ] add request tests for `system`, `messages`, `max_tokens`, structured output, and cache boundary
- [ ] add response tests for text-only content, model binding, usage, and typed completion parity
- [ ] reject tools, thinking, refusal, extra content, malformed output, credential reflection, and budget drift
- [ ] add one canonical externally pinned Anthropic policy and secret-only resolver boundary

### task 3: certify

- [ ] reproduce deterministic cross-adapter fixtures twice
- [ ] preserve every historical receipt and existing OpenAI transport regression
- [ ] obtain exact independent Terra review with zero unresolved defects
- [ ] add the next ledger and lineage entry, merge by fast-forward, push, and verify parity

### task 4: continue

- [ ] build the durable Anthropic transport over the shared protocol
- [ ] expose both proven families through the portable host SDK and conformance suite
