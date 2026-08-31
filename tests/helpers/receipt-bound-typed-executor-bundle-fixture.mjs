import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';

function executorId(bundleId, capabilityId, moduleSha256) {
  return sha256Value({
    protocolId: 'eternities-receipt-bound-typed-executor-identity-v1',
    bundleId,
    capabilityId,
    moduleSha256,
  });
}

function museSource(bundleId) {
  return `// exact certification module ${bundleId}
let calls = 0;
export async function execute(input) {
  calls += 1;
  if (calls > 1) throw new Error('receipt-bound Muse replayed unexpectedly');
  return {
    schemaVersion: 1,
    capabilityId: 'eternities-muse',
    missionId: input.missionId,
    slots: {
      'visual-direction': { direction: 'receipt-bound-white-fire' },
      'visual-system': { visualPrimitives: ['luminance', 'motion'] },
      'specialist-handoff': { target: 'eternities-forge' },
      'acceptance-boundary': {
        invariants: ['activation-bound', 'receipt-bound-executor'],
        rejectionCriteria: ['caller-executor', 'unverified-module'],
      },
    },
  };
}
`;
}

function forgeSource(bundleId, crashForgeOnce) {
  return `// exact certification module ${bundleId}
let calls = 0;
export async function execute(input) {
  calls += 1;
  ${crashForgeOnce ? "if (calls === 1) throw new Error('receipt-bound certification crash after persisted Muse output');" : ''}
  if (calls > ${crashForgeOnce ? 2 : 1}) throw new Error('receipt-bound Forge replayed unexpectedly');
  return {
    schemaVersion: 1,
    capabilityId: 'eternities-forge',
    missionId: input.missionId,
    slots: {
      implementation: { status: 'verified' },
      'claim-evidence-ledger': { claims: 3, evidence: 3 },
      'review-disposition': { disposition: 'accepted' },
      'integration-state': { state: 'ready' },
    },
  };
}
`;
}

export async function receiptBoundExecutorBundleFixture(context, { crashForgeOnce = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-receipt-bound-bundle-'));
  if (context) context.after(() => rm(root, { recursive: true, force: true }));
  const bundleId = `certification:${randomUUID()}`;
  await mkdir(join(root, 'executors'), { recursive: true });
  await mkdir(join(root, 'receipts'), { recursive: true });
  const sources = {
    'eternities-forge': forgeSource(bundleId, crashForgeOnce),
    'eternities-muse': museSource(bundleId),
  };
  const executors = [];
  for (const capabilityId of Object.keys(sources).sort()) {
    const source = sources[capabilityId];
    const moduleSha256 = sha256Text(source);
    const path = `executors/${capabilityId}.mjs`;
    await writeFile(join(root, ...path.split('/')), source, 'utf8');
    executors.push({
      capabilityId,
      module: { path, sha256: moduleSha256, bytes: Buffer.byteLength(source) },
      descriptor: {
        schemaVersion: 1,
        protocolId: 'eternities-typed-capability-executor-v1',
        executorId: executorId(bundleId, capabilityId, moduleSha256),
        capabilityId,
        authority: [],
        maximumInputBytes: 65_536,
        maximumOutputBytes: 65_536,
      },
    });
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-receipt-bound-typed-executor-bundle-v1',
    bundleId,
    status: 'verified-build',
    executors,
    proofLimits: [
      'executor modules run in the Node process and are not an operating-system sandbox',
      'external exactly-once effects remain unproved',
    ],
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  const receiptPath = 'receipts/executor-bundle-v1.json';
  const receiptText = `${canonicalJson(receipt)}\n`;
  await writeFile(join(root, ...receiptPath.split('/')), receiptText, 'utf8');
  return {
    repositoryRoot: root,
    receiptPath,
    expectedSha256: sha256Text(receiptText),
    receipt,
    descriptors: executors.map(({ descriptor }) => structuredClone(descriptor)),
  };
}

export async function bindBundleToAdmittedFixture(fixture, bundle) {
  fixture.policy.runtime.executors = structuredClone(bundle.descriptors);
  const text = `${canonicalJson(fixture.policy)}\n`;
  await writeFile(fixture.policyPath, text, 'utf8');
  fixture.common.env.GODAGENT_TYPED_EXECUTION_POLICY_SHA256 = sha256Text(canonicalJson(fixture.policy));
  fixture.common.env.GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256 = bundle.expectedSha256;
  return {
    admissionRoot: fixture.common.admissionRoot,
    policyPath: fixture.common.policyPath,
    executorBundleRoot: bundle.repositoryRoot,
    executorBundleReceiptPath: bundle.receiptPath,
    request: fixture.request,
    env: fixture.common.env,
  };
}
