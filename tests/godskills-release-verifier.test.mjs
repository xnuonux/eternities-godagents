import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { verifyGodskillsRelease } from '../src/skills/release-verifier.mjs';

const root = 'C:/dev/eternities-godskills';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function activationPin(overrides = {}) {
  return {
    protocolId: 'eternities-godskills-activation-v1',
    executableReceipt: {
      path: 'receipts/adaptive-activation-executable-v1.json',
      sha256: '98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f',
      receiptDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
    },
    parentReceipt: {
      path: 'receipts/adaptive-activation-v1.json',
      sha256: '6c6d689ecf9df14823407a917e89a5848776fb50eca3b7acc0d70056ae305f70',
      receiptDigest: 'a28a0af7e588f2abbbe1d51a15775dfbeb8d565109d0a176711bfa73b520440f',
    },
    entrypoint: {
      path: 'scripts/activation.mjs',
      sha256: 'e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a',
    },
    compiler: {
      path: 'src/adaptive-activation.mjs',
      sha256: '9844aee1147f7129f3e37067424ccebb88ff478de1b7a9a9fb7306d5f2fdbd82',
    },
    dependencies: [
      { path: 'scripts/build-adaptive-activation-executable-receipt.mjs', sha256: 'd35fa44632711c64c1e23f84f80fc0edfb5adbed4261ef88b7d9c32de2d96486' },
      { path: 'src/adaptive-activation-protocol.mjs', sha256: 'e697fe37d18a76de22ca4fdcd8ade6089bceddb20baad971e895bc49c9b0172e' },
      { path: 'src/io.mjs', sha256: '48dca2b203947e12ca3d5500b70a25066a8166d86bc2284aaeed6abf622a5c37' },
      { path: 'src/static-module-closure.mjs', sha256: '3bb0d825e6838b901315e685f9e5b02c94dac316ccb7788f54cd6fd18cd6a6ab' },
    ],
    schemas: {
      request: { path: 'schemas/adaptive-activation-request.v1.schema.json', sha256: 'bcadd846b96809733837183e12dba6f8d094409aa7c16e5676fa63357e3c2cde' },
      result: { path: 'schemas/adaptive-activation-result.v1.schema.json', sha256: '0a069a5eb121e625aa4ea529cbb48783e266e4c7c7f36f93ee24749303dd4391' },
    },
    policy: {
      path: 'policies/adaptive-activation.v1.json',
      sha256: 'b87bbfaddecb42417e57202173220bf240204d27b7de5fffc9e609eb18138939',
      logicalDigest: 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d',
    },
    evidence: {
      path: 'artifacts/adaptive-activation/evidence.v1.json',
      sha256: 'b55a5cb4f7ff039cc7f4027c165b2f151bad723d9030913076a4225342fbe8c5',
      logicalDigest: '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07',
    },
    contract: {
      path: 'artifacts/adaptive-activation/neutral-contract.json',
      sha256: 'feade348d3fd31afd5103eb296181f68000186d3193a995e4b77c25a06e57c92',
    },
    ...overrides,
  };
}

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

