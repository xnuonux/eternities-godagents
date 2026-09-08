# Workspace Browser Runner Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. These tasks share one trust boundary. Reuse the existing independent reviewer at meaningful checkpoints; do not create another actor, coordinator or generic journal.

**Goal:** Execute host-owned behavioral tests on exact host-reviewed static-app revisions and return bounded, source-bound observed results.

**Architecture:** A parent runner verifies the store, suites and named runtime pins, then starts one scrubbed Node worker. The worker serves only copied admitted bytes in a fresh browser context and executes a closed declarative suite. The parent verifies the result and input revision again; uncertain cleanup is not success.

**Tech Stack:** Node24+ ESM, built-in process/filesystem/crypto APIs, the explicitly configured installed Playwright-core driver and browser. No dependency installation or model call.

**Spec:** [host-reviewed browser workspace runner](../specs/2026-09-08-workspace-browser-runner-design.md), design commit `04cf2ed` plus its exact reviewed follow-ups.

## Global Constraints

- Baseline main `51df9e0ee5b4fd4bd4797838ead050416e558285`; branch `feat/workspace-browser-runner`.
- Profile `host-reviewed-browser-local-v1`; runtimePinScope exactly `named-driver-and-engine-files`.
- Only exact host-approved first-party revision digests. No arbitrary repository or live model-generated app execution in this qualification.
- No shell commands, executable suite code, provider/credential reads, downloads, installation, global settings, source mutation, deletion/GC, Soul or Lunari.
- At most8 cases,128 total steps,512-byte selectors,4096-byte text values,64KiB canonical suites. Step <=5000ms, launch <=10000ms, run <=60000ms plus cleanup <=10000ms.
- Initial implementation ceilings:16 selected files,4MiB total app bytes,16KiB result bytes. Smaller host/store ceilings win; no truncation of app bytes or implicit widening. Diagnostic app-text samples <=512 UTF-8 bytes.
- Reject unknown configuration fields. Node environment is scrubbed at creation, before driver import; browser environment is independently scrubbed. System-directory PATH only, no inherited NODE_OPTIONS/PW_*/DEBUG/proxy/provider environment.
- Browser controls are application/browser-layer controls. No comprehensive DNS/egress, full-installation integrity, OS sandbox attestation, exploit resistance or hard CPU/RAM claim.
- Preserve package-lock.json, all existing Realm/actor/SDK routes and all historical receipts. Full suite only at final integration, serially.

## File responsibilities

- `src/workspace/browser-test-contracts.mjs`: suite, policy, descriptor and outcome validation/digests. No filesystem, process or browser import.
- `src/workspace/browser-test-runtime.mjs`: canonical private runtime locations, bounded streaming file-pin checks and fixed environment construction. No model data or app execution.
- `src/workspace/browser-test-runner.mjs`: issued parent handle, revision approval/materialization, bounded worker lifecycle and result verification.
- `src/workspace/browser-test-worker.mjs`: fixed worker entrypoint, bounded stdin, pre-import validation, actual browser controls, declarative steps and cleanup.
- Unit tests mirror those boundaries. `scripts/check-browser-workspace-runner.mjs` performs explicit real-host qualification using inspected fixture apps and a supplied runtime config. Do not silently skip absent browser qualification and call the runner certified.

## Task 1: closed suite and runner contracts

**Files:** create `src/workspace/browser-test-contracts.mjs` and `tests/browser-test-contracts.test.mjs`.

