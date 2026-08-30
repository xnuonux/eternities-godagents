# ADR: receipt-bound, session-scoped host profile launcher

## Decision

Adopt a **session-scoped Host Profile Launcher** in Eternities Godagents. It will verify one host-pinned certified Godskills release, bind the mission through the existing Godskills adapter, and deliver the resulting immutable method envelope to a fixed native adapter for `codex`, `claude-code`, or `lunari`. It must use a per-invocation capsule and must not edit, replace, or synthesize any shared global instruction file.

This is a method-delivery integration, not a new runtime or authority plane. A Godskill package may affect method, evidence requirements, proposal requirements, and termination conditions; it never creates host tools, credentials, Realm access, identity, or permission. The effective authority is the intersection of a host-observed envelope and the caller-declared mission envelope. If the native host cannot provide a trustworthy effective-authority observation, the launcher must refuse to launch that profile.

Decision owner: the Godagents host/runtime boundary. Scope: one all-rounder profile consuming the already certified Godskills v3 release through three named host surfaces. Excluded: changing Godskills, replacing a host's instructions or tool policy, invoking Realm actions, credential brokerage, model-provider configuration, persistent identity/genesis changes, and production activation.

## Evidence and constraints

| ID | Requirement or constraint | Classification | Design response |
| --- | --- | --- | --- |
| R1 | One all-rounder must consume the certified release across Codex, Claude Code, and Lunari. | stated | One generic binder plus three fixed native adapters; profile selection never changes eligibility. |
| R2 | Shared global instructions must remain untouched. | stated | Capsule is session-scoped and passed through an adapter-owned invocation mechanism; no adapter has a write operation for host-global settings. |
| R3 | No authority expansion. | stated and verified boundary | Compute the existing one-way intersection, bind only a method package, require host authority attestation, and reject missing or broadened values. |
| R4 | Release and selected artifacts must be certified and exact. | verified | Reuse the release verifier and selected-artifact digest checks before any host invocation. |
| R5 | Recovery must not silently reroute or duplicate work. | verified design intent | Persist a body-free launch receipt and reuse the exact package digest; unknown external-host completion pauses for recovery rather than relaunching. |
| C1 | The current local launcher is an admitted-local, OpenAI-compatible cortex path. | verified | Keep it unchanged. The new launcher is an adjacent method-only host path, not a replacement cortex. |
| C2 | The current sources explicitly exclude Lunari integration and do not show native Codex or Claude Code host adapters. | verified | Treat the three adapters as new implementation work; do not claim live support before host authority observation is implemented. |

The existing binding design already establishes the critical split: Godskills alter method but cannot grant identity, authority, credentials, budget, Realm access, constitutional power, evolution rights, or keel ownership. `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:12-18` The release verifier confines artifacts to the verified repository root and validates every digest before use. `C:\dev\eternities-godagents\src\skills\release-verifier.mjs:32-59,127-186` The current host policy similarly validates an HTTPS provider, model allowlist, authority subset, composition cap, and package budget. `C:\dev\eternities-godagents\src\host\policy.mjs:21-75`

## Options compared

| Dimension | A. Per-host global instruction installation | B. Session-scoped Host Profile Launcher, selected | C. Extend `launch:local` with host switches |
| --- | --- | --- | --- |
| Global-instruction safety | Fails the requirement because it writes or replaces shared host state. | No global write path; the capsule is per invocation. | Could avoid writes, but couples external hosts to an admitted-vessel runtime. |
| Authority boundary | Global prose cannot prove effective tool permissions. | Requires a host-observed attestation and intersects it before binding; fails closed when absent. | Inherits strong local policy checks but treats three interactive hosts as another cortex provider. |
| Compatibility | Fragile across host updates and user customization. | Small fixed adapter per host behind one neutral interface. | Forces Codex, Claude Code, and Lunari into OpenAI-compatible provider assumptions they do not share. |
| Release integrity | Can pin a release, but bodies are likely copied into shared state. | Verifies the certified release and carries only the selected, bounded package. | Reuses current verifier but does not solve native host delivery. |
| Recovery | Global state can outlive a run ambiguously. | Receipt binds request, source envelope, profile, and package; ambiguous host completion pauses. | Existing journal helps, but external-host lifecycle semantics remain undefined. |
| Reversal cost | Manual cleanup of each host's global state. | Remove the profile registration and capsule store; no user configuration rollback. | High, because it changes the core admitted launch path. |

