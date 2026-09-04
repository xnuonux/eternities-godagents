# Realm compensation boundary v1

## purpose

add one provider-neutral, opt-in compensation boundary above the certified
recoverable consequence host. A compensation is an explicit inverse action for
one known completed consequence. It is not automatic rollback, and it is never
allowed to run for an uncertain primary effect.

## boundary

The host is constructed with an SDK-issued or locally branded completed
consequence host and a separate Realm port. The primary host is a constructor
dependency and is never serialized. A compensation request supplies one
standard consequence input plus a small inverse-transition relation. Both the
primary and compensating hands must already be declared by the same Realm
Contract and fit the current host authority ceiling.

The v1 relation supports only the existing `observation-delta` hand contract:

- every named primary output field has one matching compensating output field;
- the fields observe the same declared observation namespace;
- the input values are bound equal through exact payload-field bindings;
- one transition operation is `add` and the other is `subtract`;
- the primary hand and primary payload are read from the verified completed
  primary journal, never supplied as fresh caller evidence.

This proves that the two declared transitions cancel algebraically when no
intervening state changes occur. The Realm remains the source of truth. If the
observed post-compensation state does not satisfy the compensating hand's
expected outcome, the receipt reports `repair` or `escalate`; the host does not
silently retry or claim restoration.

## primary admission

Before writing `compensation.admitted`, the host calls the branded primary
host's read-only recovery operation for the supplied execution id. It requires:

- a completed primary operation with an exact verified journal;
- `invocationStatus: applied`, `discrepancyClass: none`, and `disposition:
  complete`;
- a primary action and consequence receipt whose digests agree;
- the compensation state to use the same persistent instance and mission;
- the relation's primary hand and payload bindings to match that verified
  primary action exactly.

An absent, pending, uncertain, denied, failed, stale, or changed primary fails
before any compensation journal or Realm call. This is deliberate: v1 does not
guess whether an external effect happened.

## durable lifecycle

Each compensation has one content-addressed execution id derived from the
protocol, primary execution id, compensation input, and relation. Its journal
contains exactly three legal events:

```text
compensation.admitted -> compensation.resulted -> compensation.receipted
```

The admission stores the normalized compensation input, relation, and compact
primary witness. The result stores the exact existing negotiated consequence
bundle and binds it to the admission. The final receipt binds both event
digests, the primary witness, the consequence receipt, restoration status, and
all relevant contract and authority digests. Raw Realm handles and credentials
are never durable.

Recovery re-verifies the primary host, relation, contract, authority, and all
journal bytes before resuming. A process boundary after admission may invoke
the compensating hand. A boundary after the external effect re-enters the
existing idempotency and reconciliation path. A durable result needs only the
missing host receipt. Exact terminal replay makes no Realm call.

## authority and identity

The compensation hand is intersected with the current mission, host, and
constitution ceilings by the existing negotiated consequence executor. The
compensation layer grants no authority, effect, precondition, budget, identity,
continuity, keel, Godskills, provider, tool, evolution, Inspiration, Soul, or
Lunari capability. It cannot compensate an action outside the same admitted
instance and mission, and it cannot use a caller-supplied primary receipt as a
substitute for the branded primary journal.

## proof limits

The receipt proves local crash recovery and algebraic inverse-contract binding
against the fixture Realm. It does not prove arbitrary business-level undo,
remote rollback, compensation after uncertain effects, cross-system atomicity,
financial reversal, hostile same-user filesystem isolation, live connector
quality, default vessel wiring, or Luna phenomenological behavior. General
multi-step sagas remain a later design.

