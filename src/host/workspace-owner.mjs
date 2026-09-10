import { mkdir, realpath, lstat, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value, sha256Text } from '../core/digest.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { assertSafeAdmissionTree, readAdmissionBinding, assertAdmissionPolicyBinding } from './admitted-identity-boundary.mjs';
import { localGenesisAdmission } from './local-genesis-admission.mjs';
import { loadIdentityHostPolicy } from './identity-policy.mjs';
import { verifyIdentityHostRequest } from './admitted-sealed-identity-launch.mjs';
import { compileCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';
import { createAdmittedEffectOnlyIdentityLauncher, assertAdmittedEffectOnlyTerminalResult,
  assertAdmittedEffectOnlyReconciliationResult } from './admitted-effect-only-identity-launcher.mjs';
import { prepareLocalArtifactEffectRequest } from './structured-effect-producer.mjs';
import { createWorkspaceRevisionStore } from '../workspace/revision-store.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { createBrowserWorkspaceTestRunner } from '../workspace/browser-test-runner.mjs';
import { verifyBrowserTestSuite, verifyBrowserTestResult } from '../workspace/browser-test-contracts.mjs';
import { exportWorkspaceRevision } from '../workspace/revision-export.mjs';

const issued = new WeakMap(), stagedResults = new WeakMap(), testOwners = new WeakMap(), reviewApprovals = new WeakMap();
const DIGEST = /^[a-f0-9]{64}$/;
const ensure = (ok, message) => { if (!ok) throw new Error(`workspace ${message}`); };
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
const pathKey = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
function exact(value, keys, label) {
  ensure(value && typeof value === 'object' && !Array.isArray(value)
    && equal(Object.keys(value).sort(), [...keys].sort()), `${label} fields are invalid`);
}
function text(bytes) {
  const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  ensure(!value.includes('\0'), 'binary source is unsupported'); return value;
}
async function directory(path) {
  const stat = await lstat(path);
  ensure(stat.isDirectory() && !stat.isSymbolicLink() && pathKey(await realpath(path)) === pathKey(path), 'directory alias rejected');
}
function summarized(revision) {
  return { revisionDigest: revision.revisionDigest, parentDigest: revision.parentDigest,
    files: structuredClone(revision.files), totalBytes: revision.totalBytes };
}

export function assertWorkspaceOwner(owner) {
  ensure(issued.has(owner), 'owner was not issued'); return owner;
}

// Host-only construction. The resulting model-facing handle cannot replace its
// policy, supply a result, approve code, or choose another path/tool/provider.
export async function createWorkspaceOwner(configuration) { return buildOwner(configuration, null); }
async function buildOwner(configuration, continuation) {
  const { policy: input, expectedPolicyDigest, host, hostKind, registryRoot, checkpoint = async () => {} } = configuration ?? {};
  const policy = structuredClone(input);
  exact(policy, ['schemaVersion', 'protocolId', 'admissionRoot', 'identityPolicyPath', 'identityPolicyDigest', 'request', 'source', 'storeLimits', 'repairBudget'], 'policy');
  ensure(policy.schemaVersion === 1 && policy.protocolId === 'eternities-workspace-owner-policy-v1', 'policy protocol is invalid');
  ensure(typeof expectedPolicyDigest === 'string' && DIGEST.test(expectedPolicyDigest)
    && sha256Value(policy) === expectedPolicyDigest, 'policy pin mismatch');
  for (const path of [policy.admissionRoot, policy.identityPolicyPath, policy.source?.sourceRoot]) {
    ensure(typeof path === 'string' && isAbsolute(path) && !/[\0\r\n]/.test(path), 'path is invalid');
  }
  exact(policy.source, ['sourceRoot', 'files'], 'source');
  exact(policy.repairBudget, ['maxAttempts', 'totalCompletionTokens'], 'repair budget');
  ensure(Number.isSafeInteger(policy.repairBudget.maxAttempts) && policy.repairBudget.maxAttempts >= 1 && policy.repairBudget.maxAttempts <= 4
    && Number.isSafeInteger(policy.repairBudget.totalCompletionTokens)
    && policy.repairBudget.totalCompletionTokens >= policy.request.budgets.nativeCompletionTokens
    && policy.repairBudget.totalCompletionTokens <= policy.request.budgets.totalCompletionTokens, 'repair budget exceeds admitted ceiling');
  ensure(typeof checkpoint === 'function', 'checkpoint is invalid');
  const root = resolve(policy.admissionRoot), workspace = dirname(root);
  const launcher = createAdmittedEffectOnlyIdentityLauncher({ host, hostKind });
  async function authenticate(request = policy.request) {
    await directory(workspace); await assertSafeAdmissionTree(root);
    const binding = await readAdmissionBinding(root), loaded = await loadIdentityHostPolicy(policy.identityPolicyPath);
    ensure(loaded.digest === policy.identityPolicyDigest, 'identity policy pin mismatch');
    assertAdmissionPolicyBinding({ policy: loaded.policy, policyPath: policy.identityPolicyPath, admissionRoot: root, binding });
    const verified = verifyIdentityHostRequest(loaded.policy, request);
    ensure(loaded.policy.schemaVersion === 2 && verified.schemaVersion === 2 && verified.routeMode === 'effect-only', 'proposal requires effect-only host');
    const { routeMode, effectAssessment, ...legacy } = verified;
    const candidate = await compileCortexBindingCandidate({ admission: localGenesisAdmission(root, binding),
      request: buildCortexBindingRequestFromVesselRequest({ ...legacy, schemaVersion: 1 }) });
    const limits = candidate.fullEnvelope.authority.resourceLimits;
    ensure(limits.profile === 'local-workspace-v3' && limits.independentReviewRequired === true && limits.sourceMutation === false,
      'owner requires explicit workspace admission');
    ensure(candidate.fullEnvelope.authority.realmId === loaded.policy.realmId, 'Realm binding differs');
    ensure(policy.storeLimits.maxFiles <= limits.maximumFiles && policy.storeLimits.maxTotalBytes <= limits.maximumRevisionBytes,
      'store limits exceed admitted ceiling');
    ensure(equal(launcher.describe().nativeTransport, loaded.policy.runtime.nativeTransport), 'native transport differs from identity policy');
    return { candidate, loaded };
  }
  await authenticate();
  const storeRoot = join(workspace, 'workspace-revisions');
  try { await mkdir(storeRoot); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await directory(storeRoot);
  const store = await createWorkspaceRevisionStore({ root: storeRoot, limits: policy.storeLimits });
  const stateRoot = join(root, 'vessel', 'workspace-owner');
  await mkdir(stateRoot, { recursive: true }); await directory(stateRoot);
  async function invoke(executionMode) {
    // Reconcile the predecessor outside this owner's same-root lock. Its issued
    // test owner authenticates disk evidence and performs no new browser action.
    if (continuation) {
      const actual = await continuation.testOwner.reconcile();
      ensure(equal(actual, continuation.testResult), 'previous test evidence changed');
    }
    await directory(stateRoot);
    const lock = await acquireFileLock({ lockPath: join(stateRoot, 'owner.lock') });
    try {
      const { loaded } = await authenticate();
      const origin = await store.capture(policy.source);
      const parent = continuation ? await store.inspect(continuation.stage.revision.revisionDigest) : origin, files = [];
      for (const row of parent.files) files.push({ path: row.path, sha256: row.sha256,
        text: text(await store.read({ revisionDigest: parent.revisionDigest, path: row.path })) });
      const { effectAssessment, ...base } = policy.request;
      const attempt = continuation ? continuation.stage.attempt + 1 : 1;
      const priorCompletionTokens = continuation ? continuation.stage.priorCompletionTokens + continuation.stage.usage.completionTokens : 0;
      ensure(attempt <= policy.repairBudget.maxAttempts
        && priorCompletionTokens + base.budgets.nativeCompletionTokens <= policy.repairBudget.totalCompletionTokens, 'repair budget exhausted');
      const request = prepareLocalArtifactEffectRequest({ ...base,
        mission: { ...base.mission, ...(continuation ? { missionId: `workspace-${sha256Value({ base: base.mission.missionId,
          stageDigest: continuation.stage.stageDigest, testDigest: continuation.testResult.result.receiptDigest })}` } : {}),
          objective: canonicalJson({ protocolId: 'eternities-workspace-repair-task-v1',
          task: base.mission.objective, parentDigest: parent.revisionDigest, files,
          ...(continuation ? { feedback: continuation.feedback } : {}),
          response: { schemaVersion: 1, parentDigest: parent.revisionDigest,
            changes: 'one or more {path, expectedSha256, text} replacements of selected files only; no approval or execution fields' } }) } },
      { expectedProducerDescriptorDigest: loaded.policy.runtime.effectProducerDescriptorDigest });
      const { candidate } = await authenticate(request);
      const launchInput = { admissionRoot: root, policyPath: policy.identityPolicyPath, request,
        identityPolicyDigest: policy.identityPolicyDigest, ...(registryRoot ? { registryRoot } : {}) };
      const recovered = await launcher.reconcile(launchInput);
      assertAdmittedEffectOnlyReconciliationResult(recovered, { requestDigest: sha256Value(request), identityPolicyDigest: policy.identityPolicyDigest });
      const raw = recovered.status === 'absent' && executionMode === 'launch' ? await launcher.launch(launchInput) : recovered.result;
      if (raw.status !== 'completed') return deepFreeze({ status: raw.status });
      const receipt = assertAdmittedEffectOnlyTerminalResult(raw);
      ensure(receipt.candidateDigest === candidate.candidateDigest, 'proposal candidate binding differs');
      if (receipt.acceptedArtifactDigest === null) return deepFreeze({ status: 'rejected' });
      ensure(receipt.acceptedArtifactDigest === sha256Value(raw.mission.artifact), 'proposal artifact digest differs');
      let proposal;
      try { proposal = JSON.parse(raw.mission.artifact.content); } catch { throw new Error('workspace proposal is not JSON'); }
      exact(proposal, ['schemaVersion', 'parentDigest', 'changes'], 'proposal');
      ensure(proposal.schemaVersion === 1 && proposal.parentDigest === parent.revisionDigest
        && Array.isArray(proposal.changes) && proposal.changes.length > 0 && proposal.changes.length <= policy.storeLimits.maxFiles, 'proposal parent or changes are invalid');
      const changes = proposal.changes.map(row => {
        exact(row, ['path', 'expectedSha256', 'text'], 'proposal change');
        ensure(typeof row.text === 'string' && !row.text.includes('\0') && row.text.isWellFormed(), 'proposal text is invalid');
        return { path: row.path, expectedSha256: row.expectedSha256, bytes: new TextEncoder().encode(row.text) };
      });
      await checkpoint('proposal-authenticated'); await authenticate(request);
      // Recheck source at the effect boundary, not just before a possibly long inference.
      ensure((await store.capture(policy.source)).revisionDigest === origin.revisionDigest, 'source changed during proposal');
      const revision = await store.revise({ parentDigest: parent.revisionDigest, changes });
      await checkpoint('revision-published'); await authenticate(request);
      const b = candidate.fullEnvelope.binding;
      const binding = { policyDigest: expectedPolicyDigest, requestDigest: sha256Value(request), candidateDigest: candidate.candidateDigest,
        actor: { instanceId: b.instanceId, genesisId: b.genesisId, admissionReceiptDigest: b.admissionReceiptDigest,
          genomeDigest: b.genomeValueDigest, keelHeadDigest: b.currentKeelHeadDigest },
        attempt, priorCompletionTokens, usage: structuredClone(raw.mission.receipt.usage),
        receipt, parent: summarized(parent), revision: summarized(revision) };
      const result = deepFreeze({ status: 'needs-review', ...binding, stageDigest: sha256Value(binding) });
      stagedResults.set(result, { owner, policyDigest: expectedPolicyDigest, request, stageDigest: result.stageDigest });
      return result;
    } finally { await lock.release(); }
  }
  const owner = Object.freeze({ propose: () => invoke('launch'), reconcile: () => invoke('reconcile'),
    async continueAfter(testOwner) {
      const test = testOwners.get(testOwner);
      ensure(test?.owner === owner, 'test owner was not issued to this actor operation');
      const testResult = await testOwner.reconcile();
      ensure(testResult.status === 'completed' && testResult.result.outcome === 'failed', 'continuation requires an actual failed test');
      ensure(test.stage.attempt < policy.repairBudget.maxAttempts
        && test.stage.priorCompletionTokens + test.stage.usage.completionTokens + policy.request.budgets.nativeCompletionTokens <= policy.repairBudget.totalCompletionTokens,
      'repair budget exhausted');
      const failures = [];
      for (const row of testResult.result.cases) for (const step of row.steps) if (step.outcome === 'failed') failures.push({
        caseId: row.caseId, stepIndex: step.stepIndex, kind: step.kind, reason: step.reason, observation: step.observation,
        expected: test.suite.cases.find(c => c.caseId === row.caseId).steps[step.stepIndex] });
      const feedback = { resultDigest: testResult.result.receiptDigest, outcome: 'failed', reason: testResult.result.reason, failures };
      return buildOwner({ ...configuration, policy }, { testOwner, testResult, stage: test.stage, feedback });
    } });
  issued.set(owner, { authenticate, store, storeRoot, stateRoot, limits: policy.storeLimits }); return owner;
}

async function verifiedStage(owner, stage) {
  assertWorkspaceOwner(owner);
  const binding = stagedResults.get(stage);
  ensure(binding?.owner === owner, 'stage was not issued to this owner');
  const context = issued.get(owner), { candidate } = await context.authenticate(binding.request);
  const { status, stageDigest, ...unsigned } = stage;
  ensure(status === 'needs-review' && stageDigest === binding.stageDigest && sha256Value(unsigned) === stageDigest
    && candidate.candidateDigest === stage.candidateDigest, 'stage binding changed');
  ensure(equal(summarized(await context.store.inspect(stage.parent.revisionDigest)), stage.parent)
    && equal(summarized(await context.store.inspect(stage.revision.revisionDigest)), stage.revision), 'staged revision changed');
  return context;
}

async function reviewCandidate({ owner, stage, runtime, suite: inputSuite, limits }) {
  const context = await verifiedStage(owner, stage), suite = verifyBrowserTestSuite(inputSuite);
  const runner = await createBrowserWorkspaceTestRunner({ store: { root: context.storeRoot, limits: context.limits }, runtime,
    policy: { schemaVersion: 1, profile: 'host-reviewed-browser-local-v1', approvedRevisionDigests: [stage.revision.revisionDigest], limits }, suites: [suite] });
  const descriptor = runner.describe();
  const unsigned = { schemaVersion: 1, protocolId: 'eternities-workspace-review-candidate-v1', stageDigest: stage.stageDigest,
    revisionDigest: stage.revision.revisionDigest, runnerDescriptorDigest: descriptor.descriptorDigest, testSuiteDigest: suite.testSuiteDigest,
    ownerSourceDigest: sha256Text(await readFile(new URL('./workspace-owner.mjs', import.meta.url), 'utf8')) };
  return { context, runner, suite, descriptor, candidate: deepFreeze({ ...unsigned, reviewCandidateDigest: sha256Value(unsigned) }) };
}

// This only describes the exact proposed execution. It never approves or starts
// code. The operator must review the child bytes, not merely this digest.
export async function prepareWorkspaceReview(input) { return (await reviewCandidate(input)).candidate; }

async function readRecord(path, ceiling = 131072) {
  ensure(Number.isSafeInteger(ceiling) && ceiling > 0 && ceiling <= 16777216, 'record read ceiling is invalid');
  let stat;
  try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && pathKey(await realpath(path)) === pathKey(path), 'test record alias rejected');
  const file = await open(path, 'r');
  try {
    const opened = await file.stat(); ensure(opened.isFile() && opened.nlink === 1 && opened.size <= ceiling, 'test record exceeds bound');
    const bytes = Buffer.alloc(ceiling + 1); let size = 0;
    while (size < bytes.length) { const result = await file.read(bytes, size, bytes.length - size, null); if (!result.bytesRead) break; size += result.bytesRead; }
    ensure(size <= ceiling, 'test record exceeds bound');
    const source = text(bytes.subarray(0, size)), value = JSON.parse(source);
    ensure(source === `${canonicalJson(value)}\n`, 'test record is not canonical'); return value;
  } finally { await file.close(); }
}
export { readRecord as readWorkspaceHostRecord };

// Trusted host bootstrap, never a model tool. The application caller owns the
// file and supplies the external pin through its host environment. Models cannot
// issue this capability by putting a self-hashed review into their output.
export async function loadWorkspaceReviewApproval({ path, env = process.env } = {}) {
  ensure(typeof path === 'string' && isAbsolute(path) && !/[\0\r\n]/.test(path), 'review file path is invalid');
  const review = await readRecord(path), expectedReviewDigest = env.GODAGENT_WORKSPACE_REVIEW_SHA256;
  exact(review, ['schemaVersion', 'protocolId', 'reviewCandidateDigest', 'reviewerRef', 'decision'], 'code review');
  ensure(review.schemaVersion === 1 && review.protocolId === 'eternities-workspace-code-review-v1'
    && review.decision === 'approved' && typeof review.reviewerRef === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(review.reviewerRef)
    && typeof expectedReviewDigest === 'string' && DIGEST.test(expectedReviewDigest)
    && sha256Value(review) === expectedReviewDigest, 'code review pin or decision is invalid');
  const approval = deepFreeze({ reviewCandidateDigest: review.reviewCandidateDigest, reviewDigest: expectedReviewDigest });
  reviewApprovals.set(approval, { path, review, expectedReviewDigest }); return approval;
}
async function verifyReviewApproval(approval) {
  const record = reviewApprovals.get(approval);
  ensure(record, 'review approval capability was not issued by the host loader');
  ensure(equal(await readRecord(record.path), record.review), 'host review approval changed or was revoked');
  return record;
}

export async function createReviewedWorkspaceTestOwner({ owner, stage, runtime, suite, limits,
  approval, checkpoint = async () => {} } = {}) {
  const { review, expectedReviewDigest } = await verifyReviewApproval(approval);
  ensure(typeof checkpoint === 'function', 'test checkpoint is invalid');
  const config = { owner, stage, ...structuredClone({ runtime, suite, limits }) };
  const prepared = await reviewCandidate(config), { context, runner, descriptor } = prepared;
  ensure(review.reviewCandidateDigest === prepared.candidate.reviewCandidateDigest, 'code review candidate mismatch');
  const request = { schemaVersion: 1, protocolId: 'eternities-workspace-test-dispatch-v1',
    stageDigest: stage.stageDigest, reviewDigest: expectedReviewDigest, reviewCandidate: prepared.candidate };
  const records = join(context.stateRoot, `test-${stage.stageDigest}`);
  try { await mkdir(records); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await directory(records);
  async function publish(name, value) {
    const destinationPath = join(records, `${name}.json`), existing = await readRecord(destinationPath);
    if (existing) { ensure(equal(existing, value), 'test record differs'); return; }
    const content = `${canonicalJson(value)}\n`; ensure(Buffer.byteLength(content) <= 131072, 'test result exceeds bound');
    ensure(await publishFileExclusive({ destinationPath, content }), 'test record publication collision');
  }
  async function invoke(run) {
    await directory(context.stateRoot); await directory(records);
    const lock = await acquireFileLock({ lockPath: join(context.stateRoot, 'owner.lock') });
    try {
      await verifyReviewApproval(approval);
      const current = await reviewCandidate(config);
      ensure(equal(current.candidate, prepared.candidate), 'reviewed runtime or actor binding changed');
      const prior = await readRecord(join(records, 'prepared.json'));
      ensure(!prior || equal(prior, request), 'test request changed after preparation');
      const dispatched = await readRecord(join(records, 'dispatched.json'));
      ensure(!dispatched || (prior && equal(dispatched, request)), 'test dispatch has no matching preparation');
      const completed = await readRecord(join(records, 'completed.json'));
      if (completed) {
        exact(completed, ['request', 'result'], 'saved test completion');
        ensure(dispatched && equal(completed.request, request), 'test completion has no matching dispatch');
        const result = verifyBrowserTestResult(completed.result, { revisionDigest: stage.revision.revisionDigest, suite: prepared.suite, descriptor });
        return deepFreeze({ status: 'completed', stageDigest: stage.stageDigest, reviewDigest: expectedReviewDigest, result });
      }
      if (dispatched) return deepFreeze({ status: 'pending', stageDigest: stage.stageDigest, reason: 'dispatched-without-verified-completion' });
      if (!run) return deepFreeze({ status: 'absent', stageDigest: stage.stageDigest });
      await publish('prepared', request); await checkpoint('test-prepared');
      await verifiedStage(owner, stage); await verifyReviewApproval(approval); await directory(records);
      await publish('dispatched', request); await checkpoint('test-dispatched');
      const result = await runner.run({ revisionDigest: stage.revision.revisionDigest, testId: prepared.suite.testId });
      if (result.outcome === 'uncertain') return deepFreeze({ status: 'pending', stageDigest: stage.stageDigest, reason: result.reason });
      verifyBrowserTestResult(result, { revisionDigest: stage.revision.revisionDigest, suite: prepared.suite, descriptor });
      await verifiedStage(owner, stage); await publish('completed', { request, result }); await checkpoint('test-completed');
      return deepFreeze({ status: 'completed', stageDigest: stage.stageDigest, reviewDigest: expectedReviewDigest, result });
    } finally { await lock.release(); }
  }
  const testOwner = Object.freeze({ run: () => invoke(true), reconcile: () => invoke(false),
    async export() {
      const tested = await invoke(false);
      ensure(tested.status === 'completed' && tested.result.outcome === 'passed', 'checked export requires a passed independent test');
      await verifiedStage(owner, stage);
      return exportWorkspaceRevision({ store: context.store, parentDigest: stage.parent.revisionDigest, revisionDigest: stage.revision.revisionDigest });
    } });
  testOwners.set(testOwner, { owner, stage, suite: prepared.suite }); return testOwner;
}