**Interfaces:**
- `compileBrowserTestSuite(input)` accepts `{schemaVersion:1,testId,entryPath,cases}` and returns a frozen copy plus `testSuiteDigest`.
- `verifyBrowserTestSuite(record)` accepts that complete record and recomputes its digest.
- Cases are `{caseId,steps}`. Steps are closed tagged records: `{kind:'click',selector}`, `{kind:'fill',selector,text}`, `{kind:'press',selector,key}`, `{kind:'assert-text',selector,text}`, `{kind:'assert-visible',selector,visible}`, `{kind:'assert-count',selector,count}`.
- `compileBrowserRunnerPolicy(input)` accepts profile, approvedRevisionDigests and limits; returns frozen policy plus policyDigest. Revisions must be unique SHA-256 strings and sorted deterministically, with no model-controlled approval flag.
- `buildBrowserRunnerDescriptor(unsigned)` and `verifyBrowserRunnerDescriptor(record)` enforce B-3's exact descriptor fields and partial-pin label.
- `verifyBrowserTestResult(record,{revisionDigest,testId,testSuiteDigest,descriptorDigest,maxResultBytes})` verifies exact bindings, closed cases/steps, verdict consistency, actual bounded durations, cleanup confirmation and digest. A claimed passed outcome with a failed step rejects.

- [ ] Add a missing-API RED test before production code:

```js
const api = await import('../src/workspace/browser-test-contracts.mjs').catch(() => ({}));
assert.equal(typeof api.compileBrowserTestSuite, 'function');
const suite = api.compileBrowserTestSuite({schemaVersion:1,testId:'tasks.filter',entryPath:'index.html',
  cases:[{caseId:'completed-only',steps:[
    {kind:'click',selector:'#completed'},
    {kind:'assert-count',selector:'.task',count:1},
    {kind:'assert-text',selector:'.task',text:'fix build'},
  ]}]});
assert.equal(suite.cases[0].steps[2].text, 'fix build');
assert.ok(Object.isFrozen(suite.cases[0].steps));
```

- [ ] Run `node --test tests/browser-test-contracts.test.mjs`; observe the missing-function assertion, not an accidental syntax/import error. Then implement only the closed suite validation and canonical digest using existing core canonical-json/digest helpers.
- [ ] Add table-driven invalid suites for traversal, case collisions in IDs, duplicate cases, unknown kinds/fields, evaluate/script steps, excess cases/steps/text, invalid count/visibility, non-string digest coercion and caller mutation. Add canonical-record tampering tests against `verifyBrowserTestSuite`.
- [ ] Add actual shape/binding tests for policy/descriptor/result before implementing them. Hand-derive expected rejection fields; do not use the production result verifier as the test oracle. Prove a mismatched revision, suite, runtime descriptor, failure verdict, missing cleanup confirmation or oversized result cannot be accepted.
- [ ] Run the single contract file, independent review, and commit the coherent contracts. Label these as deterministic protocol tests, not browser evidence.

## Task 2: static runtime preflight before any driver import

**Files:** create `src/workspace/browser-test-runtime.mjs`, `tests/browser-test-runtime.test.mjs`, and `scripts/prepare-browser-test-runtime.mjs`.

**Interfaces:**
- Private runtime config has `{node,driver,browser}`. Node: `{root,version,file}`; driver: `{root,version,entryPath,files}`; browser: `{root,version,executable,engineFiles}`. Named file rows are `{path,bytes,sha256}`. Absolute roots are private; descriptor rows are relative.
- `verifyBrowserRuntimeFiles(config)` returns immutable named-file evidence after verifying exact paths/types/identities/lengths/hashes and version metadata where statically available. It does not import the driver or launch a browser.
- `buildBrowserWorkerEnvironment({systemRoot,tempRoot})` returns only fixed required system/TEMP/TMP values and a system-directory PATH. Same host-owned policy applies independently to the browser child.
- The preparation CLI takes explicit Node/driver/browser roots, executable/engine relative paths and expected versions, writes an operator runtime configuration only, and performs no imports, downloads or execution. It must not search user credentials or substitute another installation on failure.

