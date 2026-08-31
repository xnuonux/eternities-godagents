import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
const programProtocolId = 'eternities-declarative-typed-executor-program-v1';
const identityProtocolId = 'eternities-receipt-bound-typed-executor-program-identity-v1';
const bundleId = 'deterministic-visual-executors-v1';

function executorIdentity(selectedBundleId, capabilityId, programSha256) {
  return sha256Value({ protocolId: identityProtocolId, bundleId: selectedBundleId, capabilityId, programSha256 });
}

function program(capabilityId, slots, delayMs = 0) {
  return {
    schemaVersion: 1,
    protocolId: programProtocolId,
    capabilityId,
    delayMs,
    outputTemplate: {
      schemaVersion: 1,
      capabilityId,
      missionId: { $input: 'missionId' },
      slots,
    },
  };
}

function fixturePrograms() {
  return {
    'eternities-forge': program('eternities-forge', {
      implementation: { status: 'verified' },
      'claim-evidence-ledger': { claims: 3, evidence: 3 },
      'review-disposition': { disposition: 'accepted' },
      'integration-state': { state: 'ready' },
    }),
    'eternities-muse': program('eternities-muse', {
      'visual-direction': { direction: 'receipt-bound-white-fire' },
      'visual-system': { visualPrimitives: ['luminance', 'motion'] },
      'specialist-handoff': { target: 'eternities-forge' },
      'acceptance-boundary': {
        invariants: ['activation-bound', 'receipt-bound-executor'],
        rejectionCriteria: ['caller-executor', 'unverified-program'],
      },
    }),
  };
}

async function rewriteReceipt(fixture) {
  const { receiptDigest: ignored, ...unsigned } = fixture.receipt;
  fixture.receipt.receiptDigest = sha256Value(unsigned);
  const receiptText = `${canonicalJson(fixture.receipt)}\n`;
  fixture.expectedSha256 = sha256Text(receiptText);
  await writeFile(join(fixture.repositoryRoot, ...fixture.receiptPath.split('/')), receiptText);
}

async function rewriteProgram(fixture, capabilityId, value, { canonical = true } = {}) {
  const row = fixture.receipt.executors.find((entry) => entry.capabilityId === capabilityId);
  const text = canonical ? `${canonicalJson(value)}\n` : value;
  row.program.sha256 = sha256Text(text);
  row.program.bytes = Buffer.byteLength(text);
  row.descriptor.executorId = executorIdentity(fixture.receipt.bundleId, capabilityId, row.program.sha256);
  await writeFile(join(fixture.repositoryRoot, ...row.program.path.split('/')), text);
  await rewriteReceipt(fixture);
}

async function bundleFixture(t, selectedBundleId = bundleId) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-executor-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'executors'), { recursive: true });
  await mkdir(join(root, 'receipts'), { recursive: true });
  const programs = fixturePrograms();
  const executors = [];
  for (const capabilityId of Object.keys(programs).sort()) {
    const text = `${canonicalJson(programs[capabilityId])}\n`;
    const programSha256 = sha256Text(text);
    const path = `executors/${capabilityId}.json`;
    await writeFile(join(root, ...path.split('/')), text);
    executors.push({
      capabilityId,
      program: { path, sha256: programSha256, bytes: Buffer.byteLength(text) },
      descriptor: {
        schemaVersion: 1,
        protocolId: 'eternities-typed-capability-executor-v1',
        executorId: executorIdentity(selectedBundleId, capabilityId, programSha256),
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
      'the host-owned declarative interpreter is trusted implementation',
      'external exactly-once effects remain unproved',
    ],
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  const receiptPath = 'receipts/executor-bundle-v1.json';
  const receiptText = `${canonicalJson(receipt)}\n`;
  await writeFile(join(root, ...receiptPath.split('/')), receiptText);
  return { repositoryRoot: root, receipt, receiptPath, expectedSha256: sha256Text(receiptText) };
}

function verificationInput(fixture) {
  return { repositoryRoot: fixture.repositoryRoot, receiptPath: fixture.receiptPath, expectedSha256: fixture.expectedSha256 };
}

test('loads exact receipt-bound declarative programs into privately branded frozen handles', async (t) => {
  const fixture = await bundleFixture(t);
  const bundle = await verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture));
  assert.equal(assertVerifiedReceiptBoundTypedExecutorBundle(bundle), bundle);
  assert.equal(bundle.receiptDigest, fixture.receipt.receiptDigest);
  assert.deepEqual(bundle.descriptors.map(({ capabilityId }) => capabilityId), ['eternities-forge', 'eternities-muse']);
  const executors = await instantiateVerifiedReceiptBoundTypedExecutors({ bundle, expectedDescriptors: bundle.descriptors });
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.descriptors));
  assert.ok(Object.isFrozen(executors));
  assert.ok(Object.isFrozen(executors[0]));
  assert.ok(Object.isFrozen(executors[0].descriptor()));
  assert.deepEqual(await executors[1].execute({ missionId: 'mission-1' }), {
    schemaVersion: 1,
    capabilityId: 'eternities-muse',
    missionId: 'mission-1',
    slots: fixturePrograms()['eternities-muse'].outputTemplate.slots,
  });
  assert.throws(() => assertVerifiedReceiptBoundTypedExecutorBundle({ ...bundle }), /provenance brand/);
});

