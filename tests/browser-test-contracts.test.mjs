import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const api = await import('../src/workspace/browser-test-contracts.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

const suiteInput = () => ({ schemaVersion: 1, testId: 'tasks.filter', entryPath: 'index.html',
  cases: [{ caseId: 'completed-only', steps: [
    { kind: 'click', selector: '#completed' },
    { kind: 'assert-count', selector: '.task', count: 1 },
    { kind: 'assert-text', selector: '.task', text: 'fix build' },
  ] }] });

const policyInput = () => ({ schemaVersion: 1, profile: 'host-reviewed-browser-local-v1',
  approvedRevisionDigests: ['b'.repeat(64), 'a'.repeat(64)],
  limits: { maxFiles: 4, maxAppBytes: 65536, maxResultBytes: 8192,
    stepTimeoutMs: 1000, launchTimeoutMs: 5000, runTimeoutMs: 10000, cleanupTimeoutMs: 5000 } });

// These literal pins test metadata contracts only, not actual runtime files.
const pin = path => ({ path, bytes: 10, sha256: '1'.repeat(64) });
const descriptorInput = () => ({ schemaVersion: 1, protocolId: 'eternities-workspace-test-runner-v1',
  profile: 'host-reviewed-browser-local-v1', runnerSourceDigest: '2'.repeat(64), workerSourceDigest: '3'.repeat(64),
  nodeVersion: '24.1.0', nodeExecutableDigest: '4'.repeat(64), driverVersion: '1.62.1',
  driverFiles: ['lib/utilsBundle.js', 'package.json', 'lib/coreBundle.js', 'index.js', 'lib/bootstrap.js'].map(pin),
  browserVersion: '152.0.4191.66', browserExecutable: pin('msedge.exe'),
  browserEngineFiles: [pin('152.0.4191.66/msedge.dll')], runtimePinScope: 'named-driver-and-engine-files',
  nodeEnvironmentPolicyDigest: '5'.repeat(64), browserEnvironmentPolicyDigest: '6'.repeat(64),
  launchPolicyDigest: '7'.repeat(64), suiteCatalogDigest: '8'.repeat(64), storePolicyDigest: '9'.repeat(64),
  reviewedRevisionsDigest: 'a'.repeat(64), limits: policyInput().limits });

// Independent JSON digest for adversarial re-signing, not the production builder.
function hashRecord(value) {
  const sort = item => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}

test('browser suite compilation preserves host assertions in a frozen verifiable record', () => {
  assert.equal(typeof api.compileBrowserTestSuite, 'function', 'browser suite compiler is required');
  assert.equal(typeof api.verifyBrowserTestSuite, 'function', 'browser suite verifier is required');
  const input = suiteInput(), suite = api.compileBrowserTestSuite(input);
  assert.equal(suite.cases[0].steps[2].text, 'fix build');
  assert.equal(suite.cases[0].steps[1].count, 1);
  assert.ok(Object.isFrozen(suite.cases[0].steps));
  input.cases[0].steps[2].text = 'mutated';
  assert.equal(suite.cases[0].steps[2].text, 'fix build');
  assert.deepEqual(api.verifyBrowserTestSuite(suite), suite);
  assert.notEqual(api.compileBrowserTestSuite(input).testSuiteDigest, suite.testSuiteDigest);
});

test('browser suite verification refuses changed host assertions under the previous digest', () => {
  assert.equal(typeof api.compileBrowserTestSuite, 'function', 'browser suite compiler is required');
  const suite = structuredClone(api.compileBrowserTestSuite(suiteInput()));
  suite.cases[0].steps[1].count = 2;
  assert.throws(() => api.verifyBrowserTestSuite(suite), /digest/);
});

test('browser suite refuses executable or authority-shaped inputs and invalid step fields', () => {
  for (const change of [
    input => { input.command = 'anything'; },
    input => { input.authority = ['shell']; },
    input => { input.schemaVersion = 2; },
    input => { input.cases[0].steps = [{ kind: 'evaluate', script: 'globalThis' }]; },
    input => { input.cases[0].steps[0].script = 'anything'; },
    input => { input.cases[0].steps[1].count = '1'; },
    input => { input.cases[0].steps[1].count = -1; },
    input => { input.cases[0].steps[0].selector = ''; },
    input => { input.cases[0].steps[0].selector = ['#completed']; },
    input => { input.cases.push(structuredClone(input.cases[0])); },
    input => { input.cases[0].caseId = 'COMPLETED-ONLY'; },
    input => { input.entryPath = '../outside.html'; },
    input => { input.entryPath = 'C:/outside.html'; },
    input => { input.entryPath = 'folder\\index.html'; },
    input => { input.entryPath = 'NUL.html'; },
    input => { input.cases = []; },
    input => { input.cases[0].steps = []; },
  ]) {
    const input = suiteInput(); change(input);
    assert.throws(() => api.compileBrowserTestSuite(input), /browser|suite|case|step|path|field/);
  }
});

test('browser suite enforces UTF-8, aggregate and step ceilings without truncating assertions', () => {
  for (const change of [
    input => { input.cases = Array.from({ length: 9 }, (_, n) => ({ ...structuredClone(input.cases[0]), caseId: `case-${n}` })); },
    input => { input.cases[0].steps = Array.from({ length: 129 }, () => ({ kind: 'click', selector: '#go' })); },
    input => { input.cases[0].steps[0].selector = '😀'.repeat(129); },
    input => { input.cases[0].steps[2].text = '😀'.repeat(1025); },
    input => { input.testId = 'a'.repeat(129); },
    input => { input.cases[0].steps = Array.from({ length: 128 }, () => ({ kind: 'fill', selector: '#entry', text: 'a'.repeat(650) })); },
  ]) {
    const input = suiteInput(); change(input);
    assert.throws(() => api.compileBrowserTestSuite(input), /limit|bytes|count|identifier|ceiling/);
  }
  const input = suiteInput();
  input.cases[0].steps = [
    { kind: 'click', selector: '#go' }, { kind: 'fill', selector: '#entry', text: '' },
    { kind: 'press', selector: '#entry', key: 'Enter' },
    { kind: 'assert-visible', selector: '#hidden', visible: false },
    { kind: 'assert-count', selector: '.empty', count: 0 },
    { kind: 'assert-text', selector: '😀'.repeat(128), text: '😀'.repeat(1024) },
  ];
  const suite = api.compileBrowserTestSuite(input);
  assert.deepEqual(suite.cases[0].steps, input.cases[0].steps);
});

test('browser host policy binds exact reviewed revisions and limits without mutating caller input', () => {
  assert.equal(typeof api.compileBrowserRunnerPolicy, 'function', 'browser runner policy compiler is required');
  assert.equal(typeof api.verifyBrowserRunnerPolicy, 'function', 'browser runner policy verifier is required');
  const input = policyInput(), policy = api.compileBrowserRunnerPolicy(input);
  assert.deepEqual(policy.approvedRevisionDigests, ['a'.repeat(64), 'b'.repeat(64)]);
  assert.deepEqual(input.approvedRevisionDigests, ['b'.repeat(64), 'a'.repeat(64)]);
  input.approvedRevisionDigests[0] = 'c'.repeat(64); input.limits.maxFiles = 1;
  assert.equal(policy.limits.maxFiles, 4);
  assert.deepEqual(policy.approvedRevisionDigests, ['a'.repeat(64), 'b'.repeat(64)]);
  assert.ok(Object.isFrozen(policy.limits));
  assert.deepEqual(api.verifyBrowserRunnerPolicy(policy), policy);
  assert.notEqual(api.compileBrowserRunnerPolicy(input).policyDigest, policy.policyDigest);
  const tampered = structuredClone(policy); tampered.limits.maxAppBytes++;
  assert.throws(() => api.verifyBrowserRunnerPolicy(tampered), /digest/);
});

test('browser host policy refuses widening, forged approvals and incoherent deadlines', () => {
  assert.equal(typeof api.compileBrowserRunnerPolicy, 'function', 'browser runner policy compiler is required');
  for (const change of [
    input => { input.approved = true; }, input => { input.environment = { PATH: 'caller-path' }; },
    input => { input.profile = 'arbitrary-project'; }, input => { input.schemaVersion = 2; },
    input => { input.approvedRevisionDigests = []; },
    input => { input.approvedRevisionDigests = ['a'.repeat(64), 'a'.repeat(64)]; },
    input => { input.approvedRevisionDigests = [['a'.repeat(64)]]; },
    input => { input.approvedRevisionDigests = Array.from({ length: 65 }, (_, n) => n.toString(16).padStart(64, '0')); },
    input => { input.limits.maxFiles = 17; }, input => { input.limits.maxAppBytes = 4194305; },
    input => { input.limits.maxResultBytes = 16385; }, input => { input.limits.cleanupTimeoutMs = 10001; },
    input => { input.limits.stepTimeoutMs = 5001; }, input => { input.limits.launchTimeoutMs = 10001; },
    input => { input.limits.runTimeoutMs = 60001; }, input => { input.limits.maxFiles = 0; },
    input => { input.limits.maxFiles = 1.5; }, input => { input.limits.runTimeoutMs = 500; },
    input => { input.limits.maxActions = 10; },
  ]) {
    const input = policyInput(); change(input);
    assert.throws(() => api.compileBrowserRunnerPolicy(input), /browser|policy|limit|digest|deadline/);
  }
});

test('browser descriptor binds the named engine separately from the launcher and normalizes host file order', () => {
  assert.equal(typeof api.buildBrowserRunnerDescriptor, 'function', 'browser runner descriptor builder is required');
  assert.equal(typeof api.verifyBrowserRunnerDescriptor, 'function', 'browser runner descriptor verifier is required');
  const input = descriptorInput(), descriptor = api.buildBrowserRunnerDescriptor(input);
  assert.deepEqual(descriptor.driverFiles.map(row => row.path),
    ['index.js', 'lib/bootstrap.js', 'lib/coreBundle.js', 'lib/utilsBundle.js', 'package.json']);
  assert.equal(input.driverFiles[0].path, 'lib/utilsBundle.js');
  assert.equal(descriptor.runtimePinScope, 'named-driver-and-engine-files');
  assert.ok(Object.isFrozen(descriptor.browserEngineFiles[0]));
  assert.deepEqual(api.verifyBrowserRunnerDescriptor(descriptor), descriptor);
  input.browserEngineFiles[0].sha256 = 'b'.repeat(64);
  const changedEngine = api.buildBrowserRunnerDescriptor(input);
  assert.equal(changedEngine.browserExecutable.sha256, descriptor.browserExecutable.sha256);
  assert.notEqual(changedEngine.descriptorDigest, descriptor.descriptorDigest);
  const forged = structuredClone(descriptor); forged.nodeEnvironmentPolicyDigest = 'c'.repeat(64);
  assert.throws(() => api.verifyBrowserRunnerDescriptor(forged), /digest/);
});

test('browser descriptor rejects unverifiable pin shapes and stronger security claims', () => {
  assert.equal(typeof api.buildBrowserRunnerDescriptor, 'function', 'browser runner descriptor builder is required');
  for (const change of [
    input => { input.runtimePinScope = 'complete-os-sandbox'; },
    input => { input.sandboxAttested = true; }, input => { input.args = ['--no-sandbox']; },
    input => { input.browserEngineFiles = []; }, input => { input.driverFiles = []; },
    input => { input.driverFiles = input.driverFiles.filter(row => row.path !== 'lib/bootstrap.js'); },
    input => { input.browserEngineFiles[0].path = '../outside.dll'; },
    input => { input.browserEngineFiles[0].path = 'msedge.exe'; },
    input => { input.driverFiles.push(pin('INDEX.js')); },
    input => { input.browserEngineFiles[0].bytes = 0; },
    input => { input.browserEngineFiles[0].bytes = 1073741825; },
    input => { input.browserEngineFiles[0].sha256 = ['1'.repeat(64)]; },
    input => { input.nodeVersion = '22.0.0'; }, input => { input.driverVersion = 'latest'; },
    input => { input.runnerSourceDigest = ['2'.repeat(64)]; },
    input => { input.limits.maxFiles = 17; },
    input => { input.driverFiles.push(...Array.from({ length: 27 }, (_, n) => pin(`extra-${n}.js`))); },
  ]) {
    const input = descriptorInput(); change(input);
    assert.throws(() => api.buildBrowserRunnerDescriptor(input), /browser|digest|path|pin|version|limit/);
  }
});

test('browser canonical verifiers reject reordered records even when rehashed or carrying the old digest', () => {
  for (const [build, verify, field, digestKey] of [
    [api.compileBrowserRunnerPolicy, api.verifyBrowserRunnerPolicy, 'approvedRevisionDigests', 'policyDigest'],
    [api.buildBrowserRunnerDescriptor, api.verifyBrowserRunnerDescriptor, 'driverFiles', 'descriptorDigest'],
  ]) {
    const original = build(field === 'driverFiles' ? descriptorInput() : policyInput());
    const reordered = structuredClone(original); reordered[field].reverse();
    assert.throws(() => verify(reordered), /digest/);
    const unsigned = { ...reordered }; delete unsigned[digestKey];
    reordered[digestKey] = hashRecord(unsigned);
    assert.throws(() => verify(reordered), /canonical/);
    const nonString = structuredClone(original); nonString[digestKey] = [original[digestKey]];
    assert.throws(() => verify(nonString), /digest/);
  }
});

test('browser suite retains any safe nonnegative count expectation without an arbitrary quality ceiling', () => {
  const input = suiteInput(); input.cases[0].steps[1].count = Number.MAX_SAFE_INTEGER;
  assert.equal(api.compileBrowserTestSuite(input).cases[0].steps[1].count, Number.MAX_SAFE_INTEGER);
  input.cases[0].steps[1].count = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => api.compileBrowserTestSuite(input), /count/);
});