- [ ] Write real temporary-file RED tests before the verifier: a correctly pinned file verifies, changing its bytes rejects, and an alias/hard link or path outside the explicit root rejects without importing it. Use a non-executable file with a sentinel string; never execute acquired fixtures.
- [ ] Implement checked streaming hashes with a bounded chunk buffer and pre/open/post bigint identity/size checks. Reject overdeclared/overread sizes rather than allocating an engine-sized Buffer. Named rows have a hard1GiB per-file read ceiling and at most32 files; these are metadata verification bounds, not accepted application sizes.
- [ ] Test that environment construction ignores parent NODE_OPTIONS, PW_INSTRUMENT_MODULES, DEBUG, proxy and dummy provider variables. Use synthetic sentinels only. Confirm worker PATH contains no user-provided executable directory.
- [ ] Inspect the actual host-provisioned package's named entry/bootstrap/core/utility files and declared metadata. Pin the browser launcher and explicit versioned engine DLL, not just its5MiB launcher. Record exactly which optional/system dependencies remain outside the partial-pin scope.
- [ ] Generate the explicit runtime config under `D:/00-INDEX/operations/2026-09-08-workspace-browser-runner` from inspected host locations. Verify it statically, preserving the result and hashes. Stop qualification if any declared file/control is missing; no automatic install or broad pin-scope claim.
- [ ] Run only runtime and contract tests, review and commit. No browser has been launched by this task.

## Task 3: actual browser runner and independent behavioral result

**Files:** create parent/worker modules, `tests/browser-test-runner.test.mjs`, `scripts/check-browser-workspace-runner.mjs`, and three first-party fixtures under `tests/fixtures/browser-workspace/`: `broken.html`, `fixed.html`, `suite.json`.

**Interfaces:** `createBrowserWorkspaceTestRunner({store,runtime,policy,suites})` returns frozen `describe()` and `run({revisionDigest,testId})`. Store is `{root,limits}`, not an injected verifier object. The worker consumes copied byte routes, one verified suite, runtime config/descriptor and bounded deadlines through one bounded IPC request. It returns only a closed verified result, never model text.

- [ ] Write a missing-runner API test, then pre-launch refusal tests: unapproved digest, unknown test ID, forged runtime pins and tampered revision. Assert no worker/browser was started from the owning process boundary, not merely that a mock was called. Keep any observation helper in tests, not as a production bypass hook.
- [ ] Build a small self-contained first-party task-list app with literal initial tasks `write docs` (incomplete) and `fix build` (complete), all/completed filtering and add-by-Enter. The broken version deliberately shows both tasks in the completed filter. The fixed version corrects that predicate. Do not use the known incident app or call these fixtures fresh quality evidence.
- [ ] Write the independent suite before runner code. Cases must assert initial two tasks, completed-only count1/text`fix build`, and Enter adding a third task. Cases start with fresh context state; the suite itself is outside the writable app revision.
- [ ] The real qualification must use the normal store and runner APIs:

```js
const broken = await store.capture({sourceRoot:fixtureRoot,files:[
  {path:'index.html',sha256:independentlyComputedBrokenHash},
]});
const fixed = await store.revise({parentDigest:broken.revisionDigest,changes:[
  {path:'index.html',expectedSha256:independentlyComputedBrokenHash,bytes:inspectedFixedBytes},
]});
const runner = await createBrowserWorkspaceTestRunner({store:storeConfig,runtime,
  policy:{...hostPolicy,approvedRevisionDigests:[broken.revisionDigest,fixed.revisionDigest]},
  suites:[independentlyOwnedSuite]});
assert.equal((await runner.run({revisionDigest:broken.revisionDigest,testId:'tasks.filter'})).outcome, 'failed');
assert.equal((await runner.run({revisionDigest:fixed.revisionDigest,testId:'tasks.filter'})).outcome, 'passed');
assert.deepEqual(await readFile(originalSourcePath), originalSourceBytes);
```

The fixture helper copies `broken.html` bytes to `source/index.html` inside its
validated owned temporary directory and uses that `source` as fixtureRoot.
It reads `fixed.html` as replacement bytes; neither committed fixture is mutated.
The fixture helper writes only its validated owned temporary directory. Literal
expected outcomes do not come from the runner's own digest or verifier.

