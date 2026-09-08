# local artifact workflow

This example composes the existing creator/admission, provider-backed identity host,
mission recovery, and artifact checks into one prepared local workspace. It is an
operator-facing reference, not a new kernel, autonomous deployment service, or live
model qualification. It neither creates a Soul nor changes an agent's genome.

## prerequisites and explicit choices

Use Node 24 or newer and a local filesystem supporting exclusive hard-link
publication. Windows NTFS is exercised by the tests; arbitrary network filesystems
are not qualified. Workspaces belong to a trusted local operator. These checks do
not sandbox a hostile process with the same operating-system account.

First finalize a creation using the existing [creator](../src/creator/local-cli.mjs)
or visual creator. Keep its compiled directory, creation build id, and policy digest.
Supply the intended prompt artifact and Realm Contract. Do not use a live admission
already resident elsewhere or duplicate an existing agent identity to bypass recovery.
The example creates a fresh **inert admission** from these explicit inputs.

The operator must choose and approve the exact provider, model, endpoint, task,
authority, materialization ceilings, and token budgets. Neither prepare nor run
selects these for you. The two registered HTTP provider families are
`openai-compatible-chat-completions-v1` and `anthropic-messages-v1`.
Provider policies use the existing [OpenAI-compatible schema](../schemas/openai-compatible-phase-transport-policy.schema.json)
or [Anthropic schema](../schemas/anthropic-messages-phase-transport-policy.schema.json).
HTTP credentials belong only in the environment variable named by that policy, never in
the configuration, mission, command line, or artifact.

For an explicitly qualified endpoint that supports `reasoning_split`, the
OpenAI-compatible policy can select
`provider.profile: "chat-completions-json-schema-reasoning-split-v1"`.
This named opt-in sends `reasoning_split: true` in all three phases without
disabling thinking. It requires a reported integer
`usage.completion_tokens_details.reasoning_tokens`; missing or contradictory
reasoning usage fails closed. Visible content must still be exact JSON. No tags
are stripped and no arbitrary provider parameters are accepted.

The original `chat-completions-json-schema` profile is unchanged. Selecting the
new profile changes the policy/request digests and requires newly pinned prepared
inputs; do not edit an existing mission workspace to bypass those checks.
The profile's existence is not qualification of every endpoint or model.

## preparation configuration

`configuration.json` is one JSON object with these exact root fields:

| Field | Operator-supplied value |
| --- | --- |
| `admission` | `creationDir`, `expectedPolicyDigest`, `expectedCreationBuildId`, `promptArtifactPath`, `realmContractPath`, `instanceId`, `creatorRef`, `checkpointPurpose` |
| `family` | One registered provider family above |
| `providerPolicyPath` | Canonical provider policy JSON file, including a final newline |
| `releasePin` | The exact reviewed Godskills release pin, including `repositoryRoot` |
| `routingPin` | The matching reviewed routing executable pin |
| `request` | A full [identity-bound mission request](../schemas/identity-bound-mission-vessel-request.schema.json) |
| `hostPolicy` | Explicit `policyId`, `realmId`, `authority`, `hostContext`, and `limits` from the [identity host policy](../schemas/identity-host-policy.schema.json) |
| `maximumReviewMaterializedBytes` | Positive bounded review materialization ceiling |
| `maximumRevisionMaterializedBytes` | Positive bounded revision materialization ceiling |

The repository's existing pin helpers are
[`pinned-godskills-review-release.mjs`](../scripts/lib/pinned-godskills-review-release.mjs)
and [`pinned-godskills-routing-executable.mjs`](../scripts/lib/pinned-godskills-routing-executable.mjs).
They expose the currently recorded dependency pins, not an automatic approval to
upgrade them. Inspect and supply the approved pin values. Do not substitute latest
branch hashes for the selected artifact digests. Run re-verifies those dependencies.

`hostPolicy.limits` includes `timeoutMs`, the three `maximumGodskills*Bytes` ceilings,
`maximumNativeMaterializedBytes`, all request budget fields, `maxProjectionBytes`,
and `maxCycles`. The host derives runtime paths and executor/classifier descriptors
from the admitted inputs. It does not infer authority from a mission description.

All source paths, including `releasePin.repositoryRoot`, resolve relative to the
configuration file. The `--workspace` path resolves from your current directory;
its parent must already exist. Configuration and pinned input files are bounded
to 1 MiB. A real preparation example is exercised in
[`local-artifact-workflow.test.mjs`](../tests/local-artifact-workflow.test.mjs);
its synthetic creation, placeholder provider, and controlled responses are **not**
production identities, credentials, or quality evidence.

```powershell
node examples/local-artifact-workflow/cli.mjs prepare --config C:\agent-inputs\configuration.json --workspace C:\agent-work\my-agent
```

Prepare prints `manifestPath` and `manifestDigest`. Save both outside the prepared
workspace as your execution reference. Preparation invokes no provider and does
not claim live residency. It validates the resulting policies/request but cannot
promise that a task has a qualified route or that a later model will produce useful
work. The separately supplied digest is the execution pin, not a signature or an
independent source of authority.

