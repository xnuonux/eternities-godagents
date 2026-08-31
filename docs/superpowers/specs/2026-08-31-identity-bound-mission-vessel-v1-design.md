# Identity-bound mission vessel v1 design

## Status

- date: 2026-08-31
- parent release: `ea014d330917c89bfe0e6db6516219946e79904d`
- scope: provider-neutral identity binding and default recoverable mission composition
- historical receipts remain immutable

## Problem

The recoverable mission kernel now executes native generation, deferred review,
revision, and final review without repeating completed external work. The native
package, however, contains only the mission and admitted Godskills projection.
It does not contain the verified Godagent identity projection produced by the
Cortex Binding Protocol.

The older admitted local launcher does carry persistent identity into a cortex
cycle, but it predates the recoverable review loop. Connecting the new kernel
directly to that launcher would create two competing execution spines and would
not prove that the exact identity consumed by cognition is the identity bound to
the mission receipt.

## Decision

Add one provider-neutral default mission vessel with two explicit boundaries:

1. an immutable vessel-admission record binds one verified genesis, one task,
   one observation, one host ceiling, one Godskills route and activation result,
   one mission admission, and one compiled inert Cortex Binding candidate;
2. an identity-bound native transport wraps the existing recoverable native
   executor and sends the exact bounded model projection beside the exact native
   mission package.

The existing mission kernel remains the only phase-order and artifact-commit
authority. The existing Cortex Binding compiler remains the only identity
projection compiler. The existing Godskills adapter remains the only routing,
activation, disclosure, and rehydration authority. This milestone composes them;
it does not duplicate their policy.

## Default vessel request

The request is a closed, credential-free value containing:

- one task identity and host-adapter identity;
- one mission objective, success-evidence set, and stop-condition set;
- one bounded observation with content-addressed evidence identities;
- explicit requested authority and explicit method requests;
- host capability, effect, precondition, risk, evidence, context, and
  composition ceilings;
- native, review, revision, total-completion, artifact-byte, projection-byte,
  and cycle ceilings;
- one source-state epoch.

The admitted genesis arguments, Godskills adapter, transports, executors,
filesystem roots, clock, and checkpoints are constructor dependencies, not
request data. Credentials, provider names, model ids, endpoints, filesystem
paths, identity prose, Realm hands, and continuity writes are rejected from the
request.

## Identity compilation

For every run the vessel compiles a Cortex Binding candidate from the exact
verified genesis and a deterministic projection of the vessel request. The
candidate remains `compiled-inert`, carries no granted effect, and includes the
current verified personal-keel head only through the existing bounded continuity
projection.

The candidate is never accepted from the caller. Recovery recompiles it from
the verified admission and requires the candidate, full-envelope, and
model-projection digests to equal the immutable vessel-admission record.

## Godskills binding

On first admission the vessel gives the configured Godskills adapter only the
mission text, explicit method requests, requested authority, bounded
observation, genome-owned Godskills policy, and host ceiling. Constitution and
Realm contract identities are derived from the verified Cortex Binding
candidate rather than caller input.

`needs-decision` remains terminally unresolved and does not create a vessel
record. A selected adaptive result enters the mission-kernel admission with its
exact trust pin and cortex package. A no-qualified-route result remains bound in
the vessel record while the mission kernel receives a native-only admission.
Legacy selected bindings without a verified adaptive trust root are rejected by
this default composition instead of silently weakening the recovery boundary.

Recovery opens the immutable vessel record first and invokes only
`rehydrateMission` against its stored Godskills receipt. It never routes,
classifies, or invokes the activation compiler again. The rehydrated package
must exactly equal the stored package and mission admission.

The first route and activation call precede immutable record publication. This
milestone serializes concurrent admissions and binds every published result, but
does not claim atomic recovery if the host process dies after an external
activation compiler finishes and before the first record is published. That
transport must remain idempotent by its own request digest until a future
reconcilable activation outbox closes the narrow pre-publication window.

## Immutable vessel admission

The record is canonically published once beneath a mission-id hash. It binds:

- the complete closed vessel request digest;
- admission receipt, instance, genesis, and keel identities;
- Cortex Binding candidate, full-envelope, and model-projection digests;
- Godskills route status, receipt, and cortex-package digest;
- the complete mission-kernel admission and its digest;
- a protocol and record digest.

