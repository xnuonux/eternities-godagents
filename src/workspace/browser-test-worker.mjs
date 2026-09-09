import { createHash } from 'node:crypto';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { verifyBrowserTestResult } from './browser-test-contracts.mjs';
import { verifyBrowserRuntimeFiles, buildBrowserWorkerEnvironment } from './browser-test-runtime.mjs';
import { validatePayload, describeRuntime, ensure, REQUEST_MAX, ORIGIN, CSP, routeUrl } from './browser-test-profile.mjs';

const uncertain = reason => ({ outcome: 'uncertain', reason, cleanup: { confirmed: false } });
let preflightStage = 'input';
async function bounded(work, milliseconds) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => { const error = new Error('bounded timeout'); error.name = 'TimeoutError'; reject(error); }, milliseconds);
  })]); } finally { clearTimeout(timer); }
}
async function readInput() {
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) { bytes += chunk.length; ensure(bytes <= REQUEST_MAX, 'input exceeds limit'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function textObservation(value) {
  let sample = '', length = 0;
  for (const symbol of value) { const bytes = Buffer.byteLength(symbol); if (length + bytes > 512) break; sample += symbol; length += bytes; }
  return { sample, textDigest: sha256Text(value), textBytes: Buffer.byteLength(value) };
}
async function observe(page, step, timeout) {
  const locator = page.locator(step.selector);
  if (step.kind === 'click') { await locator.click({ timeout }); return { observation: null, matches: true }; }
  if (step.kind === 'fill') { await locator.fill(step.text, { timeout }); return { observation: null, matches: true }; }
  if (step.kind === 'press') { await locator.press(step.key, { timeout }); return { observation: null, matches: true }; }
  if (step.kind === 'assert-count') { const count = await locator.count(); return { observation: count, matches: count === step.count }; }
  if (step.kind === 'assert-visible') { const visible = await locator.isVisible(); return { observation: visible, matches: visible === step.visible }; }
  // Fixed first-party observer only. No executable expression comes from a suite.
  const value = await locator.evaluate(element => {
    const text = element.textContent ?? '';
    if (text.length > 65536 || new TextEncoder().encode(text).length > 65536) throw new Error('text observation limit');
    return text;
  }, undefined, { timeout });
  return { observation: textObservation(value), matches: value === step.text };
}

async function run(request) {
  preflightStage = 'payload';
  const { policy, descriptor, suite, routes } = validatePayload(request);
  preflightStage = 'runtime-files';
  const runtime = (await verifyBrowserRuntimeFiles(request.runtime)).runtime;
  preflightStage = 'node-identity';
  const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
  ensure(key(resolve(process.execPath)) === key(resolve(runtime.node.root, runtime.node.file.path))
    && process.versions.node === runtime.node.version, 'actual Node runtime differs');
  preflightStage = 'environment';
  const environment = buildBrowserWorkerEnvironment({ systemRoot: process.env.SystemRoot, tempRoot: process.env.TEMP });
  ensure(canonicalJson(Object.keys(process.env).sort()) === canonicalJson(Object.keys(environment).sort())
    && Object.entries(environment).every(([name, value]) => process.env[name] === value), 'worker environment differs before driver import');
  preflightStage = 'source';
  ensure((await describeRuntime({ runtime, policy, catalog: request.catalog, storePolicyDigest: descriptor.storePolicyDigest })).descriptorDigest
    === descriptor.descriptorDigest, 'source or runtime descriptor differs');
  preflightStage = 'route-bytes';
  for (const row of routes.values()) ensure(createHash('sha256').update(row.bytes).digest('hex') === row.sha256, 'route byte digest differs');
  // The configured, prechecked CJS entry is imported only after every preflight above.
  preflightStage = 'driver-import';
  const { default: driver } = await import(pathToFileURL(join(runtime.driver.root, runtime.driver.entryPath)).href);
  const record = { schemaVersion: 1, revisionDigest: request.revision.revisionDigest,
    testId: suite.testId, testSuiteDigest: suite.testSuiteDigest, descriptorDigest: descriptor.descriptorDigest,
    outcome: 'passed', reason: null, elapsedMs: 0, cleanup: { confirmed: false, elapsedMs: 0 },
    controls: { sandboxRequested: false, sandboxArgumentsChecked: false, freshContexts: false,
      nodeEnvironmentScrubbed: true, browserEnvironmentScrubbed: false, serviceWorkersBlocked: false,
      downloadsDisabled: false, permissionsEmpty: false, routeInterception: false, webSocketInterception: false },
    cases: suite.cases.map(item => ({ caseId: item.caseId, steps: item.steps.map((step, stepIndex) => ({ stepIndex,
      kind: step.kind, outcome: 'not-run', reason: 'prior-stop', observation: null, elapsedMs: 0 })) })) };
  let server, browser, context, policyReason = null, deadlineHit = false, started = false;
  const violate = reason => { policyReason ??= reason; };
  const start = performance.now();
  const timer = setTimeout(() => { deadlineHit = true; void server?.kill().catch(() => {}); }, policy.limits.runTimeoutMs);
  try {
    server = await driver.chromium.launchServer({ executablePath: join(runtime.browser.root, runtime.browser.executable.path),
      chromiumSandbox: true, headless: true, host: '127.0.0.1', env: environment, timeout: policy.limits.launchTimeoutMs });
    started = true;
    const argv = server.process().spawnargs;
    ensure(!argv.some(arg => ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'].some(flag => arg === flag || arg.startsWith(`${flag}=`))),
      'browser sandbox disabling flag observed');
    const profile = argv.find(arg => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
    ensure(profile, 'fresh browser profile is missing');
    const childProfile = relative(environment.TEMP, resolve(profile));
    ensure(childProfile && !childProfile.startsWith('..') && !isAbsolute(childProfile), 'browser profile is outside private temporary root');
    record.controls.sandboxRequested = true; record.controls.sandboxArgumentsChecked = true;
    record.controls.browserEnvironmentScrubbed = true;
    browser = await driver.chromium.connect(server.wsEndpoint(), { timeout: policy.limits.launchTimeoutMs });
    ensure(browser.version() === runtime.browser.version, 'actual browser version differs');
    outer: for (let c = 0; c < suite.cases.length; c++) {
      if (deadlineHit) throw new Error('run deadline');
      context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
      context.setDefaultTimeout(policy.limits.stepTimeoutMs);
      Object.assign(record.controls, { freshContexts: true, serviceWorkersBlocked: true, downloadsDisabled: true, permissionsEmpty: true });
      await context.route('**/*', async route => {
        const request = route.request(), value = routes.get(request.url());
        if (!value || request.method() !== 'GET') { violate('blocked-request'); await route.abort().catch(() => {}); return; }
        await route.fulfill({ status: 200, contentType: value.contentType, body: value.bytes,
          headers: { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } }).catch(() => {});
      });
      record.controls.routeInterception = true;
      await context.routeWebSocket('**/*', async socket => { violate('blocked-request'); await socket.close().catch(() => {}); });
      record.controls.webSocketInterception = true;
      const page = await context.newPage();
      context.on('page', other => { if (other !== page) { violate('unexpected-page'); void other.close().catch(() => {}); } });
      page.on('download', download => { violate('blocked-request'); void download.cancel().catch(() => {}); });
      page.on('framenavigated', frame => { if (!routes.has(frame.url())) violate('unexpected-navigation'); });
      await page.goto(routeUrl(suite.entryPath), { waitUntil: 'domcontentloaded', timeout: policy.limits.stepTimeoutMs });
      for (let s = 0; s < suite.cases[c].steps.length; s++) {
        if (policyReason) break outer;
        const actual = record.cases[c].steps[s], step = suite.cases[c].steps[s], stepStart = performance.now();
        try {
          const observed = await bounded(observe(page, step, policy.limits.stepTimeoutMs), policy.limits.stepTimeoutMs);
          Object.assign(actual, { outcome: observed.matches ? 'passed' : 'failed', reason: observed.matches ? null : 'assertion-mismatch', observation: observed.observation });
        } catch (error) {
          Object.assign(actual, { outcome: 'failed', reason: error.name === 'TimeoutError' && !deadlineHit ? 'step-timeout' : 'driver-error', observation: null });
        }
        actual.elapsedMs = performance.now() - stepStart;
        if (actual.outcome === 'passed' && actual.elapsedMs > policy.limits.stepTimeoutMs)
          Object.assign(actual, { outcome: 'failed', reason: 'step-timeout', observation: null });
        if (actual.outcome === 'failed') {
          record.outcome = actual.reason === 'driver-error' ? 'infrastructure-error' : 'failed'; record.reason = actual.reason; break outer;
        }
      }
      await context.close(); context = null;
    }
  } catch (error) {
    if (!started) process.stderr.write(JSON.stringify({ stage: 'launch', message: String(error.message).slice(0, 8192) }));
    record.outcome = 'infrastructure-error'; record.reason = deadlineHit ? 'run-timeout' : started ? 'driver-error' : 'launch-error';
  } finally {
    clearTimeout(timer); record.elapsedMs = performance.now() - start;
    if (policyReason) { record.outcome = 'policy-violation'; record.reason = policyReason; }
    const cleanupStart = performance.now();
    // A rejected launch promise may already have spawned a process. Absence of
    // its returned handle is not evidence that no process exists or was closed.
    if (!server) record.cleanup.confirmed = false;
    else {
      try { await bounded(server.close(), policy.limits.cleanupTimeoutMs); }
      catch { void server.kill().catch(() => {}); }
      const child = server.process(); record.cleanup.confirmed = child.exitCode !== null || child.signalCode !== null;
    }
    record.cleanup.elapsedMs = performance.now() - cleanupStart;
  }
  if (!record.cleanup.confirmed) return uncertain('browser-cleanup-unconfirmed');
  const result = { ...record, receiptDigest: sha256Value(record) };
  try { return verifyBrowserTestResult(result, { revisionDigest: request.revision.revisionDigest, suite, descriptor }); }
  catch { return uncertain('completed-evidence-rejected'); }
}

try {
  const result = await run(await readInput());
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch { process.stdout.write(`${JSON.stringify(uncertain(`worker-preflight-${preflightStage}`))}\n`); }