An occupied workspace is rejected. Failed preparation can leave partial inert
files; they are retained for inspection, never recursively deleted or overwritten.
No ready manifest is returned on failure. Use a fresh approved workspace after
investigating the cause, not automatic cleanup of an existing identity.

## run and resume

### Standalone operator starter and explicit Realm-bound v3

The [operator library](../examples/local-artifact-workflow/operator-library/README.md)
contains a small standalone first-party Evidence Steward preset. It supplies
creation sources, not a compiled identity, credential, skill body or live-quality
certificate. Its numeric attributes describe design preferences, not measured IQ.
Soul is dormant and evolution is frozen. Its cortex declares OpenAI-compatible
operation; other model families need separately compatible profiles.

From the repository root, inspect the source policy and preset, then use the
public creator interface. Hash the canonical JSON value, not the pretty file's
raw bytes (the host-policy hash CLI validates a different policy schema):

```powershell
$starter = (Resolve-Path examples/local-artifact-workflow/operator-library).Path
node --input-type=module -e "import {readFile} from 'node:fs/promises'; import {sha256Value} from './src/core/digest.mjs'; console.log(sha256Value(JSON.parse(await readFile(process.argv[1], 'utf8'))));" "$starter\creation-policy.json"
```

Use the returned policy digest as `<policy-sha256>` below. Choose fresh source
and build destinations whose parent exists. These placeholder paths are examples,
not permission to replace an existing directory.

```powershell
node src/creator/local-cli.mjs catalog --policy "$starter\creation-policy.json" --policy-digest <policy-sha256> --modules "$starter\modules" --expressions "$starter\expressions" --presets "$starter\presets"
node src/creator/local-cli.mjs preview-preset --policy "$starter\creation-policy.json" --policy-digest <policy-sha256> --modules "$starter\modules" --expressions "$starter\expressions" --presets "$starter\presets" --preset preset:evidence-steward@1.0.0 --creator creator:operator
node src/creator/local-cli.mjs finalize-preset --policy "$starter\creation-policy.json" --policy-digest <policy-sha256> --modules "$starter\modules" --expressions "$starter\expressions" --presets "$starter\presets" --preset preset:evidence-steward@1.0.0 --creator creator:operator --expected-preview-digest <reviewed-preview-sha256> --source-dir C:\agent-inputs\selected-source --output-dir C:\agent-inputs\creation
```

Review the preview before finalizing. Changed source, policy or preview pins
reject. Keep `creationBuildId` from finalization. Use that fresh creation and
policy digest in `admission`; choose a new `instanceId` and set `promptArtifactPath`
and `realmContractPath` to this starter's `prompt-os.md` and `realm-contract.json`.

V3 uses the exact effect-only v2 configuration fields below, except for explicit
`configuration.schemaVersion: 3`. Its mission and host policy remain protocol 2.
Set `hostPolicy.realmId: "operator-artifacts"`. The Realm has only
`artifact.publish` and `artifact.verify`, not generic filesystem tools. The host
must still grant the effects and authority required by the effect request.
Choose the provider, endpoint, credentials, budgets and external Godskills pins
separately; none are selected by the starter. Use the same prepare command.

The prepared manifest's `realmBinding` pins the verified distribution build,
Realm contract digest/profile and existing artifact producer digest. Run checks
these before provider construction and again before publishing accepted bytes.
The model sees the actual artifact byte ceiling, not a fabricated counter limit.
The host's `maxArtifactBytes` plus the canonical newline must fit within the
contract ceiling (65,536 bytes in this starter).

Wrong pins, drift, aliases and attempted version downgrade fail closed. V1/v2
retain their legacy Realm profile; do not edit an old workspace into v3. Prepare
a new admission explicitly. No automatic retention deletion or old-agent migration
is introduced. The distribution container remains v1; embedded Realm v2 and
workflow v3 are separate versions.

The [standalone creation test](../tests/operator-artifact-creation.test.mjs)
starts from this source catalog through the public creator CLI, freshly admits,
publishes a controlled accepted artifact, and replays in a new process. Actual
SIGKILL recovery is also covered for workflow v3 by the process-recovery tests.
Controlled responses establish plumbing and recovery, not provider quality.

### Explicit effect-only v2 configuration

V1 remains unchanged. To prepare a native-only effect-bound mission, use these
exact root fields: `schemaVersion: 2`, `admission`, `family`,
`providerPolicyPath`, `effectOnly`, `request`, and `hostPolicy`.
`admission`, provider selection and the host authority envelope retain their
existing meaning. Do not include v1 `releasePin`, `routingPin` or review/revision
materialization fields.

`effectOnly` contains exactly `repositoryRoot`, `routingExecutable`,
`verifierExecutable`, and `producerDescriptorDigest`. Supply externally approved
pins in the shapes documented by the [effect-only migration decision](effect-only-vessel-migration-decision.md).
The repository root resolves relative to the configuration file. The request
must already be a valid structured effect-only v2 request; preparation does not
infer or rewrite its effects. Remove the three `maximumGodskills*Bytes` fields
from `hostPolicy.limits`; the bounded v2 source process contract supplies those
fixed ceilings. Other host and native limits remain explicit.

