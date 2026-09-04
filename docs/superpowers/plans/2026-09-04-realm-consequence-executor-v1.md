# Realm consequence executor v1 implementation plan

## bounded milestone

Create an explicit provider-neutral host seam around the certified Realm
negotiation and action adapter. Keep the default vessel causal loop and every
existing certification artifact unchanged until this phase has independent
evidence.

## implementation sequence

1. Add red tests for one successful proposal-to-consequence execution,
   receipt binding, idempotent replay, authority/effect intersection, and
   fail-closed preflight.
2. Add the strict wrapper receipt schema and register it with the schema
   validator.
3. Implement the executor using the existing proposal schema, arbiter,
   negotiation builder, and negotiated action adapter. Derive only one
   deterministic action and keep the closed portable SDK surface unchanged.
4. Run the focused suite, then the Realm, schema, action, vessel, and SDK
   regression suites.
5. Add a source-bound fixture and certification receipt only after the code and
   full suite are green. Review the final diff and receipt before integration.

## acceptance tests

- one verified proposal produces a canonical negotiation, decision, action,
  child action receipt, and wrapper receipt;
- the wrapper digest binds the exact proposal, negotiation, authority,
  decision, action, and child receipt;
- replay with the same idempotency identity does not duplicate the Realm
  mutation;
- mission authority outside the host ceiling and effects outside the host or
  constitution fail before Realm calls;
- changed source epoch, hand/effect mismatch, malformed proposal, and
  credential-shaped input fail closed;
- the explicit internal host seam is available while the closed portable SDK
  and default vessel path remain unchanged; and
- the existing full suite and historical receipts remain valid.

## explicit non-goals

- no default vessel wiring or vessel journal changes;
- no live connector, credentials, remote execution, rollback, compensation,
  leases, delegation, scheduler, or long-horizon loop;
- no Godskills copy or release change;
- no keel, memory, identity, constitution, evolution, Soul, Luna, or
  phenomenological-core integration; and
- no claim of live model quality or inhabited digital-world readiness.