Choose B. It is the only approach that directly satisfies all three central constraints: provider-neutral method delivery, no shared-instruction replacement, and no inferred authority. Its strongest counterargument is that a launcher cannot independently prove each host's effective permission set today. That is real: the design must not substitute a profile file or caller assertion for a host control-plane observation. The selected design therefore deliberately remains unavailable for a host until its adapter provides that observation.

## Target architecture

### Components and ownership

| Component | Owner | Responsibility | Explicitly does not own |
| --- | --- | --- | --- |
| `HostProfile` | Godagents | Static, versioned, declarative compatibility record: `hostId`, `profileId`, `profileVersion`, supported capsule protocol, adapter id, maximum package bytes, and required authority-attestation version. | Credentials, command strings, global instruction paths, permissions, or skill bodies. |
| `HostAuthorityPort` | Native host adapter | Reads a host-provided, session-specific effective authority observation and returns a canonical `HostEnvelope` plus source/epoch evidence. | Granting, changing, or guessing authority. |
| `GodskillsBindingService` | Existing Godagents skills boundary | Verifies the pinned release, routes after mission and authority are known, verifies selected entrypoint/contract bytes, and creates the canonical package and binding receipt. | Host launch, host configuration, and action execution. |
| `InvocationCapsule` | Godagents launcher | Ephemeral canonical file or stdin payload containing the mission, effective envelope digest, binding receipt, package digest, and selected package. | Persistent identity data, host secrets, unselected bodies, or tool grants. |
| `NativeHostAdapter` | One implementation each for Codex, Claude Code, Lunari | Starts an isolated host session using an argument vector or host API, injects the capsule through the host's documented session-local mechanism, receives a structured completion acknowledgement. | Shell interpolation, global instruction writes, policy mutation, or interpreting Godskills files. |
| `HostLaunchLedger` | Godagents | Stores body-free request, profile, source-envelope, release, stack, package, and completion-status digests for idempotency/recovery. | Skill bodies, credentials, or a Realm action receipt. |
| `HostLaunchVerifier` | Godagents | Independently validates completion acknowledgement against the exact prepared capsule and marks `completed`, `failed`, or `paused`. | Treating an agent's textual success report as proof. |

The all-rounder policy stays the current complete-eligible-catalog policy with explicit prohibitions as the only removal mechanism. `C:\dev\eternities-godagents\src\skills\capability-policy.mjs:5-39` A selected package remains capped at three capabilities and at the lesser of release and host byte ceilings. `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:65-81,191-218`

### Interfaces

`HostProfile v1` is canonical JSON and contains only:

```json
{
  "schemaVersion": 1,
  "profileId": "host:codex@1",
  "hostId": "codex",
  "adapterId": "codex-session-v1",
  "capsuleProtocol": "godagent-host-capsule-v1",
  "requiredAuthorityAttestation": "host-envelope-v1",
  "maxPackageBytes": 16000,
  "supportsRecoveryStatus": true,
  "globalInstructionMutation": false
}
```

The equivalent profiles use `claude-code` and `lunari` host IDs and fixed adapter IDs. A profile is not executable configuration: it cannot contain an arbitrary executable path, shell fragment, endpoint, credential reference, or authority list. `adapterId` is resolved from a closed in-process registry, so profile data cannot become command injection.

`HostAuthorityPort.observe(sessionRequest)` returns:

```json
{
  "schemaVersion": 1,
  "attestationVersion": "host-envelope-v1",
  "hostId": "codex",
  "sessionId": "host-issued-opaque-id",
  "sourceStateEpoch": "host-observed-opaque-epoch",
  "availableAuthority": ["..."],
  "permittedEffects": ["..."],
  "availablePreconditions": ["..."],
  "maximumRisk": "moderate",
  "minimumEvidenceConfidence": "verified",
  "contextBudget": 16000,
  "maxCompositionSize": 3
}
```

The adapter must obtain this from the host control plane or a verifiable host-owned session descriptor. A static profile, caller command line, model output, or environment variable is invalid evidence. The launcher intersects it with the mission and constitution ceilings exactly as the current binder does. `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:23-31,84-95`

`InvocationCapsule v1` holds: `requestId`, `profileId`, `profileDigest`, `hostEnvelopeDigest`, `sourceEnvelopeDigest`, the existing body-free binding receipt, `packageDigest`, `releaseDigest`, `stackDigest`, the selected package, and a `noGlobalInstructionMutation: true` assertion. It excludes credentials, Realm hand material, host-global file paths, genesis/keel identifiers, and unselected skill material. The external host receives only this capsule, never direct repository access. This preserves the existing selected-only body boundary. `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:97-130,133-159`

