# ADR: session-scoped native-host bridge for the certified Godskills release

**Status:** proposed for implementation  
**Decision:** add a provider-neutral `HostProfile` and a fixed, native-host `Cortex` adapter layer in Godagents. Launch it only through an explicit, session-scoped command. Do not install, replace, or rewrite any Codex, Claude Code, or Lunari global instruction file.

## Context and evidence

Godagents already has the right safety-critical middle of this system:

- A host policy is schema-validated, frozen, canonically digested, and rejects authority outside the host context. It also bounds a release package by composition and context budget. [C:\dev\eternities-godagents\src\host\policy.mjs:21-88]
- An admitted launch verifies its policy pin and admission, creates a mission from policy-bounded authority and host context, constructs the Godskills adapter before constructing the inference client, and journals/recoveries the vessel. [C:\dev\eternities-godagents\src\host\admitted-launch.mjs:164-199] [C:\dev\eternities-godagents\src\host\admitted-launch.mjs:281-355]
- The existing concrete inference construction is specifically `createOpenAICompatibleCortex`; it is the coupling to remove, not the admission, vessel, realm, or Godskills binding path. [C:\dev\eternities-godagents\src\host\admitted-launch.mjs:5-18] [C:\dev\eternities-godagents\src\host\admitted-launch.mjs:175-186]
- A release is already pinned by receipt and digest, requires repository containment, verifies compiler/router artifacts, and is verified before selected bodies are read. [C:\dev\eternities-godagents\src\skills\release-verifier.mjs:32-60] [C:\dev\eternities-godagents\src\skills\release-verifier.mjs:127-186]
- Routing preserves the host ceiling and rejects expansion of authority, effects, preconditions, risk, evidence floor, context, and composition size. [C:\dev\eternities-godagents\src\skills\godskills-adapter.mjs:16-121]
- Binding is deliberately before cortex inference; unresolved routing stops before a cortex request; a recovery rehydrates the exact recorded package rather than rerouting. [C:\dev\eternities-godagents\tests\godskills-runtime-order.test.mjs:128-180]

Godskills describes a local agent-neutral bridge which selects one sufficient capability or a compatible composition of at most three, with explicit ambiguity and authority refusal. [C:\dev\eternities-godskills\README.md:39-59] Its portable adapter identifies the useful integration invariants: route receipt, selected-only loading, preserved authority/effects, and surfaced unresolved decisions. [C:\dev\eternities-godskills\runtime\portable-adapter.v1.json:1-19] The router itself is deterministic and returns `needs-decision` before selecting when unresolved decisions exist. [C:\dev\eternities-godskills\src\router.mjs:250-279]

The release should not be activated by the repository's existing profile mechanism. That mechanism creates junctions in a global `.agents\\skills` root. [C:\dev\eternities-godskills\src\profile.mjs:8-32] [C:\dev\eternities-godskills\src\profile.mjs:88-122] It conflicts with this mission's no-shared-global-instructions constraint.

## Alternatives compared

| Dimension | A. Global host-profile installation | B. Native-host bridge, session-scoped | C. Separate resident Godagent daemon |
| --- | --- | --- | --- |
| Delivery | Add links/instructions to each host's shared configuration | Explicit launcher invokes a fixed Codex, Claude Code, or Lunari adapter for one admitted session | A local service proxies all host calls |
| Shared-instruction impact | Violates the requirement and risks collisions | None. Only a per-launch directory and journal are created | No instruction overwrite, but creates a long-lived privileged surface |
| Authority preservation | Depends on each host reading mutable global text | The existing policy, binding, and vessel remain the sole authority path | Must recreate policy, session, and revocation semantics across IPC |
| Release integrity | Easy to bypass with stale or competing global configuration | Reuses existing receipt/digest verification before selected-body loading | Can verify too, but adds a second trust boundary and credential transport |
| Cross-host compatibility | Three independent installation recipes | One `HostCortexAdapter` port plus three small native drivers | One protocol, but native protocol and lifecycle must be invented first |
| Recovery and audit | Weak session correlation | Reuses the Godagents journal and exact package rehydration | Requires durable daemon state, IPC idempotency, and service operation |
| Complexity now | Low code, unacceptable governance | Moderate, localized replacement of cortex construction | High, operationally disproportionate |

