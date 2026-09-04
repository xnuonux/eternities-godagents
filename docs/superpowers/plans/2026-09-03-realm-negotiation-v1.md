# Realm negotiation v1 implementation plan

## bounded milestone

Add one provider-neutral, read-only Realm capability projection. Keep the
existing local Realm execution paths unchanged and do not make negotiation a
default launch dependency.

## implementation sequence

1. Write focused red tests for the exact protocol, authority filtering,
   cross-references, credential rejection, deep freezing, and forged-data
   refusal.
2. Add a strict `realm-negotiation` schema and register it with the existing
   schema validator.
3. Implement the builder and verifier with canonical contract and projection
   digests. Clone source declarations, never return Realm handles or callable
   fields, and fail closed on source or ceiling drift.
4. Run the focused tests plus existing schema, Realm, action-gateway, and
   provider-boundary tests.
5. Build a fixture and source-bound receipt after the implementation commit.
   Rebuild it from the pinned commit, run the complete suite, run the ledger and
   release-lineage gates, and preserve the earlier receipt chain.

## acceptance tests

- identical contract and ceiling inputs produce identical canonical bytes;
- only hands within both the effect and authority ceiling are returned;
- the output and nested declarations are deeply frozen;
- malformed references and undeclared required inputs fail before projection;
- credential-shaped fields fail before any projection;
- changed source, authority ceiling, protocol, hand, or digest fails closed;
- the projection exposes no invocation, observation, handle, credential, or
  authority-granting field;
- existing Realm execution and historical certification tests remain green.

## proof requirements

The receipt must bind the exact source commit, implementation manifest, test
manifest, fixture digest, focused and complete test counts, requirements,
review state, and explicit proof limits. It must not claim live external Realm
behavior, remote exactly-once effects, provider quality, or Luna readiness.

## explicit non-goals

- no Realm invocation, tool discovery, credential resolution, lease, or
  rollback;
- no delegation, multi-agent coordination, or long-horizon scheduler;
- no public SDK or default host wiring;
- no Godskills copying or skill-body execution;
- no keel, memory, identity, constitution, evolution, Inspiration, Soul, or
  phenomenological-core change;
- no change to the existing fixture contract or action gateway semantics.