`NativeHostAdapter` has four fixed operations:

```text
observe(sessionRequest) -> HostEnvelope | closed error
prepare(capsule) -> PreparedInvocation { invocationId, capsuleDigest }
start(preparedInvocation) -> Started { hostSessionId }
inspect(invocationId) -> completed(receipt) | failed(code) | unknown
```

No `setGlobalInstructions`, `grantAuthority`, `writeHostConfig`, or generic `execute(command)` operation exists. `prepare` and `start` use an argument array or host API, never an executable command stored in a profile. The result receipt must echo `invocationId`, `requestId`, `profileDigest`, `sourceEnvelopeDigest`, and `packageDigest`; otherwise it is not attributable to the prepared run.

### Data flow and trust boundaries

```text
operator mission + explicit profile id
  -> HostProfile registry [trusted, static, no grants]
  -> HostAuthorityPort.observe [host control-plane boundary]
  -> intersected HostEnvelope [Godagents authority boundary]
  -> verified release + route + selected package [Godskills trust boundary]
  -> canonical InvocationCapsule + body-free ledger receipt [Godagents persistence boundary]
  -> NativeHostAdapter.start [host session boundary, session-local only]
  -> host acknowledgement [untrusted until HostLaunchVerifier matches digests]
  -> completed | failed | paused
```

The Godskills release is a verified dependency, not an authority source. The current release verifier already rejects escaped, absolute, and digest-mismatched artifacts and requires a certified 44-capability manifest whose metadata cannot grant authority. `C:\dev\eternities-godagents\src\skills\release-verifier.mjs:84-109,151-185` The locally verified current release digest is `0befe0bb74a9f25fa82d418cda954e63346e82c2c2870661a859ead22e8794b4`; its manifest has 44 capabilities, maximum selected count 3, and `capabilityGrantsAuthority: false`.

The host boundary is the only new trust boundary. The launcher trusts a native adapter only to report a host-observed envelope and to perform session-local delivery. It does not trust the adapter's success prose or completion claim. A host model is untrusted for authorization and cannot request new packages mid-run. The current package model already records the package digest before inference and disallows a different skill body during the cycle. `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:226-253`

## State, failures, recovery, and compatibility

### State machine

```text
new -> observed -> bound -> prepared -> started -> completed
                         |           |           |
                         v           v           v
                       refused      failed      failed
                                     |
                                     v
                                  paused-unknown
```

- `refused`: profile missing, untrusted or absent authority observation, failed release verification, `needs-decision`, any ceiling expansion, or capsule validation failure. No host session starts.
- `failed`: native adapter returns a typed failure before a completion receipt. Preserve diagnostic code and digests, not credentials or bodies.
- `paused-unknown`: process interruption or host cannot prove whether the invocation ran. Do not reroute, regenerate, or relaunch automatically. An operator can inspect the same `invocationId`; only a matching completion receipt moves to `completed`. A new request ID is required to attempt new work.
- `completed`: only after independent receipt comparison, not after an agent response. This follows the runtime truth rule that agent-reported success and verification are separate inputs.

For a crash after `bound` and before `start`, the launcher may recreate the capsule only if request, profile digest, authority/source envelope digests, release digest, stack digest, and package digest all match. It never reroutes. For a crash after `start`, it uses `inspect`; unprovable status becomes `paused-unknown`. This mirrors the established rule that recovery rehydrates the same package and rejects source, stack, or package mismatches. `C:\dev\eternities-godagents\src\skills\mission-binder.mjs:225-265`

Compatibility rules:

1. A profile supports exactly one capsule protocol major version. A newer launcher can read an older profile only through an explicit compatibility adapter.
2. A compatible Godskills release upgrade is a dependency migration only if profile, effect bindings, authority ceiling, composition ceiling, and package ceiling do not expand. Otherwise reject it as a capability-envelope change, not a host upgrade.
3. Existing `launch:local`, the persistent vessel, and unbound Codex behavior stay unchanged. The current admitted launcher constructs its own local realm, verified Godskills adapter, and OpenAI-compatible cortex; it must not be redirected through these external-host adapters. `C:\dev\eternities-godagents\src\host\admitted-launch.mjs:164-199`
4. No adapter is considered live merely because it can inject text. It is compatible only when it can supply the required authority attestation and structured recovery status.

## Implementation handoff

### Slice 1: core contracts and closed registry

