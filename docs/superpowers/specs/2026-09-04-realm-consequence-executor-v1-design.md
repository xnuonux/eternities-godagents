# Realm consequence executor v1 design

## decision

Add a provider-neutral, opt-in host seam that consumes one verified mission
proposal and executes exactly one bounded Realm consequence through the
existing negotiation and action gateways. The seam returns the exact
negotiation, constitutional decision, derived action, detailed child action
receipt, and a compact receipt binding their digests.

The existing vessel remains unchanged. A caller must explicitly invoke this
seam, so the milestone proves reachability without changing default runtime
ordering or legacy recovery behavior.

## boundary

`executeNegotiatedConsequence` accepts exactly:

```js
{
  mission: { missionId, authority },
  proposal,
  contract,
  authority,
  constitution,
  realm,
  state: { instanceId, epoch, now, preconditions },
}
```

`proposal` is validated as an `organ-proposal`. Its source epoch must equal
`state.epoch`, its required authority must fit `mission.authority`, and its
intent hand must declare the same effect as the Realm hand. Every mission
authority entry must already be present in the host authority ceiling. The
executor derives an effective authority ceiling by intersecting the mission
authority with host authority, and the selected proposal effect with both the
constitution's allowed effects and host permitted effects, before negotiation.

The executor then:

1. builds the canonical Realm negotiation from the effective ceiling;
2. commits the proposal through the existing constitutional arbiter;
3. derives one deterministic action from the committed intent, removing only
   `effect` and `handId` from the action payload;
4. executes through `executeNegotiatedAction`, which remains the only effect
   path; and
5. returns all exact artifacts plus the wrapper receipt.

No Realm method is called until proposal, authority, constitution, contract,
hand, and receipt inputs pass preflight.

## receipt

The wrapper protocol is `eternities-realm-negotiated-consequence-v1`. Its
canonical receipt binds:

- actor and mission identity;
- source proposal digest and state epoch;
- negotiation, contract, effective authority, decision, action, and child
  action receipt digests;
- Realm, hand, decision, and action identities; and
- child invocation status, discrepancy class, and disposition.

The wrapper contains no raw mission text, payload, Realm handle, callable,
credential, observation, or provider response. The returned artifact bundle is
deeply frozen and suitable for a host to persist as its own durable record.

## safety and compatibility

- the seam cannot grant authority or effects;
- mission authority cannot exceed the host ceiling;
- effective permitted effects cannot exceed host and constitution ceilings;
- the selected hand, proposal effect, decision effect, and action hand must
  agree;
- idempotency and reconciliation remain delegated to the existing action
  gateway;
- malformed, stale, expanded, credential-bearing, or contract-drifted input
  fails closed before Realm observation or invocation; and
- no default vessel wiring, live connector, credential, rollback,
  compensation, delegation, scheduler, Godskills copy, keel, memory,
  identity, constitution, evolution, Soul, Luna, or phenomenological-core
  behavior is changed.

This is a reachability milestone, not a claim of live Realm, remote exactly
once, long-horizon, product, or sentience readiness.
