import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  pinnedGodskillsTypedCompositionRelease,
  pinnedGodskillsTypedCompositionSourceCommit,
} from '../scripts/lib/pinned-godskills-typed-composition.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const receiptDigest = 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a';
const methodDigest = '63b0a268841992c55953415b279f8e76277a80b0152f49260b3a22db9a75e3c2';
const executionDigest = 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7';

async function verifier() {
  try {
    return await import('../src/skills/typed-composition-verifier.mjs');
  } catch (error) {
    assert.fail(`typed-composition verifier is unavailable: ${error.message}`);
  }
}

async function adapterFactory() {
  try {
    return await import('../src/skills/typed-composition-adapter.mjs');
  } catch (error) {
    assert.fail(`typed-composition adapter is unavailable: ${error.message}`);
  }
}

function changedReader(relativePath, observed = []) {
  const target = resolve(godskillsRoot, ...relativePath.split('/'));
  return {
    realpath,
    async readFile(filePath) {
      observed.push(resolve(filePath).replaceAll('\\', '/'));
      const bytes = await readFile(filePath);
      return resolve(filePath).toLowerCase() === target.toLowerCase()
        ? Buffer.concat([bytes, Buffer.from('\n')])
        : bytes;
    },
  };
}

function canaryMissionInputs() {
  return {
    'available-specialists': ['interface', 'motion', 'accessibility'],
    'design-constraints': ['deterministic', 'bounded-authority'],
    'repository-state': { branch: 'feat/typed-composition-v1', clean: false },
    'settled-outcome': { objective: 'compile a typed Muse to Forge mission' },
    'visual-source-set': ['brand-system', 'implemented-interface'],
  };
}

function canaryExecutors(observed = []) {
  return {
    'eternities-muse': async (input) => {
      observed.push(input);
      return {
        schemaVersion: 1,
        capabilityId: 'eternities-muse',
        missionId: input.missionId,
        slots: {
          'visual-direction': { direction: 'white-fire-sovereign' },
          'visual-system': { tokens: ['luminance', 'motion'] },
          'specialist-handoff': { target: 'eternities-forge' },
          'acceptance-boundary': {
            invariants: ['typed-handoff', 'no-authority-expansion'],
            rejectionCriteria: ['implicit-coercion', 'missing-evidence'],
          },
        },
      };
    },
    'eternities-forge': async (input) => {
      observed.push(input);
      return {
        schemaVersion: 1,
        capabilityId: 'eternities-forge',
        missionId: input.missionId,
        slots: {
          implementation: { status: 'verified' },
          'claim-evidence-ledger': { claims: 2, evidence: 2 },
          'review-disposition': { disposition: 'accepted' },
          'integration-state': { state: 'ready' },
        },
      };
    },
  };
}

async function compileCanary(adapter) {
  const [activationResult, checkedPlan] = await Promise.all([
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/activation.v1.json'), 'utf8').then(JSON.parse),
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/plan.v1.json'), 'utf8').then(JSON.parse),
  ]);
  const unsignedPlan = structuredClone(checkedPlan);
  delete unsignedPlan.planDigest;
  return { activationResult, checkedPlan, compiled: adapter.compile({ unsignedPlan, activationResult }) };
}

test('the static sidecar and schema pin the exact pushed typed-composition release', async () => {
  const pin = pinnedGodskillsTypedCompositionRelease(godskillsRoot);
  const schema = JSON.parse(await readFile(new URL(
    '../schemas/godskills-typed-composition-pin.schema.json',
    import.meta.url,
  )));

  assert.equal(pinnedGodskillsTypedCompositionSourceCommit,
    '7c1a183d55616310ac96255dd996536c53c8b577');
  assert.equal(pin.releaseReceipt.receiptDigest, receiptDigest);
  assert.equal(pin.releaseReceipt.sha256,
    'bf311f1eebce635b5217ecb69fda6b8741889bc60f0be8186d14a3bcbe900f11');
  assert.equal(pin.module.sha256,
    'd2189dd88d0fad0d1255ff48f4429bdbb5baa9c06d14052551afd49d4bcef4f0');
  assert.equal(pin.policy.sha256,
    'f5934f9b22fc3ede905fec359cc9697f40b23ede4f7144eb298f4cd184b005fd');
  assert.equal(pin.expected.methodDigest, methodDigest);
  assert.equal(pin.expected.executionDigest, executionDigest);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.protocolId.const,
    'eternities-godskills-typed-composition-consumer-v1');
  assert.equal(schema.properties.releaseReceipt.properties.path.const,
    'receipts/typed-composition-v1.json');
  assert.equal(schema.properties.module.properties.path.const,
    'src/typed-composition.mjs');
});

