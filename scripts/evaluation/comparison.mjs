import { open, readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { captureComparisonFiles } from './comparison-files.mjs';
import { verifyPreparedComparison } from './comparison-preparation.mjs';
import { resolveComparisonOracle } from './comparison-oracles.mjs';
import { createBoundedDispatch } from './dispatch.mjs';
import { runBaseline } from './baseline.mjs';
import { runGodagent } from './godagent.mjs';
import { diagnosticFailure } from './attempt.mjs';
import { runLocalWorkflow } from '../../examples/local-artifact-workflow/run.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';

const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
const syntheticCredential = 'controlled-comparison-not-an-account-key';

async function loadPreparation(path, digest) {
  if (typeof path !== 'string' || !/^[a-f0-9]{64}$/.test(digest ?? '')) throw new Error('comparison preparation reference invalid');
  const resolved = resolve(path);
  if (key(await realpath(resolved)) !== key(resolved)) throw new Error('comparison preparation alias rejected');
  const file = await open(resolved, 'r');
  let bytes;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 12_582_912) throw new Error('comparison preparation exceeds bound');
    const buffer = Buffer.alloc(12_582_913);
    let size = 0;
    while (size < buffer.length) {
      const read = await file.read(buffer, size, buffer.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > 12_582_912) throw new Error('comparison preparation exceeds bound');
    bytes = buffer.subarray(0, size);
  } finally { await file.close(); }
  const text = bytes.toString('utf8');
  if (sha256Text(text) !== digest) throw new Error('comparison preparation digest mismatch');
  const record = JSON.parse(text);
  if (text !== `${canonicalJson(record)}\n` || record.schemaVersion !== 1
      || record.protocolId !== 'eternities-comparison-preparation-v1' || record.status !== 'prepared'
      || record.executionAuthorized !== false || key(record.directory) !== key(dirname(resolved))
      || sha256Value(record.preregistration) !== record.preregistrationDigest) throw new Error('comparison preparation binding invalid');
  return record;
}

// Explicit offline seam, not a live-provider entrypoint or source-closure
// certification. Only reserved test endpoints and a synthetic credential are
// admitted. Production account access requires a separately reviewed adapter.
export async function runControlledComparison({ preparationPath, preparationDigest, fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new Error('controlled comparison requires a test transport');
  const prepared = await loadPreparation(preparationPath, preparationDigest);
  const registration = prepared.preregistration;
  if (registration.schemaVersion !== 1
      || !['["baseline","godagent"]', '["godagent","baseline"]'].includes(canonicalJson(registration.armOrder))) throw new Error('comparison arm order invalid');
  const inspected = await verifyPreparedComparison(registration.comparison);
  if (canonicalJson(inspected) !== canonicalJson(prepared.inspected)) throw new Error('comparison workflow snapshot differs');
  const endpoint = new URL(inspected.envelope.endpoint);
  if (!endpoint.hostname.endsWith('.test') && !endpoint.hostname.endsWith('.invalid')) throw new Error('controlled comparison forbids live endpoints');
  const oracle = resolveComparisonOracle(registration.oracle.id);
  if (key(resolve(registration.oracle.source.path)) !== key(oracle.sourcePath)) throw new Error('comparison oracle source differs from fixed registry');
  if (canonicalJson(oracle.createTask(registration.comparison.task.input)) !== canonicalJson(registration.comparison.task)) throw new Error('comparison oracle task contract differs');
  const pins = [...registration.sources, registration.oracle.source];
  if (!pins.some(pin => key(resolve(pin.path)) === key(fileURLToPath(import.meta.url)))) throw new Error('comparison runner source pin missing');
  const sources = await captureComparisonFiles(pins);
  if (canonicalJson(sources) !== canonicalJson(prepared.sources)) throw new Error('comparison source snapshot differs');
  const root = join(prepared.directory, 'run');
  await mkdir(root, { mode: 0o700 });
  const arms = {};
  for (const arm of registration.armOrder) {
    const directory = join(root, arm);
    await mkdir(directory);
    const limits = inspected.envelope.allocations[arm];
    const started = performance.now();
    const transport = createBoundedDispatch({ endpoint: inspected.envelope.endpoint, model: inspected.envelope.model, ...limits }, { fetchImpl });
    let quality = { status: 'unscored', reason: 'no-completed-artifact' };
    let artifactDigest = null;
    let oracleInputDigest = null;
    const accept = async content => {
      const answer = { content };
      try { quality = { status: 'scored', ...oracle.score(registration.comparison.task, content) }; }
      catch { quality = { status: 'unscored', reason: 'oracle-error' }; }
      await writeFile(join(directory, 'answer.json'), `${canonicalJson(answer)}\n`, { flag: 'wx', flush: true });
      oracleInputDigest = sha256Value(answer);
      if (arm === 'baseline') artifactDigest = oracleInputDigest;
    };
    const result = arm === 'baseline'
      ? await runBaseline({ directory, model: inspected.envelope.model, maximumCompletionTokens: limits.maximumReservedTokens,
        maximumResponseBytes: limits.maximumResponseBytes,
        dispatch: () => transport.fetch(inspected.envelope.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${syntheticCredential}` }, body: canonicalJson(registration.comparison.baseline.request) }),
        assertResponseSafe: text => { if (text.includes(syntheticCredential)) throw diagnosticFailure('credential-reflection'); },
        acceptAnswer: answer => accept(answer.content) })
      : await runGodagent({ directory, maximumCompletionTokens: limits.maximumReservedTokens,
        runWorkflow: () => runLocalWorkflow({ manifestPath: registration.comparison.workflow.path, expectedManifestDigest: registration.comparison.workflow.sha256,
          env: { [inspected.providerPolicy.provider.credentialEnv]: syntheticCredential },
          createProviderPhaseHostImpl: options => createProviderPhaseHost({ ...options, fetchImpl: transport.fetch }) }),
        inspectCompleted: async workflow => {
          const artifact = JSON.parse(await readFile(workflow.artifact.path, 'utf8'));
          if (sha256Value(artifact) !== workflow.receipt.acceptedArtifactDigest) throw new Error('comparison artifact digest changed');
          await accept(artifact.content);
          artifactDigest = workflow.receipt.acceptedArtifactDigest;
        } });
    arms[arm] = { status: result.status, category: result.category ?? null, quality,
      elapsedMs: performance.now() - started, ...transport.snapshot(), usage: result.usage ?? null, artifactDigest, oracleInputDigest };
  }
  const report = { schemaVersion: 1, executionKind: 'controlled', preparationDigest,
    taskDigest: inspected.envelope.taskDigest, arms,
    comparable: Object.values(arms).every(arm => arm.status === 'completed' && arm.quality.status === 'scored') };
  await writeFile(join(root, 'result.json'), `${canonicalJson(report)}\n`, { flag: 'wx', flush: true });
  return report;
}
