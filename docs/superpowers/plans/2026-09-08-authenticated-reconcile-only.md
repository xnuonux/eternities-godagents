# Authenticated reconciliation implementation plan

> **For agentic workers:** Use `executing-plans` inline. These tasks share the same execution boundary and must remain sequential.

**Goal:** Reconcile a prepared authenticated native-only mission without starting a new inference.

**Architecture:** Add a no-execute drive mode inside the existing kernel, thread it through the authenticated effect-only facade, then expose it at the current local-artifact owner. Preserve all existing admission, journal, authority, Realm and writer checks. Do not add a new engine or raw-file state classifier.

**Tech Stack:** Node.js 24+, ESM, existing durable transport/journal contracts and in-process issuance maps.

**Spec:** [authenticated reconciliation decision](../specs/2026-09-08-authenticated-reconcile-only-design.md).

## Global constraints

- Existing run/launch and historical receipt behavior remain unchanged.
- No live calls, credential lookup, provider refresh or spend renewal.
- No direct bypass of `launchAdmittedSealedIdentityMission` authentication.
- Mode is fixed by the host method, not accepted inside mission or policy data.
- Preserve untracked `package-lock.json`, frozen Godskills dependency and all historical evidence.
- Reconcile may advance local recovery, but must never call an executor's execute method.
- Use targeted tests until final integration; do not regenerate historical certifications.

## Task 1: no-execute kernel drive

**Files:** modify `src/runtime/mission-review-kernel.mjs`; add
`tests/mission-review-kernel-reconciliation.test.mjs`. Reuse the setup patterns
from `tests/mission-review-kernel.test.mjs` after reading that exact test file.

**Interface:** the frozen kernel exposes existing `run(input)` and new
`reconcile(input)`. Both accept the identical current closed input shape. Extract
one private `drive(input, mayExecute)`; never use a mutable instance-wide flag.
`executePrepared` receives that boolean explicitly. Keep absent response fields
identical to pending's phase reference except `status: 'absent'`.
Absence is only returned after the same admission/descriptor verification and
phase materialization used by run, followed by the existing executor/transport's
actual reconciliation. No missing workflow or mission file is an absence shortcut.

- [x] Write focused behavior tests. A fresh reconcile must prepare/reconcile but
  never execute; pending stays pending; a persisted completion reaches terminal
  evidence without execute. Reuse the same kernel for a following normal run to
  catch a leaked mode flag. Keep counters at the existing executor boundary:

```js
const first = await kernel.reconcile(input);
assert.equal(first.status, 'absent');
assert.equal(calls.execute, 0);
const finished = await kernel.run(input);
assert.equal(finished.status, 'completed');
assert.equal(calls.execute, 1);
assert.deepEqual(await kernel.reconcile(input), finished);
assert.equal(calls.execute, 1);
```

- [x] Run `node --test tests/mission-review-kernel-reconciliation.test.mjs` and
  retain the expected missing-method failures.
- [x] Extract the shared driver and add the absent branch immediately after
  existing executor reconciliation, before `before-*-execute` or execute:

```js
if (reconciled.status === 'absent' && !mayExecute) {
  return deepFreeze({ status: 'absent', missionId: evidence.admission.mission.missionId,
    phase, round, requestDigest: request.requestDigest });
}
```

  Pass `mayExecute` through the one existing prepared-phase call. Return
  `Object.freeze({ run: input => drive(input, true), reconcile: input => drive(input, false) })`.
  Keep unchanged input validation and all existing terminal and journal checks.
- [x] Run the new test and `tests/mission-review-kernel.test.mjs`. Add regression
  cases for descriptor drift, changed admission and malformed saved evidence;
  assert rejection rather than false absence and zero execute calls.
- [x] Commit the verified kernel slice without new certification claims.

**Task-1 checkpoint:** seven initial RED cases failed on the missing method.
An initial argument-placement error stopped normal runs; existing compatibility
tests caught it. Forwarding the per-call flag at the actual execution boundary
restored all 25 focused tests (7 new, 18 existing), exit 0, 9,132.7272 ms.
Independent review cleared this slice. Later task status is recorded below.

## Task 2: authenticated native-only reconciliation and issuance

**Files:** modify `src/runtime/effect-only-mission-runner.mjs`,
`src/host/effect-only-identity-execution.mjs`,
`src/host/admitted-sealed-identity-launch.mjs`, and
`src/host/admitted-effect-only-identity-launcher.mjs`; add
`tests/admitted-effect-only-reconciliation.test.mjs`.

**Interface:** internal host option `executionMode` is exactly `launch` (default)
or `reconcile`. Validate it before side effects, and reject reconciliation for a
v1 policy rather than silently falling back. The public facade adds
`reconcile(input)` using the same accepted input fields as `launch`. The internal
effect-only runner selects the matching kernel method and propagates absent and
pending with `vesselAdmissionDigest`; only completed results build terminal receipts.

- [x] Write failing real-admission tests with the issued controlled provider
  host. Start from the fresh artifact Realm helper, not a forged launcher. Test
  fresh absence with zero HTTP attempts; then normal launch; then recovery with
  no credential and zero additional attempts. Reusing an old mission ID with a
  changed request, policy drift or admission drift must reject before dispatch.
- [x] Verify the missing public reconciliation method causes the intended RED.
- [x] Thread the fixed mode through the existing authentication path. Do not
  duplicate policy/admission verification or call the internal runner from the
  facade. Factor a private `invoke(input, executionMode)` inside the facade for
  the shared field validation, request snapshot, credential screen and launch.