V2 also accepts `family: "grok-cli-subscription-v1"`. This selects the existing
issued Grok portable host, not an HTTP endpoint or an arbitrary host loader.
`providerPolicyPath` must contain the canonical
`eternities-grok-cli-phase-transport-policy-v1` policy. Pin the exact binary and
bridge SHA256 values, explicit model/usage profile and completion ceilings there.
Its absolute `provider.authFile` points to native OIDC subscription credentials;
the credential values never belong in the workflow configuration or command line.
Preparation does not read that auth file or start an inference. Run uses the
prepared policy digest and validates the existing program/auth boundaries.
An optional `reportedModelId` is a separate exact accounting pin, not a model
alias or permission to choose a fallback. See the
[Grok qualification audit](audits/2026-09-08-grok-live-qualification-and-diagnostics.md).

The Grok family is intentionally rejected for v1 before workspace creation or
admission. This addition exposes only the native-only v2 operation. It does not
qualify live adaptive review/revision or grant model tool access. The
[Grok workflow tests](../tests/grok-local-artifact-workflow.test.mjs) use an actual
child process returning synthetic provider data, real admission/publication and
auth-free fresh-process CLI replay. Those are workflow tests, not model-quality
evidence. HTTP families retain their existing v1/v2 behavior.

The same prepare/run commands consume the versioned manifest. Preparation
verifies source pins before publishing it. Run uses the issued-host v2 facade,
and checks in-process terminal provenance before publishing an artifact. A
copied or independently rehashed completion is not an issued result. Fresh-process
replay must go through authenticated admission and journal verification again.

Offline tests cover accepted publication, credential-free replay, denied effects
with zero provider calls, and uncertain dispatch remaining pending without retry.
The v2 decision labels come directly from its routing contract, for example
`authority-missing:local-write`; they are not translated to v1 labels. This is
offline workflow evidence, not live provider quality or a release certificate.

Only after explicitly approving the configured network call and spending limits:

```powershell
node examples/local-artifact-workflow/cli.mjs run --manifest C:\agent-work\my-agent\workflow.json --manifest-digest <saved-sha256>
```

Run checks the saved digest, fixed workspace location, all three prepared input
files, admission, host policy, and dependency pins before the existing launcher.
It acquires one workflow lock. The same invocation resumes the same mission;
do not invent a new mission id or delete outbox/journal/lock files to force retry.

- Completed, accepted work prints receipt/digest references, measured usage, and
  the artifact file path. Raw model content is not printed. The artifact is
  canonical JSON at `artifacts/<accepted-digest>.json` and is never executed.
- Identical completed replay reuses that file without another provider call.
  A conflicting file or a link at the destination is rejected without alteration.
- `needs-decision` reports unresolved routing requirements with `artifact: null`.
  For example, `realm:write` does not imply separate `local-read` or `local-write`
  authority. The example never grants missing permissions or rewrites a pinned
  policy. Resolve the policy question through the host's normal governance.
- `pending` means no accepted artifact is available. A connection failure after
  dispatch can first return a failure and then remain pending on resume. Do not
  retry a potentially performed provider operation. Inspect the existing provider
  operation state under `admission/vessel/provider-phase/<family>` and the vessel's
  mission evidence before any separately authorized reconciliation.
- `rejected` terminal work returns its verified receipt and usage with `artifact: null`,
  distinct from a runtime failure. CLI failures intentionally
  omit raw exception/provider/configuration contents. Programmatic callers can use
  the existing host's typed contracts and on-disk evidence for diagnosis.

Exit codes: `0` prepared or accepted; `1` failed; `2` invalid arguments; `3` pending
or needs-decision; `4` verified rejection. `--help` describes the two commands. No credential flag, arbitrary
code loader, host factory, or automatic retry option is exposed on the CLI.

## what the evidence means

Tests exercise real creation/admission, policy validation, SDK/launcher, persistent
mission state, checked publication, permission stops, rejected review, and ambiguous
transport recovery. Provider network responses or subprocess inference are controlled. A terminal
acceptance receipt and a matching digest establish acceptance and exact bytes, not
truth, usefulness, or superiority to an ordinary model answer.

The [process-recovery tests](../tests/local-workflow-process-recovery.test.mjs)
also terminate an owned process with SIGKILL at two explicit boundaries: uncertain
native dispatch, and persisted provider completion before artifact publication.
They exercise the production lock's actual 30-second dead-owner grace period.
Fresh CLI recovery and credential-present reruns make zero observed fetch/socket
attempts. Uncertain work remains pending; saved completion is recovered and its
artifact subsequently replays exactly. A canary verifies the network witness.
The existing SDK fetch/checkpoint seams control the test boundary. This is local
process-death evidence, not live networking, every crash checkpoint, OS power-loss
durability, or remote exactly-once behavior.

This example adds no historical certification receipt. Live useful-task evaluation
against an unbound baseline under an explicit spending envelope remains a separate
next milestone. So do cross-provider quality and broader fault injection,
hostile same-account filesystem isolation, Soul, evolution, and Lunari integration.
