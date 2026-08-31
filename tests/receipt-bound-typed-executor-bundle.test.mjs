import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertVerifiedReceiptBoundTypedExecutorBundle,
  instantiateVerifiedReceiptBoundTypedExecutors,
  verifyReceiptBoundTypedExecutorBundle,
} from '../src/runtime/receipt-bound-typed-executor-bundle.mjs';

const protocolId = 'eternities-receipt-bound-typed-executor-bundle-v1';
const bundleId = 'deterministic-visual-executors-v1';

const moduleSources = Object.freeze({
  'eternities-forge': `export async function execute(input) {
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
`,
  'eternities-muse': `export async function execute(input) {
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
`,
});

function executorIdentity(capabilityId, moduleSha256) {
  return sha256Value({
    protocolId: 'eternities-receipt-bound-typed-executor-identity-v1',
    bundleId,
    capabilityId,
    moduleSha256,
  });
}

async function bundleFixture(t, selectedBundleId = bundleId) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-executor-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executors = [];
  for (const capabilityId of Object.keys(moduleSources).sort()) {
    const source = moduleSources[capabilityId];
    const path = `executors/${capabilityId}.mjs`;
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(root, 'executors'), { recursive: true }));
    await writeFile(join(root, ...path.split('/')), source, 'utf8');
    const moduleSha256 = sha256Text(source);
    executors.push({
      capabilityId,
      module: { path, sha256: moduleSha256, bytes: Buffer.byteLength(source) },
      descriptor: {
        schemaVersion: 1,
        protocolId: 'eternities-typed-capability-executor-v1',
        executorId: sha256Value({
          protocolId: 'eternities-receipt-bound-typed-executor-identity-v1',
          bundleId: selectedBundleId,
          capabilityId,
          moduleSha256,
        }),
        capabilityId,
        authority: [],
        maximumInputBytes: 65_536,
        maximumOutputBytes: 65_536,
      },
    });
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    bundleId: selectedBundleId,
    status: 'verified-build',
    executors,
    proofLimits: [
      'executor modules run in the Node process and are not an operating-system sandbox',
      'external exactly-once effects remain unproved',
    ],
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  const receiptPath = 'receipts/executor-bundle-v1.json';
  await import('node:fs/promises').then(({ mkdir }) => mkdir(join(root, 'receipts'), { recursive: true }));
  const receiptText = `${canonicalJson(receipt)}\n`;
  await writeFile(join(root, ...receiptPath.split('/')), receiptText, 'utf8');
  return {
    repositoryRoot: root,
    receipt,
    receiptPath,
    expectedSha256: sha256Text(receiptText),
  };
}

function verificationInput(fixture) {
  return {
    repositoryRoot: fixture.repositoryRoot,
    receiptPath: fixture.receiptPath,
    expectedSha256: fixture.expectedSha256,
  };
}

test('loads exact receipt-bound executor bytes into privately branded frozen handles', async (t) => {
  const fixture = await bundleFixture(t);
  const bundle = await verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture));
  assert.equal(assertVerifiedReceiptBoundTypedExecutorBundle(bundle), bundle);
  assert.equal(bundle.receiptDigest, fixture.receipt.receiptDigest);
  assert.deepEqual(bundle.descriptors.map(({ capabilityId }) => capabilityId), [
    'eternities-forge', 'eternities-muse',
  ]);
  const executors = await instantiateVerifiedReceiptBoundTypedExecutors({
    bundle,
    expectedDescriptors: bundle.descriptors,
  });
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.descriptors));
  assert.ok(Object.isFrozen(executors));
  assert.ok(Object.isFrozen(executors[0]));
  assert.ok(Object.isFrozen(executors[0].descriptor()));
  assert.equal((await executors[1].execute({ missionId: 'mission-1' })).capabilityId, 'eternities-muse');
  assert.throws(() => assertVerifiedReceiptBoundTypedExecutorBundle({ ...bundle }), /provenance brand/);
});

test('fails before import when receipt or module bytes drift', async (t) => {
  const fixture = await bundleFixture(t);
  await writeFile(
    join(fixture.repositoryRoot, 'executors', 'eternities-muse.mjs'),
    `${moduleSources['eternities-muse']}\n`,
    'utf8',
  );
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture)),
    /module (byte count|digest) mismatch/,
  );

  const fresh = await bundleFixture(t);
  const text = await readFile(join(fresh.repositoryRoot, ...fresh.receiptPath.split('/')), 'utf8');
  await writeFile(join(fresh.repositoryRoot, ...fresh.receiptPath.split('/')), text.replace('verified-build', 'changed-build'));
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(fresh)), /receipt file digest mismatch/);
});

test('rejects imported dependencies, changed descriptors, and expanded public fields', async (t) => {
  const imported = await bundleFixture(t);
  const source = `import fs from 'node:fs';\n${moduleSources['eternities-muse']}`;
  const moduleRow = imported.receipt.executors.find(({ capabilityId }) => capabilityId === 'eternities-muse');
  moduleRow.module.sha256 = sha256Text(source);
  moduleRow.module.bytes = Buffer.byteLength(source);
  moduleRow.descriptor.executorId = executorIdentity('eternities-muse', moduleRow.module.sha256);
  const { receiptDigest: ignored, ...unsigned } = imported.receipt;
  imported.receipt.receiptDigest = sha256Value(unsigned);
  const receiptText = `${canonicalJson(imported.receipt)}\n`;
  imported.expectedSha256 = sha256Text(receiptText);
  await writeFile(join(imported.repositoryRoot, 'executors', 'eternities-muse.mjs'), source);
  await writeFile(join(imported.repositoryRoot, ...imported.receiptPath.split('/')), receiptText);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(imported)), /dependencies are forbidden/);

  const changed = await bundleFixture(t);
  changed.receipt.executors[0].descriptor.executorId = 'caller-selected';
  const { receiptDigest: oldDigest, ...changedUnsigned } = changed.receipt;
  changed.receipt.receiptDigest = sha256Value(changedUnsigned);
  const changedText = `${canonicalJson(changed.receipt)}\n`;
  changed.expectedSha256 = sha256Text(changedText);
  await writeFile(join(changed.repositoryRoot, ...changed.receiptPath.split('/')), changedText);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(changed)), /executor identity mismatch/);

  const expanded = await bundleFixture(t);
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle({ ...verificationInput(expanded), io: {} }),
    /input fields are invalid/,
  );
});