const textObservation = text => ({ sample: text.length <= 128 ? text : text.slice(0, 128),
  textDigest: createHash('sha256').update(text).digest('hex'), textBytes: Buffer.byteLength(text) });
function resultFixture() {
  const suite = api.compileBrowserTestSuite(suiteInput()), descriptor = api.buildBrowserRunnerDescriptor(descriptorInput());
  const expected = { revisionDigest: 'a'.repeat(64), suite, descriptor };
  const record = { schemaVersion: 1, revisionDigest: expected.revisionDigest, testId: 'tasks.filter',
    testSuiteDigest: suite.testSuiteDigest, descriptorDigest: descriptor.descriptorDigest,
    outcome: 'passed', reason: null, elapsedMs: 100, cleanup: { confirmed: true, elapsedMs: 10 },
    controls: { sandboxRequested: true, sandboxArgumentsChecked: true, freshContexts: true,
      nodeEnvironmentScrubbed: true, browserEnvironmentScrubbed: true, serviceWorkersBlocked: true,
      downloadsDisabled: true, permissionsEmpty: true, routeInterception: true, webSocketInterception: true },
    cases: [{ caseId: 'completed-only', steps: [
      { stepIndex: 0, kind: 'click', outcome: 'passed', reason: null, observation: null, elapsedMs: 1 },
      { stepIndex: 1, kind: 'assert-count', outcome: 'passed', reason: null, observation: 1, elapsedMs: 1 },
      { stepIndex: 2, kind: 'assert-text', outcome: 'passed', reason: null, observation: textObservation('fix build'), elapsedMs: 1 },
    ] }] };
  return { record, expected };
}
const signResult = record => ({ ...record, receiptDigest: hashRecord(record) });

