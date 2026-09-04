# portable Realm consequence SDK v1

## purpose

The recoverable Realm consequence host is already a separately certified,
provider-neutral boundary, but it is reachable only by importing an internal
module. This slice exposes that exact boundary from the package root so an
external host can opt into durable consequence recovery without depending on
repository layout.

This is an SDK migration boundary, not a new Realm runtime. The package must
export the existing protocol identifier, the existing branded-host verifier,
and the existing host factory without wrapping, translating, or weakening
their contracts.

## public contract

The root export adds:

- `RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID`
- `assertRecoverableRealmConsequenceHost`
- `createRecoverableRealmConsequenceHost`

The SDK descriptor names `eternities-recoverable-realm-consequence-v1` as an
additional supported adapter protocol. The existing portable phase-host
protocol and provider-family registrations remain unchanged.

The exported factory keeps the existing requirements: the caller supplies a
real runtime root and a Realm port whose contract is schema-verified, while
the returned host owns a bounded admission/result/receipt journal. The Realm
port remains runtime-only. The host grants no authority, persists no
credential, supports no rollback, and is not enabled by default launch.

## safety boundary

The root remains closed. It does not export persistent-vessel internals,
action gateways, Realm handles, credentials, provider transports, or
continuity and Soul operations. The SDK descriptor remains deeply frozen,
credential-free, and explicit that Realm authority and default-launch
adoption are absent.

This slice does not change the causal loop, the admitted launcher, the local
CLI, the provider host, the Godskills adapter, or the historical recoverable
Realm receipt. It only makes the already-certified host available through the
versioned package surface and proves that the package-root call reaches the
same durable boundary.

## proof obligations

- the package root exposes exactly the new protocol and two host operations;
- the SDK descriptor is deterministic, frozen, and credential-free;
- a host constructed through the package root has the existing private
  provenance brand and exact descriptor;
- one fixture consequence and its exact retry produce one Realm mutation;
- the public export does not add launch adoption, authority, credentials,
  rollback, continuity, keel, identity evolution, Inspiration, Lunari, or
  Soul capability;
- the prior recoverable Realm consequence receipt remains byte-identical;
- the append-only ledger and release lineage include the new surface receipt.
