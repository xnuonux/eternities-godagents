import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

// Exercise the actual CLI orchestration and filesystem publication. Only the
// expensive git, test-suite and certificate-construction boundaries are doubles.
const [sourcePath, root, outcome] = process.argv.slice(2);
const artifactPath = path.join(root, 'integrations/cross-repository-current-head-v2.json');
const scriptPath = path.join(root, 'scripts/build-cross-repository-current-head-v2.mjs');
const scriptUrl = url.pathToFileURL(scriptPath).href;
const skillsRoot = path.join(root, 'godskills');
const before = await fs.readFile(artifactPath, 'utf8');
const events = [];
const cleanChecks = new Map();
const headChecks = new Map();
const rootName = (rootPath) => rootPath === skillsRoot ? 'godskills' : 'godagents';
const observe = async (phase) => {
  events.push({ phase, unchanged: await fs.readFile(artifactPath, 'utf8') === before });
  if (outcome === phase) throw new Error(`controlled ${phase} failure`);
};
const execFile = () => {};
execFile[promisify.custom] = async (_command, args) => {
  const name = rootName(args[1]);
  if (args.at(-1) === 'HEAD') {
    const count = (headChecks.get(name) ?? 0) + 1;
    headChecks.set(name, count);
    if (outcome === `drift-post-${name}` && count > 1) {
      return { stdout: `${'d'.repeat(40)}\n`, stderr: '' };
    }
  }
  return { stdout: `${'a'.repeat(40)}\n`, stderr: '' };
};
const requireCleanExcept = async (rootPath, allowed) => {
  const name = rootName(rootPath);
  const count = (cleanChecks.get(name) ?? 0) + 1;
  cleanChecks.set(name, count);
  if (name === 'godskills' && allowed.length !== 0) throw new Error('Godskills must have no dirty-file whitelist');
  if (outcome === `dirty-${name}-${count === 1 ? 'pre' : 'post'}`) {
    throw new Error(`controlled ${outcome} failure`);
  }
};
const fakeRunTests = async (files, cwd) => {
  const phase = cwd === skillsRoot ? 'godskills' : files.length === 0 ? 'full' : 'focused';
  await observe(phase);
  if (outcome === 'interrupt' && phase === 'full') {
    process.stdout.write('waiting-for-interruption\n');
    await new Promise(() => setInterval(() => {}, 1000));
  }
  return { status: 'pass', tests: { godskills: 3, full: 17, focused: 5 }[phase] };
};
const doubles = {
  'node:child_process': { execFile },
  'node:fs/promises': {
    ...fs,
    rename: async (...args) => {
      if (outcome === 'publish') throw new Error('controlled publish failure');
      return fs.rename(...args);
    },
  },
  'node:path': path,
  'node:url': url,
  'node:crypto': crypto,
  'node:util': { promisify },
  '../src/core/canonical-json.mjs': { canonicalJson: JSON.stringify },
  '../src/integration/current-head-certificate.mjs': {
    CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_DOCUMENT: 'existing certification\n',
    CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH: 'docs/cross-repository-current-head-v2-certification.md',
    CROSS_REPOSITORY_CURRENT_HEAD_V2_ARTIFACT_PATH: 'integrations/cross-repository-current-head-v2.json',
    buildCrossRepositoryCurrentHeadCertificateV2: async ({ testRuns }) => ({
      status: 'certified', testRuns, receiptDigest: 'b'.repeat(64),
    }),
    verifyCrossRepositoryCurrentHeadCertificateV2: async () => {
      await observe('verify');
      return { status: 'verified', receiptDigest: 'b'.repeat(64) };
    },
  },
  './lib/certification-support.mjs': { requireCleanExcept, runTests: fakeRunTests },
  './lib/pinned-godskills-review-release.mjs': {
    pinnedGodskillsReviewRelease: () => ({}), pinnedGodskillsReviewSourceCommit: 'c'.repeat(40),
  },
};
const context = createContext({
  process: {
    argv: [process.execPath, scriptPath],
    env: { ETERNITIES_GODSKILLS_ROOT: skillsRoot },
    stdout: { write() {} },
    stderr: { write() {} },
    pid: process.pid,
  },
  Buffer,
});
const module = new SourceTextModule(await fs.readFile(sourcePath, 'utf8'), {
  context, identifier: scriptUrl, initializeImportMeta(meta) { meta.url = scriptUrl; },
});
await module.link((specifier) => {
  const exports = doubles[specifier];
  if (!exports) throw new Error(`unexpected dependency: ${specifier}`);
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
});
let error = null;
try { await module.evaluate(); } catch (failure) { error = failure.message; }
process.stdout.write(`${JSON.stringify({ error, events })}\n`);