An existing record is never overwritten. Exact replay continues. A changed
task, mission, observation, budget, host ceiling, authority request, method
request, genesis source, keel head, Godskills release, route result, or identity
projection fails before executor use.

## Identity-bound native transport

The outer surface remains the certified `mission-native-transport-v1` contract.
The wrapper descriptor identity binds the vessel-admission digest, Cortex
Binding candidate digest, model-projection digest, and one separately described
inner transport.

The inner dispatch contains exactly:

- the outer native dispatch and package identities;
- the vessel-admission and Cortex Binding identities;
- the exact bounded model projection;
- the exact native mission package;
- the completion-token ceiling;
- an authority-empty projection;
- its canonical dispatch digest.

The inner transport promises terminal reconciliation and atomic deduplication by
that dispatch digest. The wrapper reconciles before execution, permits execution
only after exact `absent`, treats `pending` as pending, recovers exact
`completed`, and rejects ambiguous state. Its verified inner completion is
converted into the ordinary native transport completion, so the existing native
executor and mission kernel remain unchanged.

The model projection is content, not authority. Model output remains an
untrusted native artifact. Neither the wrapper nor the inner transport receives
a Realm hand, personal-keel writer, identity owner, evolution control, Soul
state, or continuity-admission capability.

## Recovery sequence

1. Validate the closed request and open any immutable vessel admission.
2. Recompile the identity candidate from verified genesis sources.
3. On first admission, bind Godskills and publish the vessel record. On replay,
   rehydrate the exact stored binding without routing.
4. Reconstruct the identity-bound transport and native executor. Their
   descriptors must reproduce exactly.
5. Run the existing mission kernel against the record's exact mission
   admission.
6. Reconcile the identity-bound inner dispatch before any possible execution.
7. Return a vessel completion receipt binding the immutable vessel admission,
   identity projection, mission completion receipt, verdict, and accepted
   artifact.

If external native work completed before process death, reconstruction produces
the same inner and outer dispatch digests, recovers the completion, and performs
no second model call.

## Acceptance claims

| id | claim |
| --- | --- |
| `IMV-001` | one verified genesis and closed request deterministically compile one immutable vessel admission |
| `IMV-002` | the exact verified model projection reaches native cognition beside the exact mission package |
| `IMV-003` | candidate, projection, task, mission, observation, ceiling, and Godskills changes fail closed |
| `IMV-004` | one published admission rehydrates on reconstruction without routing, classification, or activation recompilation |
| `IMV-005` | inner and outer dispatches both require exact absent reconciliation before execution |
| `IMV-006` | completed native work is recovered after process reconstruction without redispatch |
| `IMV-007` | pending and ambiguous transport states cannot dispatch or commit |
| `IMV-008` | native, review, revision, and final review remain ordered and content-addressed by the existing kernel |
| `IMV-009` | exact terminal replay performs no transport, routing, classification, activation, or executor call |
| `IMV-010` | identity, Godskills, artifact, usage, byte, time, and authority substitution fail closed |
| `IMV-011` | credentials and provider-routing fields cannot enter requests, records, dispatches, completions, or receipts |
| `IMV-012` | Realm, continuity, personal-keel, identity, evolution, Inspiration, and Soul authority remain absent |
| `IMV-013` | two admitted identities executing the same mission remain cryptographically distinct |
| `IMV-014` | the complete repository suite and append-only certification ledger remain valid |
| `IMV-015` | the exact certified source remains an ancestor of the released main head |

## Explicit non-goals

- no concrete OpenAI, Anthropic, local-model, Codex desktop, Claude Code, or MCP
  transport;
- no credential resolution or model routing;
- no claim of model quality or Godskills superiority;
- no Realm action, compensation, or delegation;
- no continuity-content admission or personal-keel write;
- no hosted service, daemon, cross-machine replication, or hostile same-user
  isolation;
- no Lunari, Inspiration, or Soul integration.

The next provider milestone may implement this inner transport contract. It may
not weaken or bypass the vessel admission, identity projection, mission journal,
or exact terminal-reconciliation requirements.
