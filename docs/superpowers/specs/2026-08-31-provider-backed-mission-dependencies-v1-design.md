# provider-backed mission dependencies v1 design

## decision

Add one provider-neutral production bridge that accepts a certified provider
phase host and an exact Godskills release pin, verifies both boundaries, and
constructs the three dependencies required by the recoverable identity vessel:
the native transport, deferred Godskills review executor, and mission revision
executor.

The bridge returns opaque callable dependencies plus one immutable description
whose digest binds the provider host, Godskills release, transport descriptors,
executor descriptors, materializer identities, and configured byte ceilings.
That description is directly usable when an external authority authors the
identity host policy. The bridge does not author, pin, or launch that policy.

## verified basis

- The provider phase host already exposes `native`, `review`, and `revision`
  handles with one common surface for both certified provider families.
- The SDK owns an unforgeable process-local host brand. Descriptor-equivalent
  caller objects, proxies, and getter facades are not certified host instances.
- The native handle already satisfies the identity-bound native transport
  contract.
- The review handle is the exact transport consumed by the certified deferred
  Godskills review executor.
- The revision handle is the exact transport consumed by the certified mission
  revision executor.
- Existing admitted-host fixtures assemble these parts privately, but no
  production module currently owns or verifies the assembly.

## public boundary

`createProviderBackedMissionDependencies` accepts only:

- one closed certified provider host surface
- one exact Godskills release pin
- bounded review and revision materialization ceilings
- one bounded executor id prefix
- optional shared artifact cache and filesystem read boundary

It returns only:

- `describe()` for a deep-frozen clone of the verified bundle description
- `nativeTransport`
- `reviewExecutor`
- `revisionExecutor`

The description carries no credential, endpoint, raw prompt, response, signing
key, filesystem handle, launch request, or mutable cache. Host credentials stay
inside the provider transport closure. Godskills bodies remain deferred until
the existing review materializer opens the exact selected capabilities.

## failure and recovery semantics

Construction fails closed before returning a partial bundle when the host
surface, host description, provider descriptors, release pin, limits, cache, or
filesystem boundary is invalid. The bridge introduces no retry or journal. Each
dependency retains its already certified reconciliation and crash-recovery
semantics. Callable references are captured once from the SDK-issued frozen host
rather than looked up dynamically after verification. Provider ambiguity
remains pending and must pass through the existing signed resolution controller
and authority outbox.

## authority boundaries

The bridge cannot create an identity policy, choose a provider family, resolve
credentials, sign ambiguity decisions, launch a mission, call Realm, expand an
authority ceiling, mutate continuity, or grant evolution, Inspiration, Lunari,
or Soul authority. All of those remain with their existing explicit owners.

## alternatives

### full one-call provider launcher

This would be convenient, but it would combine provider construction, Godskills
verification, identity policy authority, admission, and model execution before
the dependency boundary itself has independent evidence. It also risks making
policy generation look like runtime authority.

### operator command-line shell

This would expose existing APIs more conveniently but leave the production
provider-to-vessel assembly duplicated and uncertified. It is lower leverage
than closing the missing runtime seam.

## counterargument and revisit trigger

The strongest counterargument is that a three-object factory is only ergonomic
assembly and does not itself prove an end-to-end agent. The milestone earns its
place only if tests demonstrate both provider families, exact descriptor
binding, no credential or authority leakage, deterministic reconstruction, and
successful use by the real admitted identity launch. After that evidence is
stable, revisit a narrow admitted launcher facade that consumes an externally
authored exact policy rather than creating one.
