# Realm consequence vessel recovery v1 implementation plan

## bounded milestone

Make the existing negotiated Realm consequence executor reachable through one
opt-in durable host and recoverable across the three meaningful local process
boundaries without changing default vessel behavior.

## implementation sequence

1. Write red tests for admission, exact terminal replay, post-admission
   recovery, post-effect idempotent reconciliation, post-result receipt
   completion, fail-closed tamper and authority handling, bounded inspection,
   and the existing uncertain-effect disposition.
2. Add the strict host receipt schema and register it without widening the
   public portable SDK surface.
3. Implement the smallest host module using the existing canonical JSON,
   digest, file-lock, journal, consequence executor, and negotiation
   verification machinery. Add regular-directory and bounded-file checks.
4. Add a deterministic multi-boundary fixture, focused certification test,
   source-bound receipt builder, certification document, and append-only
   ledger entry.
5. Run focused tests, relevant Realm and schema regressions, the complete
   suite, certification ledger verification, release-lineage verification,
   and a final diff review before proposing integration.

## acceptance tests

- invalid input reaches neither admission nor the Realm;
- one valid input creates exactly one admission, result, and receipt event;
- exact terminal retry performs no Realm operation and returns the same
  consequence and host receipt;
- recovery after admission performs one consequence;
- recovery after an effect but before its result does not duplicate the
  external mutation and exercises the child idempotency/reconciliation path;
- recovery after result publication performs no Realm operation;
- changed journal bytes, event order, result bindings, path aliases,
  credential-shaped data, authority expansion, and oversized data fail closed;
- inspection exposes only bounded status and digest metadata;
- the deterministic fixture and receipt bind the exact source closure, test
  runs, historical receipt digests, and release lineage; and
- the default vessel path, closed SDK surface, and all historical receipts
  remain unchanged.

## explicit non-goals

- no default vessel or persistent-vessel wiring;
- no live Realm connector, credentials, remote storage, rollback,
  compensation, scheduler, delegation, or long-horizon mission loop;
- no Godskills body, release, routing, activation, or runtime change;
- no keel, memory, identity, constitutional evolution, Inspiration, Soul,
  Luna, Lunari, phenomenological-core, or sentience integration; and
- no claim that a local deterministic fixture establishes live model quality or
  product readiness.
