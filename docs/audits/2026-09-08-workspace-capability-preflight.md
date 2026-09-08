# Workspace capability preflight

Baseline: `5f38ed5989a222b2c910d129e64f4192769ab715`, reconciled with main.
This is a current-boundary assessment and controlled feasibility probe, not a
workspace implementation, new certification or completed architecture decision.

## What the current paths actually provide

| Inspected boundary | Verified implementation | Consequence for useful coding work |
| --- | --- | --- |
| `schemas/realm-contract.schema.json`, `src/realm/hand-contract.mjs` | v1 is fixture-local/test-only; expected outcomes are numeric addition/subtraction | File preimage/postimage evidence and test results need explicit semantics, not numeric-counter relabeling |
| `src/realm/local-persistent-realm.mjs` | Durable counter increments with idempotency records | Reuse publication/locking patterns, not the counter as a filesystem adapter |
| `src/realm/distribution-contract.mjs` | Explicit v1 fixture and v2 local-artifact profiles | A workspace profile is absent; enabling it is an additive admission change, not an implicit privilege of existing actors |
| `src/realm/recoverable-consequence-host.mjs`, `src/runtime/realm-consequence-mission-operation-adapter.mjs` | Recoverable negotiated consequences under the v1 contract; descriptor excludes rollback | The ownership/recovery pattern is useful, but current validation and outcome contracts cannot simply execute workspace operations |
| `examples/local-artifact-workflow/owner.mjs`, `src/runtime/effect-only-mission-runner.mjs` | Authenticated native artifact missions and publication | Accepted output does not apply a source patch or execute tests |
| `src/runtime/vessel.mjs` | Existing observation/inference/decision/action/recovery loop, using the v1 action gateway | Preserve the persistent-actor loop; do not build a second identity or generic scheduler merely to add tools |
| `src/host/codex-recoverable-turn-coordinator.mjs`, `src/host/codex-task-execution.mjs` | Injected task transport and response/dispatch receipt binding | Inspected code does not establish an actual filesystem/shell authority boundary; a Codex response receipt is not proof of safe edits/tests |

The read-only `probe.mjs` checks unchanged fixture arithmetic and both supported
distribution profiles, then reproduces five rejections: v2 artifact as negotiated
v1 Realm, unregistered workspace version, relabeled operator trust, relabeled
retention, and file-digest replacement through numeric observation-delta. It
exits 0 because those expected existing boundaries were observed. Its result
includes exact hashes of twelve inspected first-party files. It is not a new
product test claiming that a workspace feature exists.

## Concrete execution environment

Read-only command discovery found no Docker or Podman on PATH. `wsl --list --quiet`
reported WSL not installed. This does not prove that no other isolation mechanism
exists, and nothing was installed. Edge `152.0.4191.66` and bundled Playwright
`1.62.1` are present.

The earlier incident observer uses HTTP route interception, blocked service
workers and an empty permission set, but does not set `chromiumSandbox: true`.
The installed `playwright-core/lib/coreBundle.js` explicitly adds `--no-sandbox`
when that option is not true. Consequently the old observer is not a secured
workspace runner and must not be inherited as one by assumption.

A separate first-party canary used a fresh headless browser, explicit sandbox
request, scrubbed launch environment, local in-memory page fulfillment, blocked
HTTP requests and WebSocket routes closed without connecting to a server.
The first attempt stopped before the page test: Browser.getBrowserCommandLine
requires `--enable-automation`, as the installed protocol typing documents.
The corrected probe requested only that extra diagnostic flag and retained the
sandbox assertion. Both owned browsers were closed through finally cleanup.

The corrected attempt exited 0. Actual browser arguments contained none of the
three checked disabling flags: no-sandbox, disable-setuid-sandbox and
disable-gpu-sandbox. Clicking the canary changed its displayed count to 1. The
exercised HTTP request was aborted and the WebSocket was closed before server
connection. No repository page, model-generated code, user credential or provider
call was used. This is feasibility evidence, **not** OS sandbox attestation,
comprehensive egress enforcement, browser exploit resistance or product-host
qualification. Do not generalize two network canaries into arbitrary-code safety.

