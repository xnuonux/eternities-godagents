# Governed local workspace owner

The workspace owner is a provider-neutral SDK path for an **already freshly admitted** `local-workspace-v3` actor. It stages a proposed text repair, obtains a separately host-approved browser result, carries verified failure feedback into a bounded next attempt, and returns a checked replacement bundle after a pass. It does not update the original application or supply a general shell.

Use the existing admission/creation APIs to create a workspace actor. Do not relabel an artifact-only actor. Old artifact owners intentionally cannot issue these capabilities. This is currently a local, operator-managed path, not a finished interactive application or a claim that a live model writes better code.

## Host construction and model-facing handles

`src/host/workspace-owner.mjs` exports:

- `createWorkspaceOwner({policy, expectedPolicyDigest, host, hostKind, registryRoot?, checkpoint?})`: accepts an already issued provider or portable host. No provider/model selection or credential discovery is performed. Construction verifies the actual admission and policy before opening the revision store.
- `assertWorkspaceOwner(owner)`: accepts the original issued object, not a deserialized or copied shape.
- `prepareWorkspaceReview({owner, stage, runtime, suite, limits})`: describes the exact candidate for **host review**, without executing app code. It includes the stage, revision, suite, runner descriptor and owner implementation digest.
- `loadWorkspaceReviewApproval({path, env})`: reads a bounded canonical, single-link host approval file using `GODAGENT_WORKSPACE_REVIEW_SHA256`. Returns an in-process issued capability; a copied object does not qualify. The file is rechecked for changes or revocation before use.
- `createReviewedWorkspaceTestOwner({...sameInputs, approval, checkpoint?})`: requires that host-issued approval capability and the exact review candidate. The model must not receive the loader/constructor, approval-writing authority or the external approval pin.

The proposal handle exposes only `propose()`, `reconcile()` and `continueAfter(issuedTestOwner)`. Its policy and source paths cannot be replaced through a method call. The tested handle exposes `run()`, `reconcile()` and `export()` for exactly the approved operation. Models do not author the evaluator, review record or dispatch binding.

The host policy is closed `schemaVersion:1`, `protocolId:eternities-workspace-owner-policy-v1` and contains:

| Field | Meaning |
| --- | --- |
| `admissionRoot` | Actual canonical local admission directory |
| `identityPolicyPath`, `identityPolicyDigest` | Existing canonical identity policy and its verified pin |
| `request` | Existing valid v2 effect-only proposal request, including authority and per-inference ceilings |
| `source` | Existing revision-store capture shape: absolute `sourceRoot` and selected `{path, sha256}` rows |
| `storeLimits` | Existing closed revision-store limits, no greater than the admitted file/revision ceilings |
| `repairBudget` | `maxAttempts` from 1 to 4 and `totalCompletionTokens`, bounded by the existing request's total completion ceiling |

The workspace policy digest is SHA256 of canonical JSON, not of pretty-printed file bytes. The same applies to the separately pinned review. Stable operating guidance is optional inside the existing transport policy; see the operating-guidance delivery plan and the separate Prompt OS exporter. No raw third-party system prompt is loaded.

## Review is a host decision, not a model verdict

A staged result has `status:needs-review`. Read the exact selected child from the revision store and assess whether it is appropriate for `host-reviewed-browser-local-v1`. Matching hashes and successful structural validation are insufficient to approve code.

An approved record has exactly `schemaVersion:1`, `protocolId:eternities-workspace-code-review-v1`, `reviewCandidateDigest`, `reviewerRef`, and `decision:approved`. Its external digest must come from the host's actual independent decision. A self-authored model record plus its self-computed digest is not accepted by the test owner. The trusted application loader requires a separate host file and pin, then issues a branded capability. The bootstrap assumes the operator controls host configuration, environment and review storage. It does not protect against a malicious host administrator or impersonate a human reviewer.

Only reviewed first-party fixture code is automatically approved in tests. Actual model-generated code must undergo the same real host review gate before running. This browser profile is not OS isolation for arbitrary hostile code.

## One bounded repair sequence

