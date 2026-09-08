# Creator-to-use preflight and local-artifact Realm decision

Source inspected and exercised: `77603139347840df8b2a005fae484f63afad9827`.
This is a verified product-gap audit and prospective design, not a new runtime
certificate. The implementation described below does not yet exist.

## Verified observations

The public [creator CLI](../../src/creator/local-cli.mjs) previewed and finalized
a fresh Evidence Steward selection. The existing
[operator workflow](../../src/creator/operator-workflow.mjs) and
[creation verifier](../../src/creation/compile.mjs) produced and verified build
`0420ff609f662b968dcb1e98a89534443ab12d5ffb239012f965bc45646711db`.
No precompiled creation, live identity or admitted agent was copied. The module
sources were reused from the first-party fixture catalog with provenance retained;
this does **not** establish a fixture-independent production catalog.

The [Realm schema](../../schemas/realm-contract.schema.json) requires version 1,
`trustModel: fixture-local`, and `privacy.retention: test-only`. The
[distribution compiler](../../src/foundry/compile.mjs) enforces that schema before
publishing a distribution. Controlled cases using the fresh creation showed:

| Case | Observation |
| --- | --- |
| legacy fixture labels | structurally accepted and verified |
| `operator-local` trust | rejected at `/trustModel`, `const`, before output directory creation |
| `operator-managed` retention | rejected at `/privacy/retention`, `const`, before output directory creation |

The positive control is structural only. Its declared capabilities are not proof
of working filesystem hands. The retained fixture counter hand was not executed.
[The persistent local Realm](../../src/realm/local-persistent-realm.mjs) is also
a counter implementation, not a general filesystem Realm.

The real [artifact writer](../../examples/local-artifact-workflow/artifact.mjs)
already validates accepted content digests, bounds bytes, checks canonical paths,
publishes through an exclusive hard link and verifies existing bytes on replay.
The [workflow](../../examples/local-artifact-workflow/run.mjs) uses it after an
authenticated accepted result. This is an existing useful effect to describe and
bind, not a reason to invent another generic Realm execution engine.

No admission, provider or Realm operation occurred. The probe's guarded `fetch`
counter remained zero. This is not an OS-level network-isolation certificate.
An initial Windows ESM import-path error stopped before trial creation; correcting
the imports to file URLs allowed the single recorded trial to execute.

## Evidence and review

Root: `D:/00-INDEX/operations/2026-09-08-creator-to-admission-preflight`.
`probe.mjs` is an exclusive, source-pinned operational probe. Do not rerun its
closed `trial-1` or repurpose its structural control as a live agent.

- Probe SHA256: `662a742b1a745a4a25bc4fba1f9dd18525808d6e51a4d4ee3e0a2e288c7d276a`.
- `trial-1/result.json` SHA256: `67718cc2946e82b66897076cde3f39a4958e32df9ce700f663aae5bba9b7fa59`.
- `trial-1/intent.json` pins the catalog and directly implicated implementation
  sources. The probe rechecked those bytes after execution.
- Preview, finalization, fresh creation sources/build and controlled distribution
  records remain local. No historical repository artifact was overwritten.

Independent read-only review confirmed the gap and additive migration direction.
One review concern was corrected against the code: distribution identity already
includes the canonical Realm contract hash through its `sources` array. Changing
contract bytes changes the distribution build ID even if `realmId` stays the same.
There is no demonstrated identity collision. A new distribution-container version
solely to duplicate that digest is not justified.

## Decision: an explicit local-artifact profile

Keep the current Realm v1 schema and historical workflow protocols unchanged.
Add a separate `local-artifact-v2` embedded Realm contract, accepted only through
an explicit profile dispatcher in distribution compilation/verification and a
new local-artifact workflow manifest protocol 3. Retain the distribution manifest
v1 container and its complete source hashes; `compatibility.schemaRange: 1`
continues to describe that container, not every embedded Realm version.

The new contract is deliberately limited to verified publication and verification
of content-addressed accepted artifacts below the admitted workspace's `artifacts`
directory. It declares operator-local trust and operator-managed retention with
no automatic deletion. It grants no authority, provides no arbitrary filesystem
tool, and promises no encryption, hostile-same-user sandbox, cloud durability or
automatic retention enforcement.

Bind the existing
[localArtifactEffectProducer](../../src/host/structured-effect-producer.mjs)
descriptor, which already describes `publish-local-artifact` and its requested
effects. Do not introduce a parallel producer registry. The new contract's byte
ceiling must be compatible with the host's existing artifact ceiling, including
the canonical JSON newline. All existing authority and effect gates still apply.

Workflow protocol 3 pins the exact Realm contract digest/profile, distribution
build ID and existing producer descriptor digest in addition to existing identity,
policy, provider and mission bindings. Verify those pins before provider dispatch
and again before artifact publication. Never derive a new trusted pin from edited
workspace bytes during run. New profiles require fresh preparation and admission;
do not rewrite a historical identity or silently convert a v1/v2 workspace.

Legacy counter/negotiation consumers keep their v1-only validators. A new Realm
profile must not cause a counter implementation to appear production-capable.
Likewise, a valid contract does not establish a compatible model/cortex adapter;
that remains a separate operator-profile acceptance check.

### Alternatives and reversal

| Option | Benefit | Cost or failure |
| --- | --- | --- |
| retain fixture-only operation | no compatibility change | cannot honestly qualify ordinary local artifact use |
| relax v1 constants globally | small edit | reinterprets historical semantics and could admit profiles to incompatible consumers |
| additive profile and explicit workflow binding | preserves history and describes an existing real effect | requires targeted foundry, admission and workflow compatibility tests |

The additive route is selected. The strongest risk is accidentally widening a
shared validator so legacy consumers accept an unsupported Realm. Rejection tests
at those consumers are mandatory. Rollback disables creation of new profile-3
workspaces while preserving their evidence; it does not reinterpret them as old
profiles. Broader Realm tools, old-agent migration and multi-tenant hosting are
separate future milestones, not requirements to add speculative code now.

## Completion boundary for the next milestone

1. Unchanged v1 distributions and historical evidence still verify exactly.
2. The new profile compiles, verifies and admits only under explicit compatible
   host bindings; wrong profile, digest, effects, ceilings and source drift stop
   before provider access or publication as applicable.
3. A fresh operator catalog selection produces an admitted profile-3 workflow
   without a test helper, precompiled fixture or copied live identity.
4. Controlled execution publishes an actual accepted artifact; process recovery
   verifies identical bytes without another controlled dispatch.
5. Only after those gates, register a separate bounded live qualification under
   existing provider authority. MiniMax's prior exhausted allowance is not renewed.

No claim of universal product completion, model superiority, Soul activation or
Lunari integration follows from this milestone. The concrete implementation path
is in the [implementation plan](../superpowers/plans/2026-09-08-local-artifact-realm.md).