Choose **B**. It is the smallest change that meets the hard boundary and keeps the already-certified release and authority machinery on the execution path. A may be revisited only if a host offers a first-party, immutable, per-project activation primitive that is demonstrably not a shared instruction mutation. C may be revisited if concurrent, long-lived multi-session operation becomes an explicit product requirement and its IPC boundary receives its own admission and recovery proof.

## Architecture

### Components and ownership

1. **Godagents: `HostProfile` schema and loader.** Owns a versioned, policy-digested descriptor of one supported host: `hostKind` (`codex`, `claude-code`, or `lunari`), `adapterId`, supported profile version range, maximum request/response sizes, timeout, allowed local executable identity, and delivery mode. It contains no credential value, no Godskills body, and no authority grant. It is referenced from the existing host policy, so changing it changes the operator-pinned policy digest.
2. **Godagents: `HostCortexAdapter` port.** Owns the provider-neutral replacement for the hard-wired OpenAI-compatible cortex factory. It must satisfy the current cortex contract: `adapterId` and `prepare(context, attempt)`, with `execute()` returning the existing validated proposal/result type. Existing OpenAI-compatible construction remains an adapter implementation for compatibility.
3. **Godagents: three native drivers.** `codex`, `claude-code`, and `lunari` drivers are fixed code selected by `hostKind`, not arbitrary policy-supplied commands. Each owns only translation between the canonical session packet and that host's documented local invocation/session mechanism. They cannot write global instructions, change host settings, or call actions directly.
4. **Godagents: hosted launcher.** Extends admitted launch with `--host-profile`. It verifies admission, policy, profile digest, and release pin; binds the mission; then obtains the selected `HostCortexAdapter`. It owns a per-request working directory under the admitted vessel root and removes only its own temporary packet after terminal journaling.
5. **Godskills: immutable certified release.** Continues to own routing, capability selection, and release receipts. It exposes no host-specific profile and receives no provider credential. The existing all-rounder capability policy remains an eligibility input, including the maximum composition bound of three. [C:\dev\eternities-godagents\src\skills\capability-policy.mjs:5-39]
6. **Operator.** Owns the signed/pinned host policy, the selected host profile, and local host installation. The operator explicitly starts a session; no discovery service, background daemon, or automatic activation is introduced.

### Interfaces

`HostProfileV1` is declarative and closed:

```text
{ schemaVersion, profileId, hostKind, adapterId, supportedHostVersions,
  executableIdentity, deliveryMode, limits:{ timeoutMs, maxRequestBytes, maxResponseBytes },
  outputProtocol:"proposal-json-v1" }
```

`hostKind` selects a compiled-in driver. `executableIdentity` is an allowlisted filename/version fingerprint used for local preflight, not a shell string. `deliveryMode` is limited to a named enum implemented by that driver. A profile has neither free-form arguments nor a path to a prompt file, preventing it from becoming a command-execution or instruction-injection configuration surface.

`HostCortexAdapter`:

```text
prepare({ mission, observation, methodEnvelope, stateEpoch }, attempt)
  -> { metadata:{ attemptId, adapterId, profile, modelId, requestDigest }, execute() -> ProposalResult }
```

The hosted launcher serializes an ephemeral `HostSessionPacketV1` containing the mission identity/text, observed-state digest or bounded observation, the already-bound method envelope, authority projection, attempt identity, expiry, and output schema version. It excludes credentials, global-instruction content, unselected capabilities, and any action handle. The driver returns only `ProposalResultV1`; Godagents continues to validate, constitutionally decide, and enact it.

### Data flow

```text
operator command
  -> admitted launch verifies admission + policy digest + HostProfile
  -> verifies Godskills release pin
  -> observes realm and binds mission under the policy ceiling
  -> journals binding receipt/digests
  -> native driver gives one ephemeral packet to Codex | Claude Code | Lunari
  -> driver normalizes proposal result
  -> existing Godagents validation, decision, realm action, journal receipt
```