test('browser result requires the exact host suite, descriptor and observed assertion values', () => {
  assert.equal(typeof api.verifyBrowserTestResult, 'function', 'browser result verifier is required');
  const { record, expected } = resultFixture();
  const verified = api.verifyBrowserTestResult(signResult(record), expected);
  assert.equal(verified.outcome, 'passed'); assert.ok(Object.isFrozen(verified.cases[0].steps));
  for (const change of [
    item => { item.revisionDigest = 'b'.repeat(64); }, item => { item.testId = 'other'; },
    item => { item.testSuiteDigest = 'c'.repeat(64); }, item => { item.descriptorDigest = 'd'.repeat(64); },
    item => { item.cases[0].steps[1].observation = 2; },
    item => { item.cases[0].steps[2].observation = textObservation('wrong text'); },
    item => { item.cases[0].steps.pop(); }, item => { item.cases.push(structuredClone(item.cases[0])); },
    item => { item.cases[0].steps[0].stepIndex = 1; }, item => { item.cases[0].caseId = 'other'; },
    item => { item.cases[0].steps[0].kind = 'fill'; }, item => { item.cleanup.confirmed = false; },
    item => { item.controls.nodeEnvironmentScrubbed = false; }, item => { item.stdout = 'secret'; },
    item => { item.elapsedMs = -1; }, item => { item.cases[0].steps[0].elapsedMs = 101; },
    item => { item.cases[0].steps[0].observation = 'arbitrary'; },
    item => { item.cases[0].steps[2].observation.sample = 'different'; },
  ]) {
    const changed = structuredClone(record); change(changed);
    assert.throws(() => api.verifyBrowserTestResult(signResult(changed), expected), /browser/);
  }
  const tampered = signResult(record); tampered.elapsedMs++;
  assert.throws(() => api.verifyBrowserTestResult(tampered, expected), /digest/);
});

