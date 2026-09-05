# descriptor-bound mission operation adapter v1

Status: approved bounded design

## purpose

Godagents already has separate local contracts for review, bounded
delegation, and Realm consequence work. The long-horizon mission program has
an intentionally smaller authority-empty step adapter. This boundary makes
the relationship explicit without copying any Godskill body, merging the
three operation implementations, or giving the program sequencer new
authority.

The adapter is a provider-neutral migration seam. It binds one operation
kind to one exact source descriptor and exposes only a digest-bound,
payload-free request to the source operation. It may be used to make an
operation compatible with a mission-program step, but it does not change the
mission-program journal protocol or become default vessel wiring.

## protocol

The description protocol is
`eternities-mission-operation-adapter-v1`. The request protocol is
`eternities-mission-operation-request-v1`. The mission-program step descriptor
retains its existing `eternities-mission-program-step-adapter-v1` shape.

The adapter description contains exactly:

- `schemaVersion` and `protocolId`
- `operationKind`, one identifier such as `review`, `delegation`, or
  `realm-consequence`
- `sourceDescriptorDigest`, the SHA-256 of the exact source descriptor
- `missionStepDescriptor`, the existing authority-empty mission-program
  descriptor. Its adapter id is the caller's bounded adapter id followed by
  `:` and the complete source descriptor digest, which preserves the existing
  exact step schema while carrying the unambiguous source binding.
- `capabilities`, a fixed declaration of descriptor revalidation,
  payload-free requests, and mission-completion projection
- `authority`, fixed to zero for Realm effects, continuity writes, identity
  mutation, evolution, and Soul operation
- `descriptionDigest`, covering every other field

The source descriptor itself is not copied into the description or any
mission-program durable record. It is supplied once at construction and
re-read from the source operation before every reconcile or execute call.
Changed or non-canonical source bytes fail closed before the source operation
is invoked.

## source operation boundary

The source operation must expose `descriptor()`, `reconcile({ request })`,
and `execute({ request })`. The adapter passes the source only a frozen
request containing:

- operation and source descriptor identity
- mission-program id, step identity, input digest, and dispatch digest
- the host authority-ceiling digest
- admitted completion and result ceilings
- the fixed empty operation authority projection
- a self-digest over the request

No mission body, result body, provider route, model choice, credential,
filesystem path, Realm handle, callable, keel writer, memory writer, or
arbitrary dispatch object crosses this boundary. The source operation may
close over its own already-authorized runtime state, but the adapter neither
discovers nor expands that state.

The source returns exactly `{ status: "absent" }`, `{ status: "pending" }`,
or `{ status: "completed", completion }`. A completed value must be the
existing mission-program completion shape and must bind to the request's
program, step, kind, and dispatch identity. Extra fields, credential-shaped
fields, authority-shaped completion fields, malformed usage, or a completion
over a ceiling fail closed. The adapter does not reinterpret source output as
a Realm action, constitutional decision, identity mutation, or authority
grant.

The adapter exposes a thin mission-program step surface. It translates an already verified
mission-program dispatch into the payload-free request and returns only the
mission-program outcome shape, so the existing coordinator remains the owner
of admission, ordering, journal writes, artifact publication, locking,
recovery, and terminal replay.

## execution and receipt semantics

The adapter itself performs no durable writes and owns no lock. A caller that
needs a durable mission run uses the existing mission-program coordinator.
Reconciliation remains mandatory before execute and ambiguous `pending`
remains pending. The source operation is never silently retried by this
boundary.

Each adapter description and each operation result can be bound to an optional
compact operation receipt containing only request, source
descriptor, disposition, completion, and source-evidence digests. The receipt
is provenance, not authority. It never contains the source descriptor body,
request body, mission body, response body, credentials, paths, handles, or
callables. The mission-program step surface deliberately returns no extra
receipt field so the existing v1 coordinator contract remains byte-stable;
the source's evidence digest is represented by the opaque completion result
digest and can be bound by a caller-owned receipt.

## invariants

1. source descriptor bytes are pinned at construction and revalidated before
   every source call;
2. the mission-step descriptor binds the source digest through its exact
   adapter version, so admission cannot silently swap the source operation;
3. the request digest covers the complete bounded request;
4. authority is always the fixed empty operation projection and cannot be
   supplied by the caller or source;
5. source calls receive no bodies or arbitrary mission-program dispatch data;
6. only absent, pending, and a fully bound completed outcome are accepted;
7. a changed source, request binding, completion binding, ceiling, schema, or
   credential-shaped field fails closed before the source call or publication;
8. creating the adapter does not select a provider, load a Godskill body,
   invoke a Realm effect, write continuity, or alter identity;
9. current mission-program, review, delegation, Realm, Godskills, and
   current-head receipts remain unchanged until a later source-specific
   integration earns its own receipt.

## proof boundary

The certification fixture will use a deterministic source operation with the
same descriptor/reconcile/execute shape. It will prove source pinning,
request minimization, exact mission-step compatibility, absent/pending/
completed outcomes, descriptor drift rejection, completion binding, ceiling
and credential rejection, and zero adapter-owned writes. It will also prove
that the existing mission-program coordinator can run the thin step surface
without receiving a second authority or receipt shape.

This is not a live review, delegation, Realm, provider, model, scheduler,
multi-agent, sandbox, hosted durability, or product certification. It does
not claim that any one source operation is semantically interchangeable with
another. Review, bounded delegation, and Realm consequence wrappers remain
separate follow-on receipts over this contract.

## non-goals

- no change to existing mission-program schemas or journal events
- no Godskills source-body loading or license/provenance erasure
- no default vessel or launcher wiring
- no live provider, Codex, Claude Code, local-model, MCP, or Realm adapter
- no child-process isolation, retry, quorum, scheduler, or nested program
- no keel, memory, identity, constitution, evolution, Inspiration, or Soul
  authority