Implement canonical schemas and validators for `HostProfile v1`, `HostEnvelope v1`, `InvocationCapsule v1`, and `HostLaunchReceipt v1`; create the fixed adapter registry keyed by `adapterId`. Observable result: a profile cannot contain executable text, a global-instruction path, credentials, authority grants, or unknown fields. Upstream decision: profiles describe compatibility only. Validation surface: schema/property tests and canonical-digest fixtures.

### Slice 2: binding and capsule preparation

Build the launcher service around the existing `verifyGodskillsRelease` and `createGodskillsAdapter` APIs. It calls `observe`, intersects the envelope, then binds and emits a capsule and body-free pending ledger record. Observable result: one all-rounder request produces a deterministic capsule only after release and authority checks. Upstream decision: the current binder remains the sole release/package authority. Validation surface: adversarial release-pin, entrypoint, contract, forbidden capability, effect-binding, and context-budget fixtures.

### Slice 3: native adapter port and a fake conformance host

Implement the `HostAuthorityPort`/`NativeHostAdapter` interface plus a deterministic fake host. The fake must prove profile lookup, argument-array invocation, session-local capsule delivery, matching acknowledgement, and no global file write. Observable result: the complete contract is executable without a real external host. Upstream decision: adapters cannot execute arbitrary profile content. Validation surface: fake-host transcript, write-spy, path-escape, duplicate request, and malformed acknowledgement tests.

### Slice 4: Codex, Claude Code, and Lunari adapters

For each host, implement a thin adapter only after its documented/local control plane can supply the required envelope and invocation status. Observable result: each adapter passes the common conformance suite and has no host-global write capability. Upstream decision: unsupported authority observation fails closed. Validation surface: host-specific contract fixture plus the shared suite. If a host cannot meet it, retain a clear `host-authority-unavailable` refusal rather than a best-effort integration.

### Slice 5: ledger recovery and migration gate

Implement pending/completed/failed/paused-unknown ledger transitions, `inspect`, exact retry rules, and release/profile compatibility validation. Observable result: an interrupted invocation cannot silently cause a second host execution or a new route. Validation surface: crash checkpoints before prepare, after prepare, after start, and after host completion; release/profile migration matrix.

### Exact acceptance cases

| Case | Required evidence |
| --- | --- |
| AC-1 Exact certified release | Mutate each pinned receipt/manifest/entrypoint/contract byte; preparation refuses before `prepare` is called. |
| AC-2 All-rounder eligibility | With no explicit prohibitions, the binding service receives the complete manifest eligibility set; selection still stays at or below three packages. |
| AC-3 No global mutation | A filesystem/process spy proves Codex, Claude Code, and Lunari adapters do not write configured shared instruction/config locations. |
| AC-4 No authority expansion | Forge an attestation with an expanded effect, authority, precondition, risk, context, or composition value; binding/launch refuses. |
| AC-5 Unattested host | Each native adapter without a verifiable `HostEnvelope v1` returns `host-authority-unavailable` and does not create a capsule or host session. |
| AC-6 Selected-only delivery | Trace read access and capsule content: exactly the selected entrypoint/contract bodies appear, no unselected Godskills body and no direct Godskills repository access by the host. |
| AC-7 Capsule attribution | Alter profile, source envelope, stack, package, or request digest in the host acknowledgement; verifier rejects it. |
| AC-8 Recovery | Interrupt after `bound`, then recover with equal inputs: same package digest is used and no reroute occurs. Interrupt after `started` with no status: state becomes `paused-unknown`, with no automatic relaunch. |
| AC-9 Existing behavior | Current unbound Codex path and admitted `launch:local` regression suites remain unchanged. The existing binding design explicitly requires this preservation. `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md:290-307` |
| AC-10 Dependency migration | A same-envelope release change records old/new release and profile digests; any broader authority, effects, composition, or context ceiling is rejected. |

## Assumptions, non-goals, and revisit triggers

Assumptions:

- Codex, Claude Code, and Lunari can eventually expose a documented or locally verifiable session-local invocation mechanism and an effective-authority observation. This is not established by the inspected repositories.
- The host profile launcher is allowed to create its own bounded run directory/ledger, but not to mutate host-global configuration.
- The mission is method-only. Any future Realm or external-action bridge requires a separately authorized architecture decision and action-gateway integration.

Unresolved decisions:

1. The exact host-native authority-attestation APIs, evidence freshness/epoch semantics, and structured status APIs for Codex, Claude Code, and Lunari are unknown.
2. The durable storage location and retention policy for the host-launch ledger are unknown; it must be owned by Godagents rather than a host-global directory.
3. Whether a human may resolve `paused-unknown` with a signed host transcript, versus requiring a new request ID, needs an operational owner decision.