test('rejects changed module exports and noncanonical receipt paths', async (t) => {
  const changed = await bundleFixture(t);
  const source = `${moduleSources['eternities-forge']}\nexport const extra = true;\n`;
  const row = changed.receipt.executors[0];
  row.module.sha256 = sha256Text(source);
  row.module.bytes = Buffer.byteLength(source);
  row.descriptor.executorId = executorIdentity(row.capabilityId, row.module.sha256);
  const { receiptDigest: ignored, ...unsigned } = changed.receipt;
  changed.receipt.receiptDigest = sha256Value(unsigned);
  const receiptText = `${canonicalJson(changed.receipt)}\n`;
  changed.expectedSha256 = sha256Text(receiptText);
  await writeFile(join(changed.repositoryRoot, ...row.module.path.split('/')), source);
  await writeFile(join(changed.repositoryRoot, ...changed.receiptPath.split('/')), receiptText);
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle(verificationInput(changed)),
    /must contain only one async execute declaration/,
  );
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle({
      ...verificationInput(changed),
      receiptPath: '../outside.json',
    }),
    /canonical repository-relative path/,
  );
});

test('comment-separated dynamic imports fail syntactic closure before module evaluation', async (t) => {
  const fixture = await bundleFixture(t);
  const source = `export async function execute(input) { return import/* bypass */('node:path'); }\n`;
  const row = fixture.receipt.executors[0];
  row.module.sha256 = sha256Text(source);
  row.module.bytes = Buffer.byteLength(source);
  row.descriptor.executorId = executorIdentity(row.capabilityId, row.module.sha256);
  const { receiptDigest: ignored, ...unsigned } = fixture.receipt;
  fixture.receipt.receiptDigest = sha256Value(unsigned);
  const receiptText = `${canonicalJson(fixture.receipt)}\n`;
  fixture.expectedSha256 = sha256Text(receiptText);
  await writeFile(join(fixture.repositoryRoot, ...row.module.path.split('/')), source);
  await writeFile(join(fixture.repositoryRoot, ...fixture.receiptPath.split('/')), receiptText);
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture)),
    /dependencies are forbidden/,
  );
});

test('module instances are isolated by bundle and capability identity', async (t) => {
  const leftFixture = await bundleFixture(t, 'deterministic-visual-executors-left-v1');
  const rightFixture = await bundleFixture(t, 'deterministic-visual-executors-right-v1');
  const left = await verifyReceiptBoundTypedExecutorBundle(verificationInput(leftFixture));
  const right = await verifyReceiptBoundTypedExecutorBundle(verificationInput(rightFixture));
  const leftExecutors = await instantiateVerifiedReceiptBoundTypedExecutors({
    bundle: left, expectedDescriptors: left.descriptors,
  });
  const rightExecutors = await instantiateVerifiedReceiptBoundTypedExecutors({
    bundle: right, expectedDescriptors: right.descriptors,
  });
  assert.notEqual(leftExecutors[0].execute, rightExecutors[0].execute);
  await assert.rejects(
    instantiateVerifiedReceiptBoundTypedExecutors({
      bundle: left, expectedDescriptors: right.descriptors,
    }),
    /not authorized by admitted policy/,
  );
});

test('an observed symbolic-link bundle root is rejected before receipt loading', async (t) => {
  const fixture = await bundleFixture(t);
  const parent = await mkdtemp(join(tmpdir(), 'godagents-executor-alias-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const alias = join(parent, 'bundle-link');
  await symlink(fixture.repositoryRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle({
      ...verificationInput(fixture),
      repositoryRoot: alias,
    }),
    /not a real directory|non-canonical alias/,
  );
});

test('top-level module behavior is rejected inertly before any evaluation', async (t) => {
  const fixture = await bundleFixture(t);
  const marker = `__receiptBoundTopLevel_${Date.now()}`;
  const source = `export async function execute(input) { const expression = /{/; return input; }
{ globalThis[${JSON.stringify(marker)}] = true; /}/; }
`;
  const row = fixture.receipt.executors[0];
  row.module.sha256 = sha256Text(source);
  row.module.bytes = Buffer.byteLength(source);
  row.descriptor.executorId = executorIdentity(row.capabilityId, row.module.sha256);
  const { receiptDigest: ignored, ...unsigned } = fixture.receipt;
  fixture.receipt.receiptDigest = sha256Value(unsigned);
  const receiptText = `${canonicalJson(fixture.receipt)}\n`;
  fixture.expectedSha256 = sha256Text(receiptText);
  await writeFile(join(fixture.repositoryRoot, ...row.module.path.split('/')), source);
  await writeFile(join(fixture.repositoryRoot, ...fixture.receiptPath.split('/')), receiptText);
  try {
    await assert.rejects(
      verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture)),
      /must contain only one async execute declaration/,
    );
    assert.equal(globalThis[marker], undefined);
  } finally {
    delete globalThis[marker];
  }
});
