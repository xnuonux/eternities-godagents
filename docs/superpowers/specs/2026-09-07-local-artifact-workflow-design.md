# local artifact workflow reference host

The approved current-state milestone is an operator creating an agent, giving it a bounded task, retrieving a useful artifact, and resuming the same mission without repeated effects. This slice composes existing mechanisms as an example host. It does not certify model quality.

## chosen design

Keep the current creator and local-admission contracts, provider-phase SDK, admitted provider-backed launcher, request validation, routing pins, and terminal validation. A prepared workspace contains an inert admission, canonical provider/identity policies, a fixed mission request, and a manifest. Preparing must not invoke a provider or acquire live agent residency. Model, provider policy, compiled creation, host ceilings, task, and token limits are explicit operator input. No automatic model or permission selection.

Run/resume requires the prepared manifest's separately supplied digest. Validate the workspace location and pinned input bytes before the existing launcher is called. The same command and request identity resume existing state. The example must never retry an uncertain provider operation or resolve it on the operator's behalf. It uses the existing host's recovery dispositions.

Export only a checked, accepted terminal artifact. The output is content-addressed canonical JSON under the prepared workspace, published exclusively. Identical replay reuses the file. Conflicting files, symlinks, invalid digests, rejected or pending results, and oversized output fail without overwriting anything. Agent-generated content cannot choose output paths or run commands. A digest binds bytes; it does not by itself establish quality or authority.

Review refinement: a verified rejection is a distinct closed outcome, not a generic runtime error. Return its verified receipt and usage with no artifact and a separate nonzero CLI exit code. Pending and missing-authority outcomes also remain distinguishable; no outcome is promoted into acceptance.

## boundaries

- Node 24+, no new dependencies, no copied Godskills bodies or changed release pins.
- Keep the existing launch CLI's closed stdout projection unchanged; share its terminal verifier if needed rather than weaken it.
- The operator supplies policy and budget inputs. Preparation proposes an inert configuration, not an independently authorized policy.
- Do not use test helpers or synthesized certification results in the production example.
- Test real admission, policy, persistence, and publication. Mock only provider network transport where needed.
- No live provider spending in this batch. No Soul, evolution, external tools, arbitrary repository edits, or Lunari integration.
- Preserve historical receipts, fixtures, and the user-owned untracked package-lock.json.

## proof limits and acceptance

Local preparation, controlled transport execution, output validation, changed-input rejection, occupied-path protection, and replay are structural/operator evidence. They do not prove a model is useful. The later paid evaluation must compare an independently checked real task against an unbound baseline under an explicit budget. A second host/provider is needed before a cross-host quality claim.

This example is a finite composition seam, not a new universal kernel or another certification framework.