Non-goals:

- modifying either repository in this trial;
- copying or globally installing skill bodies;
- authorizing tools, models, credentials, Realm actions, evolution, identity, or keel state;
- declaring a live Codex, Claude Code, or Lunari integration from a text-injection-only adapter;
- replacing `launch:local` or the generic cortex.

Revisit the decision if any named host lacks a verifiable authority observation, cannot report idempotent invocation status, requires global-instruction mutation, or if a new Godskills release expands effects, authority, composition, context, or the selected-package protocol. In each case, disable that profile and retain the generic local path; do not weaken the launcher.

## Appendix: trial record

### Inspected files

- `C:\dev\eternities-godagents\evidence\field-trials\2026-08-30-terra-architect-v1\mission.md`
- `C:\dev\eternities-godagents\evidence\field-trials\2026-08-30-terra-architect-v1\godagent-binding.json`
- `C:\dev\eternities-godagents\README.md`
- `C:\dev\eternities-godagents\src\skills\godskills-adapter.mjs`
- `C:\dev\eternities-godagents\src\skills\mission-binder.mjs`
- `C:\dev\eternities-godagents\src\skills\release-verifier.mjs`
- `C:\dev\eternities-godagents\src\skills\capability-policy.mjs`
- `C:\dev\eternities-godagents\src\host\admitted-launch.mjs`
- `C:\dev\eternities-godagents\src\host\policy.mjs`
- `C:\dev\eternities-godagents\src\host\admitted-cli-contracts.mjs`
- `C:\dev\eternities-godagents\src\runtime\persistent-vessel.mjs`
- `C:\dev\eternities-godagents\schemas\host-policy.schema.json`
- `C:\dev\eternities-godagents\schemas\godskills-release-pin.schema.json`
- `C:\dev\eternities-godagents\schemas\godskills-cycle-receipt.schema.json`
- `C:\dev\eternities-godagents\tests\host-policy.test.mjs`
- `C:\dev\eternities-godagents\tests\godskills-v3-integration.test.mjs`
- `C:\dev\eternities-godagents\docs\superpowers\specs\2026-08-30-godskills-v3-mission-binding-design.md`
- `C:\dev\eternities-godskills\skills\eternities-architect\SKILL.md`
- `C:\dev\eternities-godskills\skills\eternities-architect\references\operating-contract.md`
- `C:\dev\eternities-godskills\skills\eternities-architect\references\first-party-contracts.md`
- `C:\dev\eternities-godskills\skills\eternities-architect\references\capability-contract.json`
- `C:\dev\eternities-godskills\artifacts\portable-capabilities\manifest.v1.json`
- `C:\dev\eternities-godskills\receipts\godskills-system-certification-v3.json`
- `C:\dev\eternities-godskills\receipts\portable-capability-manifest-v1.json`

No control result was inspected.

### Receipt and uncertainty

- Selected Godskill id: `eternities-architect`.
- Entrypoint SHA-256 verified: `3edb67a8aa6ef6717cd1abb3aa0658215ab76ec9009895d29bd6068612ee7a05`.
- Capability-contract SHA-256 verified: `1011c45e7350d9bedc8ffeb0bddd0e88e26a8a79c12244e61af3ff703331fe90`.
- Package digest from the trial binding: `1dd76261b10b826e77258388133bb623ce4edd1750f0705445a01e9519e08ddf`. It was not recomputed because doing so would invoke the routing transport and create temporary files outside this trial's single-file write boundary.
- Unresolved uncertainty: the three hosts' authority-attestation, session-local capsule injection, and idempotent completion-status interfaces are not evidenced in the inspected repositories.

### Termination conditions

| Condition | Met | Evidence |
| --- | --- | --- |
| Interfaces, failure behavior, and acceptance conditions are explicit | Yes | Interfaces, state machine, recovery semantics, and AC-1 through AC-10 above. |
| The chosen design traces to requirements and evidence | Yes | Requirement table, option comparison, and cited implementation/receipt evidence above. |
| The implementation handoff does not require renewed architecture discovery | Yes | Five ordered dependency slices, fixed contracts, ownership, and exact verification cases. Host-specific APIs are explicitly gated, not left for architectural rediscovery. |
| Unresolved decisions and revisit triggers are named | Yes | Assumptions, unresolved decisions, and revisit triggers above. |
