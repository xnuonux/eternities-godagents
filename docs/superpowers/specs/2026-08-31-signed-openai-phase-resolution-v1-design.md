# signed OpenAI-compatible phase resolution v1 design

## status

- date: 2026-08-31
- Godagents parent: `0c3871393fc91c28b1d632b7718c0f2bd1aa23c0`
- scope: additive signed operator resolution for ambiguous concrete phase calls
- the certified transport, admitted host, phase contracts, launch defaults,
  Realm, continuity, personal keel, evolution, Lunari, Inspiration, and Soul
  remain unchanged

## problem

The sealed OpenAI-compatible phase transport publishes an immutable attempt
before HTTPS. If the process dies or the connection fails ambiguously after
that point, the operation remains `pending` and cannot dispatch again. This is
the correct automatic behavior because a generic provider offers no
cross-boundary exactly-once guarantee, but the operation can remain stranded
forever even when an operator later obtains trustworthy outcome evidence or
chooses to terminate the unknown attempt.

The missing layer is not automatic retry. It is an explicit, independently
authorized decision that can close one exact pending attempt without changing
its dispatch, erasing its history, or granting the model authority over its own
outcome.

## decision

Add one optional signed operator-resolution controller to an already-created
phase transport suite. The controller supports exactly two dispositions:

- `adopt-response`: accept one exact externally recovered provider response,
  pass it through the existing strict response and phase-completion verifier,
  then publish the ordinary completion;
- `abandon`: publish the ordinary sanitized terminal failure with reason
  `operator-abandoned`.

There is no retry, replacement call, changed request, synthetic model output,
or deletion path in version 1. An operator who wants to risk a duplicate call
must do so through a future separately designed protocol or a new mission,
never by editing this operation.

## resolution authority policy

One canonical JSON policy has protocol
`eternities-openai-compatible-phase-resolution-policy-v1` and binds:

- a stable policy id;
- the exact certified phase-transport policy digest;
- one Ed25519 authority key id and SPKI public key;
- a maximum decision lifetime;
- a maximum adopted-response byte count.

Its canonical SHA-256 must match the external
`GODAGENT_PHASE_RESOLUTION_POLICY_SHA256` pin before a decision, response, or
operation record is inspected. The adopted-response ceiling cannot exceed the
underlying provider response ceiling. The policy contains no private key,
credential, endpoint override, model override, retry permission, Realm hand,
or continuity authority.

## signed decision

The operator signs one canonical decision with protocol
`eternities-openai-compatible-phase-resolution-decision-v1`. It binds:

- resolution-policy digest and authority key id;
- phase, dispatch digest, request digest, and original attempt id;
- disposition;
- exact normalized provider-response digest for `adopt-response`, otherwise
  `null`;
- issued and expiry timestamps within the policy lifetime;
- a unique bounded nonce;
- the decision digest.

The Ed25519 signature covers the complete canonical decision including its
decision digest. The private key never enters Godagents. The controller checks
the external policy pin, public-key type, signature, lifetime, operation
identity, and response binding before publication.

## response witness

An adopted response is normalized to:

- integer HTTP status;
- lower-cased trimmed content type or `null`;
- UTF-8 body byte count;
- SHA-256 of the raw body.

The decision binds the SHA-256 of that canonical witness. The raw body is held
only in memory long enough to run the existing strict parser and completion
builder. It is never stored in `resolution.json`, a failure record, a receipt,
or returned metadata. The provider credential is resolved only for the
existing reflection check and never enters the signed decision.

## durable protocol

The existing operation slot gains one allowed immutable file:

```text
<runtime-root>/<phase>/<dispatch-digest>/
  prepared.json
  attempt.json
  resolution.json
  completion.json
  failure.json
  execution.lock
```

`resolution.json` records the exact signed decision, normalized response
witness digest or `null`, acceptance time, and a self-digest. It never contains
the response body, request body, credential, endpoint, or model output.

