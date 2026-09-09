import { sha256Value, sha256Text } from '../core/digest.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const requireValue = (condition, message) => { if (!condition) throw new TypeError(message); };
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const PROFILE = 'host-reviewed-browser-local-v1';
const LIMIT_CAPS = Object.freeze({ maxFiles: 16, maxAppBytes: 4194304, maxResultBytes: 16384,
  stepTimeoutMs: 5000, launchTimeoutMs: 10000, runTimeoutMs: 60000, cleanupTimeoutMs: 10000 });
const STEP_FIELDS = Object.freeze({
  click: ['kind', 'selector'], fill: ['kind', 'selector', 'text'],
  press: ['kind', 'selector', 'key'], 'assert-text': ['kind', 'selector', 'text'],
  'assert-visible': ['kind', 'selector', 'visible'], 'assert-count': ['kind', 'selector', 'count'],
});
function exact(value, keys, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), `browser ${label} fields are invalid`);
}
function text(value, maximum, label, allowEmpty = false) {
  requireValue(typeof value === 'string' && (allowEmpty || value.length > 0)
    && Buffer.byteLength(value, 'utf8') <= maximum, `browser ${label} bytes exceed limit or type is invalid`);
}
function identifier(value) {
  requireValue(typeof value === 'string' && IDENTIFIER.test(value), 'browser suite identifier is invalid');
}
function digest(value) {
  requireValue(typeof value === 'string' && DIGEST.test(value), 'browser digest is invalid');
}
function validateLimits(value) {
  exact(value, Object.keys(LIMIT_CAPS), 'limits');
  for (const [key, ceiling] of Object.entries(LIMIT_CAPS)) requireValue(Number.isSafeInteger(value[key])
    && value[key] > 0 && value[key] <= ceiling, `browser ${key} limit is invalid`);
  requireValue(value.stepTimeoutMs <= value.runTimeoutMs && value.launchTimeoutMs <= value.runTimeoutMs,
    'browser deadlines exceed total run limit');
}
function entryPath(value) {
  text(value, 1024, 'entry path');
  requireValue(value === value.normalize('NFC') && !/[\x00-\x1f\x7f<>:"\\|?*]/.test(value), 'browser entry path is invalid');
  const parts = value.split('/');
  requireValue(parts.length <= 32 && parts.every(part => part && part !== '.' && part !== '..'
    && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(part.split('.')[0].trimEnd())),
  'browser entry path is invalid');
}
function validateSuite(value) {
  exact(value, ['schemaVersion', 'testId', 'entryPath', 'cases'], 'suite');
  requireValue(value.schemaVersion === 1, 'browser suite version is invalid');
  identifier(value.testId); entryPath(value.entryPath);
  requireValue(Array.isArray(value.cases) && value.cases.length > 0 && value.cases.length <= 8, 'browser suite case count exceeds limit');
  const ids = new Set(); let steps = 0;
  for (const item of value.cases) {
    exact(item, ['caseId', 'steps'], 'case'); identifier(item.caseId);
    requireValue(!ids.has(item.caseId), 'browser suite case identifier is duplicated'); ids.add(item.caseId);
    requireValue(Array.isArray(item.steps) && item.steps.length > 0, 'browser case step count is invalid');
    steps += item.steps.length; requireValue(steps <= 128, 'browser suite step count exceeds limit');
    for (const step of item.steps) {
      requireValue(step && typeof step.kind === 'string' && Object.hasOwn(STEP_FIELDS, step.kind), 'browser suite step kind is invalid');
      exact(step, STEP_FIELDS[step.kind], 'step'); text(step.selector, 512, 'selector');
      if (step.kind === 'fill' || step.kind === 'assert-text') text(step.text, 4096, 'assertion text', true);
      if (step.kind === 'press') text(step.key, 64, 'key');
      if (step.kind === 'assert-visible') requireValue(typeof step.visible === 'boolean', 'browser step visibility is invalid');
      if (step.kind === 'assert-count') requireValue(Number.isSafeInteger(step.count) && step.count >= 0,
        'browser step count is invalid');
    }
  }
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function compileBrowserTestSuite(input) {
  validateSuite(input);
  const value = structuredClone(input);
  validateSuite(value);
  const result = { ...value, testSuiteDigest: sha256Value(value) };
  requireValue(Buffer.byteLength(canonicalJson(result), 'utf8') <= 65536, 'browser suite bytes exceed limit');
  return freeze(result);
}

export function verifyBrowserTestSuite(input) {
  const value = structuredClone(input);
  requireValue(value && typeof value.testSuiteDigest === 'string' && DIGEST.test(value.testSuiteDigest),
    'browser test suite digest is invalid');
  const { testSuiteDigest, ...unsigned } = value;
  const expected = compileBrowserTestSuite(unsigned);
  requireValue(expected.testSuiteDigest === testSuiteDigest, 'browser test suite digest mismatch');
  return expected;
}

function validatePolicy(value) {
  exact(value, ['schemaVersion', 'profile', 'approvedRevisionDigests', 'limits'], 'policy');
  requireValue(value.schemaVersion === 1 && value.profile === PROFILE, 'browser policy profile or version is invalid');
  requireValue(Array.isArray(value.approvedRevisionDigests) && value.approvedRevisionDigests.length > 0
    && value.approvedRevisionDigests.length <= 64, 'browser policy approval count is invalid');
  for (const valueDigest of value.approvedRevisionDigests) digest(valueDigest);
  requireValue(new Set(value.approvedRevisionDigests).size === value.approvedRevisionDigests.length,
    'browser policy approval digests are duplicated');
  validateLimits(value.limits);
}

export function compileBrowserRunnerPolicy(input) {
  validatePolicy(input);
  const value = structuredClone(input); validatePolicy(value);
  value.approvedRevisionDigests.sort();
  return freeze({ ...value, policyDigest: sha256Value(value) });
}

export function verifyBrowserRunnerPolicy(input) {
  const value = structuredClone(input);
  requireValue(value && typeof value === 'object', 'browser policy record is invalid');
  digest(value.policyDigest);
  const { policyDigest, ...unsigned } = value;
  requireValue(sha256Value(unsigned) === policyDigest, 'browser policy digest mismatch');
  const expected = compileBrowserRunnerPolicy(unsigned);
  requireValue(expected.policyDigest === policyDigest, 'browser policy canonical digest mismatch');
  return expected;
}

const DESCRIPTOR_DIGESTS = ['runnerSourceDigest', 'workerSourceDigest', 'nodeExecutableDigest',
  'nodeEnvironmentPolicyDigest', 'browserEnvironmentPolicyDigest', 'launchPolicyDigest',
  'suiteCatalogDigest', 'storePolicyDigest', 'reviewedRevisionsDigest'];
const DRIVER_FILES = ['index.js', 'lib/bootstrap.js', 'lib/coreBundle.js', 'lib/utilsBundle.js', 'package.json'];
function version(value, parts, label) {
  text(value, 64, `${label} version`);
  requireValue(new RegExp(`^(0|[1-9][0-9]{0,8})(\\.(0|[1-9][0-9]{0,8})){${parts - 1}}$`).test(value),
    `browser ${label} version is invalid`);
}
function filePins(rows) {
  const names = new Set();
  for (const row of rows) {
    exact(row, ['path', 'bytes', 'sha256'], 'file pin'); entryPath(row.path); digest(row.sha256);
    requireValue(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 1073741824,
      'browser file pin bytes exceed limit');
    const name = row.path.toLowerCase();
    requireValue(!names.has(name), 'browser file pin paths collide'); names.add(name);
  }
}
function validateDescriptor(value) {
  exact(value, ['schemaVersion', 'protocolId', 'profile', ...DESCRIPTOR_DIGESTS,
    'nodeVersion', 'driverVersion', 'driverFiles', 'browserVersion', 'browserExecutable',
    'browserEngineFiles', 'runtimePinScope', 'limits'], 'descriptor');
  requireValue(value.schemaVersion === 1 && value.protocolId === 'eternities-workspace-test-runner-v1'
    && value.profile === PROFILE, 'browser descriptor protocol, profile or version is invalid');
  requireValue(value.runtimePinScope === 'named-driver-and-engine-files', 'browser runtime pin scope is invalid');
  for (const key of DESCRIPTOR_DIGESTS) digest(value[key]);
  version(value.nodeVersion, 3, 'node'); version(value.driverVersion, 3, 'driver');
  version(value.browserVersion, 4, 'engine');
  requireValue(Number(value.nodeVersion.split('.')[0]) >= 24, 'browser node version is unsupported');
  requireValue(Array.isArray(value.driverFiles) && Array.isArray(value.browserEngineFiles)
    && value.browserEngineFiles.length > 0
    && value.driverFiles.length + value.browserEngineFiles.length + 2 <= 32, 'browser named file pin count is invalid');
  filePins(value.driverFiles); filePins([value.browserExecutable, ...value.browserEngineFiles]);
  requireValue(DRIVER_FILES.every(path => value.driverFiles.some(row => row.path === path)),
    'browser required driver file pin is missing');
  validateLimits(value.limits);
}
const comparePins = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

export function buildBrowserRunnerDescriptor(input) {
  validateDescriptor(input);
  const value = structuredClone(input); validateDescriptor(value);
  value.driverFiles.sort(comparePins); value.browserEngineFiles.sort(comparePins);
  return freeze({ ...value, descriptorDigest: sha256Value(value) });
}

export function verifyBrowserRunnerDescriptor(input) {
  const value = structuredClone(input);
  requireValue(value && typeof value === 'object', 'browser descriptor record is invalid');
  digest(value.descriptorDigest);
  const { descriptorDigest, ...unsigned } = value;
  requireValue(sha256Value(unsigned) === descriptorDigest, 'browser descriptor digest mismatch');
  const expected = buildBrowserRunnerDescriptor(unsigned);
  requireValue(expected.descriptorDigest === descriptorDigest, 'browser descriptor canonical digest mismatch');
  return expected;
}

const CONTROL_FIELDS = ['sandboxRequested', 'sandboxArgumentsChecked', 'freshContexts',
  'nodeEnvironmentScrubbed', 'browserEnvironmentScrubbed', 'serviceWorkersBlocked',
  'downloadsDisabled', 'permissionsEmpty', 'routeInterception', 'webSocketInterception'];
const RUN_REASONS = {
  passed: [null], failed: ['assertion-mismatch', 'step-timeout'],
  'policy-violation': ['blocked-request', 'unexpected-navigation', 'unexpected-page'],
  'infrastructure-error': ['launch-error', 'driver-error', 'run-timeout'],
};
function duration(value) {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0
    && value <= Number.MAX_SAFE_INTEGER, 'browser elapsed time is invalid');
}
function assertionMatches(step, observation) {
  if (step.kind === 'assert-count') {
    requireValue(Number.isSafeInteger(observation) && observation >= 0, 'browser count observation is invalid');
    return observation === step.count;
  }
  if (step.kind === 'assert-visible') {
    requireValue(typeof observation === 'boolean', 'browser visibility observation is invalid');
    return observation === step.visible;
  }
  exact(observation, ['sample', 'textDigest', 'textBytes'], 'text observation');
  text(observation.sample, 512, 'text sample', true); digest(observation.textDigest);
  requireValue(Number.isSafeInteger(observation.textBytes) && observation.textBytes >= 0
    && Buffer.byteLength(observation.sample) <= observation.textBytes, 'browser observed text bytes are invalid');
  if (observation.textBytes <= 512) requireValue(Buffer.byteLength(observation.sample) === observation.textBytes
    && sha256Text(observation.sample) === observation.textDigest, 'browser text sample digest mismatch');
  return observation.textBytes === Buffer.byteLength(step.text) && observation.textDigest === sha256Text(step.text);
}

// This verifies consistency of a host-issued result, not who issued it or whether
// execution occurred. The worker/owner must establish that source separately.
export function verifyBrowserTestResult(input, binding) {
  exact(binding, ['revisionDigest', 'suite', 'descriptor'], 'result binding'); digest(binding.revisionDigest);
  const suite = verifyBrowserTestSuite(binding.suite), descriptor = verifyBrowserRunnerDescriptor(binding.descriptor);
  const value = structuredClone(input);
  exact(value, ['schemaVersion', 'revisionDigest', 'testId', 'testSuiteDigest', 'descriptorDigest',
    'outcome', 'reason', 'elapsedMs', 'cleanup', 'controls', 'cases', 'receiptDigest'], 'result');
  requireValue(Buffer.byteLength(canonicalJson(value)) <= descriptor.limits.maxResultBytes, 'browser result bytes exceed limit');
  digest(value.receiptDigest);
  const { receiptDigest, ...unsigned } = value;
  requireValue(sha256Value(unsigned) === receiptDigest, 'browser result receipt digest mismatch');
  requireValue(value.schemaVersion === 1 && value.revisionDigest === binding.revisionDigest
    && value.testId === suite.testId && value.testSuiteDigest === suite.testSuiteDigest
    && value.descriptorDigest === descriptor.descriptorDigest, 'browser result source binding mismatch');
  requireValue(typeof value.outcome === 'string' && Object.hasOwn(RUN_REASONS, value.outcome)
    && RUN_REASONS[value.outcome].includes(value.reason), 'browser result outcome or reason is invalid');
  duration(value.elapsedMs); exact(value.cleanup, ['confirmed', 'elapsedMs'], 'cleanup');
  requireValue(value.cleanup.confirmed === true, 'browser completed result requires confirmed cleanup');
  duration(value.cleanup.elapsedMs);
  exact(value.controls, CONTROL_FIELDS, 'controls');
  requireValue(CONTROL_FIELDS.every(key => typeof value.controls[key] === 'boolean'), 'browser control observation is invalid');
  const controlled = CONTROL_FIELDS.every(key => value.controls[key]);
  requireValue(Array.isArray(value.cases) && value.cases.length === suite.cases.length, 'browser result case count mismatch');
  let stopped = false, failure = null, skipped = false, assertionCount = 0, stepTime = 0;
  for (let c = 0; c < suite.cases.length; c++) {
    const actual = value.cases[c], wanted = suite.cases[c];
    exact(actual, ['caseId', 'steps'], 'case result');
    requireValue(actual.caseId === wanted.caseId && Array.isArray(actual.steps)
      && actual.steps.length === wanted.steps.length, 'browser result case or step coverage mismatch');
    for (let s = 0; s < wanted.steps.length; s++) {
      const step = actual.steps[s], wantedStep = wanted.steps[s];
      exact(step, ['stepIndex', 'kind', 'outcome', 'reason', 'observation', 'elapsedMs'], 'step result');
      requireValue(step.stepIndex === s && step.kind === wantedStep.kind, 'browser result step binding mismatch');
      duration(step.elapsedMs); stepTime += step.elapsedMs;
      requireValue(stepTime <= value.elapsedMs, 'browser step time exceeds run elapsed time');
      requireValue(step.outcome !== 'passed' || step.elapsedMs <= descriptor.limits.stepTimeoutMs,
        'browser passed step exceeds its deadline');
      if (step.outcome === 'not-run') {
        requireValue(step.reason === 'prior-stop' && step.observation === null && step.elapsedMs === 0
          && (stopped || value.outcome === 'policy-violation' || value.outcome === 'infrastructure-error'),
        'browser not-run step has no valid stop');
        stopped = true; skipped = true; continue;
      }
      requireValue(!stopped && controlled && ['passed', 'failed'].includes(step.outcome),
        'browser observed step follows stop or lacks required controls');
      const assertion = step.kind.startsWith('assert-');
      if (step.outcome === 'passed') requireValue(step.reason === null, 'browser passed step has failure reason');
      else requireValue(['assertion-mismatch', 'step-timeout', 'driver-error'].includes(step.reason),
        'browser failed step reason is invalid');
      if (!assertion) requireValue(step.observation === null && step.reason !== 'assertion-mismatch',
        'browser action observation is invalid');
      else if (step.observation === null) requireValue(step.outcome === 'failed'
        && ['step-timeout', 'driver-error'].includes(step.reason), 'browser assertion observation is missing');
      else {
        const matches = assertionMatches(wantedStep, step.observation); assertionCount++;
        requireValue(matches ? step.outcome === 'passed' : step.outcome === 'failed' && step.reason === 'assertion-mismatch',
          'browser assertion verdict contradicts observation');
      }
      if (step.outcome === 'failed') { failure = step.reason; stopped = true; }
    }
  }
  if (value.outcome === 'passed') requireValue(!failure && !skipped && assertionCount > 0 && controlled,
    'browser passed run lacks complete observed assertions');
  if (value.outcome === 'passed' || value.outcome === 'failed') requireValue(
    value.elapsedMs <= descriptor.limits.runTimeoutMs && value.cleanup.elapsedMs <= descriptor.limits.cleanupTimeoutMs,
    'browser completed test exceeds its deadline');
  if (value.outcome === 'failed') requireValue(failure === value.reason, 'browser failed run has no matching failed step');
  if (failure && value.outcome !== 'policy-violation') requireValue(value.reason === failure
    && value.outcome === (failure === 'driver-error' ? 'infrastructure-error' : 'failed'),
    'browser run outcome contradicts the recorded terminal step failure');
  return freeze(value);
}
