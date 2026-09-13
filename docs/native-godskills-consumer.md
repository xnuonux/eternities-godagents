# Optional native Godskills consumer

The native Pi operator can opt one admitted mission into a pinned Godskills
release. This is a **consumer adapter**, not a new skill engine or a new model
loop. Without the option, existing native sessions retain their previous behavior.

## What changes

Before the first model call, Godagents verifies the supplied first-party release
and executable roots, derives the agent's capability policy from its admission,
and routes the mission through the existing local recoverable adapter. One
selected stack is fixed for that mission association. At most three capabilities
and at most32KiB of skill disclosure are allowed; the lower release/host bound
also applies. The rest of the catalog stays out of model context.

| Certified activation mode | Model receives | Review claim |
| --- | --- | --- |
| native | selection/activation metadata, no selected body | not performed |
| guardrail | compiled selected contract constraints | not performed |
| method | selected verified entrypoint and operational contract | not performed |
| review | deferred-review metadata, no selected body | scheduled-only |

`reviewAvailable` is the operator's assertion that a separate review can be
provided. It does not force review mode, run a review, or certify one. The existing
evidence-qualified policy chooses the mode. Explicit method requests are also
host choices, not automatically extracted from untrusted prompt text.

## Opt-in configuration

Add `godskills: {policy, expectedPolicyDigest}` to the existing
[operator configuration](native-pi-operator.md). Both the policy and complete
configuration need independent canonical pins. Use the current verified release
pins, not a freshly calculated replacement for a mismatched artifact. The
existing `scripts/lib/pinned-godskills-review-release.mjs` and
`pinned-godskills-routing-executable.mjs` name this tested release; they are not an
automatic latest-release updater.

```js
const policy = {
  schemaVersion: 1,
  protocolId: 'eternities-native-godskills-policy-v1',
  releasePin, routingPin, // independently verified first-party release inputs
  sourceStateEpoch: 0,
  hostEnvelope: {
    availableAuthority: ['local-read', 'local-write', 'repository-write'],
    permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['repository-present', 'settled-outcome'],
    forbiddenCapabilities: [],
    maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 16000,
    maxCompositionSize: 3,
  },
  explicitMethodRequests: [],
  reviewAvailable: false,
  maximumDisclosureBytes: 32768,
};
config.godskills = {policy, expectedPolicyDigest: sha256Value(policy)};
// Review the whole config before separately pinning it for the operator command.
```

The host attests available authority and preconditions. Those declarations do
not grant tools. Concrete effects must fit the native grant and the admitted
constitution/Realm. Genome eligibility, prohibitions and specialization are
derived from the admitted actor, not overwritten by this policy. `sourceStateEpoch`
identifies the declared mission observation; it is not a claim that every
changing file in the working repository is hashed before each inference.

`preflight` verifies roots and effect bounds without selecting skills, creating
session state or invoking a model. A ready preflight does not guarantee a route
exists. Launch must resolve and verify that route before any provider call.
An unresolved or pending route, invalid root, changed artifact, overlarge package
or authority expansion causes rejection before inference. Errors use screened
`native-godskills:` codes.

The SDK uses the same option at `bindingOptions.godskills`; it does not discover
global skills or import another agent's personal keel.

## Persistence, compaction and recovery

`native-state/godskills.json` stores the exact binding receipt, package and
policy/candidate/grant/input digests. The native association binds that record's
digest. Existing route/activation outboxes remain under `godskills-outbox`.

Each provider entry revalidates the pinned release closure and the selected
entrypoint/contract, then rehydrates and compares the exact stored package.
Cached verified artifacts never excuse source verification. Only the stable
selected package enters the native system-prompt suffix; it is not appended to
the persisted conversation. Compaction traverses the same checked boundary.

Resume requires the original policy, record, actor and native transcript. It
does not reroute, reclassify, renew authority, or adopt edited history. Removing
the option from an already-bound mission is a binding mismatch. A deliberate
release or mission migration needs a new governed association; editing checksums
is not migration. Preserve failed state and existing outboxes, do not delete them
to disguise a failed attempt.

## Evidence limits

The consumer tests use actual pinned local Godskills executables and the actual
Pi0.85.1 SDK, replacing only provider inference with scripted responses. They
prove delivery, authority bounds, artifact-drift rejection and continuity. They
do not prove improved coding quality or lower provider cost. That requires a
separate matched outcome study. Old negative Godskills studies remain negative.

Native file/shell tools retain OS-user authority, not a sandbox. This does not
add production Realm semantics, Soul/Inspiration, Lunari integration, external
review execution or a native spending guarantee. Old certification receipts are
preserved at their original revisions, not silently expanded to cover this code.