No driver calls the realm/action gateway. No host receives a capability merely because it is named in the profile. The selected package's authority projection remains an intersection of mission authority and host availability, while effects remain bounded by the host/constitution intersection. [C:\dev\eternities-godagents\src\skills\mission-binder.mjs:23-42] [C:\dev\eternities-godagents\src\skills\mission-binder.mjs:133-159]

## Trust boundaries, failures, recovery, and observability

**Boundaries.** Treat the local host process and its text output as untrusted until proposal validation. Treat the profile as operator-controlled but untrusted until schema validation and policy-digest binding. Treat the Godskills repository as untrusted until the exact release verifier succeeds. Treat credentials as restricted to the existing credential resolver and its selected transport; never include them in a profile, packet, journal, or host prompt. The current resolver's non-serializing shape is a useful invariant. [C:\dev\eternities-godagents\tests\host-policy.test.mjs:107-117]

**Fail closed.** Refuse launch on an unknown profile version/host kind, executable identity mismatch, invalid packet/output schema, oversized input/output, unsupported host feature, policy/profile/release digest mismatch, missing local host executable, or any native-host nonzero/timeout result. A `needs-decision` route stays terminal for that cycle and makes no host invocation. A native driver cannot silently fall back to another host or to a bare transport.

**Recovery.** Persist `host.profile.selected`, `host.invocation.requested`, `host.invocation.completed|failed` as digest-only journal events around the existing `godskills.bound` event. On restart after binding but before a terminal invocation result, rehydrate the exact package using the existing receipt. If the driver can prove its request was not delivered, it may retry within the existing policy attempt budget using the same request id. If delivery is uncertain or the native host is session-bound and cannot prove idempotent replay, record `host.invocation.uncertain`, perform no realm action, and require an explicit new admitted request. Never reroute during recovery.

**Observability.** Record policy/profile/release/package/packet digests, host kind, adapter id/version, request id, timing, byte counts, outcome class, and retry/recovery cause. Redact mission body where the existing journal policy requires and always omit packet contents, credentials, selected body text, and unselected capability information. Provide a local `inspect-hosted-request` view that correlates those digests with existing `godskills.bound`, cortex, decision, and action events.

## Staged implementation handoff

1. **Contracts first.** Add `HostProfileV1` schema, canonical loader/digest, a closed `hostKind` registry, and the `HostCortexAdapter` interface. Add profile reference and digest to host policy without changing the current OpenAI-compatible policy path.
2. **Refactor, no behavior change.** Extract the `defaultRuntimeFactory` cortex construction behind a `createCortexFromProfile` factory. Implement `openai-compatible-v1` through that factory and prove existing admitted-launch fixtures are byte-for-byte/journal-equivalent where applicable.
3. **Packet and journal.** Implement canonical packet creation, bounded local files, digest-only events, output parsing, and recovery states. Do not yet launch a real native host.
4. **Native drivers.** Implement Codex first against a fake local executable, then Claude Code and Lunari using the same fixture contract. Each driver gets its own version-compatibility probe and refuses unknown versions/modes. Only after all three fixtures pass may operator profiles name the real local executables.
5. **Admission and operator surface.** Add `launch:hosted` CLI validation, documentation, and a migration guide that explicitly states no global host file is touched. Keep `launch:local` as the compatibility command.
6. **Release gate.** Run focused tests, then the existing Godagents and Godskills suites in the normal certification process. Publish no profile as generally enabled until exact host fixtures and a clean release receipt are recorded.

## Exact verification cases

