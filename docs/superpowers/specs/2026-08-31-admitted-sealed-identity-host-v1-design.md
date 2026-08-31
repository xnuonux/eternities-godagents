# admitted sealed identity host v1 design

## decision

add a separate programmatic admitted-host path for the certified sealed local
identity-bound vessel. it uses a new identity-host policy rather than extending
or reinterpreting the historical networked host policy.

`launchAdmittedLocalAgent`, `launch:local`, `host:local`, their policies, Realm
behavior, provider behavior, receipts, and CLI contracts remain byte-compatible.

## problem

the current certified pieces are not yet a product launch boundary:

- the sealed local vessel accepts programmatic genesis arguments rather than an
  admission root and operator policy pin
- its classifier and native, review, and revision dependencies are caller
  supplied
- the historical admitted launcher runs a different persistent-vessel and Realm
  cycle and cannot be silently replaced
- the historical host policy requires provider configuration that is irrelevant
  to an injected provider-neutral identity mission transport

## identity-host policy

the new canonical JSON policy contains no credentials and no provider endpoint.
it binds:

- policy, instance, Realm, host-adapter, and revocation identities
- exact admission-owned distribution, journal, and snapshot references
- the full Godskills release and routing executable pins
- the full routing-evidence classifier descriptor
- the full non-authoritative identity-bound native transport descriptor
- either both review and revision executor descriptors or neither
- host authority and routing context ceilings
- mission artifact, token, cycle, projection, process, and byte ceilings

the operator separately pins the canonical policy digest through
`GODAGENT_IDENTITY_POLICY_SHA256` before any runtime construction.

## launch protocol

`launchAdmittedSealedIdentityMission` accepts:

- admission root
- identity-host policy path
- one identity-bound mission request object
- operator environment containing only the policy digest pin
- native transport and optional review and revision executors
- optional clock, checkpoint, lock, cache, and filesystem test seams

the launcher:

1. rejects malformed inputs and unsafe admission trees
2. reads and verifies the canonical admission binding
3. loads the identity-host policy and constant-time verifies its external digest
4. resolves policy paths exactly to the admission-owned distribution, journal,
   and snapshot
5. verifies the transactional genesis, personal keel, distribution, and Realm
6. claims the existing OS-account-local instance residency
7. verifies the mission request and binds every authority, context, identity, and
   budget field beneath policy ceilings
8. verifies the actual dependency descriptors against the policy
9. verifies the exact Godskills routing executable and constructs the certified
   routing-evidence classifier
10. compares its complete descriptor to the policy pin
11. constructs the sealed local identity-bound vessel beneath the fixed
    admission-owned `vessel/sealed-identity-v1` root
12. runs or recovers one mission and returns its existing closed result

## descriptor and authority rules

- native transport must pass the existing identity-bound native descriptor verifier and
  match the policy byte-for-byte
- review and revision executors must pass existing phase descriptor verification
  and match policy byte-for-byte
- review availability is true only when both executor descriptors and both live
  executors are present
- the derived classifier descriptor must exactly equal the policy descriptor
- no dependency can carry authority in its descriptor
- caller mission authority must be a subset of policy authority
- host ceiling arrays must exactly equal the policy's frozen host context
- mission budgets and projection size may be lower than policy, never higher
- task host adapter and revocation epoch must exactly match policy

## concurrency and recovery

the identity-bound vessel's content-addressed admissions, process terminals,
mission journals, and executor reconciliation remain the recovery mechanism.
the new launcher does not add a broad global lock or Realm writer. identical
terminal requests return through existing replay; changed mission identity or
content collides and fails closed.

the residency claim prevents ordinary copied admission trees from becoming a
second local identity. hostile same-user filesystem manipulation remains outside
the Node process boundary.

## errors

the public launcher emits closed typed codes only:

- `input-invalid`
- `admission-invalid`
- `policy-integrity`
- `policy-mismatch`
- `request-invalid`
- `dependency-mismatch`
- `residency-conflict`
- `launch-failed`

causes remain attached for programmatic diagnostics but are not serialized by
this milestone.

## acceptance

- a real admitted identity, exact policy, certified classifier, sealed local
  route and activation, and pinned deterministic executors complete the existing
  review and revision loop
- reconstruction after local activation success performs no duplicate route or
  activation process work
- exact terminal replay performs no classifier, process, native, review, or
  revision work
- changed policy digest, binding path, instance, Realm, request ceiling,
  authority, descriptor, review pairing, classifier pin, or executable pin fails
  before the affected dependency executes
- the legacy launch tests and source contracts remain unchanged
- deterministic fixture, full tests, release gates, ledger, and lineage pass

## proof limit

this is a programmatic host for injected, descriptor-bound transports. it does
not yet supply a concrete OpenAI, Anthropic, Codex, Claude, local-model, or MCP
transport, a CLI, credential handling, hostile same-user isolation, external
effects, Realm action, continuity admission, keel writes, evolution, Inspiration,
Lunari integration, or Soul activation.
