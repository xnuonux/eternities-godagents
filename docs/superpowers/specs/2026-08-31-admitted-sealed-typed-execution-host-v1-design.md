# Admitted sealed typed execution host v1 design

## decision

Add a sibling programmatic admitted host for the certified sealed local typed
execution runner. Do not modify or reinterpret the certified identity host,
identity vessel, native/review/revision pipeline, CLIs, policies, or default
launch paths.

The new host binds one verified created identity, one externally pinned policy,
one deterministic typed topology, and one exact descriptor-bound executor set to
the certified route, activation, typed compilation, and per-node journal chain.

## why a sibling host

The existing admitted sealed identity host executes a native generation plus
optional review and revision loop. The new runner executes a typed capability
graph. Folding one into the other would silently change certified request,
policy, recovery, and completion semantics.

A generic wrapper without genesis admission would exercise the runner but would
not adopt it as a Godagent host. A sibling host preserves the old system and
adds the missing identity and operator-policy boundary without claiming that the
two execution models are interchangeable.

## trust boundary

The operator supplies a canonical policy and pins its exact digest through
`GODAGENT_TYPED_EXECUTION_POLICY_SHA256`. The policy contains no credentials and
binds:

- policy, instance, Realm, host-adapter, and revocation identities
- exact admission-owned distribution, journal, and snapshot references
- the full Godskills release and routing executable pins
- the full typed-composition and typed-execution-stepper release pins
- the routing-evidence activation-classifier descriptor
- a filename-sorted exact set of authority-empty typed executor descriptors
- authority, topology, input, process, artifact, and result ceilings

The launcher accepts live executor objects only when every descriptor matches
the policy byte-for-byte. It passes only their snapshotted `execute` functions
to the runner. No caller may inject route transport, activation transport,
activation result, typed method, capability registry, execution handle, or
runner factory.

## request

The programmatic request has exactly three fields:

- `missionRequest`: the existing verified identity-bound mission-vessel request
- `topology`: the existing typed-composition topology contract
- `missionInputs`: the closed per-node input map consumed by the certified
  execution journal

The host reuses the existing mission request because it already closes mission
identity, authority, host context, source epoch, budgets, and projection limits.
The policy may narrow those fields but cannot expand them.

## admitted identity derivation

The launcher:

1. rejects malformed inputs and unsafe admission trees
2. reads the canonical admission binding
3. loads the new canonical policy and constant-time verifies its external digest
4. proves that policy paths, instance, and Realm equal the admitted identity
5. verifies transactional genesis, distribution, dormant Soul, and personal keel
6. claims the existing OS-account-local instance residency
7. verifies the mission request beneath policy authority and budget ceilings
8. compiles the existing cortex binding candidate from the admitted identity
9. derives the Godskills binding input from the verified request and candidate

The derived binding input uses:

- mission request id and objective
- requested authority and explicit method requests
- verified observation and source-state epoch
- the candidate's exact Godskills genome policy
- the request host ceiling plus the candidate's declared effect ceiling and
  Realm-hand contract digest

Caller-supplied Godskills binding input is never accepted.
The registry location is host-owned and cannot be replaced by the caller.

## dependency verification

Before constructing the runner, the host independently verifies:

- the Godskills routing executable against the policy pins
- the classifier descriptor derived from verified routing evidence
- typed-composition release closure
- typed-execution-stepper release closure
- each live executor descriptor against the exact policy descriptor
- topology node capability ids against the exact executor set
- every configured byte and count ceiling

The production launcher owns verifier filesystem operations, lock policy,
clocks, instrumentation callbacks, artifact caches, and the OS-account-local
residency registry. Callers cannot replace these runtime dependencies.

Review availability is derived rather than caller selected. It is true only
when the policy's exact executor set includes the certified Muse capability.

## execution and recovery

The runner root is fixed beneath the admitted tree at
`vessel/sealed-typed-execution-v1/<execution-binding-digest>`. That digest binds
the externally pinned policy, admission binding, and exact executor descriptor
set. A repinned policy therefore receives a separate durable namespace and
cannot relabel outputs recovered from an earlier policy. The host calls the
certified runner with the derived binding input, verified topology, verified
mission inputs, and the snapshotted executor map.

The existing runner owns process terminals, compilation records, and typed node
journals. Recovery therefore preserves these guarantees:

- completed route and activation children are not relaunched
- accepted persisted nodes are not re-executed
- terminal execution replay performs no process or node work
- reconstructed activation, plan, and method digests must equal durable records
- private typed methods are never serialized

The deterministic certification fixture hashes the durable file paths and byte
counts as a structural manifest. Timestamp-bearing file contents are verified
by their native runtime contracts rather than misrepresented as deterministic
wall-clock bytes.

The host returns one canonical completion receipt binding policy digest,
admission binding digest, cortex candidate digest, runner compilation digest,
runner execution digest, and authority-expansion false. Pending routing remains
an explicit pending result and creates no executor work.

## errors

The public launcher exposes closed error codes only:

- `input-invalid`
- `admission-invalid`
- `policy-integrity`
- `policy-mismatch`
- `request-invalid`
- `dependency-mismatch`
- `residency-conflict`
- `launch-failed`

Causes may remain attached for local diagnostics but are not serialized into the
completion receipt.

## acceptance

- one real admitted identity and externally pinned policy complete the certified
  local route, activation, typed compilation, and durable Muse-to-Forge graph
- process reconstruction after the first persisted node runs only the unfinished
  node and relaunches no local child
- exact terminal replay executes no child and no node
- changed policy pin, admission path, identity, Realm, authority, budget,
  topology, executor descriptor, executor set, or release pin fails before the
  affected dependency executes
- caller-owned binding input and runner-component injection are impossible
- caller-owned verifier I/O and lock policy are impossible
- accepted executor output is credential-screened before durable publication
- durable state is namespaced by policy, admission, and executor descriptors
- durable state contains no typed method body, credentials, or new authority
- legacy admitted host, vessel, CLI, provider, Realm, and policy tests remain
  byte-compatible
- deterministic fixture, independent review, full suite, receipt ledger, and
  release lineage reproduce from exact source commits

## proof limits

- the descriptor-bound executor implementations remain trusted
- process death after executor return but before durable publication may repeat
  that node
- external exactly-once effects and executor idempotency are not certified
- model, provider, skill, and output quality are not certified
- hostile same-user filesystem mutation and operating-system sandboxing are not
  certified
- no CLI, provider transport, default launch, Realm action, continuity write,
  evolution, Inspiration, Lunari, or Soul activation is added