1. A profile with an unknown `hostKind`, free-form command/arguments, writable global-instruction path, or unsupported version is rejected before release verification.
2. Changing any profile byte after policy digest creation causes admitted launch to fail with policy integrity; the same applies to a changed release receipt, manifest, compiler artifact, or repository escape.
3. For each of Codex, Claude Code, and Lunari fixture drivers, a valid all-rounder mission produces the same accepted proposal and realm result as the existing fixture cortex, while every global instruction/config file hash remains unchanged before and after.
4. The packet contains exactly the approved fields; it contains no credential, no host-global instruction content, no realm action handle, no unselected capability, and no selected body in the journal.
5. A route with unresolved decisions records no native invocation and prepares no cortex, preserving the current abort-before-inference invariant.
6. A driver that returns an authority/effect/precondition/risk/evidence/context/composition expansion is rejected before the constitutional decision; no realm action occurs.
7. Timeout, malformed output, oversized output, executable mismatch, and nonzero exit each produce a typed terminal failure with no fallback host and no action receipt.
8. Crash after durable binding, before native invocation, rehydrates the same release/package digests and invokes once. Crash after uncertain native delivery does not invoke again or enact an action; it requires a new request id.
9. Existing OpenAI-compatible admitted-launch tests pass unchanged through the new factory, and explicit unbound operation still omits `godskills.bound`, preserving the documented compatibility behavior. [C:\dev\eternities-godagents\tests\godskills-runtime-order.test.mjs:182-231]
10. Concurrent hosted launches with the same admitted instance retain the existing residency and launch-lock refusal behavior. [C:\dev\eternities-godagents\src\host\admitted-launch.mjs:271-291]

## Assumptions, unresolved decisions, and non-goals

**Assumptions:** Codex, Claude Code, and Lunari each have a locally invocable, operator-authorized mechanism that can accept a bounded per-session packet and return a structured proposal without changing global instructions. Their actual command/session details have not been inspected in this control trial and must be captured only in their respective driver specifications and fixture tests.

**Unresolved decisions:** exact native invocation protocol and supported versions for each host; whether packet transport should be stdin or a locked temporary file per host; the retention/redaction duration for packet-adjacent diagnostic data; and whether a hosted proposal should be restricted to a single model/model configuration per profile or allow a profile-local allowlist. Resolve these before implementing the corresponding real driver, not by weakening the closed profile schema.

**Non-goals:** global skill/profile installation; replacing Codex, Claude Code, or Lunari instructions; making any host a source of authority; arbitrary provider selection; remote service/daemon operation; changing Godskills capability bodies/contracts or release contents; changing Realm/keel semantics; and automatic external action.

## Appendix: inspected files and uncertainty

Inspected local files:

- `C:\dev\eternities-godagents\evidence\field-trials\2026-08-30-terra-architect-v1\mission.md`
- `C:\dev\eternities-godagents\src\host\policy.mjs`
- `C:\dev\eternities-godagents\src\host\admitted-launch.mjs`
- `C:\dev\eternities-godagents\src\host\admitted-cli-contracts.mjs`
- `C:\dev\eternities-godagents\src\skills\release-verifier.mjs`
- `C:\dev\eternities-godagents\src\skills\mission-binder.mjs`
- `C:\dev\eternities-godagents\src\skills\capability-policy.mjs`
- `C:\dev\eternities-godagents\src\skills\godskills-adapter.mjs`
- `C:\dev\eternities-godagents\tests\host-policy.test.mjs`
- `C:\dev\eternities-godagents\tests\godskills-v3-integration.test.mjs`
- `C:\dev\eternities-godagents\tests\godskills-release-verifier.test.mjs`
- `C:\dev\eternities-godagents\tests\godskills-runtime-order.test.mjs`
- `C:\dev\eternities-godagents\package.json`
- `C:\dev\eternities-godskills\README.md`
- `C:\dev\eternities-godskills\src\portable-capability-manifest.mjs`
- `C:\dev\eternities-godskills\src\profile.mjs`
- `C:\dev\eternities-godskills\src\router.mjs`
- `C:\dev\eternities-godskills\runtime\portable-adapter.v1.json`
- `C:\dev\eternities-godskills\package.json`

Uncertainty is intentionally limited to the three hosts' actual local invocation and structured-output capabilities. This decision does not claim those details are present or compatible; it requires a fail-closed driver preflight and fixture proof for each.
