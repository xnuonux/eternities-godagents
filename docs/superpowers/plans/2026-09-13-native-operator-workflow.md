# Native operator workflow delivery plan

> **For agentic workers:** Use `dispatching-parallel-agents` for genuinely independent tasks or `executing-plans` for inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified native Pi binding into a reusable operator workflow and qualify actual multi-turn coding continuation, not merely session opening.

**Architecture:** A thin command owner loads an explicitly pinned JSON configuration, opens the existing admitted actor in Pi, invokes one native prompt, and preserves its result. Pi retains its tool/context/inference loop. Offline summaries and local credential preflight do not invoke a model. No second harness, automatic retries, skill activation, or permission enlargement.

**Tech Stack:** Node 24 ESM, existing Godagents admission and native binding, optional Pi 0.85.1, native xAI subscription for live qualification.

**Spec:** The interface and acceptance contract below, extending `docs/native-pi-session.md` and `docs/native-coding-host-direction.md` under Dom's standing autonomous development approval and September 13 larger-batch request.

## Global constraints and interface

- Preserve `package-lock.json`, historical receipts, current SDK exports and ordinary unbound hosts.
- Native shell and file tools retain OS-user authority. Project cwd is not a sandbox.
- Host config lives outside model project. All paths absolute. Credentials are referenced only by `authPath`; no inline secrets or fallback providers.
- A configuration pin is `sha256Value(config)` supplied independently by the operator, not model prose. Config schema is version 1, protocol `eternities-native-pi-operator-v1`.
- Exact top-level config: `schemaVersion, protocolId, piPackageRoot, authPath, cwd, sessionRoot, admission, mission, model, grant, limits`.
- Admission JSON: `receiptPath, creationDir, distributionDir, expectedPolicyDigest, expectedCreationBuildId, instanceId, creatorRef, transactionDir, journalPath, keelRoot`. Convert only `keelRoot` into the existing local keel adapter.
- Mission: existing cortex mission object, unchanged. The native UUID supplies taskId; `hostAdapterId=pi-sdk-v1`, revocationEpoch 0, maxProjectionBytes 32768.
- Model: `provider, id, maxTokens`. Limits: `maxRunMs`. Grant inputs: `allowedTools, maxToolCalls, expiresAt`. No automatic renewal or resumed identity/mission/model changes.
- Commands: `preflight|launch|resume|status|history --config <file> --pin <digest>`; launch/resume also require `--prompt-file <file>`. Standalone `--help` needs no configuration. Pin failure, malformed config and unknown flags fail before SDK/auth loading.
- Preflight checks explicit installed SDK, selected model and OAuth subscription locally, no inference. Status is offline, credential-free and read-only; it reports recorded state, not authority to resume.
- Launch reserves a fresh session directory, stores pinned metadata and a native session association, then runs once. Resume requires that exact metadata/config/history and uses existing fail-closed native validation. Timeout or interruption aborts without retry; preserve ambiguous effects.
- Per-run output is private local data. Console result is a screened summary, not raw tools, prompts, credentials or provider error strings. Record supplied token fields separately; absent usage is unknown, not zero. Token fields are observations, not billing caps.

## Task 1: Configuration contract (worker A, disjoint ownership)

**Files:** `src/host/native-pi-operator-config.mjs`, `tests/native-pi-operator-config.test.mjs`.

**Produces:** `parseNativeOperatorArgs(argv) -> {command, configPath, expectedConfigDigest, promptPath?}`, `loadNativeOperatorConfig({configPath,expectedConfigDigest}) -> config`, `validateNativeOperatorConfig(config) -> config`. Errors have a screened `native-operator:<code>` message. Loading caps input at 1MiB and verifies pin before returning.

- [x] RED: unknown/duplicate flags, missing pin, inline auth fields, relative paths, unsupported schema, extra grant authority, changed config and invalid limits reject; valid explicit configuration round-trips.
- [x] Implement exact field checks and bounds, using existing digest and native tool map; mission semantics stay with existing cortex compiler.
- [x] GREEN: `node --test tests/native-pi-operator-config.test.mjs`.

## Task 2: Safe operator observability (worker B, disjoint ownership)

**Files:** `src/host/native-session-report.mjs`, `tests/native-session-report.test.mjs`.

**Produces:** `summarizeNativeState(state) -> {phase,sessionId,instanceId,turns,inferences,actions:{total,completed,pending,failed,byTool},stateDigest,associationDigest}`; verifies canonical stateDigest and protocol before summarizing, never raw actions/arguments/results. `createNativeUsageCollector() -> {record(event), snapshot()}` consumes native message_end assistant events; snapshot contains message count, each numeric usage field or null when unavailable, missing-usage count and stop-reason counts. No content/error strings or costs invented.

- [x] RED: altered state, malformed counts and missing usage cannot masquerade as verified totals; a token-bearing native event is counted once per distinct message id where supplied; content never leaks.
- [x] Implement pure summary and accounting without importing SDK, opening auth or writing files.
- [x] GREEN: `node --test tests/native-session-report.test.mjs`.

## Task 3: Native lifecycle owner and CLI (main owner)

**Files:** `src/host/native-pi-operator.mjs`, `src/host/native-pi-cli.mjs`, `tests/native-pi-operator.test.mjs`, package script, operator documentation.

- [x] RED using actual Pi SDK plus scripted provider at the external inference seam: launch writes a real file; resume retains actor/history and writes a second file; status does not call provider; wrong config/history, duplicate launch and unresolved state fail before effects.
- [x] Wire existing admission compiler/native adapter, exclusive session-root reservation, exact metadata integrity, local OAuth preflight, per-run evidence and cleanup.
- [x] Prove timeout/provider failure remains failure, no private raw data in console, and failed/tampered continuation is never retried automatically.
- [x] GREEN: config/report/operator/native binding suites with optional SDK explicitly configured.

## Task 4: Live multi-stage delivery and integration

- [x] Use a fresh admitted actor, workspace and pinned acceptance checks. Two dependent coding stages execute through the new command owner in separate processes under one actor/mission/grant. Use Grok 4.6 subscription only, no personal keel.
- [x] Independently verify source, unchanged tests and rendered behavior as applicable; keep failed attempts and full usage categories.
- [x] Obtain independent code review of changed production interfaces, address material findings, then targeted and full integration gates once at the release boundary. Preserve all historical receipts.
- [x] Reconcile upstream, merge verified batch and push main under standing approval; verify merged source and record exact implementation/live/remaining boundaries.

Completed at source `6efe4a9`, merged/pushed through `9ed8b9a`. The
[delivery audit](../../audits/2026-09-13-native-operator-workflow.md) records the
full regression, final independent review, 59 merged native checks, 8 post-push
cross-repository checks, preserved receipts and environment-assisted live stage2.

## Parallel coordination and non-goals

Worker A owns only config files, worker B owns only report files. Main owns lifecycle, live qualification, package/docs and Git integration. No worker commits/merges or changes others' files. Godskills task owns its read-only consumer-readiness note; no integration activation follows from that note. No production Realm redesign, soul/inspiration changes, model replacement, long-running daemon, shell rollback fiction, or generalized benchmarking matrix in this batch.
