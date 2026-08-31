# sealed local identity-bound vessel v1 design

## status

- date: 2026-08-31
- Godagents parent: `3c44ad0034a076738b352c489c21752f44a9f3e0`
- Godskills parent: `7aad930bdb5408ba65e03acf8a56d1978021bcaf`
- scope: additive programmatic identity-bound vessel composition
- legacy host, admitted launcher, CLI, policy schema, and receipts remain unchanged

## problem

Godagents now has two independently certified boundaries that already fit one
another:

1. the identity-bound mission vessel accepts any verified Godskills adapter and
   carries its exact binding into native generation, deferred review, revision,
   final review, and terminal recovery;
2. the sealed local Godskills adapter verifies and executes the exact pushed
   Godskills route and activation binaries through a recoverable process
   transport.

The two are not yet exposed as one construction path. Callers must know how to
derive three durable roots, construct the sealed adapter correctly, preserve
separate process and mission clocks, pass the same checkpoint boundary through
both layers, and then inject the result into the identity-bound vessel. That
manual composition invites root collisions, partial configuration, and a
fallback to the older transient transport.

The admitted launcher and legacy local host are not the right first migration.
They use the older persistent vessel and a closed historical host policy whose
Godskills pin does not carry the new routing and activation roots. Changing
either now would silently alter a certified production-facing path and combine
policy migration with runtime migration.

## decision

Add one explicit asynchronous factory:

`createSealedLocalIdentityBoundMissionVessel`

The factory accepts one `runtimeRoot`, the verified genesis inputs, exact
Godskills release and routing pins, one activation classifier, and the already
defined native, review, and revision transports. It derives non-overlapping
durable roots beneath the runtime root:

```text
<runtime-root>/
  godskills/
  vessel-admissions/
  mission-journals/
```

It first creates the sealed local recoverable Godskills adapter and then passes
that exact adapter to the existing identity-bound mission vessel. It adds no
new routing, activation, identity, mission, review, authority, or recovery
semantics.

## clock and lock separation

The mission vessel accepts the existing general clock contract used for
admission and journal timestamps. The local child transport requires an ISO
timestamp clock for execution and success witnesses. The factory therefore
accepts `clock` and `godskillsClock` separately rather than coercing or sharing
one stateful source implicitly.

Likewise, `lockOptions` govern vessel admission and mission journals, while
`godskillsLockOptions` govern recoverable bindings, outboxes, and local process
terminals. Their roots do not overlap and their test clocks or nonces cannot
accidentally contaminate one another.

## returned surface

The returned object exposes only:

- `run`, delegated to the identity-bound vessel;
- `releaseDigest`, from the verified Godskills release;
- `localExecution`, containing the already certified routing and activation
  trust roots, fixed route mode, and process transport descriptor digests.

It does not expose filesystem roots, verifier brands, adapter internals,
credentials, provider configuration, model configuration, Realm hands,
continuity writers, or identity mutation surfaces.

## recovery model

Before identity-bound admission is published, routing and activation use the
sealed adapter's immutable intent, outbox, process terminal, success-witness,
and binding records. A crash after real child output can therefore reconstruct
the exact Godskills binding without relaunching either child.

After identity-bound admission is published, the existing vessel reconstructs
the candidate from verified genesis, asks the adapter only to rehydrate the
stored binding, reproduces the exact mission admission and native transport,
and delegates phase recovery to the existing mission journal. Exact terminal
replay performs no route, activation, classification, native, review, or
revision work.

## acceptance claims

| id | claim |
|---|---|
| `SLV-001` | one factory constructs the exact sealed local Godskills adapter before the identity-bound vessel |
| `SLV-002` | runtime roots are derived, non-overlapping, and never returned |
| `SLV-003` | missing or partial release, routing, activation, classifier, transport, root, clock, or lock configuration fails before mission work |
| `SLV-004` | real Godskills routing and activation execute inside a complete identity-bound mission loop |
| `SLV-005` | process death after activation success recovers without route or activation relaunch |
| `SLV-006` | recovered native output receives the exact identity projection and exact deferred-review binding |
| `SLV-007` | real review, revision, and final review remain ordered under the existing kernel |
| `SLV-008` | terminal replay performs zero external or classification work |
| `SLV-009` | returned metadata binds both executable roots and both transport descriptors without disclosing paths |
| `SLV-010` | authority, credentials, provider routing, Realm, continuity, keel, evolution, Inspiration, Lunari, and Soul remain unchanged or absent |
| `SLV-011` | historical host, CLI, policy, vessel, adapter, schema, fixture, and receipt paths remain compatible |

## explicit non-goals

- no admitted-host or legacy-local-host default migration;
- no CLI or host-policy option;
- no live provider, model, endpoint, credential, or network call;
- no production activation-classifier implementation;
- no model-quality or routing-quality superiority claim;
- no hostile same-user filesystem isolation;
- no universal exactly-once execution before observable output;
- no Realm action, continuity admission, personal-keel write, identity mutation,
  evolution, Inspiration, Lunari, or Soul activation.