- [ ] Observe the missing runner/behavior RED, then implement parent materialization through the existing store, exact route table, descriptor revalidation, fixed scrubbed worker spawn and bounded output handling. Use direct argument vectors, never a model-built shell string.
- [ ] Implement worker validation before driver import. Request and observe sandbox-related arguments; use a fresh context, fixed permissions/download/service-worker settings, exact routes and denial policy, fresh state per case, and the six allowed step kinds. Never accept evaluate/module/command steps.
- [ ] Implement independent assertion observations. Fixed failure classes and bounded app text may explain test failures; arbitrary browser exception stacks, HTML, URLs, console output and environment never become the result. A browser-layer policy violation overrides otherwise successful assertions.
- [ ] Confirm cleanup before issuing completed evidence. Overall timeout or failed cleanup cannot become a passed receipt. The parent never retries an uncertain worker; later workspace-owner recovery remains separate.
- [ ] Run the explicit real-host qualification command with the prepared config, preserving broken and fixed results, source/suite/runtime digests, observed controls, cleanup and exact source hashes. No provider call. Review the real evidence before committing the runner.

## Task 4: refusal and failure-path qualification

**Files:** extend runner/runtime tests and the explicit qualification script; add inspected first-party control fixtures only when a distinct browser behavior needs them.

- [ ] Add one failing regression at a time for stale descriptor/suite/revision, unknown resource routes, unexpected pages/navigation, app request refusal, changed engine pins, oversized diagnostics and deadline behavior.
- [ ] Prove refusal at the actual launch or browser boundary. Any synthetic environment sentinels must be absent from the spawned worker and browser launch configuration. No real API key or user-browser profile is read to test secrecy.
- [ ] Exercise a real inspected app's attempted external HTTP/WebSocket requests. Record whether CSP, request interception or socket closure was actually observed. Do not infer that DNS, WebRTC, background-browser traffic or OS egress were audited.
- [ ] Exercise a bounded action/assertion timeout and an overall deadline. Confirm owned-browser closure through actual process/connection state where observable. If cleanup is uncertain, assert an uncertainty result rather than accepting termination intent as proof.
- [ ] Rehash original source, suite and parent revision after each controlled rejected/failed run. Keep mismatch evidence, not an automatic repair. Run the targeted tests and explicit real-host controls, independent review, then commit this failure-path slice.

## Task 5: integration and next actor connection

**Files:** add `docs/workspace-browser-runner.md`, a dated closeout, and update this plan/current-state. Existing SDK/Realm/runtime effect routes remain unchanged in this slice.

- [ ] Document exact runtime pins, partial-pin scope, reviewed-content restriction, IPC/result contract, controls observed and exclusions. Link the real qualification receipt separately from deterministic contract tests.
- [ ] Freeze the reviewed candidate; run targeted workspace-store and new runner tests, then one complete serial suite at the final integration gate. Preserve all69 historical receipts, failures and exact logs. Verify source has not moved.
- [ ] Reconcile origin, independent final review, merge the verified branch, focused merged checks and push under standing approval. Preserve user files and feature branch. Do not broaden a failed environment preflight into permission to install or weaken controls.
- [ ] Hand off the actual runner to the next Workspace Realm/owner/mission-source integration. That next phase must issue authority independently, bind revisions/results to an actor, preserve uncertain dispatch, export checked diffs, and only then preregister matched fresh model comparisons.

## Coverage and honest stopping point

B-1/B-2 map to Tasks2-4 and explicit profile restrictions; B-3 to Tasks1-3;
B-4 to Tasks1,3,4; B-5 to real qualification and Task5. This plan finishes a real
host-reviewed browser executor dependency, not the full Godagents objective.
No repeated approval menu is required for scoped implementation under standing
authority. New spending, arbitrary untrusted code, security changes or live actor
permission expansion remain separate decisions.
