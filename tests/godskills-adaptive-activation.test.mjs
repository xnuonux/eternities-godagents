import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import test from 'node:test';

import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';

const root = 'C:/dev/eternities-godskills';
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';

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
      selectedIds: ['eternities-muse'],
      selectedEntrypoints: ['skills/eternities-muse/SKILL.md'],
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

function resolver({ consequenceClass = 'consequential', reviewAvailable = true, extras = {} } = {}) {
  const state = { calls: 0 };
  return { state, value: {
    policyDigest,
    evidenceDigest,
    classify() {
      state.calls += 1;
      return {
        taskClass: 'creative-generation',
        consequenceClass,
        reviewAvailable,
        ...extras,
      };
    },
  } };
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
  const settings = ({
    native: { consequenceClass: 'low', reviewAvailable: false },
    guardrail: { consequenceClass: 'consequential', reviewAvailable: false },
    method: { consequenceClass: 'consequential', reviewAvailable: true },
    review: { consequenceClass: 'consequential', reviewAvailable: true },
  })[mode];
  const adaptive = resolver(settings);
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: routed,
    activationResolver: adaptive.value,
    io,
  });
  reads.length = 0;
  const supplied = input();
  if (mode === 'method') supplied.mission.explicitMethodRequests = ['eternities-muse'];
  return { result: await adapter.bindMission(supplied), reads, adaptive, supplied };
}

test('native activation preserves route identity without reading selected artifacts', async () => {
  const { result, reads } = await bind('native');
  assert.deepEqual(reads, []);
  assert.deepEqual(result.cortexPackage.selectedCapabilities, ['eternities-muse']);
  assert.deepEqual(result.cortexPackage.selectedPackages, []);
  assert.deepEqual(result.cortexPackage.deferredReviews, []);
  assert.equal(result.cortexPackage.activation.decisions[0].mode, 'native');
  assert.equal(result.cortexPackage.disclosureBytes, 0);
  assert.equal(result.receipt.activation.policyDigest, policyDigest);
});

test('guardrail activation reads only the contract and transports no method prose', async () => {
  const { result, reads } = await bind('guardrail');
  assert.deepEqual(reads, [`${root}/skills/eternities-muse/references/capability-contract.json`]);
  const selected = result.cortexPackage.selectedPackages[0];
  assert.deepEqual(Object.keys(selected).sort(), [
    'activationMode', 'contractSha256', 'entrypointSha256', 'guardrails', 'id', 'ownerGodskillId', 'tier',
  ].sort());
  assert.equal(selected.activationMode, 'guardrail');
  assert.ok(selected.guardrails.successCondition.length > 0);
  assert.ok(selected.guardrails.terminationConditions.length > 0);
  assert.deepEqual(result.cortexPackage.methods, []);
  assert.deepEqual(result.cortexPackage.riskObligations, []);
  assert.deepEqual(result.cortexPackage.preconditionObligations, []);
  assert.ok(result.cortexPackage.disclosureBytes > 0);
});

test('method activation retains the exact legacy entrypoint and contract disclosure', async () => {
  const { result, reads } = await bind('method');
  assert.deepEqual(reads.sort(), [
    `${root}/skills/eternities-muse/SKILL.md`,
    `${root}/skills/eternities-muse/references/capability-contract.json`,
  ]);
  assert.match(result.cortexPackage.selectedPackages[0].entrypoint, /name:\s*eternities-muse/);
  assert.equal(result.cortexPackage.selectedPackages[0].contract.name, 'eternities-muse');
  assert.equal(result.cortexPackage.selectedPackages[0].activationMode, 'method');
  assert.ok(result.cortexPackage.disclosureBytes > 0);
});

test('review activation defers exact selected artifacts without reading or claiming review', async () => {
  const { result, reads } = await bind('review');
  assert.deepEqual(reads, []);
  assert.deepEqual(result.cortexPackage.selectedPackages, []);
  assert.deepEqual(result.cortexPackage.deferredReviews, [{
    id: 'eternities-muse',
    entrypointSha256: result.receipt.selected[0].entrypointSha256,
    contractSha256: result.receipt.selected[0].contractSha256,
    status: 'scheduled-not-executed',
  }]);
  assert.equal(result.cortexPackage.activation.decisions[0].mode, 'review');
  assert.equal(result.cortexPackage.disclosureBytes, 0);
});

test('adaptive recovery reuses the exact activation receipt and rejects a changed policy', async () => {
  const adaptive = resolver();
  const first = await createGodskillsAdapter({ releasePin: releasePin(), transport: routed, activationResolver: adaptive.value });
  const bound = await first.bindMission(input());
  const second = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: async () => { throw new Error('routing must not run during recovery'); },
    activationResolver: adaptive.value,
  });
  const rehydrated = await second.rehydrateMission({ ...input(), receipt: bound.receipt });
  assert.deepEqual(rehydrated.cortexPackage, bound.cortexPackage);
  assert.equal(adaptive.state.calls, 1);

  const changed = { ...resolver().value, policyDigest: '8'.repeat(64) };
  await assert.rejects(
    createGodskillsAdapter({ releasePin: releasePin(), transport: routed, activationResolver: changed }),
    /trusted activation policy/i,
  );
});

test('a mode-bearing resolver cannot forge method activation before selected artifact reads', async () => {
  const reads = [];
  const io = {
    async readFile(path) { reads.push(String(path).replaceAll('\\', '/')); return readFile(path); },
    realpath,
  };
  const adaptive = resolver({ extras: {
    mode: 'method',
    decisions: [{ id: 'eternities-muse', mode: 'method', decisionDigest: '0'.repeat(64) }],
  } });
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(), transport: routed, activationResolver: adaptive.value, io,
  });
  reads.length = 0;
  await assert.rejects(adapter.bindMission(input()), /classification fields/i);
  assert.deepEqual(reads, []);
});

test('adaptive no-qualified route never invokes classification and recovers its empty package', async () => {
  const adaptive = resolver();
  const transport = (request) => {
    const response = routed(request);
    response.routeReceipt.status = 'no-qualified-route';
    response.routeReceipt.selectionKind = 'none';
    response.routeReceipt.selectedIds = [];
    response.routeReceipt.selectedEntrypoints = [];
    return response;
  };
  const adapter = await createGodskillsAdapter({ releasePin: releasePin(), transport, activationResolver: adaptive.value });
  const bound = await adapter.bindMission(input());
  assert.equal(bound.status, 'no-qualified-route');
  assert.equal(adaptive.state.calls, 0);
  assert.deepEqual(bound.receipt.activation.decisions, []);
  assert.equal(bound.receipt.activation.context, null);

  const recovered = await adapter.rehydrateMission({ ...input(), receipt: bound.receipt });
  assert.equal(recovered.status, 'no-qualified-route');
  assert.deepEqual(recovered.cortexPackage, bound.cortexPackage);
  assert.equal(adaptive.state.calls, 0);
});