test('fails when receipt or program bytes drift', async (t) => {
  const fixture = await bundleFixture(t);
  const path = join(fixture.repositoryRoot, 'executors', 'eternities-muse.json');
  await writeFile(path, `${await readFile(path, 'utf8')} `);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture)), /program (byte count|digest) mismatch/);

  const fresh = await bundleFixture(t);
  const receiptPath = join(fresh.repositoryRoot, ...fresh.receiptPath.split('/'));
  const text = await readFile(receiptPath, 'utf8');
  await writeFile(receiptPath, text.replace('verified-build', 'changed-build'));
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(fresh)), /receipt file digest mismatch/);
});

test('rejects descriptor drift, expanded verifier fields, and noncanonical receipt paths', async (t) => {
  const changed = await bundleFixture(t);
  changed.receipt.executors[0].descriptor.executorId = 'caller-selected';
  await rewriteReceipt(changed);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(changed)), /executor identity mismatch/);

  const expanded = await bundleFixture(t);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle({ ...verificationInput(expanded), io: {} }), /input fields are invalid/);
  await assert.rejects(
    verifyReceiptBoundTypedExecutorBundle({ ...verificationInput(expanded), receiptPath: '../outside.json' }),
    /canonical repository-relative path/,
  );
});

test('rejects noncanonical programs and expanded executable-shaped program fields', async (t) => {
  const noncanonical = await bundleFixture(t);
  const original = fixturePrograms()['eternities-forge'];
  await rewriteProgram(noncanonical, 'eternities-forge', `${canonicalJson(original)} \n`, { canonical: false });
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(noncanonical)), /not canonical JSON/);

  const expanded = await bundleFixture(t);
  const value = fixturePrograms()['eternities-forge'];
  value.source = "process.getBuiltinModule('node:fs')";
  await rewriteProgram(expanded, 'eternities-forge', value);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(expanded)), /program .*fields are invalid/);
});

test('javascript-looking strings remain inert data inside an admitted fixed template', async (t) => {
  const fixture = await bundleFixture(t);
  const value = fixturePrograms()['eternities-forge'];
  const marker = `__receiptBoundProgram_${Date.now()}`;
  value.outputTemplate.slots.payload = `globalThis.${marker}=true; process.getBuiltinModule('node:fs')`;
  await rewriteProgram(fixture, 'eternities-forge', value);
  const bundle = await verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture));
  const [executor] = await instantiateVerifiedReceiptBoundTypedExecutors({ bundle, expectedDescriptors: bundle.descriptors });
  const output = await executor.execute({ missionId: 'mission-inert' });
  assert.equal(output.slots.payload, value.outputTemplate.slots.payload);
  assert.equal(globalThis[marker], undefined);
});

