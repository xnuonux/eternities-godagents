import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createWorkspaceRevisionStore } from './revision-store.mjs';
import { compileBrowserRunnerPolicy, verifyBrowserTestSuite, verifyBrowserTestResult } from './browser-test-contracts.mjs';
import { verifyBrowserRuntimeFiles, buildBrowserWorkerEnvironment } from './browser-test-runtime.mjs';
import { describeRuntime, validatePayload, ensure, exact, REQUEST_MAX } from './browser-test-profile.mjs';

const workerPath = fileURLToPath(new URL('browser-test-worker.mjs', import.meta.url));
const uncertain = reason => Object.freeze({ outcome: 'uncertain', reason, cleanup: Object.freeze({ confirmed: false }) });
function invoke(node, environment, cwd, payload, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(node, [workerPath], { shell: false, windowsHide: true, cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [], diagnostics = []; let bytes = 0, diagnosticBytes = 0, invalid = false, failure = null;
    const timer = setTimeout(() => { failure = 'worker-deadline'; child.kill(); }, timeoutMs);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > payload.policy.limits.maxResultBytes) { invalid = true; child.kill(); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { diagnosticBytes += chunk.length; if (diagnosticBytes <= 16384) diagnostics.push(chunk); });
    child.on('error', () => { failure = 'worker-start-error'; });
    child.stdin.on('error', () => { failure ??= 'worker-input-error'; });
    child.on('close', async code => {
      clearTimeout(timer);
      if (diagnostics.length) await writeFile(join(cwd, 'launch-diagnostic.json'), Buffer.concat(diagnostics), { flag: 'wx' }).catch(() => {});
      if (failure || invalid || code !== 0) return resolveResult(uncertain(failure ?? 'worker-output-error'));
      try { resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolveResult(uncertain('worker-output-invalid')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function createBrowserWorkspaceTestRunner(input) {
  exact(input, ['store', 'runtime', 'policy', 'suites']);
  const config = structuredClone(input), policy = compileBrowserRunnerPolicy(config.policy);
  ensure(Array.isArray(config.suites) && config.suites.length > 0 && config.suites.length <= 16, 'suite catalog exceeds limit');
  const suites = config.suites.map(verifyBrowserTestSuite).sort((a, b) => a.testId < b.testId ? -1 : 1);
  ensure(new Set(suites.map(row => row.testId)).size === suites.length, 'duplicate test identifiers');
  const runtime = (await verifyBrowserRuntimeFiles(config.runtime)).runtime;
  const store = await createWorkspaceRevisionStore(config.store), storeDescription = await store.describe();
  ensure(policy.limits.maxFiles <= storeDescription.limits.maxFiles && policy.limits.maxAppBytes <= storeDescription.limits.maxTotalBytes,
    'runner limits exceed store ceiling');
  const catalog = suites.map(({ testId, testSuiteDigest }) => ({ testId, testSuiteDigest }));
  const descriptor = await describeRuntime({ runtime, policy, catalog, storePolicyDigest: storeDescription.storePolicyDigest });
  let active = false;
  return Object.freeze({ describe: () => descriptor, async run(input) {
    exact(input, ['revisionDigest', 'testId']); const request = structuredClone(input);
    ensure(!active, 'already executing'); ensure(policy.approvedRevisionDigests.includes(request.revisionDigest), 'revision is not host approved');
    const suite = suites.find(row => row.testId === request.testId); ensure(suite, 'test is not host owned'); active = true;
    let temp = null, result;
    try {
      await verifyBrowserRuntimeFiles(runtime);
      ensure((await describeRuntime({ runtime, policy, catalog, storePolicyDigest: descriptor.storePolicyDigest })).descriptorDigest === descriptor.descriptorDigest,
        'runner source changed');
      const inspected = await store.inspect(request.revisionDigest);
      ensure(inspected.files.length <= policy.limits.maxFiles && inspected.totalBytes <= policy.limits.maxAppBytes, 'revision exceeds runner limits');
      const revision = { revisionDigest: inspected.revisionDigest, parentDigest: inspected.parentDigest, files: inspected.files, totalBytes: inspected.totalBytes };
      const routes = [];
      for (const row of inspected.files) routes.push({ path: row.path,
        body: Buffer.from(await store.read({ revisionDigest: inspected.revisionDigest, path: row.path })).toString('base64') });
      const payload = { schemaVersion: 1, revision, runtime, policy, descriptor, catalog, suite, routes };
      ensure(Buffer.byteLength(JSON.stringify(payload)) <= REQUEST_MAX, 'worker request exceeds limit');
      const decoded = validatePayload(payload);
      for (const row of decoded.routes.values()) ensure(createHash('sha256').update(row.bytes).digest('hex') === row.sha256, 'copied bytes differ');
      temp = await mkdtemp(join(tmpdir(), 'godagent-browser-'));
      const environment = buildBrowserWorkerEnvironment({ systemRoot: process.env.SystemRoot, tempRoot: temp });
      await mkdir(environment.LOCALAPPDATA, { recursive: true }); await mkdir(environment.APPDATA, { recursive: true });
      result = await invoke(join(runtime.node.root, runtime.node.file.path), environment, temp, payload,
        policy.limits.runTimeoutMs + policy.limits.cleanupTimeoutMs + 15000);
      if (result.outcome === 'uncertain') return uncertain(result.reason);
      await store.inspect(request.revisionDigest);
      return verifyBrowserTestResult(result, { revisionDigest: request.revisionDigest, suite, descriptor });
    } finally {
      active = false;
      if (temp && result?.cleanup?.confirmed === true && ['passed', 'failed'].includes(result.outcome)) {
        const root = resolve(tmpdir()), actual = await realpath(temp), child = relative(root, actual);
        ensure(child.startsWith('godagent-browser-') && !child.includes('..') && !isAbsolute(child) && actual === resolve(temp), 'temporary directory ownership changed');
        await rm(actual, { recursive: true, force: true });
      }
    }
  } });
}
