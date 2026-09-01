# admitted provider-backed identity launcher v1 design

## decision

Add one provider-neutral launcher factory that composes the certified provider
phase host, provider-backed mission dependency bundle, and admitted sealed
identity host without making provider, policy, credential, or authority
decisions. Construction returns one immutable description for an external
authority to use when authoring the existing identity-host policy, plus one
opaque `launch` function that can execute only those captured dependencies.

This is the narrowest production composition path after provider-backed mission
dependencies v1. The lower-level factories remain public and unchanged.

## evidence

- `createProviderPhaseHost` already returns an SDK-issued, process-branded host
  with certified native, review, and revision transports.
- `createProviderBackedMissionDependencies` already authenticates that host,
  verifies the exact Godskills release, captures its callables, and returns the
  three handles required by the identity vessel.
- `launchAdmittedSealedIdentityMission` already verifies the admission tree,
  externally pinned identity policy, request, routing executable, dependency
  descriptors, persistent identity residency, and durable replay.
- the current certification fixture must manually assemble these three layers
  and pass raw dependency handles at each launch. No production boundary owns
  that composition or prevents launch-time dependency substitution.

## requirements

- `APBIL-001`: construction accepts exactly one SDK-issued provider host and
  one exact Godskills release pin, and performs zero provider calls.
- `APBIL-002`: `describe()` returns a deeply frozen, self-digested description
  that binds the complete provider-backed dependency description.
- `APBIL-003`: `launch()` accepts only admission root, policy path, request,
  explicit identity-policy digest, registry root, clocks, checkpoints, and lock
  controls. It cannot accept provider selection, credentials, release pins,
  transports, executors, classifiers, Realm handles, or continuity handles.
- `APBIL-004`: the identity-policy digest is converted into the exact existing
  policy-pin environment projection internally. No ambient process environment
  is read.
- `APBIL-005`: every launch uses the native, review, and revision handles
  captured during construction. A matching external policy succeeds; changed
  provider, Godskills, executor, or policy descriptors fail in the existing
  admitted-host checks before cognition.
- `APBIL-006`: both certified provider families complete native, review,
  revision, and final review through the new launcher.
- `APBIL-007`: terminal replay returns the exact prior result with zero new
  provider, route, or activation work.
- `APBIL-008`: credentials never enter the launcher description, identity
  policy, mission request, durable vessel files, fixture, or receipt.
- `APBIL-009`: all historical receipts remain byte-identical and the new
  certification is append-only in the ledger and release lineage.

## interface

`createAdmittedProviderBackedIdentityLauncher(configuration)` consumes:

- `host`
- `releasePin`
- optional fixed review and revision materialization ceilings
- optional fixed executor id prefix
- optional construction-time artifact cache and verifier I/O

It returns exactly:

- `describe(): AdmittedProviderBackedIdentityLauncherDescription`
- `launch(request): Promise<IdentityBoundMissionResult>`

The description contains schema version, protocol id, the complete verified
provider-backed dependency description, a closed authority declaration, and a
binding digest. The authority declaration fixes policy authorship, provider
selection, credential resolution, signature creation, Realm mutation,
continuity admission, identity mutation, evolution, Inspiration, Lunari, and
Soul authority to false.

The launch request uses `identityPolicyDigest`, not a caller-provided `env`.
The launcher creates only:

```js
{ GODAGENT_IDENTITY_POLICY_SHA256: identityPolicyDigest }
```

and forwards its captured dependency handles to the existing admitted host.

## state and recovery

The launcher owns no durable state. The provider transports, Godskills route
and activation processes, mission journal, vessel snapshot, instance registry,
and admission tree retain their existing ownership and recovery semantics.
Constructing a launcher is deterministic for the same certified host,
Godskills release, and fixed ceilings. Reconstructing one cannot recover work
under a changed policy because the admitted host still binds policy, admission,
request, provider descriptors, and Godskills roots into durable identities.

## failure behavior

Configuration and launch objects are exact-key, bounded inputs. Construction
fails before returning a partial launcher. Launch input failure occurs before
the admitted host or provider is called. Dependency or policy drift remains an
existing `dependency-mismatch` or `policy-integrity` failure. Provider
ambiguity remains pending under the signed resolution controller and authority
outbox. The launcher adds no retry.

## alternatives rejected

1. Have the launcher author the identity policy. Rejected because policy is an
   external authority decision and must not be inferred from executable
   dependencies.
2. Have the launcher choose or construct the provider family from ambient
   configuration. Rejected because provider choice, endpoint, model, policy,
   credential source, and resolution authority are consequential host policy.
3. Continue manual composition. Rejected because callers retain substitution
   opportunities and no reusable production entrypoint represents the exact
   certified stack.

## proof and reversal

Certification uses fake provider HTTPS responses, both provider families, a
real admitted identity fixture, the real Godskills route and activation
executables, the real review and revision loop, process reconstruction, exact
terminal replay, credential-canary scanning, source manifests, independent
review, full tests, ledger verification, and release lineage.

The change is additive. Reversal removes the launcher, its tests, and its
append-only certification from a future release while leaving every existing
factory and historical receipt untouched. Reconsider if a later host contract
can derive the launcher from an independently signed policy without exposing
policy authorship or credentials.

## proof limits

This milestone does not qualify live model quality, truth, latency, cost, or
availability. It does not establish remote exactly-once execution, automatic
provider failover, policy authorship, signing authority, production deployment,
Realm action, continuity admission, identity evolution, Inspiration, Lunari,
or Soul activation.
