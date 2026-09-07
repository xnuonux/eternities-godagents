import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { verifyEffectOnlyExecutable, verifyEffectOnlyVerifier } from '../../src/skills/effect-only-executable-verifier.mjs';
import { createEffectOnlyProcessAdapters } from '../../src/skills/effect-only-process-adapters.mjs';
import { createEffectOnlyRoutingJournal } from '../../src/skills/effect-only-routing-journal.mjs';
import { sha256Value } from '../../src/core/digest.mjs';

// Frozen offline evidence pins; not adopted host policy or agent admission.
const routePin = { protocolId: 'eternities-godskills-effect-only-executable-v2',
  executableReceipt: { path: 'receipts/effect-only-executable-v2.json', sha256: 'f4baee63d9d802f7a985b5570deb81bbf174dbad3d7aea3d3aba67d546851e04', receiptDigest: '03fe45aeb133b715354174867a05781fac9b3cfa5353edf020cecdafa1a88a73' },
  entrypoint: { path: 'scripts/effect-only-v2.mjs', sha256: '12ae69b74a412ba711a1ae630eec0fc3bb3181a4a18df1810857a4e49df1ab3b' } };
const verifyPin = { protocolId: 'eternities-godskills-effect-only-verifier-v2',
  executableReceipt: { path: 'receipts/effect-only-verifier-v2.json', sha256: '1e027c1061fdb5bb482aae9d1a09409ba70ccb9f87bd834784fb3cf95e8f427a', receiptDigest: 'a4c2ef29dc626d45e57cce361185b5c43a6065dd602236fe38385cc28b025f81' },
  entrypoint: { path: 'scripts/verify-effect-only-v2.mjs', sha256: 'bedfcf57bcff9b7d780c30c933cdef709a4a5c042973449d07fe0a4cc78857a8' } };
const [sourceRoot, existingParent] = process.argv.slice(2);
if (!sourceRoot || !existingParent || process.argv.length !== 4) throw new Error('requires source-root existing-output-parent');
const routingExecutable = await verifyEffectOnlyExecutable({ repositoryRoot: sourceRoot, pin: routePin });
const verifierExecutable = await verifyEffectOnlyVerifier({ repositoryRoot: sourceRoot, pin: verifyPin, routingExecutable });
const vectorBytes = await readFile(join(resolve(sourceRoot), 'data/effect-only-golden-vector-v2.json'));
assert.equal(createHash('sha256').update(vectorBytes).digest('hex'), '55817a3754c4f55247f5dba77a0f4f361bb13a3b90a204c6a05566bc6e872420');
const vector = JSON.parse(vectorBytes);
const parent = resolve(existingParent);
const pathKey = p => process.platform === 'win32' ? p.toLowerCase() : p;
assert.equal(pathKey(await realpath(parent)), pathKey(parent), 'output parent is canonical');
const root = await mkdtemp(join(parent, 'journal-smoke-'));
const adapters = await createEffectOnlyProcessAdapters({ routingExecutable, verifierExecutable, snapshotParent: root });
const journal = createEffectOnlyRoutingJournal({ root, ...adapters,
  routingReceiptDigest: routePin.executableReceipt.receiptDigest, verifierReceiptDigest: verifyPin.executableReceipt.receiptDigest });
const input = { slotId: 'frozen-golden-vector', request: vector.request, expectedSource: vector.expectedSource,
  hostBindingDigest: sha256Value({ scope: 'offline-smoke-not-agent-admission', request: vector.request }) };
const first = await journal.run(input);
assert.equal(first.status, 'no-qualified-route');
const recovered = await journal.run(input);
assert.deepEqual(recovered, first);
assert.deepEqual(adapters.counters(), { routingSubprocesses: 1, verificationSubprocesses: 2 });
const report = { schemaVersion: 1, kind: 'offline-effect-only-journal-smoke', status: 'passed', root,
  completionDigest: first.completion.completionDigest, resultDigest: first.completion.resultDigest,
  resultFileDigest: first.completion.resultFileDigest, ...adapters.counters(), nativeInferences: 0,
  hostPolicyAdoption: false, proofLimit: 'frozen-golden-journal-interop-not-authenticated-vessel-or-task-quality' };
await writeFile(join(root, 'journal-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report));
