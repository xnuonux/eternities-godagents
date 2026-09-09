import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';
import { compileBrowserTestSuite } from '../src/workspace/browser-test-contracts.mjs';
import { createBrowserWorkspaceTestRunner } from '../src/workspace/browser-test-runner.mjs';

// Inspected first-party probes, never arbitrary user/project commands. Synthetic
// .invalid origins contain no credentials or payloads and cannot name a real site.
const app = action => `<!doctype html><meta charset="utf-8"><title>Control probe</title>
<button id="start">Start</button><p id="ready">ready</p><script>
document.querySelector('#start').onclick=()=>{${action}};
</script>`;
const settled = "document.querySelector('#ready').textContent='settled'";
const cases = [
  { id: 'csp-http', html: app(`fetch('https://outside.invalid/probe').catch(()=>{${settled}})`), event: 'csp-blocked' },
  { id: 'http-route', html: app(`fetch('/not-admitted').catch(()=>{${settled}})`), event: 'http-aborted' },
  { id: 'external-websocket', html: app("new WebSocket('wss://outside.invalid/socket')"), event: 'websocket-closed' },
  { id: 'websocket-route', html: app("new WebSocket('wss://godagent.invalid/socket')"), event: 'websocket-closed' },
  { id: 'popup', html: app("window.open('about:blank')"), event: 'unexpected-page' },
  { id: 'navigation', html: app("location.href='/not-admitted'"), event: 'navigation-denied' },
  { id: 'download', html: app("const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['probe']));a.download='probe.txt';a.click()"), event: 'download-cancelled' },
  { id: 'step-timeout', html: app(''), outcome: 'failed', reason: 'step-timeout', target: '#missing' },
  { id: 'run-timeout', html: app('while(true){}'), outcome: 'infrastructure-error', reason: 'run-timeout', deadline: true },
  { id: 'text-limit', html: app("document.querySelector('#ready').textContent='a'.repeat(65537)"), outcome: 'infrastructure-error', reason: 'driver-error', text: true },
];
const args = process.argv.slice(2);
assert.ok((args.length === 4 || args.length === 6 && args[4] === '--case') && args[0] === '--runtime' && args[2] === '--output-root');
const selected = args.length === 6 ? cases.filter(row => row.id === args[5]) : cases;
assert.ok(selected.length, 'unknown first-party probe');
const runtime = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
const root = await mkdtemp(join(resolve(args[3]), 'controls-')), summary = [];
const hash = value => createHash('sha256').update(value).digest('hex');
for (const probe of selected) {
  const home = join(root, probe.id), source = join(home, 'source'), storeRoot = join(home, 'store');
  await mkdir(source, { recursive: true }); await mkdir(storeRoot);
  const bytes = Buffer.from(probe.html); await writeFile(join(source, 'index.html'), bytes);
  const config = { root: storeRoot, limits: { maxFiles: 1, maxFileBytes: 131072, maxTotalBytes: 131072, maxRevisions: 2, maxStoreBytes: 524288 } };
  const store = await createWorkspaceRevisionStore(config);
  const revision = await store.capture({ sourceRoot: source, files: [{ path: 'index.html', sha256: hash(bytes) }] });
  const suite = compileBrowserTestSuite({ schemaVersion: 1, testId: probe.id, entryPath: 'index.html', cases: [{ caseId: 'control', steps: [
    { kind: 'assert-visible', selector: '#ready', visible: true },
    { kind: 'click', selector: probe.target ?? '#start' },
    ...(probe.text ? [{ kind: 'assert-text', selector: '#ready', text: 'bounded' }] : [{ kind: 'assert-visible', selector: '#ready', visible: true }]),
  ] }] });
  const suiteSha256 = hash(JSON.stringify(suite));
  const runner = await createBrowserWorkspaceTestRunner({ runtime, store: config, suites: [suite], policy: {
    schemaVersion: 1, profile: 'host-reviewed-browser-local-v1', approvedRevisionDigests: [revision.revisionDigest],
    limits: { maxFiles: 1, maxAppBytes: 131072, maxResultBytes: 16384, stepTimeoutMs: probe.deadline ? 2500 : 500,
      launchTimeoutMs: probe.deadline ? 2000 : 5000, runTimeoutMs: probe.deadline ? 2500 : 10000, cleanupTimeoutMs: 5000 } } });
  const result = await runner.run({ revisionDigest: revision.revisionDigest, testId: suite.testId });
  const originalUnchanged = (await readFile(join(source, 'index.html'))).equals(bytes);
  const revisionUnchanged = Buffer.from(await store.read({ revisionDigest: revision.revisionDigest, path: 'index.html' })).equals(bytes);
  const suiteUnchanged = hash(JSON.stringify(suite)) === suiteSha256;
  await writeFile(join(home, 'result.json'), `${JSON.stringify({ result, descriptor: runner.describe(), sourceSha256: hash(bytes),
    suite, suiteSha256, originalUnchanged, revisionUnchanged, suiteUnchanged }, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ id: probe.id, outcome: result.outcome, reason: result.reason, policyEvents: result.policyEvents, root })}\n`);
  assert.equal(result.outcome, probe.outcome ?? 'policy-violation', `${probe.id} outcome`);
  if (probe.reason) assert.equal(result.reason, probe.reason);
  if (probe.event) assert.ok(result.policyEvents?.includes(probe.event), `${probe.id} missing observed control event`);
  assert.equal(result.cleanup.confirmed, true); assert.ok(originalUnchanged && revisionUnchanged && suiteUnchanged);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
  summary.push({ id: probe.id, outcome: result.outcome, reason: result.reason, policyEvents: result.policyEvents, receiptDigest: result.receiptDigest });
}
await writeFile(join(root, 'summary.json'), `${JSON.stringify({ cases: summary, liveModelQualityClaim: false }, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ verified: true, root })}\n`);
