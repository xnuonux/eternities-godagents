# Realm consequence mission-operation adapter v1

## intent

bind the already-certified recoverable Realm consequence host to one exact
mission-program step without moving Realm authority into the mission journal
or generic operation request. this is an explicit provider-neutral migration
boundary. it does not change the default vessel path.

## source contract

the source is one branded `createRecoverableRealmConsequenceHost` instance
and one frozen, credential-free consequence input. the source descriptor
contains only:

- the source protocol, kind, and version;
- the host descriptor digest;
- the content-addressed execution and input identities;
- mission, instance, and state epoch identities;
- mission, proposal, Realm Contract, authority, constitution, and state
  digests; and
- the exact generic mission completion and result ceilings.

it contains no proposal body, action payload, Realm handle, callable,
credential, observation, provider route, keel, memory, identity, evolution,
or durable journal content.

## binding rules

1. construction verifies the recoverable-host provenance brand, exact input
   shape, credential-free input, stable execution id, and immutable host
   descriptor;
2. the generic operation request carries only digests, ids, empty generic
   authority, and the bounded mission ceilings;
3. the live host descriptor and input-derived execution identity are
   revalidated before every reconcile and execute call;
4. reconcile maps an absent execution to `absent`; an admitted or resulted
   execution is recovered through the host, which owns any required Realm
   reconciliation, and a completed execution becomes a compact projection;
5. execute calls the host only after the generic adapter has observed
   `absent`, and projects the host result without copying consequence bodies;
6. the projection binds the execution, host receipt, consequence receipt,
   action receipt, invocation status, discrepancy, disposition, and bounded
   zero-provider usage;
7. mission-program terminal replay performs no second host or Realm call; and
8. stale source identity, contract drift, malformed receipts, credential
   fields, or wider ceilings fail closed.

## ownership boundaries

the recoverable Realm consequence host owns admission, journal, locks,
recovery, proposal validation, constitutional decision, authority
intersection, idempotency, action derivation, and the only Realm effect path.

the mission-program coordinator owns step ordering, mission journal writes,
step completion, terminal replay, and phase recovery. the generic adapter
owns only source-to-step binding and the compact projection. the host owns
Realm credentials, hands, effect ceilings, and connector state.

## acceptance matrix

| id | acceptance condition |
| --- | --- |
| RCA-001 | one exact recoverable-host descriptor and consequence input bind the source identity |
| RCA-002 | the generic mission request is body-free and its ceilings are exact |
| RCA-003 | host descriptor, execution id, input, contract, proposal, authority, and epoch cannot drift |
| RCA-004 | absent, admitted, resulted, and completed host states reconcile without guessing |
| RCA-005 | completed output is compact, digest-bound, and contains no Realm or action body |
| RCA-006 | a crash after admission recovers through the host without a duplicate Realm effect |
| RCA-007 | mission-program terminal replay makes no host or Realm calls |
| RCA-008 | no generic authority, credential, provider, continuity, identity, evolution, Soul, or scheduler surface is added |

## proof limits

this boundary does not certify live connectors, remote exactly-once effects,
general rollback, compensation policy, worker delegation, scheduling,
provider or model quality, hosted persistence, default launch behavior,
keel or memory ownership, evolution, Inspiration, Soul, Luna, Lunari, or
phenomenological-core behavior.