async function replacedActivationReceipt(mutator, activationMutator = (value) => value) {
  const receiptPath = `${root}/receipts/adaptive-activation-executable-v1.json`;
  const receipt = JSON.parse(await readFile(receiptPath));
  mutator(receipt);
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  receipt.receiptDigest = sha256(canonicalJson(unsigned));
  const receiptBytes = jsonBytes(receipt);
  const activation = activationMutator(activationPin({
    executableReceipt: {
      ...activationPin().executableReceipt,
      sha256: sha256(receiptBytes),
      receiptDigest: receipt.receiptDigest,
    },
  }));
  return {
    pin: releasePin({ activation }),
    replacements: new Map([[receiptPath, receiptBytes]]),
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

test('verifies an optional complete activation trust root while preserving legacy compatibility', async () => {
  const legacy = await verifyGodskillsRelease(releasePin());
  assert.equal(legacy.activation, undefined);

  const tracked = trackedIo();
  const verified = await verifyGodskillsRelease(releasePin({ activation: activationPin() }), { io: tracked.io });
  assert.equal(verified.activation.protocolId, 'eternities-godskills-activation-v1');
  assert.equal(verified.activation.trustRootDigest, activationPin().executableReceipt.receiptDigest);
  assert.equal(verified.activation.entrypoint.path, 'scripts/activation.mjs');
  assert.equal(verified.activation.entrypoint.absolutePath, `${root}/scripts/activation.mjs`);
  assert.equal(verified.activation.policy.logicalDigest, activationPin().policy.logicalDigest);
  assert.equal(verified.activation.evidence.logicalDigest, activationPin().evidence.logicalDigest);
  assert.deepEqual(verified.activation.dependencies.map(({ path }) => path), activationPin().dependencies.map(({ path }) => path));
  assert.equal(Object.isFrozen(verified.activation), true);
  assert.equal(Object.isFrozen(verified.activation.dependencies), true);
  assert.equal(tracked.reads.some((path) => /\/skills\//.test(path)), false);
  assert.equal(tracked.reads.some((path) => /quarry|third-party/i.test(path)), false);
});

test('rejects incomplete, unknown, duplicate, and unordered activation pin structure', async () => {
  const incomplete = activationPin();
  delete incomplete.policy;
  await assert.rejects(verifyGodskillsRelease(releasePin({ activation: incomplete })), /activation.*policy|required/i);

  await assert.rejects(
    verifyGodskillsRelease(releasePin({ activation: activationPin({ unexpected: true }) })),
    /activation.*unexpected|additionalProperties/i,
  );

  const duplicate = activationPin();
  duplicate.dependencies[1] = structuredClone(duplicate.dependencies[0]);
  await assert.rejects(verifyGodskillsRelease(releasePin({ activation: duplicate })), /dependencies.*unique|duplicate/i);

  const unordered = activationPin();
  unordered.dependencies.reverse();
  await assert.rejects(verifyGodskillsRelease(releasePin({ activation: unordered })), /dependencies.*order|sorted|canonical/i);
});

test('requires the activation pin and executable receipt to describe exactly the same artifact set', async () => {
  const extra = await replacedActivationReceipt((receipt) => {
    receipt.artifacts.push({ role: 'dependency', path: 'README.md', sha256: '0'.repeat(64), bytes: 1 });
    receipt.artifacts.sort((left, right) => left.path.localeCompare(right.path));
    receipt.dependencyClosure.localModules.push('README.md');
    receipt.dependencyClosure.localModules.sort();
  });
  await assert.rejects(
    verifyGodskillsRelease(extra.pin, { io: trackedIo(extra.replacements).io }),
    /artifact set|dependency closure|artifacts.*ordered|extra/i,
  );

  const missing = await replacedActivationReceipt((receipt) => {
    receipt.artifacts = receipt.artifacts.filter(({ path }) => path !== 'src/io.mjs');
    receipt.dependencyClosure.localModules = receipt.dependencyClosure.localModules.filter((path) => path !== 'src/io.mjs');
  });
  await assert.rejects(
    verifyGodskillsRelease(missing.pin, { io: trackedIo(missing.replacements).io }),
    /artifact set|dependency closure|missing/i,
  );
});

test('rejects substituted activation artifacts and logical digest drift', async () => {
  const substitutions = [
    ['parentReceipt', (pin) => { pin.parentReceipt.sha256 = '0'.repeat(64); }],
    ['entrypoint', (pin) => { pin.entrypoint.sha256 = '0'.repeat(64); }],
    ['compiler', (pin) => { pin.compiler.sha256 = '0'.repeat(64); }],
    ['dependency', (pin) => { pin.dependencies[0].sha256 = '0'.repeat(64); }],
    ['request schema', (pin) => { pin.schemas.request.sha256 = '0'.repeat(64); }],
    ['result schema', (pin) => { pin.schemas.result.sha256 = '0'.repeat(64); }],
    ['policy', (pin) => { pin.policy.sha256 = '0'.repeat(64); }],
    ['evidence', (pin) => { pin.evidence.sha256 = '0'.repeat(64); }],
    ['contract', (pin) => { pin.contract.sha256 = '0'.repeat(64); }],
  ];
  for (const [name, mutate] of substitutions) {
    const pin = activationPin();
    mutate(pin);
    await assert.rejects(
      verifyGodskillsRelease(releasePin({ activation: pin })),
      /digest mismatch|receipt.*binding|artifact sets do not match/i,
      name,
    );
  }

  for (const field of ['policy', 'evidence']) {
    const pin = activationPin();
    pin[field].logicalDigest = '0'.repeat(64);
    await assert.rejects(
      verifyGodskillsRelease(releasePin({ activation: pin })),
      new RegExp(`${field}.*logical|logical.*${field}`, 'i'),
    );
  }
});

test('rejects stale receipt digests, unsupported protocol, and wrong executable status', async () => {
  const receiptPath = `${root}/receipts/adaptive-activation-executable-v1.json`;
  const stale = JSON.parse(await readFile(receiptPath));
  stale.receiptDigest = '0'.repeat(64);
  const staleBytes = jsonBytes(stale);
  const stalePin = activationPin({
    executableReceipt: {
      ...activationPin().executableReceipt,
      sha256: sha256(staleBytes),
      receiptDigest: stale.receiptDigest,
    },
  });
  await assert.rejects(
    verifyGodskillsRelease(releasePin({ activation: stalePin }), {
      io: trackedIo(new Map([[receiptPath, staleBytes]])).io,
    }),
    /receipt digest mismatch/i,
  );

  const unsupported = await replacedActivationReceipt((receipt) => { receipt.protocolId = 'unsupported-v2'; });
  await assert.rejects(
    verifyGodskillsRelease(unsupported.pin, { io: trackedIo(unsupported.replacements).io }),
    /protocol/i,
  );

  const status = await replacedActivationReceipt((receipt) => { receipt.status = 'experimental'; });
  await assert.rejects(
    verifyGodskillsRelease(status.pin, { io: trackedIo(status.replacements).io }),
    /status|verified-build/i,
  );
});

test('rejects lexical and post-realpath activation escapes', async () => {
  for (const malformed of [
    '../activation.mjs',
    'scripts//activation.mjs',
    'scripts/./activation.mjs',
    'scripts/activation.mjs?changed',
    'scripts/activation.mjs\n',
  ]) {
    const lexical = activationPin();
    lexical.entrypoint.path = malformed;
    await assert.rejects(
      verifyGodskillsRelease(releasePin({ activation: lexical })),
      /repository-relative|escaped repository root/i,
      malformed,
    );
  }

  const target = `${root}/scripts/activation.mjs`;
  const tracked = trackedIo(new Map(), (path) => path === target ? 'C:/outside/activation.mjs' : realpath(path));
  await assert.rejects(
    verifyGodskillsRelease(releasePin({ activation: activationPin() }), { io: tracked.io }),
    /escaped repository root/i,
  );
});

test('keeps legacy and adaptive verification isolated in a shared artifact cache', async () => {
  const artifactCache = new Map();
  const legacy = await verifyGodskillsRelease(releasePin(), { artifactCache });
  const adaptive = await verifyGodskillsRelease(releasePin({ activation: activationPin() }), { artifactCache });
  assert.notEqual(legacy.releaseDigest, adaptive.releaseDigest);
  assert.equal(legacy.activation, undefined);
  assert.equal(adaptive.activation.trustRootDigest, activationPin().executableReceipt.receiptDigest);
  assert.equal(artifactCache.size, 2);
});