test('rejects unsupported projections, wrong capability identity, and excessive delay', async (t) => {
  for (const [name, mutate, pattern] of [
    ['projection', (value) => { value.outputTemplate.missionId = { $input: 'path' }; }, /output template is invalid|unsupported input projection/],
    ['slot-projection', (value) => { value.outputTemplate.slots.payload = { $input: 'missionId' }; }, /unsupported input projection/],
    ['capability', (value) => { value.capabilityId = 'eternities-muse'; }, /identity or delay is invalid/],
    ['delay', (value) => { value.delayMs = 5_001; }, /identity or delay is invalid/],
  ]) {
    const fixture = await bundleFixture(t, `invalid-${name}-v1`);
    const value = fixturePrograms()['eternities-forge'];
    mutate(value);
    await rewriteProgram(fixture, 'eternities-forge', value);
    await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture)), pattern);
  }
});

test('rejects credential-shaped content and prototype-affecting keys', async (t) => {
  const credential = await bundleFixture(t, 'invalid-credential-v1');
  const secretValue = fixturePrograms()['eternities-forge'];
  secretValue.outputTemplate.slots.apiKey = 'not-a-secret-but-forbidden';
  await rewriteProgram(credential, 'eternities-forge', secretValue);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(credential)), /credential/i);

  const prototype = await bundleFixture(t, 'invalid-prototype-v1');
  const safeText = `${canonicalJson(fixturePrograms()['eternities-forge'])}\n`;
  const prototypeText = safeText.replace('"slots":{', '"slots":{"__proto__":{"polluted":true},');
  await rewriteProgram(prototype, 'eternities-forge', prototypeText, { canonical: false });
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(prototype)), /forbidden object key/);
  assert.equal({}.polluted, undefined);
});

test('rejects output templates beyond bounded depth or node count', async (t) => {
  const fixture = await bundleFixture(t);
  const value = fixturePrograms()['eternities-forge'];
  let cursor = value.outputTemplate.slots;
  for (let index = 0; index < 20; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  await rewriteProgram(fixture, 'eternities-forge', value);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(fixture)), /structural limits/);

  const wide = await bundleFixture(t, 'invalid-wide-template-v1');
  const wideValue = fixturePrograms()['eternities-forge'];
  wideValue.outputTemplate.slots.values = Array.from({ length: 513 }, (_, index) => index);
  await rewriteProgram(wide, 'eternities-forge', wideValue);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(wide)), /structural limits/);
});

test('rejects changed and duplicate program paths before program loading', async (t) => {
  const changed = await bundleFixture(t);
  changed.receipt.executors[0].program.path = 'executors/../outside.json';
  await rewriteReceipt(changed);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(changed)), /canonical repository-relative path/);

  const duplicate = await bundleFixture(t, 'duplicate-program-path-v1');
  duplicate.receipt.executors[1].program.path = duplicate.receipt.executors[0].program.path;
  await rewriteReceipt(duplicate);
  await assert.rejects(verifyReceiptBoundTypedExecutorBundle(verificationInput(duplicate)), /path is invalid or duplicated/);
});

test('bundle instances remain isolated and policy authorization precedes executor construction', async (t) => {
  const leftFixture = await bundleFixture(t, 'deterministic-visual-executors-left-v1');
  const rightFixture = await bundleFixture(t, 'deterministic-visual-executors-right-v1');
  const left = await verifyReceiptBoundTypedExecutorBundle(verificationInput(leftFixture));
  const right = await verifyReceiptBoundTypedExecutorBundle(verificationInput(rightFixture));
  const leftExecutors = await instantiateVerifiedReceiptBoundTypedExecutors({ bundle: left, expectedDescriptors: left.descriptors });
  const rightExecutors = await instantiateVerifiedReceiptBoundTypedExecutors({ bundle: right, expectedDescriptors: right.descriptors });
  assert.notEqual(leftExecutors[0].execute, rightExecutors[0].execute);
  await assert.rejects(
    instantiateVerifiedReceiptBoundTypedExecutors({ bundle: left, expectedDescriptors: right.descriptors }),
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
    verifyReceiptBoundTypedExecutorBundle({ ...verificationInput(fixture), repositoryRoot: alias }),
    /not a real directory|non-canonical alias/,
  );
});
