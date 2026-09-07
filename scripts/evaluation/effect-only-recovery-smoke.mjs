import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { verifyEffectOnlyExecutable, verifyEffectOnlyVerifier, materializeEffectOnlyExecutable } from '../../src/skills/effect-only-executable-verifier.mjs';

// Pinned offline recovery interoperability probe, not host policy adoption.
const routingPin = { protocolId: 'eternities-godskills-effect-only-executable-v2',
  executableReceipt: { path: 'receipts/effect-only-executable-v2.json', sha256: 'f4baee63d9d802f7a985b5570deb81bbf174dbad3d7aea3d3aba67d546851e04', receiptDigest: '03fe45aeb133b715354174867a05781fac9b3cfa5353edf020cecdafa1a88a73' },
  entrypoint: { path: 'scripts/effect-only-v2.mjs', sha256: '12ae69b74a412ba711a1ae630eec0fc3bb3181a4a18df1810857a4e49df1ab3b' } };
const verifierPin = { protocolId: 'eternities-godskills-effect-only-verifier-v2',
  executableReceipt: { path: 'receipts/effect-only-verifier-v2.json', sha256: '1e027c1061fdb5bb482aae9d1a09409ba70ccb9f87bd834784fb3cf95e8f427a', receiptDigest: 'a4c2ef29dc626d45e57cce361185b5c43a6065dd602236fe38385cc28b025f81' },
  entrypoint: { path: 'scripts/verify-effect-only-v2.mjs', sha256: 'bedfcf57bcff9b7d780c30c933cdef709a4a5c042973449d07fe0a4cc78857a8' } };
const [sourceRoot, originalRoot, snapshotParent] = process.argv.slice(2);
if (!sourceRoot || !originalRoot || !snapshotParent || process.argv.length !== 5) throw new Error('requires source-root original-smoke-root existing-snapshot-parent');
const routingExecutable = await verifyEffectOnlyExecutable({ repositoryRoot: sourceRoot, pin: routingPin });
const sidecar = await verifyEffectOnlyVerifier({ repositoryRoot: sourceRoot, pin: verifierPin, routingExecutable });
const snapshot = await materializeEffectOnlyExecutable({ verifiedExecutable: sidecar, parent: snapshotParent });
const inputPaths = ['request.json', 'expected-source.json', 'result.json'].map(p => join(resolve(originalRoot), p));
const hash = b => createHash('sha256').update(b).digest('hex');
const before = await Promise.all(inputPaths.map(async p => hash(await readFile(p))));
const env = {};
for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
const child = spawnSync(process.execPath, [snapshot.entrypoint, '--request', inputPaths[0],
  '--expected-source', inputPaths[1], '--result', inputPaths[2]],
{ cwd: snapshot.root, env, windowsHide: true, shell: false, timeout: 5000, maxBuffer: 4096 });
assert.ok(!child.error && child.status === 0, 'isolated recovery verification succeeds');
assert.equal(child.stdout.length, 0);
assert.equal(child.stderr.length, 0);
assert.deepEqual(await Promise.all(inputPaths.map(async p => hash(await readFile(p)))), before, 'original input/result bytes unchanged');
const report = { schemaVersion: 1, kind: 'offline-effect-only-recovery-smoke', status: 'passed',
  routingReceiptDigest: routingPin.executableReceipt.receiptDigest,
  verifierReceiptDigest: verifierPin.executableReceipt.receiptDigest,
  originalRoot: resolve(originalRoot), snapshotRoot: snapshot.root, originalFileDigests: before,
  verificationSubprocesses: 1, routingSubprocesses: 0, nativeInferences: 0, effectDispatches: 0,
  hostPolicyAdoption: false, proofLimit: 'single-saved-golden-result-not-vessel-recovery-or-live-quality' };
await writeFile(join(snapshot.root, 'recovery-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report));