## Next vertical outcome and dependency order

Target: one freshly created, explicitly admitted actor observes selected source,
edits a selected file in an owned staging workspace, obtains an actual test result
through a host-authorized executor, recovers across both effect boundaries, and
exports a checked diff. Keep identity, policy, selected source and resulting
revision bound throughout. This is the next outcome, not delivered functionality.

1. **Resolve the execution trust boundary and versioned Workspace Realm.** Decide
   exactly which host enforces process/filesystem/network/resource limits and
   bind its descriptor. An isolated provider and a same-user trusted executor are
   different profiles; neither can silently claim the other's guarantees. A
   browser-backed static-app executor is only a candidate from this probe, not a
   substitute for the universal architecture. No arbitrary shell by default.
2. **Implement selected-file staging and real outcome semantics.** Bind exact
   source preimages, allowed relative targets, byte limits, immutable revisions,
   postimage verification and conflict-preserving recovery. Reject path aliases,
   traversal, stale preimages and unrelated writes. Reuse existing actor,
   publication and operation ownership rather than adding another generic journal.
3. **Connect tests and model feedback through the same actor.** A host-pinned
   runner operates on the exact staged revision. Model proposals cannot supply
   executable host code, grant themselves effects or rewrite acceptance tests.
   Return bounded diagnostics as observations; distinguish application failure,
   infrastructure failure, uncertainty and successful verification. Observe real
   resource/tool limits and expose a paused state when they are exceeded.
4. **Qualify with a real eligible task and matched baseline.** Verify final
   behavior and regressions with independently owned tests, then compare the same
   model under equal substantive context, tools, durability and recovery access.
   Preserve failures and overhead. The known incident defect is not fresh evidence.

Required acceptance includes actual staged bytes, unchanged original source,
stable actor bindings, rejection of unauthorized/aliased/stale operations,
pre- and post-effect process-death recovery without speculative retries, a failing
then passing independent behavioral test, bounded diagnostics, and the same
capabilities for the unbound baseline. A digest alone cannot satisfy behavior.

The architectural choice is **not yet implementation-ready**: the concrete
execution provider/trust profile and its enforcement proof remain unresolved.
The controlled browser result narrows that investigation without removing the
decision. Safe first-party conformance work can proceed; arbitrary project
execution, environment installation or external effects are not authorized by a
passing canary. Existing actor authority is not expanded by this assessment.

Independent reviewer `01a07e22-93d9-7c82-981e-91ea6f493e98` confirmed the key
precondition: record an explicit runner trust decision and descriptor before
claiming secured workspace execution. The recommendation is a narrow real-file
integration, not a new general scheduler or reuse of the unsecured observer.

## Evidence

Root: `D:/00-INDEX/operations/2026-09-08-workspace-capability-preflight`.

| File | SHA-256 |
| --- | --- |
| `probe.mjs` | `87febbd71254490686dadf2249883d6332b2b4151f87103fdc2f7bd2bede8980` |
| `result.json` | `26658dbb4ddb2b4bb18905298d2fee8da425ad2ad253e33e889daacc5ca4bcbd` |
| `browser-probe.cjs` (corrected) | `d86baf80ff55da25c3ab9c0122a186cc406123d0dab2ca93bcd3446ff3ba9e6e` |
| `browser-result-v2.json` | `723af4df67e73b384f93778027caa42056edd2938cce0d9b6462292d60d91e68` |

`browser-attempt-1.md` preserves the first error as transcribed console evidence;
its empty initial output is not success. Corrected stderr is separately retained.
No Godagents runtime/schema, historical receipt, Godskills dependency, model
routing, Soul, personal-keel authority or Lunari component changed.