test('browser results distinguish assertion failure, policy violation and infrastructure stops', () => {
  assert.equal(typeof api.verifyBrowserTestResult, 'function', 'browser result verifier is required');
  const { record, expected } = resultFixture();
  record.outcome = 'failed'; record.reason = 'assertion-mismatch';
  Object.assign(record.cases[0].steps[1], { outcome: 'failed', reason: 'assertion-mismatch', observation: 2 });
  Object.assign(record.cases[0].steps[2], { outcome: 'not-run', reason: 'prior-stop', observation: null, elapsedMs: 0 });
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'failed');
  for (const change of [
    item => { item.outcome = 'passed'; item.reason = null; },
    item => { item.outcome = 'infrastructure-error'; item.reason = 'launch-error'; },
    item => { item.outcome = 'infrastructure-error'; item.reason = 'run-timeout'; },
    item => { item.outcome = 'infrastructure-error'; item.reason = 'driver-error'; },
    item => { item.cases[0].steps[1].observation = 1; },
    item => { item.cases[0].steps[1].reason = 'unknown'; },
    item => { item.cases[0].steps[2] = resultFixture().record.cases[0].steps[2]; },
    item => { item.cases[0].steps[0] = { ...item.cases[0].steps[2], stepIndex: 0, kind: 'click' }; },
  ]) {
    const changed = structuredClone(record); change(changed);
    assert.throws(() => api.verifyBrowserTestResult(signResult(changed), expected), /browser/);
  }
  record.outcome = 'policy-violation'; record.reason = 'blocked-request';
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'policy-violation');
  record.outcome = 'infrastructure-error'; record.reason = 'launch-error';
  for (const step of record.cases[0].steps) Object.assign(step,
    { outcome: 'not-run', reason: 'prior-stop', observation: null, elapsedMs: 0 });
  for (const key of Object.keys(record.controls)) record.controls[key] = false;
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'infrastructure-error');
});