1. `stage = await owner.propose()`. Reconciliation precedes any new native dispatch. Accepted model output must be a closed `{schemaVersion:1, parentDigest, changes:[{path, expectedSha256, text}]}` proposal; unknown authority fields, other paths, stale preimages and invalid bytes reject.
2. Host reviews the exact child and separately issues the tested handle. `tested.run()` invokes the existing real browser runner under its pinned suite/runtime limits.
3. On actual assertion failure, `nextOwner = await owner.continueAfter(tested)`. Only verified failed-test observations feed the new admitted mission. Infrastructure failures, uncertainty and policy violations do not automatically become another repair attempt. A passed test stops this sequence.
4. `nextOwner.propose()` produces another child. It needs its **own** exact-code review. Attempts and aggregate native completion tokens are bounded; the next configured completion envelope is reserved before dispatch.
5. Once independently tested successfully, `tested.export()` returns a non-mutating text replacement bundle with exact parent/child digests, path and before/after hashes/text. UTF-8 BOMs are preserved; binary/NUL or invalid UTF-8 refuses. Publication and application to a user-chosen destination remain explicit host actions and must recheck preimages.

## Recovery and remaining limits

Native inference reuses the existing durable admitted launcher. Staging is deterministic in the existing revision store. Browser operations use only bounded prepared/dispatched/completed side-effect records under the admission's vessel directory, protected by the existing file lock. A dispatched operation without verified completion remains pending; it cannot silently rerun. Missing or changed predecessor evidence is not successful recovery.

For a follow-up after process restart, reconstruct the original owner, reconcile its stage, reconstruct the reviewed test handle from the host's saved review, then call `continueAfter`. This verifies the predecessor chain rather than trusting a deserialized handle. No identity or personal-keel rewrite is involved.

Bounded live qualifications and a one-task comparison now exist; see the
[September12 trial](audits/2026-09-12-grok-workspace-forensics.md). They do not
establish general quality superiority. The later
[multi-file inspector task](audits/2026-09-12-workspace-export-inspector.md) needed
host corrections and exposed a concrete size limit: this owner serializes source
and task into the request's4096-character mission objective. Larger coding tasks
are not qualified by its wider revision-store file quotas. Local synthetic tests
remain wiring/failure evidence, not model competence. There is no automatic
source-tree promotion, global multi-actor budget, cloud sandbox or Lunari integration.

## Operator application entrypoint

`src/host/local-workspace-host.mjs::openLocalWorkspaceHost` is the actual application caller. `examples/local-workspace-workflow/run.mjs` provides its CLI:

```text
node examples/local-workspace-workflow/run.mjs <absolute-operator-host.json>
```

The operator host file is closed `schemaVersion:1`, `protocolId:eternities-local-workspace-host-v1` with these remaining fields:

- `workspacePolicy: {path, digest}` for the owner policy above.
- `provider: {family, policyPath, policyDigest}` for one of the existing OpenAI-compatible, Anthropic or Grok subscription hosts. Model selection and any operating guidance remain in that pinned transport policy.
- `browser: {runtimePath, runtimeDigest, suitePath, suiteDigest, limits}`. The suite file is the ordinary unsigned browser suite; its compiled digest is independently bound during review.
- `reviewDirectory` and `exportDirectory`, absolute operator-controlled paths disjoint from source, admission, revision storage and each other.

`GODAGENT_WORKSPACE_HOST_SHA256` must match canonical host-file JSON. The separately controlled `GODAGENT_WORKSPACE_REVIEW_PINS` is a JSON object mapping up to four review-candidate digests to approved review-record digests. It defaults to an empty map, which pauses at `needs-review`. A matching file in `reviewDirectory/<reviewCandidateDigest>.json` alone does **not** authorize execution. The application snapshots the environment; reopen it after the operator adds an approval pin.

The application returns only a zero-argument `run()` handle. It revalidates config/source pins, reconstructs prior admitted/test steps, and never accepts a model-authored stage or review as an argument. Upon a pass it exclusively publishes `<stageDigest>.json` in the host-selected export directory. Existing different bytes reject; identical verified exports replay. No original app is patched. Missing provider credentials can still permit completed replay through the existing authenticated transport behavior.

This entrypoint is deliberately a small local host. It does not provide a visual review UI, bypass the host's independent code-review work, or silently activate an existing actor with broader permissions.