Resolution acquires the same operation lock as execution. It first re-verifies
the prepared and attempt records and requires an unresolved pending state. It
then publishes `resolution.json` before the terminal record:

- for `abandon`, reconstruction can deterministically finish the sanitized
  failure from the resolution record;
- for `adopt-response`, reconstruction requires the caller to resupply the
  exact response whose witness digest is already bound, then finishes the
  ordinary completion without network access.

Once an exact resolution record was accepted while its decision was valid,
later crash recovery may finish that same decision after expiry. A different
decision, response witness, disposition, authority key, or operation identity
is a permanent collision. Existing completion or failure remains terminal and
cannot be rewritten or retroactively resolved.

Ordinary `reconcile()` never signs, chooses, or completes a resolution. A
resolution record lacking its terminal record remains `pending`; only the
explicit controller can finish it.

## public surface

The transport suite adds one explicit method:

```js
const controller = await suite.createOperatorResolutionController({
  policyPath,
  env,
});

await controller.inspect({ phase, dispatch });
await controller.resolve({ phase, dispatch, signedDecision, response });
```

`response` is required only for `adopt-response` and forbidden for `abandon`.
The native, review, and revision adapters do not receive this controller and
retain their existing interfaces.

## acceptance claims

| id | claim |
|---|---|
| `SOR-001` | a canonical externally pinned resolution policy binds the exact transport policy and one Ed25519 authority before inspection |
| `SOR-002` | malformed, noncanonical, downgraded, stale, over-broad, or mismatched policies fail closed |
| `SOR-003` | a signed decision binds the exact phase, dispatch, request, attempt, disposition, lifetime, nonce, and response witness |
| `SOR-004` | invalid, wrong-key, expired, future, overlong, changed, or replayed-across-operation decisions fail before mutation |
| `SOR-005` | only a genuinely pending attempted operation can be resolved |
| `SOR-006` | adopting a response runs the existing strict provider parser and phase completion builder with zero network calls |
| `SOR-007` | abandoning publishes one sanitized `operator-abandoned` failure and no model artifact |
| `SOR-008` | the resolution record contains no request body, response body, credential, endpoint, model output, Realm hand, or continuity content |
| `SOR-009` | interruption after resolution publication recovers exact abandon without external input and exact adoption when the bound response is resupplied |
| `SOR-010` | an accepted exact decision remains recoverable after expiry while a previously unaccepted expired decision does not |
| `SOR-011` | concurrent or changed resolutions produce one exact terminal record or fail as a collision |
| `SOR-012` | existing completion, failure, malformed state, symlink, and unknown entries remain immutable and fail closed |
| `SOR-013` | native, review, and revision each support exact adoption without weakening their contracts |
| `SOR-014` | ordinary execute and reconcile behavior remains unchanged and never retries or resolves implicitly |
| `SOR-015` | the full admitted host can recover an ambiguous native phase by signed adoption and finish review without another native provider call |
| `SOR-016` | deterministic certification reproduces exact fixture and receipt bytes while ledger and release lineage remain valid |

## explicit non-goals

- no automatic or operator-authorized retry;
- no provider dashboard query or provider-specific retrieval API;
- no private-key storage or signing inside Godagents;
- no live API call, billable certification, or model-quality claim;
- no change to CLI or default host behavior;
- no response editing, partial acceptance, synthetic completion, or failure
  deletion;
- no streaming, tools, files, images, audio, or web search;
- no Realm action, continuity admission, personal-keel write, identity mutation,
  evolution, Lunari, Inspiration, or Soul activation.

## proof limit

This milestone can prove exact signed authority, immutable local resolution,
zero-network response adoption, terminal abandonment, secret containment, and
crash recovery against deterministic fixtures. It cannot prove that external
operator evidence is truthful, that a provider did or did not execute the
ambiguous call, or that adopting a retrieved response is semantically correct.
Those remain operator and provider evidence questions outside the local
cryptographic boundary.
