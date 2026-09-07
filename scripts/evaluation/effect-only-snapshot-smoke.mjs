import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyEffectOnlyExecutable, materializeEffectOnlyExecutable } from '../../src/skills/effect-only-executable-verifier.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';

// Offline interoperability probe only. These externally reviewed pins are NOT
// installed host policy, and successful routing is not permission to run a model.
const pin = {
  protocolId: 'eternities-godskills-effect-only-executable-v2',
  executableReceipt: { path: 'receipts/effect-only-executable-v2.json',
    sha256: 'f4baee63d9d802f7a985b5570deb81bbf174dbad3d7aea3d3aba67d546851e04',
    receiptDigest: '03fe45aeb133b715354174867a05781fac9b3cfa5353edf020cecdafa1a88a73' },
  entrypoint: { path: 'scripts/effect-only-v2.mjs',
    sha256: '12ae69b74a412ba711a1ae630eec0fc3bb3181a4a18df1810857a4e49df1ab3b' },
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [sourceRoot, outputParent] = process.argv.slice(2);
if (!sourceRoot || !outputParent || process.argv.length !== 4) {
  throw new Error('usage: effect-only-snapshot-smoke.mjs source-root output-parent');
}
const parent = resolve(outputParent);
// Require an existing host-owned canonical parent; materialization validates it.
const verified = await verifyEffectOnlyExecutable({ repositoryRoot: resolve(sourceRoot), pin });
const snapshot = await materializeEffectOnlyExecutable({ verifiedExecutable: verified, parent });
async function vector(role) {
  const reference = verified.receipt.vectors.find(row => row.role === role);
  assert.ok(reference && ['data/effect-only-golden-vector-v2.json', 'data/effect-only-result-v2.json'].includes(reference.path));
  const bytes = await readFile(join(resolve(sourceRoot), reference.path));
  assert.equal(hash(bytes), reference.sha256, 'pinned vector bytes match');
  return JSON.parse(bytes);
}
const input = await vector('input');
const expected = await vector('result');
const requestPath = join(snapshot.root, 'request.json');
const expectedSourcePath = join(snapshot.root, 'expected-source.json');
const resultPath = join(snapshot.root, 'result.json');
await writeFile(requestPath, JSON.stringify(input.request), { flag: 'wx' });
await writeFile(expectedSourcePath, JSON.stringify(input.expectedSource), { flag: 'wx' });
const env = {};
for (const name of ['SystemRoot', 'WINDIR']) if (process.env[name]) env[name] = process.env[name];
const child = spawnSync(process.execPath, [snapshot.entrypoint,
  '--request', requestPath, '--expected-source', expectedSourcePath, '--output', resultPath],
{ cwd: snapshot.root, env, shell: false, windowsHide: true, timeout: 5000, maxBuffer: 4096 });
// Never print captured child bodies or native error objects.
assert.ok(!child.error && child.status === 0, 'isolated executable exits successfully');
const result = JSON.parse(await readFile(resultPath, 'utf8'));
assert.equal(canonicalJson(result), canonicalJson(expected), 'actual subprocess matches pinned result vector');
const report = { schemaVersion: 1, kind: 'offline-effect-only-snapshot-smoke',
  status: 'passed', sourceCommit: verified.receipt.sourceCommit,
  receiptDigest: verified.receipt.receiptDigest, snapshotRoot: snapshot.root,
  modules: verified.sources.length, resultDigest: hash(canonicalJson(result)),
  providerCalls: 0, hostPolicyAdoption: false, missionLaunch: false,
  proofLimit: 'single-golden-vector-not-general-language-or-live-quality' };
await writeFile(join(snapshot.root, 'smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report));