test('browser text verdict uses full digest and length rather than a matching diagnostic prefix', () => {
  assert.equal(typeof api.verifyBrowserTestResult, 'function', 'browser result verifier is required');
  const input = suiteInput(); input.cases[0].steps[2].text = 'x'.repeat(4096);
  const { record, expected } = resultFixture(); expected.suite = api.compileBrowserTestSuite(input);
  record.testSuiteDigest = expected.suite.testSuiteDigest;
  record.cases[0].steps[2].observation = textObservation(input.cases[0].steps[2].text);
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'passed');
  record.cases[0].steps[2].observation = textObservation('x'.repeat(4095) + 'y');
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /browser/);
  record.cases[0].steps[2].observation = textObservation(input.cases[0].steps[2].text);
  record.cases[0].steps[2].observation.sample = '😀'.repeat(129);
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /browser/);
  const small = structuredClone(descriptorInput()); small.limits.maxResultBytes = 100;
  expected.descriptor = api.buildBrowserRunnerDescriptor(small);
  record.descriptorDigest = expected.descriptor.descriptorDigest;
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /bytes|limit/);
});

test('browser result verifies visibility, timeout and driver-error observations without promoting errors to passes', () => {
  const { record, expected } = resultFixture(), input = suiteInput();
  input.cases[0].steps[1] = { kind: 'assert-visible', selector: '.task', visible: false };
  expected.suite = api.compileBrowserTestSuite(input); record.testSuiteDigest = expected.suite.testSuiteDigest;
  Object.assign(record.cases[0].steps[1], { kind: 'assert-visible', observation: false });
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'passed');
  record.cases[0].steps[1].observation = 0;
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /visibility/);
  record.cases[0].steps[1].observation = true;
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /verdict/);
  Object.assign(record.cases[0].steps[1], { observation: null, outcome: 'failed', reason: 'step-timeout' });
  Object.assign(record.cases[0].steps[2], { observation: null, outcome: 'not-run', reason: 'prior-stop', elapsedMs: 0 });
  record.outcome = 'failed'; record.reason = 'step-timeout';
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'failed');
  record.cases[0].steps[1].reason = 'driver-error';
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /browser/);
  record.outcome = 'infrastructure-error'; record.reason = 'driver-error';
  assert.equal(api.verifyBrowserTestResult(signResult(record), expected).outcome, 'infrastructure-error');
  record.reason = 'launch-error';
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /browser/);
});

test('browser completed results cannot call action-only suites or overdue work a passed behavioral test', () => {
  const { record, expected } = resultFixture();
  for (const change of [
    item => { item.elapsedMs = 10001; },
    item => { item.cleanup.elapsedMs = 5001; },
    item => { item.elapsedMs = 2000; item.cases[0].steps[0].elapsedMs = 1001; },
  ]) {
    const changed = structuredClone(record); change(changed);
    assert.throws(() => api.verifyBrowserTestResult(signResult(changed), expected), /browser.*deadline/);
  }
  const input = suiteInput(); input.cases[0].steps.length = 1;
  expected.suite = api.compileBrowserTestSuite(input); record.testSuiteDigest = expected.suite.testSuiteDigest;
  record.cases[0].steps.length = 1;
  assert.throws(() => api.verifyBrowserTestResult(signResult(record), expected), /assertions/);
});
