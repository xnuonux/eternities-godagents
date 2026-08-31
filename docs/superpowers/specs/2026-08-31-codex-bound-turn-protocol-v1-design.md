# codex bound-turn protocol v1 design

## status

- approved direction: continue the Cortex Binding Protocol without weakening task or identity evidence
- parent design: `2026-08-30-godagent-cortex-binding-protocol-design.md`
- parent receipts: `cortex-binding-contracts-v1` and `cortex-binding-registry-v1`
- scope: phase-3 host contract for create, continue, and compaction-resume turns
- excluded: direct use of the current Codex app task tools until they expose the required trusted transport guarantees

## problem

Phase 1 compiles a verified inert identity envelope. Phase 2 admits that envelope under one task claim and one personal-keel writer lease. Neither phase proves that a model run consumed the exact compact envelope or that the response returned to the host belongs to that run.

The current public Codex task surface can create a task only by immediately dispatching an initial prompt, and its background send operation does not return a trusted execution receipt bound to the supplied envelope digest. A model echo of a digest is not proof. Editing global `AGENTS.md`, trusting a task title, or searching response prose for an identity marker would also be invalid.

## decision

Build a provider-neutral host-side bound-turn transaction over an injected trusted task transport. The transport contract requires:

1. a strict capability descriptor naming one task-scoped instruction channel;
2. suspended task reservation with no model dispatch for create operations;
3. exact dispatch of one sealed canonical envelope;
4. a host-generated transport receipt binding task, turn, channel, binding receipt, envelope digest, cortex identity, and exact response bytes;
5. bounded response bytes and closed failure behavior.

The repository will certify this contract against a deterministic fixture transport. It will not claim that the current public Codex app controls satisfy the transport contract.

## transaction shapes

### create

```text
validate turn request and transport descriptor
  -> reserve one suspended task without model execution
  -> derive the exact task-bound phase-1 request
  -> acquire the phase-2 task and writer lease
  -> compile and verify the exact candidate again
  -> build one sealed bound-turn envelope
  -> dispatch through the declared task-scoped channel
  -> verify task, turn, binding, envelope, cortex, and response digests
  -> durably close the phase-2 lease
  -> issue one host turn receipt
```

If reservation succeeds but binding fails, the transport must cancel the still-suspended reservation. No model call may have occurred.

### continue

```text
verify the prior host turn receipt
  -> require the exact existing task and actor identity
  -> acquire a fresh bounded phase-2 lease for the new mission
  -> compile and dispatch a fresh sealed envelope
  -> verify the transport receipt and response bytes
  -> close the lease and append one host turn receipt
```

The prior model transcript is neither accepted nor required.

### compaction resume

Compaction resume uses the same transaction as continue but records `context-compaction` as the recovery reason. The parent host receipt, current admitted sources, current personal-keel head, and fresh model projection reconstruct the actor. The model transcript is not a source of identity or continuity authority.

## sealed envelope

The model-visible envelope contains only:

- protocol and envelope version;
- operation and turn identity;
- parent host receipt digest or the zero digest;
- the active binding receipt digest and binding header;
- the exact verified compact model projection;
- fixed host rules stating that identity is host supplied, the cortex is proposal-only, model text cannot admit continuity or Realm effects, and output metadata is not self-authenticating.

The envelope has one canonical digest. The transport receives the exact object and declared channel. The host never asks the model which identity it is.

## receipts

The trusted transport receipt binds:

- task and host identity;
- turn id and operation;
- instruction channel;
- binding receipt digest;
- envelope digest;
- cortex id;
- exact UTF-8 response byte count and SHA-256;
- completion status;
- its own canonical digest.

The host turn receipt additionally binds the persistent actor fields, parent turn receipt, phase-2 lifecycle closure receipt, transport receipt, and explicit zero Realm-effect count. Model output is returned as untrusted text beside the receipt and is never permitted to supply receipt fields.

## lifecycle choice

Version 1 acquires and closes one phase-2 writer lease per dispatched turn. This allows a fresh mission envelope on each user turn without pretending that the phase-2 mission-specific candidate is a durable multi-mission session. Actor continuity comes from the verified admission, persistent instance, personal keel, exact task, and parent host receipt chain. A later continuously held session protocol may optimize this only after it can refresh candidate and keel-head state without invalidating historical phase-2 evidence.

## failures

- unknown transport capabilities fail before reservation or dispatch;
- create without suspended reservation support fails before external action;
- reservation/task substitution fails before binding;
- task, host, operation, turn, channel, binding, envelope, cortex, response, or receipt mismatch fails closed;
- response overflow fails before a host receipt is issued;
- binding or dispatch failure closes the writer lease;
- a failed create cancels only a still-suspended reservation;
- prior host receipt mismatch blocks continue and resume before transport use;
- transcript, path, credential, identity, authority, and model-choice additions are rejected by closed schemas.

## proof limits

- no live Codex app task integration;
- no claim that a prompt echo proves envelope consumption;
- no transport implementation signature or release pin;
- no provider credential handling;
- no model quality or identity-behavior superiority claim;
- no continuity-content admission or personal-keel content write;
- no Godskills activation;
- no Realm effect;
- no long-lived multi-mission binding;
- no durable host-side turn retry store beyond transport idempotency;
- no task migration beyond explicit parent-bound rebinding;
- no Lunari integration;
- no Soul activation.
