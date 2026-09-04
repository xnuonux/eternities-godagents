# Realm action adapter v1 design

## purpose

This slice turns the certified Realm negotiation projection into a narrow,
receipt-bound execution boundary. A host supplies a verified negotiation, its
current authority ceiling, one committed decision, one action, and an
injected Realm port. The adapter verifies that every input still describes the
same declared Realm and then delegates the effect to the existing action
gateway.

The adapter is provider-neutral in shape, but the current certified
negotiation protocol remains `fixture-local`. This proves an actionable local
boundary without claiming a remote Realm, a live connector, or the inhabited
digital world envisioned for later Luna work.

## preserved layers

- The Realm Contract remains the declared world boundary.
- The host authority ceiling remains the only authority source.
- The negotiation remains a credential-free, deeply frozen projection.
- The existing action gateway remains the only effect path.
- The existing action receipt remains the detailed consequence record.
- The new execution receipt binds the exact negotiation, contract, authority
  ceiling, decision, action, and child action receipt by digest.

The adapter never copies Godskills, writes a keel or memory, changes identity
or constitution, or grants an effect. It is not a Soul or phenomenological-core
interface.

## input boundary

`executeNegotiatedAction` accepts exactly:

```js
{
  negotiation,
  contract,
  authority,
  decision,
  action,
  realm,
  stateEpoch,
}
```

The adapter first verifies the exact negotiation against `contract` and
`authority`. It then requires:

- the Realm port to expose the existing `observe`, `invoke`, and `reconcile`
  operations and the same canonical contract;
- the committed hand to be present in the negotiation's available hands;
- the hand declaration in the negotiation to equal the contract declaration;
- the hand to be idempotent, because v1 relies on the existing reconciliation
  path;
- the action hand, committed intent, decision effects, decision authority, and
  payload to fit the selected hand before the Realm port is called;
- the decision state epoch and supplied `stateEpoch` to match through the
  existing action gateway.

Any stale negotiation, contract drift, authority expansion, omitted hand,
unsupported input, credential-shaped field, or authority/effect mismatch
fails before observation or invocation.

## receipt boundary

The returned value is:

```js
{
  actionReceipt,
  receipt,
}
```

`actionReceipt` is the unchanged receipt from
`executeCommittedAction`. `receipt` is a compact
`eternities-realm-negotiated-action-v1` record containing the negotiation,
contract, normalized authority ceiling, decision, action, and child receipt
digests, plus the child invocation status, discrepancy class, and disposition.
It contains no Realm handle, function, credential, raw observation, payload,
or provider response.

Because the wrapper does not own durable journal publication, its receipt is a
content-addressed handoff artifact. A future vessel or durable adapter may
publish it beside the existing action receipt under a separate lifecycle
contract.

## failure and proof law

The adapter fails closed on protocol mismatch, source drift, authority or
effect expansion, non-idempotent hands, missing ports, invalid payloads, and
receipt schema violations. It does not retry an uncertain effect. The existing
action gateway remains responsible for reconciliation and returns `repair` or
`escalate` when observed state cannot be closed.

This milestone certifies local adapter mechanics and exact receipt binding. It
does not certify live provider quality, external credentials, remote exactly
once semantics, compensation, rollback, leases, tool discovery, delegation,
long-horizon scheduling, public host SDK adoption, Luna, Soul, or the
phenomenological core.
