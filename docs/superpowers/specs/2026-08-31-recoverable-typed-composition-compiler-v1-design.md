# Recoverable typed-composition compiler v1 design

## decision

add one optional Godagents compiler that joins the existing recoverable
Godskills admission boundary to the separately pinned typed-composition
consumer. a caller declares a complete topology template before routing but
does not supply policy roots, activation roots, activation-result identity, or
per-capability activation-decision digests.

the compiler obtains those fields only from one binding produced by the
existing recoverable Godskills adapter, mechanically seals the resulting plan,
and compiles the private-provenance method through the verified Godskills
typed-composition module.

## purpose

typed-composition consumer v1 proves that an exact activation-bound plan can
compile and execute. it intentionally accepts an explicit activation result.
that is suitable for a narrow consumer boundary but not for a host that must
prove where the result came from or recover after routing and activation have
already completed.

this milestone closes that gap without changing any default vessel:

1. persist one exact topology and binding input before external work;
2. route and activate through the existing recoverable Godskills outboxes;
3. bind only certified roots and exact decision digests into the topology;
4. compile and publish one body-free compilation receipt;
5. reconstruct the private method deterministically after process death;
6. execute only through a process-local branded compilation handle.

## topology template

the closed template contains:

- protocol and mission identity;
- authority projection and context ceiling;
- explicit mission input contracts;
- explicit node, phase, and capability ownership without activation fields;
- explicit typed links;
- explicit terminal mission outputs.

the template has no defaults and no semantic inference. node capability ids
must equal the selected activation decisions exactly. topology limits are no
wider than the pinned typed-composition policy.

before routing, the host-side validator also rejects structural impossibility
that does not require private registry semantics: unknown node or mission-input
references, duplicate consumer bindings, one artifact id with multiple
producers, duplicate phase owners, dependency cycles, unknown output nodes,
and outputs that are already consumed by another node. capability slot types,
allowed phases, compatibility, required slots, effects, and policy vocabulary
remain authoritative in the pinned typed-composition compiler after activation.

## durable intent

before Godskills routing, one mission slot publishes a canonical intent that
binds:

- the complete recoverable Godskills binding input and its digest;
- the complete topology template and its digest;
- the historical Godskills release digest;
- the exact typed-composition release receipt, capability-layer, activation,
  and registry roots;
- an authority-empty compiler boundary.

the mission slot is derived from the mission id. changed topology, binding
input, release, or trust root collides before another route or activation call.
the persisted payload is rejected if it contains credential-shaped fields.

## activation-bound compilation

the compiler accepts only a terminal `bound` result returned by its internally
constructed recoverable Godskills adapter. `pending` remains an explicit
nonterminal projection. `needs-decision` and `no-qualified-route` cannot become
a typed method.

for a bound result, the compiler requires:

- template mission id equals the Godskills binding mission id;
- selected capability ids equal template node capability ids;
- activation trust root equals the typed registry root;
- activation authority projection equals the explicit topology authority;
- one activation decision exists for every node.

it then inserts the pinned policy and capability-layer roots, exact activation
root and result digest, and exact decision digest for each node. no phase,
capability, link, type, authority, effect, precondition, input, output, or
context field is inferred.

## durable result and reconstruction

the compiler publishes only one compact receipt containing the intent,
binding, activation, plan, method, and trust-root digests plus an explicit
no-authority-expansion assertion. it does not serialize the private method.

recovery reads the exact intent, rehydrates the already durable Godskills
binding without rerouting or reactivation, recompiles a fresh process-local
method, and requires every receipt field to reproduce before returning a new
branded handle. a caller-created lookalike cannot execute.

compiler state is limited to canonical regular files below one real contained
mission directory, with a one-mebibyte ceiling per record. escaped directory
aliases, symbolic records, noncanonical bytes, and collisions fail closed.
same-process requests for one mission are serialized before taking the durable
file lock, so concurrent local calls converge on one record without weakening
the lock's fail-closed cross-process ownership semantics.

## execution boundary

`execute` accepts one branded compilation handle, exact mission inputs, and
exactly one host-supplied function per selected capability. execution remains
owned by the previously certified typed-composition module. the compiler adds
no retry, persistence, provider, credential, Realm, continuity, identity,
keel, evolution, Lunari, Inspiration, or Soul behavior.

## deterministic proof

the retained canary uses trusted injected recoverable route and activation
transports to select Muse and Forge, persists the topology before either
stage, interrupts after the durable Godskills binding but before compilation
publication, reconstructs the compiler, and proves:

- route and activation each execute once;
- the resumed compiler reads its stored intent and performs no second external
  stage;
- interruption after result publication reconstructs the same compilation;
- concurrent same-process compilation converges on one external route and
  activation execution;
- plan and method digests reproduce exactly;
- no method or reviewer body is serialized into compiler state;
- the process-local handle executes the typed Muse-to-Forge graph;
- changed input, topology, roots, activation, records, and forged handles fail
  closed;
- authority does not expand and no default path changes.

## proof limits

v1 trusts the injected route and activation transports under their already
certified terminal-reconciliation contract. it does not prove a real local
Godskills child process, real skill or model quality, durable graph execution,
cross-process waiting, retry or exactly-once external effects, hostile executor isolation, hostile
same-user operating-system isolation, or adoption by an existing vessel,
host, CLI, Codex task, Realm, continuity system, keel, evolution system,
Lunari, Inspiration, or Soul.
