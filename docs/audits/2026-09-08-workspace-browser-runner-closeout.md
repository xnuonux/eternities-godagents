# Workspace browser runner qualification and integration status

Date: 2026-09-08. Runtime candidate: `333fd1f` on
`feat/workspace-browser-runner`. Main remains `51df9e0`.
**Integration pending:** this record is not a claim that the full release gate
has passed or that the branch is merged. Update that state only from final output.

## Delivered and excluded

A real host-reviewed browser executor now reads immutable revision bytes and
evaluates independent click/fill/press/count/visibility/text suites. Actual policy
events cannot be hidden by passing assertions, and step versus overall timeout
causes remain distinct. Completed evidence requires confirmed browser closure.

This is the executor dependency, not the full persistent coding actor. No new
Realm authority, public SDK route, provider call, model comparison, arbitrary-code
sandbox, Soul activation or Lunari integration is supplied by this change.
See [use and limits](../workspace-browser-runner.md) and the
[implementation plan](../superpowers/plans/2026-09-08-workspace-browser-runner.md).

## Current real-browser evidence

Operations root: `D:/00-INDEX/operations/2026-09-08-workspace-browser-runner`.
Existing runtime config `runtime-config-chrome.json` verifies eight named files:
Node24.18.0, Playwright Core1.62.1, Chrome153.0.8010.36 launcher and engine.
Runtime digest: `1d7d78736e11272e5aa1909cdd26cd1939d7646283dc516c68ae54fb36d50cfd`.
Config file SHA256: `656092cc5521c489b089eb8655c5aea86bc5836ad0e15e8fcdfd39d6ce5204ca`.
It is a named partial pin, not a full vendor/OS closure.

Current source bundle: `7090fb227f0f13d8b723a651d561d4da1a85908be3e1b00cb00f77fd54e328c1`.
Current worker: `2d00a23db2cfef94f10ec22b475f05153411245caada7977256ab6e80fd82bc1`.

| Actual qualification | Observation | Summary file SHA256 |
| --- | --- | --- |
| `qualification-oVYx2r` | Broken task-list app fails; fixed app passes three independent cases. Source, parent revision and suite unchanged; both browser cleanups confirmed. | `d76675f591f05ac8f211a53fa0092c697bda113a1cd1374b0102eae105cc0994` |
| `controls-zFmxZo` | Ten cases meet literal expected outcomes: CSP HTTP, HTTP route refusal, two WebSocket cases, popup, navigation, download, step timeout, run timeout, text limit. All confirm cleanup and unchanged original, revision and suite. | `ed38eb897b9d97e548465aa2b117e068d6926b7182f2bcd4bb78dfb0543a07f5` |

The positive suite digest is `66b176748134cabea97d842f7f855fb2e159d710c87f9bdff5a4823d13dd9539`.
Its descriptor is `ac0579031a428f975a51a3a9ada78588c01cd4b8cf9f5f943115c3e2b99f3a72`.
The control cases have different per-case descriptors because their suites,
reviewed bytes and limits differ. Their full records are preserved per case.
Process inspection after the matrix found no owned Node worker or Chrome process.

## Test-first failures retained

- `controls-pr7Pk7`: enforced CSP blocked the attempted HTTP fetch, but passing
  DOM assertions hid that activity. Native Chromium Audits events now report it
  with a closed `csp-blocked` policy event.
- `controls-yS8KFH`: the overall timer killed a stuck app, but the active step
  caught the disconnection as driver-error. It now retains run-timeout; a unit
  regression also rejects premature timeout claims and relabeled assertions.
- `controls-P9btKU`: a probe expected CSP for a WebSocket, while the actual
  intercepting control closed it first. The expected event was corrected to the
  observed socket-closure mechanism, without weakening production controls.
- Earlier launch/profile diagnostics and the no-server-handle cleanup RED are
  preserved in the Task3 plan. The latter now returns uncertainty, not invented
  cleanup success. Missing or failed refusal acknowledgements also fail closed
  to uncertainty rather than inventing successful control observations.

The revised required policyEvents and step timeout vocabulary refine an unmerged
v1 branch. Older branch receipts are historical, not silently rewritten records.

## Review and release gate

Reviewer Sartre `01a083fc-7326-7112-aeec-af344cfead76` cleared the contracts,
static preflight, real runner and Task4 refusal/failure slice. Task4 has no remaining
must-fix findings. Focused contract/runtime/runner tests:28 passed,0 failed,
420.5094ms,exit0. Those are protocol/implementation tests, not model-quality proof.

Full serial integration suite, final review, upstream reconciliation, merge,
merged focused checks and push remain pending. All69 historical certification
receipts must remain unchanged. The user's untracked package-lock.json and the
feature branch are preserved.

## Next product outcome

Connect host-issued Workspace Realm effects to the existing persistent actor
and mission-operation adapter. Bind every revision and test result to its actor,
authority, source mission and exact execution descriptor. Preserve uncertain
dispatch across restart; provide checked diff export rather than mutating the
original project. Then preregister a fresh real development task with the same
model and comparable budget in bound and unbound arms. Do not infer general
superiority, consciousness or completion from these first-party fixtures.
