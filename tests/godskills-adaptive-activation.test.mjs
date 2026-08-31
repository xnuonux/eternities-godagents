import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import test from 'node:test';

import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';

const root = 'C:/dev/eternities-godskills';
const policyDigest = '9'.repeat(64);

function releasePin() {
  return {
    adapterProtocol: 'eternities-godskills-adapter-v1',
    repositoryRoot: root,
    systemReceipt: { path: 'receipts/godskills-system-certification-v3.json', sha256: '228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57' },
    routerReceipt: { path: 'receipts/agent-native-router-v8.json', sha256: 'b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3' },
    compilerReceipt: { path: 'receipts/intent-compiler-v3.json', sha256: '1ca40ec9138c1d0583068ee4dc3db58f0b77b07f631a2b38d9c47eb28ccce49a' },
    portableReceipt: { path: 'receipts/portable-capability-manifest-v1.json', sha256: 'f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d' },
    portableManifest: { path: 'artifacts/portable-capabilities/manifest.v1.json', sha256: 'ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a', manifestDigest: 'df646600e601dae7208d460135773f5d436b75117c45a3acad85fae6ff91c3c8' },
    semanticEffectBindings: { read: ['local-read'], write: ['local-write'] },
    maximumSelected: 3,
    maximumPackageBytes: 32768,
  };
}

const genomePolicy = Object.freeze({
  protocolId: 'eternities-godskills-adapter-v1',
  profile: 'all-rounder',
  preferredFamilies: [],
  prohibitedFamilies: [],
  prohibitedCapabilities: [],
  maxComposition: 3,
});

const hostEnvelope = Object.freeze({
  permittedEffects: ['local-read', 'local-write'],
  constitutionAllowedEffects: ['local-read', 'local-write'],
  availableAuthority: ['realm:write'],
  availablePreconditions: ['realm-observed'],
  forbiddenCapabilities: [],
  maximumRisk: 'moderate',
  minimumEvidenceConfidence: 'verified',
  contextBudget: 16000,
  maxCompositionSize: 3,
  realmHandContractDigest: 'a'.repeat(64),
});

function input() {
  return {
    mission: { requestId: 'adaptive-mission', text: 'implement and verify a consequential feature', authority: ['realm:write'] },
    observation: { observationId: 'adaptive-observation', counter: 0 },
    genomePolicy,
    hostEnvelope,
    sourceStateEpoch: 0,
  };
}

function routed(request) {
  return {
    compilerReceipt: {
      requestId: request.requestId,
      envelope: {
        availableAuthority: [...request.context.availableAuthority],
        permittedEffects: [...request.context.permittedEffects],
        availablePreconditions: [...request.context.availablePreconditions],
        forbiddenCapabilities: [...request.context.forbiddenCapabilities],
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
        maxCompositionSize: request.context.maxCompositionSize,
      },
    },
    routeReceipt: {
      requestId: request.requestId,
      status: 'selected',
      selectionKind: 'single',
      selectedIds: ['eternities-forge'],
      selectedEntrypoints: ['skills/eternities-forge/SKILL.md'],
      requestFeatures: {
        permittedEffects: [...request.context.permittedEffects],
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
      },
      unresolvedDecisions: [],
    },
  };
}

function resolver(mode) {
  return {
    policyDigest,
    resolve({ selected }) {
      return {
        policyDigest,
        decisions: selected.map(({ id }) => ({
          id,
          mode,
          decisionDigest: ({
            native: '1', guardrail: '2', method: '3', review: '4',
          })[mode].repeat(64),
          reasonCodes: [`fixture-${mode}`],
        })),
      };
    },
  };
}

async function bind(mode) {
  const reads = [];
  const io = {
    async readFile(path) {
      reads.push(String(path).replaceAll('\\', '/'));
      return readFile(path);
    },
    realpath,
  };
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: routed,
    activationResolver: resolver(mode),
    io,
  });
  reads.length = 0;
  return { result: await adapter.bindMission(input()), reads };
}

test('native activation preserves route identity without reading selected artifacts', async () => {
  const { result, reads } = await bind('native');
  assert.deepEqual(reads, []);
  assert.deepEqual(result.cortexPackage.selectedCapabilities, ['eternities-forge']);
  assert.deepEqual(result.cortexPackage.selectedPackages, []);
  assert.deepEqual(result.cortexPackage.deferredReviews, []);
  assert.equal(result.cortexPackage.activation.decisions[0].mode, 'native');
  assert.equal(result.cortexPackage.disclosureBytes, 0);
  assert.equal(result.receipt.activation.policyDigest, policyDigest);
});

test('guardrail activation reads only the contract and transports no method prose', async () => {
  const { result, reads } = await bind('guardrail');
  assert.deepEqual(reads, [`${root}/skills/eternities-forge/references/capability-contract.json`]);
  assert.equal(Object.hasOwn(result.cortexPackage.selectedPackages[0], 'entrypoint'), false);
  assert.equal(Object.hasOwn(result.cortexPackage.selectedPackages[0], 'contract'), false);
  assert.equal(result.cortexPackage.selectedPackages[0].activationMode, 'guardrail');
  assert.ok(result.cortexPackage.selectedPackages[0].guardrails.successCondition.length > 0);
  assert.ok(result.cortexPackage.disclosureBytes > 0);
});

test('method activation retains the exact legacy entrypoint and contract disclosure', async () => {
  const { result, reads } = await bind('method');
  assert.deepEqual(reads.sort(), [
    `${root}/skills/eternities-forge/SKILL.md`,
    `${root}/skills/eternities-forge/references/capability-contract.json`,
  ]);
  assert.match(result.cortexPackage.selectedPackages[0].entrypoint, /name:\s*eternities-forge/);
  assert.equal(result.cortexPackage.selectedPackages[0].contract.name, 'eternities-forge');
  assert.equal(result.cortexPackage.selectedPackages[0].activationMode, 'method');
  assert.ok(result.cortexPackage.disclosureBytes > 0);
});

test('review activation defers exact selected artifacts without reading or claiming review', async () => {
  const { result, reads } = await bind('review');
  assert.deepEqual(reads, []);
  assert.deepEqual(result.cortexPackage.selectedPackages, []);
  assert.deepEqual(result.cortexPackage.deferredReviews, [{
    id: 'eternities-forge',
    entrypointSha256: result.receipt.selected[0].entrypointSha256,
    contractSha256: result.receipt.selected[0].contractSha256,
    status: 'scheduled-not-executed',
  }]);
  assert.equal(result.cortexPackage.activation.decisions[0].mode, 'review');
  assert.equal(result.cortexPackage.disclosureBytes, 0);
});

test('adaptive recovery reuses the exact activation receipt and rejects a changed policy', async () => {
  const adaptive = resolver('review');
  const first = await createGodskillsAdapter({ releasePin: releasePin(), transport: routed, activationResolver: adaptive });
  const bound = await first.bindMission(input());
  const second = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: async () => { throw new Error('routing must not run during recovery'); },
    activationResolver: adaptive,
  });
  const rehydrated = await second.rehydrateMission({ ...input(), receipt: bound.receipt });
  assert.deepEqual(rehydrated.cortexPackage, bound.cortexPackage);

  const changed = { ...resolver('review'), policyDigest: '8'.repeat(64) };
  const incompatible = await createGodskillsAdapter({ releasePin: releasePin(), transport: routed, activationResolver: changed });
  await assert.rejects(incompatible.rehydrateMission({ ...input(), receipt: bound.receipt }), /activation policy digest/i);
});
