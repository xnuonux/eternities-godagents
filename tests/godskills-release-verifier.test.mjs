import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { verifyGodskillsRelease } from '../src/skills/release-verifier.mjs';

const root = 'C:/dev/eternities-godskills';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function releasePin(overrides = {}) {
  return {
    adapterProtocol: 'eternities-godskills-adapter-v1',
    repositoryRoot: root,
    systemReceipt: { path: 'receipts/godskills-system-certification-v3.json', sha256: '228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57' },
    routerReceipt: { path: 'receipts/agent-native-router-v8.json', sha256: 'b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3' },
    compilerReceipt: { path: 'receipts/intent-compiler-v3.json', sha256: '1ca40ec9138c1d0583068ee4dc3db58f0b77b07f631a2b38d9c47eb28ccce49a' },
    portableReceipt: { path: 'receipts/portable-capability-manifest-v1.json', sha256: 'f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d' },
    portableManifest: {
      path: 'artifacts/portable-capabilities/manifest.v1.json',
      sha256: 'ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a',
      manifestDigest: 'df646600e601dae7208d460135773f5d436b75117c45a3acad85fae6ff91c3c8',
    },
    semanticEffectBindings: { read: ['local-read'], write: ['local-write'] },
    maximumSelected: 3,
    maximumPackageBytes: 32768,
    ...overrides,
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function trackedIo(replacements = new Map(), realpathOverride = null) {
  const reads = [];
  return {
    reads,
    io: {
      async readFile(path) {
        reads.push(String(path).replaceAll('\\', '/'));
        return replacements.get(String(path).replaceAll('\\', '/')) ?? readFile(path);
      },
      async realpath(path) {
        const normalized = String(path).replaceAll('\\', '/');
        return realpathOverride?.(normalized) ?? realpath(path);
      },
    },
  };
}

async function replacedManifest(mutator) {
  const manifestPath = `${root}/artifacts/portable-capabilities/manifest.v1.json`;
  const receiptPath = `${root}/receipts/portable-capability-manifest-v1.json`;
  const manifest = JSON.parse(await readFile(manifestPath));
  mutator(manifest);
  const body = structuredClone(manifest);
  delete body.manifestDigest;
  manifest.manifestDigest = sha256(JSON.stringify(body));
  const manifestBytes = jsonBytes(manifest);
  const receipt = JSON.parse(await readFile(receiptPath));
  receipt.manifest.sha256 = sha256(manifestBytes);
  receipt.manifest.bytes = manifestBytes.length;
  receipt.manifest.manifestDigest = manifest.manifestDigest;
  const unsignedReceipt = structuredClone(receipt);
  delete unsignedReceipt.receiptDigest;
  receipt.receiptDigest = sha256(JSON.stringify(unsignedReceipt));
  const receiptBytes = jsonBytes(receipt);
  return {
    pin: releasePin({
      portableReceipt: { ...releasePin().portableReceipt, sha256: sha256(receiptBytes) },
      portableManifest: { ...releasePin().portableManifest, sha256: sha256(manifestBytes), manifestDigest: manifest.manifestDigest },
    }),
    replacements: new Map([[manifestPath, manifestBytes], [receiptPath, receiptBytes]]),
  };
}

test('verifies the exact certified release without reading any capability body', async () => {
  const tracked = trackedIo();
  const verified = await verifyGodskillsRelease(releasePin(), { io: tracked.io });

  assert.equal(verified.manifest.capabilities.length, 44);
  assert.equal(verified.capabilitiesById.size, 44);
  assert.equal(verified.pin.adapterProtocol, 'eternities-godskills-adapter-v1');
  assert.match(verified.releaseDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(tracked.reads.some((path) => /\/skills\//.test(path)), false);
  assert.equal(tracked.reads.some((path) => /quarry|third-party/i.test(path)), false);
});

test('rejects root digest drift and unsupported adapter protocols', async () => {
  await assert.rejects(
    verifyGodskillsRelease(releasePin({ systemReceipt: { ...releasePin().systemReceipt, sha256: '0'.repeat(64) } })),
    /system receipt digest mismatch/,
  );
  await assert.rejects(
    verifyGodskillsRelease(releasePin({ adapterProtocol: 'eternities-godskills-adapter-v2' })),
    /godskills-release-pin.*const|unsupported adapter protocol/,
  );
});

test('rejects uncertified root receipts even when their outer pin is recomputed', async () => {
  const path = `${root}/receipts/godskills-system-certification-v3.json`;
  const receipt = JSON.parse(await readFile(path));
  receipt.status = 'failed';
  const bytes = jsonBytes(receipt);
  const tracked = trackedIo(new Map([[path, bytes]]));
  await assert.rejects(
    verifyGodskillsRelease(releasePin({ systemReceipt: { ...releasePin().systemReceipt, sha256: sha256(bytes) } }), { io: tracked.io }),
    /system receipt is not certified/,
  );
});

test('rejects manifest count drift and duplicate capability identities', async () => {
  const short = await replacedManifest((manifest) => manifest.capabilities.pop());
  await assert.rejects(verifyGodskillsRelease(short.pin, { io: trackedIo(short.replacements).io }), /exactly 44 capabilities/);

  const duplicate = await replacedManifest((manifest) => {
    manifest.capabilities[43].id = manifest.capabilities[0].id;
  });
  await assert.rejects(verifyGodskillsRelease(duplicate.pin, { io: trackedIo(duplicate.replacements).io }), /duplicate capability id/);
});

test('rejects logical manifest digest drift and path escape before trust', async () => {
  const path = `${root}/artifacts/portable-capabilities/manifest.v1.json`;
  const manifest = JSON.parse(await readFile(path));
  manifest.manifestDigest = '0'.repeat(64);
  const bytes = jsonBytes(manifest);
  const receiptPath = `${root}/receipts/portable-capability-manifest-v1.json`;
  const receipt = JSON.parse(await readFile(receiptPath));
  receipt.manifest.sha256 = sha256(bytes);
  receipt.manifest.bytes = bytes.length;
  receipt.manifest.manifestDigest = manifest.manifestDigest;
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  receipt.receiptDigest = sha256(JSON.stringify(unsigned));
  const receiptBytes = jsonBytes(receipt);
  const pin = releasePin({
    portableReceipt: { ...releasePin().portableReceipt, sha256: sha256(receiptBytes) },
    portableManifest: { ...releasePin().portableManifest, sha256: sha256(bytes), manifestDigest: manifest.manifestDigest },
  });
  const tracked = trackedIo(new Map([[path, bytes], [receiptPath, receiptBytes]]));
  await assert.rejects(verifyGodskillsRelease(pin, { io: tracked.io }), /logical manifest digest mismatch/);

  await assert.rejects(
    verifyGodskillsRelease(releasePin({ portableManifest: { ...releasePin().portableManifest, path: '../manifest.json' } })),
    /path must be repository-relative|escaped repository root/,
  );
});

test('rejects post-resolution junction escape and certified executable drift', async () => {
  const target = `${root}/artifacts/portable-capabilities/manifest.v1.json`;
  const tracked = trackedIo(new Map(), (path) => path === target ? 'C:/outside/manifest.v1.json' : realpath(path));
  await assert.rejects(verifyGodskillsRelease(releasePin(), { io: tracked.io }), /escaped repository root/);

  const compilerPath = `${root}/scripts/intent.mjs`;
  const mutated = Buffer.from('export const drift = true;\n');
  const compilerIo = trackedIo(new Map([[compilerPath, mutated]]));
  await assert.rejects(verifyGodskillsRelease(releasePin(), { io: compilerIo.io }), /compiler artifact transport digest mismatch/);
});

test('release digest is canonical and independent from object insertion order', async () => {
  const first = await verifyGodskillsRelease(releasePin());
  const source = releasePin();
  const reversed = Object.fromEntries(Object.entries(source).reverse());
  const second = await verifyGodskillsRelease(reversed);
  assert.equal(first.releaseDigest, second.releaseDigest);
  assert.equal(first.releaseDigest, sha256(canonicalJson({ pin: first.pin, roots: first.rootDigests })));
});