- [x] Add an issuance map and the wrapper/validator from spec R-5. The validator
  takes `{ requestDigest, identityPolicyDigest }` as its expected binding and
  rejects mismatches, copied/deserialized objects, mutation and ordinary launch
  results. On completed recovery, preserve the existing nested terminal brand:

```js
const reply = await launcher.reconcile(input);
assertAdmittedEffectOnlyReconciliationResult(reply, {
  requestDigest: sha256Value(input.request), identityPolicyDigest: input.identityPolicyDigest,
});
if (reply.status === 'completed') assertAdmittedEffectOnlyTerminalResult(reply.result);
```

- [x] Test pending native outbox evidence with an execute tripwire, wrong expected
  request/policy digests, stale returned wrapper bytes and routing `needs-decision`.
  An absent wrapper must not bypass the next normal launch's own reconciliation.
  Install credential-resolver/refresh tripwires as well as execute/fetch/process
  tripwires. They cover issued-host construction and reconciliation, not only the
  final executor call. Host construction must remain inert.
- [x] Run the new tests, task-1 tests, and existing local-artifact workflow tests.
  Include controlled Anthropic and Grok-portable coverage before closing this task.
  Reuse their existing correctly issued hosts and exact response shapes, not an
  unbranded object. Commit only after these checks pass.

**Task-2 checkpoint:** 11 new cases cover both registered HTTP families and the
Grok portable host. Combined with the kernel and existing workflow cases, all 48
focused tests passed, exit 0, 8,295.3502 ms. Independent review found no critical
or important defect. HTTP construction/recovery uses an empty credential env and
a counted fetch boundary; Grok construction/absence uses absent auth and a pinned
throwing bridge. No actual user credential, refresh, model call or live network
is used. Existing literal credential screening is preserved, not mistaken for
dispatch readiness. The public HTTP SDK accepts static env, not an injectable
credential resolver, so this does not claim instrumentation of an invented API.

## Task 3: workflow and CLI boundary, complete integration

**Files:** modify `examples/local-artifact-workflow/run.mjs` and `cli.mjs`,
`docs/local-artifact-workflow.md`; add
`tests/local-artifact-workflow-reconciliation.test.mjs`.

**Interface:** preserve `runLocalWorkflow(options)`, add
`reconcileLocalWorkflow(options)` with the same arguments. A private shared
driver receives a fixed operation, validates the existing pinned workspace and
inputs, and requires workflow 3 for the new operation. Keep existing run versions
unchanged. CLI `reconcile` accepts the same manifest flags as `run`.

- [x] Write RED tests through the public workflow function and fresh CLI process.
  Fresh reconcile returns absent/artifact null with zero provider work. Saved
  completion recovers and publishes once, then replays identical bytes. Pending
  returns null and never calls a new inference. Unsupported workflow versions,
  changed Realm/input pins and aliased directories reject before provider work.
- [x] Add the shared operation selection without moving Realm checks or writer
  ownership into the lower SDK. Call/validate the new branded reply, then reuse
  the existing completed-result path and post-recovery Realm check. Map absent
  separately to `{ status: 'absent', instanceId, missionId, artifact: null }`.
- [x] Extend CLI parse/help for `reconcile`; preserve existing flags and return
  codes. Return 3 for absent/pending/needs-decision, 0 for accepted completed,
  4 for verified rejection, and unchanged 1/2 errors. Document local recovery
  writes and the no-new-inference promise, not read-only or universal network isolation.
- [x] Run new and existing local workflow tests plus the task-1/task-2 tests.
  Exercise real interruption after provider completion with fresh-process
  reconcile and no model/HTTP attempt; retain the actual stale-lock delay.
- [x] Obtain independent review of the full source range, fix confirmed findings,
  run one full integration gate with exact source/log pins, reconcile upstreams,
  fast-forward/merge under standing approval, run focused merged checks and push.
  Preserve old receipts and distinguish controlled evidence from live qualification.

**Task-3 pre-integration checkpoint:** six new public-workflow cases first failed
on the missing method. The new workflow, Realm-binding and facade gate passed 23
tests, exit 0, 8,089.6722 ms, following the task-2 48-test gate. Two actual killed
artifact-v3 processes recovered through fresh CLI `reconcile`: persisted completion
published once; uncertain dispatch stayed pending. Both respected the real
30-second dead-owner delay, preserved input pins, and observed zero new network
attempts with and without synthetic credentials. The selected process gate
passed 2 tests, exit 0, 63,061.6276 ms; it did not rerun the three historical `run`
fault cases. Independent review cleared the full feature for final integration.
The full suite, merged check and push are still pending at this checkpoint.

**Final integration:** runtime `6ca69d1d6037f578c2cfb06a4b304664a6f5f1df`
passed all 1,370 tests, zero failures/cancellations/skips/todos, exit 0,
625,542.2587 ms. Upstream was reconciled, main fast-forwarded to the identical
source, and 31 focused merged checks passed in 9,492.4753 ms. Main was pushed
and its exact remote ref verified. See the [closeout](../../audits/2026-09-08-authenticated-reconciliation-closeout.md)
for source/log hashes and remaining product boundaries. This bounded plan is done.

## Coverage and next boundary

R-1/R-2/R-3 map to task 1; R-4/R-5/R-6 to task 2;
R-7/R-8 to task 3; R-9 applies to every task and integration.
This plan does not implement dependent mission templates, automatic memory,
artifact-mission program adapters, new providers or live comparisons. Those
remain real product requirements; closing this prerequisite does not redefine
the overall goal or justify a universal completion claim.