test('verifies and privately brands every exact source, contract, and generated release byte', async () => {
  const {
    assertVerifiedGodskillsTypedCompositionRelease,
    verifyGodskillsTypedCompositionRelease,
  } = await verifier();
  const observed = [];
  const io = changedReader('never/matches', observed);
  const verified = await verifyGodskillsTypedCompositionRelease({
    releasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    io,
  });

  assert.equal(verified.protocolId, 'eternities-godskills-typed-composition-consumer-v1');
  assert.equal(verified.sourceCommit, pinnedGodskillsTypedCompositionSourceCommit);
  assert.equal(verified.trustRootDigest, receiptDigest);
  assert.equal(verified.registryDigest,
    '5143a9ca74b5676605c33e94c7d610d830c3aafe7d57c32a48558d5112b713b8');
  assert.equal(verified.methodDigest, methodDigest);
  assert.equal(verified.executionDigest, executionDigest);
  assert.equal(verified.sourceModules, 9);
  assert.equal(verified.generatedArtifacts, 9);
  assert.equal(verified.authorityExpanded, false);
  assert.equal(assertVerifiedGodskillsTypedCompositionRelease(verified), verified);
  assert.throws(
    () => assertVerifiedGodskillsTypedCompositionRelease(structuredClone(verified)),
    /verified|provenance|brand/i,
  );
  assert.equal(observed.some((value) => /capability-layers\/.*\/method\.v1\.md$/i.test(value)), false);
  assert.equal(observed.some((value) => /capability-layers\/.*\/reviewer\.v1\.md$/i.test(value)), false);
});

test('pin drift, changed release bytes, changed bound bytes, and path aliases fail before branding', async () => {
  const { verifyGodskillsTypedCompositionRelease } = await verifier();
  const base = pinnedGodskillsTypedCompositionRelease(godskillsRoot);
  for (const [name, releasePin] of [
    ['protocol', { ...base, protocolId: 'other' }],
    ['source commit', { ...base, sourceCommit: '0'.repeat(40) }],
    ['receipt digest', {
      ...base,
      releaseReceipt: { ...base.releaseReceipt, receiptDigest: '0'.repeat(64) },
    }],
    ['receipt bytes', {
      ...base,
      releaseReceipt: { ...base.releaseReceipt, bytes: base.releaseReceipt.bytes + 1 },
    }],
    ['module digest', { ...base, module: { ...base.module, sha256: '0'.repeat(64) } }],
    ['aliased path', {
      ...base,
      module: { ...base.module, path: 'src/../src/typed-composition.mjs' },
    }],
    ['extra field', { ...base, defaultLaunch: true }],
  ]) {
    await assert.rejects(
      verifyGodskillsTypedCompositionRelease({ releasePin }),
      /typed composition|protocol|receipt|digest|path|field|pin/i,
      name,
    );
  }

  for (const relativePath of [
    'receipts/typed-composition-v1.json',
    'src/typed-composition.mjs',
    'policies/typed-composition.v1.json',
    'receipts/adaptive-activation-executable-v1.json',
    'receipts/capability-layer-abi-v1.json',
    'schemas/typed-composition-plan.v1.schema.json',
    'artifacts/typed-composition/canary-execution.v1.json',
    'artifacts/typed-composition/method.v1.json',
    'tests/typed-composition.test.mjs',
  ]) {
    await assert.rejects(
      verifyGodskillsTypedCompositionRelease({
        releasePin: base,
        io: changedReader(relativePath),
      }),
      /typed composition|digest|bytes|receipt|artifact|module|policy|schema|source/i,
      relativePath,
    );
  }
});

test('adapter construction verifies before import and the export surface is closed', async () => {
  const { createPinnedTypedCompositionAdapter } = await adapterFactory();
  const observed = [];
  await assert.rejects(() => createPinnedTypedCompositionAdapter({
    releasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot, {
      releaseReceipt: {
        ...pinnedGodskillsTypedCompositionRelease(godskillsRoot).releaseReceipt,
        sha256: '0'.repeat(64),
      },
    }),
    io: changedReader('never/matches', observed),
  }), /receipt|digest|typed composition/i);
  assert.equal(observed.some((value) => value.endsWith('/src/typed-composition.mjs')), false);

  const { assertGodskillsTypedCompositionModuleExports } = await verifier();
  assert.throws(() => assertGodskillsTypedCompositionModuleExports({}), /export|module/i);
  const adapter = await createPinnedTypedCompositionAdapter({
    releasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
  });
  assert.equal(adapter.descriptor.sourceCommit, pinnedGodskillsTypedCompositionSourceCommit);
});

