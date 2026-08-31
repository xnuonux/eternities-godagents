import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';

const root = 'C:/dev/eternities-godskills';

function releasePin(overrides = {}) {
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
    ...overrides,
  };
}

function preferencePin() {
  return {
    protocolId: 'eternities-godskills-specialist-preference-v1',
    releaseReceipt: {
      path: 'receipts/specialist-preference-routing-v1.json',
      sha256: '3b5164b41aa498ad637def561ff38df76d22a8f95b694a8c37f29ffa363718e7',
      receiptDigest: '992f1efb07de413af42b8da869b0c6b3184a8bd010903a30ecc5735296654080',
    },
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

const specialistGenomePolicy = Object.freeze({
  ...genomePolicy,
  profile: 'specialist',
  preferredFamilies: ['eternities-forge'],
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

function input(overrides = {}) {
  return {
    mission: { requestId: 'mission-1', text: 'implement and verify a consequential feature', authority: ['realm:write'] },
    observation: { observationId: 'observation-1', counter: 0 },
    genomePolicy,
    hostEnvelope,
    sourceStateEpoch: 0,
    ...overrides,
  };
}

function routed(request, selectedIds = ['eternities-forge'], status = 'selected') {
  const selectedEntrypoints = selectedIds.map((id) => `skills/${id}/SKILL.md`);
  const envelope = {
    availableAuthority: [...request.context.availableAuthority],
    permittedEffects: [...request.context.permittedEffects],
    availablePreconditions: [...request.context.availablePreconditions],
    forbiddenCapabilities: [...request.context.forbiddenCapabilities],
    maximumRisk: request.context.maximumRisk,
    minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
    contextBudget: request.context.contextBudget,
    maxCompositionSize: request.context.maxCompositionSize,
  };
  const requestFeatures = {
    permittedEffects: [...request.context.permittedEffects],
    maximumRisk: request.context.maximumRisk,
    minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
    contextBudget: request.context.contextBudget,
  };
  const compilerReceipt = { requestId: request.requestId, envelope };
  const routeReceipt = {
    requestId: request.requestId,
    status,
    selectionKind: selectedIds.length > 1 ? 'composition' : selectedIds.length === 1 ? 'single' : 'none',
    selectedIds,
    selectedEntrypoints,
    requestFeatures,
    unresolvedDecisions: status === 'needs-decision' ? ['effect'] : [],
  };
  if (request.context.preferredCapabilities !== undefined) {
    const suppliedIds = [...request.context.preferredCapabilities];
    const semanticCandidateIds = [...selectedIds].sort();
    envelope.preferredCapabilities = suppliedIds;
    requestFeatures.preferredCapabilities = suppliedIds;
    compilerReceipt.requestDigest = sha256Value(request);
    routeReceipt.requestDigest = sha256Value(envelope);
    routeReceipt.decisionPolicy = 'coverage>card-count>extra-capabilities>effects>context>dependencies>evidence>preference>id';
    routeReceipt.candidateIds = [...new Set([...suppliedIds, ...selectedIds])].sort();
    routeReceipt.preference = {
      protocolId: 'eternities-godskills-specialist-preference-v1',
      suppliedIds,
      qualifiedIds: suppliedIds,
      selectedIds: [...selectedIds],
      baselineSelectedIds: [...selectedIds],
      semanticCandidateIds,
      applied: false,
      reason: status === 'needs-decision'
        ? 'unresolved-decision'
        : status === 'no-qualified-route'
          ? 'no-selection'
          : 'selected-without-effect',
    };
  }
  return { compilerReceipt, routeReceipt };
}

async function adapterFor(selector, options = {}) {
  let observedRequest;
  const adapter = await createGodskillsAdapter({
    releasePin: options.releasePin ?? releasePin(),
    io: options.io,
    transport: async (request) => {
      observedRequest = request;
      return selector(request);
    },
  });
  return { adapter, request: () => observedRequest };
}

test('binds one selected first-party capability into a body-free receipt and bounded cortex package', async () => {
  const { adapter, request } = await adapterFor((value) => routed(value));
  const result = await adapter.bindMission(input());

  assert.equal(result.status, 'bound');
  assert.deepEqual(result.cortexPackage.selectedCapabilities, ['eternities-forge']);
  assert.match(result.cortexPackage.selectedPackages[0].entrypoint, /name:\s*eternities-forge/);
  assert.equal(result.cortexPackage.selectedPackages[0].contract.name, 'eternities-forge');
  assert.ok(result.cortexPackage.methods.includes('implement bounded slices'));
  assert.ok(result.cortexPackage.terminationConditions.length > 0);
  assert.equal(JSON.stringify(result.receipt).includes('implement bounded slices'), false);
  assert.equal(JSON.stringify(result.cortexPackage).includes(root), false);
  assert.deepEqual(request().context.permittedEffects, ['local-read', 'local-write']);
  assert.deepEqual(request().context.availableAuthority, ['realm:write']);
  assert.equal(request().requestId, `${input().mission.requestId}:${result.receipt.sourceEnvelopeDigest}`);
});

test('opens only the selected entrypoint and contract after release verification', async () => {
  const reads = [];
  const io = {
    async readFile(path) { reads.push(String(path).replaceAll('\\', '/')); return readFile(path); },
    realpath,
  };
  const { adapter } = await adapterFor((value) => routed(value), { io });
  reads.length = 0;
  await adapter.bindMission(input());
  assert.deepEqual(reads.sort(), [
    `${root}/skills/eternities-forge/SKILL.md`,
    `${root}/skills/eternities-forge/references/capability-contract.json`,
  ]);
});

test('specialization prohibitions and owner hierarchy fail closed', async () => {
  const prohibited = { ...genomePolicy, prohibitedCapabilities: ['eternities-forge'] };
  const { adapter } = await adapterFor((value) => routed(value));
  await assert.rejects(adapter.bindMission(input({ genomePolicy: prohibited })), /not eligible/);

  await assert.rejects(adapter.bindMission(input({
    hostEnvelope: { ...hostEnvelope, forbiddenCapabilities: ['eternities-forge'] },
  })), /forbidden by host/i);

  const operational = await adapterFor((value) => routed(value, ['bounded-service-shutdown']));
  await assert.rejects(operational.adapter.bindMission(input()), /owner selection/);
});

test('semantic effects can only narrow through explicit concrete host bindings', async () => {
  const { adapter } = await adapterFor((value) => routed(value));
  await assert.rejects(adapter.bindMission(input({
    hostEnvelope: { ...hostEnvelope, permittedEffects: ['local-read'], constitutionAllowedEffects: ['local-read'] },
  })), /effect binding.*local-write|concrete effect/);

  const unmapped = await adapterFor((value) => routed(value), {
    releasePin: releasePin({ semanticEffectBindings: { read: ['local-read'], write: ['external-write'] } }),
  });
  await assert.rejects(unmapped.adapter.bindMission(input()), /effect binding.*external-write|concrete effect/);
});

test('composition and package budgets fail before a cortex package is admitted', async () => {
  const overflow = await adapterFor((value) => routed(value, ['eternities-forge', 'eternities-oracle', 'eternities-architect', 'eternities-aegis']));
  await assert.rejects(overflow.adapter.bindMission(input()), /maximum composition/);

  const tiny = await adapterFor((value) => routed(value), { releasePin: releasePin({ maximumPackageBytes: 128 }) });
  await assert.rejects(tiny.adapter.bindMission(input()), /package byte ceiling/);
});

test('different selected contracts shape method evidence proposal and termination inputs without changing authority', async () => {
  const forge = await adapterFor((value) => routed(value, ['eternities-forge']));
  const oracle = await adapterFor((value) => routed(value, ['eternities-oracle']));
  const first = await forge.adapter.bindMission(input());
  const second = await oracle.adapter.bindMission(input());
  assert.notDeepEqual(first.cortexPackage.methods, second.cortexPackage.methods);
  assert.notDeepEqual(first.cortexPackage.evidenceRequirements, second.cortexPackage.evidenceRequirements);
  assert.notDeepEqual(first.cortexPackage.proposalRequirements, second.cortexPackage.proposalRequirements);
  assert.notDeepEqual(first.cortexPackage.terminationConditions, second.cortexPackage.terminationConditions);
  assert.deepEqual(first.cortexPackage.authorityProjection, second.cortexPackage.authorityProjection);
});

test('no-qualified route binds an empty package while needs-decision remains unresolved', async () => {
  const none = await adapterFor((value) => routed(value, [], 'no-qualified-route'));
  const empty = await none.adapter.bindMission(input());
  assert.equal(empty.status, 'no-qualified-route');
  assert.deepEqual(empty.cortexPackage.selectedPackages, []);
  assert.match(empty.receipt.packageDigest, /^[a-f0-9]{64}$/);

  const decision = await adapterFor((value) => routed(value, [], 'needs-decision'));
  const unresolved = await decision.adapter.bindMission(input());
  assert.deepEqual(unresolved, {
    status: 'needs-decision',
    unresolvedDecisions: ['effect'],
    receipt: null,
    cortexPackage: null,
  });
});

test('rehydrates a durable selected receipt without invoking the router again', async () => {
  const first = await adapterFor((value) => routed(value, ['eternities-forge']));
  const bound = await first.adapter.bindMission(input());
  let routeCalls = 0;
  const second = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: async () => { routeCalls += 1; throw new Error('router must not run during rehydration'); },
  });
  const rehydrated = await second.rehydrateMission({ ...input(), receipt: bound.receipt });
  assert.equal(routeCalls, 0);
  assert.equal(rehydrated.receipt.packageDigest, bound.receipt.packageDigest);
  assert.deepEqual(rehydrated.cortexPackage, bound.cortexPackage);
});

test('specialist preference is derived from verified eligibility and durably bound to the cycle', async () => {
  const { adapter, request } = await adapterFor((value) => routed(value), {
    releasePin: releasePin({ preference: preferencePin() }),
  });
  const bound = await adapter.bindMission(input({ genomePolicy: specialistGenomePolicy }));
  const forwarded = request().context.preferredCapabilities;

  assert.ok(forwarded.length >= 1);
  assert.ok(forwarded.includes('eternities-forge'));
  assert.deepEqual(forwarded, [...forwarded].sort());
  assert.deepEqual(bound.receipt.preference.suppliedIds, forwarded);
  assert.deepEqual(bound.receipt.preference.selectedIds, ['eternities-forge']);
  assert.equal(bound.receipt.preference.trustRootDigest, preferencePin().releaseReceipt.receiptDigest);
  const { preferenceDigest, ...body } = bound.receipt.preference;
  assert.equal(preferenceDigest, sha256Value(body));
});

test('all-rounder and legacy release paths never activate specialist preference', async () => {
  const allRounder = { ...genomePolicy, preferredFamilies: ['eternities-forge'] };
  const rooted = await adapterFor((value) => routed(value), {
    releasePin: releasePin({ preference: preferencePin() }),
  });
  const rootedResult = await rooted.adapter.bindMission(input({ genomePolicy: allRounder }));
  assert.equal(rooted.request().context.preferredCapabilities, undefined);
  assert.equal(rootedResult.receipt.preference, undefined);

  const legacy = await adapterFor((value) => routed(value));
  const legacyResult = await legacy.adapter.bindMission(input({ genomePolicy: specialistGenomePolicy }));
  assert.equal(legacy.request().context.preferredCapabilities, undefined);
  assert.equal(legacyResult.receipt.preference, undefined);
});

test('specialist recovery replays no route and rejects changed preference identity', async () => {
  const release = releasePin({ preference: preferencePin() });
  const first = await adapterFor((value) => routed(value), { releasePin: release });
  const bound = await first.adapter.bindMission(input({ genomePolicy: specialistGenomePolicy }));
  let routeCalls = 0;
  const second = await createGodskillsAdapter({
    releasePin: release,
    transport: async () => { routeCalls += 1; throw new Error('router must not run during rehydration'); },
  });
  const rehydrated = await second.rehydrateMission({
    ...input({ genomePolicy: specialistGenomePolicy }),
    receipt: bound.receipt,
  });
  assert.equal(routeCalls, 0);
  assert.deepEqual(rehydrated.receipt, bound.receipt);
  assert.deepEqual(rehydrated.cortexPackage, bound.cortexPackage);

  await assert.rejects(second.rehydrateMission({
    ...input({
      genomePolicy: { ...specialistGenomePolicy, preferredFamilies: ['eternities-oracle'] },
    }),
    receipt: bound.receipt,
  }), /preference|source envelope/i);

  const tampered = structuredClone(bound.receipt);
  tampered.preference.suppliedIds = ['eternities-aegis'];
  await assert.rejects(second.rehydrateMission({
    ...input({ genomePolicy: specialistGenomePolicy }),
    receipt: tampered,
  }), /preference/i);

  const contradictory = structuredClone(bound.receipt);
  contradictory.preference.reason = 'no-selection';
  const { preferenceDigest: _oldDigest, ...contradictoryBody } = contradictory.preference;
  contradictory.preference.preferenceDigest = sha256Value(contradictoryBody);
  await assert.rejects(second.rehydrateMission({
    ...input({ genomePolicy: specialistGenomePolicy }),
    receipt: contradictory,
  }), /preference/i);
});
