# Realm consequence vessel recovery v1 design

## decision

Add one explicit, provider-neutral host around the already certified
`executeNegotiatedConsequence` path. The host gives one caller-owned journal
root to one Realm port and makes one validated consequence a durable,
recoverable operation. It is an additive adapter, not a new execution policy
and not a default vessel launch path.

The host owns the durable admission boundary. The existing negotiated
consequence executor still owns proposal validation, constitutional decision,
authority intersection, action derivation, idempotency, reconciliation, and
the only Realm effect path.

## boundary

Construction is explicit:

```js
await createRecoverableRealmConsequenceHost({
  root,
  realm,
  checkpoint,
  clock,
  lockOptions,
})
```

The host accepts exactly the effect-free consequence input below. The Realm
port is a constructor dependency and is never serialized:

```js
{
  mission,
  proposal,
  contract,
  authority,
  constitution,
  state,
}
```

The host derives `inputDigest` from canonical input and an
`executionId` from the protocol and input digest. One execution id owns one
real directory under `root/executions/` and one bounded canonical JSONL
journal.

## journal protocol

The journal contains at most three digest-chained vessel events:

1. `consequence.admitted` persists the exact validated effect-free input;
2. `consequence.resulted` persists the exact result of the existing
   negotiated consequence executor and binds it to the admission event; and
3. `consequence.receipted` persists a compact host receipt binding the exact
   result event, child receipt, input, identity, epoch, status, discrepancy,
   and disposition.

Every event is source-bound to
`eternities-recoverable-realm-consequence-journal-v1`, uses the execution id
as its journal identity and correlation, is canonical, and is checked for
credential-shaped fields. The host rejects gaps, reordering, changed input or
result digests, stale event identity, unexpected directory entries,
unverified tails, aliases, oversized journals, and unsupported terminal
states.

## recovery

`execute(input)` performs effect-free preflight before creating admission. A
new operation publishes admission, then invokes the existing consequence
executor. If the process ends after admission, recovery uses the persisted
input. If the process ends after a Realm effect but before result publication,
the same deterministic child action is re-entered and the existing action
gateway reconciles its idempotency key. If the result is already durable,
recovery publishes only the missing host receipt. A terminal retry reads the
journal and performs no Realm call.

No compensation, rollback, remote exactly-once guarantee, scheduler,
delegation, or automatic retry policy is introduced. A failed non-uncertain
effect remains admitted and requires an explicit later recovery call.

## authority and compatibility

The host cannot add authority, effects, hands, credentials, budgets,
identities, constitutional powers, or Realm capabilities. All such checks
remain in the existing consequence and action contracts. The host persists
the input and typed result only after credential rejection and stores no Realm
callable or live connector state.

The default vessel, its causal journal, persistent-vessel constructor,
Godskills runtime, portable SDK export surface, keel, memory, identity,
evolution, Inspiration, Soul, Lunari, and phenomenological-core behavior are
unchanged. The module is reachable only through explicit internal import.

## proof limits

This milestone proves a local durable host seam over the certified fixture
Realm. It does not prove a live connector, credentials, remote durable
storage, remote exactly-once effects, rollback, delegation, long-horizon
mission scheduling, provider quality, product usability, or any sentient
agent or Luna behavior.