test('the pinned adapter recompiles and executes the exact Muse to Forge canary without body disclosure', async () => {
  const {
    assertPinnedTypedCompositionAdapter,
    createPinnedTypedCompositionAdapter,
  } = await adapterFactory();
  const observedReads = [];
  const adapter = await createPinnedTypedCompositionAdapter({
    releasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    io: changedReader('never/matches', observedReads),
  });
  const { compiled, checkedPlan } = await compileCanary(adapter);

  assert.equal(compiled.plan.planDigest, checkedPlan.planDigest);
  assert.equal(compiled.method.methodDigest, methodDigest);
  assert.equal(compiled.method.aggregate.methodBodiesEmbedded, 0);
  assert.equal(compiled.method.aggregate.sourceBodiesTransported, 0);
  assert.equal(compiled.method.aggregate.authorityExpanded, false);
  assert.equal(adapter.descriptor.defaultLaunchEnabled, false);
  assert.equal(adapter.descriptor.authorityExpanded, false);
  assert.equal(assertPinnedTypedCompositionAdapter(adapter), adapter);
  assert.throws(
    () => assertPinnedTypedCompositionAdapter({ ...adapter }),
    /adapter|verified|brand|provenance/i,
  );

  const observedExecutions = [];
  const result = await adapter.execute({
    method: compiled.method,
    missionInputs: canaryMissionInputs(),
    executors: canaryExecutors(observedExecutions),
  });

  assert.equal(result.receipt.executionDigest, executionDigest);
  assert.equal(result.outputs.implementation.status, 'verified');
  assert.deepEqual(
    observedExecutions[1].slots['acceptance-risk-boundary'],
    {
      invariants: ['typed-handoff', 'no-authority-expansion'],
      rejectionCriteria: ['implicit-coercion', 'missing-evidence'],
    },
  );
  assert.equal(observedReads.some((value) => /capability-layers\/.*\/method\.v1\.md$/i.test(value)), false);
  assert.equal(observedReads.some((value) => /capability-layers\/.*\/reviewer\.v1\.md$/i.test(value)), false);
});

test('the consumer preserves closed requests and executor, input, and output rejection boundaries', async () => {
  const { createPinnedTypedCompositionAdapter } = await adapterFactory();
  const adapter = await createPinnedTypedCompositionAdapter({
    releasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
  });
  const { activationResult, checkedPlan, compiled } = await compileCanary(adapter);
  const unsignedPlan = structuredClone(checkedPlan);
  delete unsignedPlan.planDigest;
  assert.throws(
    () => adapter.compile({ unsignedPlan, activationResult, inferMissingFields: true }),
    /compile request fields/i,
  );

  await assert.rejects(() => adapter.execute({
    method: compiled.method,
    missionInputs: canaryMissionInputs(),
    executors: { 'eternities-muse': canaryExecutors()['eternities-muse'] },
  }), (error) => error?.code === 'executor-missing');

  const malformedInputs = canaryMissionInputs();
  malformedInputs['settled-outcome'] = ['wrong-kind'];
  await assert.rejects(() => adapter.execute({
    method: compiled.method,
    missionInputs: malformedInputs,
    executors: canaryExecutors(),
  }), (error) => error?.code === 'execution-invalid');

  const malformedExecutors = canaryExecutors();
  malformedExecutors['eternities-forge'] = async (input) => ({
    schemaVersion: 1,
    capabilityId: 'eternities-forge',
    missionId: input.missionId,
    slots: {},
  });
  await assert.rejects(() => adapter.execute({
    method: compiled.method,
    missionInputs: canaryMissionInputs(),
    executors: malformedExecutors,
  }), (error) => error?.code === 'output-invalid');
});

test('foreign methods and changed plan or activation identities remain rejected by Godskills', async () => {
  const { createPinnedTypedCompositionAdapter } = await adapterFactory();
  const adapter = await createPinnedTypedCompositionAdapter({
    releasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
  });
  const [activationResult, checkedPlan, checkedMethod] = await Promise.all([
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/activation.v1.json'), 'utf8').then(JSON.parse),
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/plan.v1.json'), 'utf8').then(JSON.parse),
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/method.v1.json'), 'utf8').then(JSON.parse),
  ]);
  const unsignedPlan = structuredClone(checkedPlan);
  delete unsignedPlan.planDigest;
  unsignedPlan.maximumContextBytes = 8000;
  assert.throws(
    () => adapter.compile({ unsignedPlan, activationResult }),
    (error) => error?.code === 'context-overflow',
  );

  const changedActivation = structuredClone(activationResult);
  changedActivation.resultDigest = '0'.repeat(64);
  const restoredPlan = structuredClone(checkedPlan);
  delete restoredPlan.planDigest;
  assert.throws(
    () => adapter.compile({ unsignedPlan: restoredPlan, activationResult: changedActivation }),
    (error) => error?.code === 'activation-mismatch',
  );
  await assert.rejects(() => adapter.execute({
    method: checkedMethod,
    missionInputs: {},
    executors: {},
  }), (error) => error?.code === 'method-integrity');
});
