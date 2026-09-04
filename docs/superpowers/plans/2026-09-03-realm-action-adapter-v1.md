# Realm action adapter v1 implementation plan

## bounded milestone

Add a provider-neutral, receipt-bound adapter over the existing verified Realm
negotiation and action gateway. Keep existing negotiation, action receipt,
persistent Realm, vessel, and historical certification behavior unchanged.

## implementation sequence

1. Write red tests for successful negotiated execution, exact receipt binding,
   idempotent replay, and fail-closed stale, expanded, omitted, non-idempotent,
   malformed, and credential-bearing inputs.
2. Add the strict `realm-negotiated-action` schema and register it with the
   schema validator.
3. Implement the preflight adapter. Verify negotiation and Realm source before
   any Realm method call, validate the selected hand and payload, delegate once
   to `executeCommittedAction`, and emit the compact child-bound receipt.
4. Run focused tests, then the existing Realm, schema, action, and SDK tests.
5. Build a source-bound certification fixture and receipt only after the
   implementation and full suite are green. Have the coordinator independently
   review the final diff and receipt before integration.

## acceptance tests

- exact negotiation and authority bind to one successful action;
- the adapter returns the unchanged action receipt plus a digest-bound wrapper;
- exact retry does not duplicate the Realm mutation;
- changed negotiation, contract, authority, Realm contract, decision, action,
  selected hand, or payload fails before observation or invocation;
- an omitted or non-idempotent hand cannot execute;
- credential-shaped fields never enter a receipt or Realm call;
- existing Realm and historical certification tests remain green;
- the existing SDK surface remains unchanged and does not expose Realm
  authority or an executable Realm handle.

## explicit non-goals

- no live external Realm or tool connector;
- no credentials, leases, compensation, or rollback;
- no vessel default-wiring or durable journal mutation;
- no delegation, scheduler, Godskills copy, keel, memory, identity,
  constitution, evolution, Inspiration, Soul, Luna, or phenomenological-core
  change.
