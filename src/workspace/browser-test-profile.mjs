import { readFile, stat } from 'node:fs/promises';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { buildBrowserRunnerDescriptor, verifyBrowserRunnerDescriptor, verifyBrowserRunnerPolicy, verifyBrowserTestSuite } from './browser-test-contracts.mjs';

export const ORIGIN = 'https://godagent.invalid';
export const REQUEST_MAX = 6 * 1024 * 1024;
export const ENV_POLICY = Object.freeze({ schemaVersion: 1,
  keys: ['APPDATA', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE', 'SystemRoot', 'TEMP', 'TMP', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR'],
  path: 'system32-only', home: 'private-temp-root', username: 'godagent', domain: 'godagent', logonserver: 'local' });
export const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'";
export const LAUNCH_POLICY = Object.freeze({ schemaVersion: 1, headless: true, chromiumSandbox: true,
  host: '127.0.0.1', serviceWorkers: 'block', acceptDownloads: false, permissions: [], origin: ORIGIN, csp: CSP });
export const MIME = Object.freeze({ html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2' });
export const ensure = (condition, message) => { if (!condition) throw new TypeError(`browser runner ${message}`); };
export function exact(value, keys) {
  ensure(value && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), 'fields are invalid');
}
export const routeUrl = path => `${ORIGIN}/${path.split('/').map(encodeURIComponent).join('/')}`;
export function routeType(path) { const type = MIME[path.split('.').at(-1).toLowerCase()]; ensure(type, 'file type is unsupported'); return type; }

export async function describeRuntime({ runtime, policy, catalog, storePolicyDigest }) {
  const names = ['browser-test-runner.mjs', 'browser-test-worker.mjs', 'browser-test-profile.mjs', 'browser-test-runtime.mjs',
    'browser-test-contracts.mjs', 'revision-store.mjs', '../state/file-lock.mjs',
    '../core/errors.mjs', '../core/digest.mjs', '../core/canonical-json.mjs'];
  const sources = {};
  for (const name of names) {
    const url = new URL(name, import.meta.url); ensure((await stat(url)).size <= 1048576, 'source file exceeds limit');
    sources[name] = sha256Text(await readFile(url, 'utf8'));
  }
  return buildBrowserRunnerDescriptor({ schemaVersion: 1, protocolId: 'eternities-workspace-test-runner-v1', profile: policy.profile,
    runnerSourceDigest: sha256Value(sources), workerSourceDigest: sources['browser-test-worker.mjs'],
    nodeVersion: runtime.node.version, nodeExecutableDigest: runtime.node.file.sha256,
    driverVersion: runtime.driver.version, driverFiles: runtime.driver.files,
    browserVersion: runtime.browser.version, browserExecutable: runtime.browser.executable, browserEngineFiles: runtime.browser.engineFiles,
    runtimePinScope: 'named-driver-and-engine-files', nodeEnvironmentPolicyDigest: sha256Value(ENV_POLICY),
    browserEnvironmentPolicyDigest: sha256Value(ENV_POLICY), launchPolicyDigest: sha256Value(LAUNCH_POLICY),
    suiteCatalogDigest: sha256Value(catalog), storePolicyDigest, reviewedRevisionsDigest: sha256Value(policy.approvedRevisionDigests),
    limits: policy.limits });
}

export function validatePayload(request) {
  exact(request, ['schemaVersion', 'revision', 'runtime', 'policy', 'descriptor', 'catalog', 'suite', 'routes']);
  ensure(request.schemaVersion === 1, 'request version is invalid');
  const policy = verifyBrowserRunnerPolicy(request.policy), descriptor = verifyBrowserRunnerDescriptor(request.descriptor);
  const suite = verifyBrowserTestSuite(request.suite);
  ensure(Array.isArray(request.catalog) && request.catalog.length > 0 && request.catalog.length <= 16, 'suite catalog exceeds limit');
  const names = new Set(); let previous = '';
  for (const row of request.catalog) {
    exact(row, ['testId', 'testSuiteDigest']);
    ensure(typeof row.testId === 'string' && /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(row.testId)
      && typeof row.testSuiteDigest === 'string' && /^[a-f0-9]{64}$/.test(row.testSuiteDigest)
      && !names.has(row.testId) && row.testId > previous, 'catalog identity/order is invalid');
    names.add(row.testId); previous = row.testId;
  }
  ensure(request.catalog.some(row => row.testId === suite.testId && row.testSuiteDigest === suite.testSuiteDigest)
    && sha256Value(request.catalog) === descriptor.suiteCatalogDigest, 'suite is not in pinned catalog');
  const revision = request.revision;
  exact(revision, ['revisionDigest', 'parentDigest', 'files', 'totalBytes']);
  ensure(typeof revision.revisionDigest === 'string' && policy.approvedRevisionDigests.includes(revision.revisionDigest), 'revision is not host approved');
  ensure(revision.parentDigest === null || typeof revision.parentDigest === 'string' && /^[a-f0-9]{64}$/.test(revision.parentDigest), 'parent digest is invalid');
  ensure(Array.isArray(revision.files) && revision.files.length > 0 && revision.files.length <= policy.limits.maxFiles
    && Array.isArray(request.routes) && request.routes.length === revision.files.length, 'route count exceeds approved limit');
  const routes = new Map(); let total = 0;
  for (let i = 0; i < revision.files.length; i++) {
    const file = revision.files[i], row = request.routes[i];
    exact(file, ['path', 'sha256', 'bytes']); exact(row, ['path', 'body']);
    ensure(typeof file.path === 'string' && row.path === file.path && typeof row.body === 'string', 'route identity is invalid');
    ensure(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= policy.limits.maxAppBytes, 'route bytes exceed limit');
    const bytes = Buffer.from(row.body, 'base64');
    ensure(bytes.toString('base64') === row.body && bytes.length === file.bytes, 'route encoding/size mismatch');
    // Byte digests use the same SHA-256 as the revision store, without decoding text.
    total += bytes.length; ensure(total <= policy.limits.maxAppBytes, 'app bytes exceed limit');
    const url = routeUrl(file.path); ensure(!routes.has(url), 'routes collide');
    routes.set(url, { bytes, contentType: routeType(file.path), sha256: file.sha256 });
  }
  ensure(total === revision.totalBytes && routes.has(routeUrl(suite.entryPath)), 'app byte total or entry route differs');
  const unsigned = { schemaVersion: 1, protocolId: 'eternities-workspace-revision-v1', storePolicyDigest: descriptor.storePolicyDigest,
    parentDigest: revision.parentDigest, files: revision.files, totalBytes: total };
  ensure(sha256Value(unsigned) === revision.revisionDigest, 'revision manifest digest mismatch');
  return { policy, descriptor, suite, routes };
}
