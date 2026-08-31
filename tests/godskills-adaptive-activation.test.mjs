import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';
import { compileContractGuardrails } from '../src/skills/contract-guardrails.mjs';

const root = 'C:/dev/eternities-godskills';
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';
const trustRootDigest = 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function activationPin(overrides = {}) {
  return {
    protocolId: 'eternities-godskills-activation-v1',
    executableReceipt: {
      path: 'receipts/adaptive-activation-executable-v1.json',
      sha256: '98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f',
      receiptDigest: trustRootDigest,
    },
    parentReceipt: {
      path: 'receipts/adaptive-activation-v1.json',
      sha256: '6c6d689ecf9df14823407a917e89a5848776fb50eca3b7acc0d70056ae305f70',
      receiptDigest: 'a28a0af7e588f2abbbe1d51a15775dfbeb8d565109d0a176711bfa73b520440f',
    },
    entrypoint: { path: 'scripts/activation.mjs', sha256: 'e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a' },
    compiler: { path: 'src/adaptive-activation.mjs', sha256: '9844aee1147f7129f3e37067424ccebb88ff478de1b7a9a9fb7306d5f2fdbd82' },
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
      logicalDigest: policyDigest,
    },
    evidence: {
      path: 'artifacts/adaptive-activation/evidence.v1.json',
      sha256: 'b55a5cb4f7ff039cc7f4027c165b2f151bad723d9030913076a4225342fbe8c5',
      logicalDigest: evidenceDigest,
    },
    contract: { path: 'artifacts/adaptive-activation/neutral-contract.json', sha256: 'feade348d3fd31afd5103eb296181f68000186d3193a995e4b77c25a06e57c92' },
    ...overrides,
  };
}

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
    activation: activationPin(),
  };
}

function legacyReleasePin() {
  const pin = releasePin();
  delete pin.activation;
  return pin;
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

function routed(request, selectedIds = ['eternities-muse'], status = 'selected') {
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
      status,
      selectionKind: selectedIds.length > 1 ? 'composition' : selectedIds.length === 1 ? 'single' : 'none',
      selectedIds,
      selectedEntrypoints: selectedIds.map((id) => `skills/${id}/SKILL.md`),
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

function activationResult(request, mode) {
  const decisions = request.selected.map(({ selectedId }) => {
    const unsigned = {
      schemaVersion: 1,
      selectedId,
      taskClass: request.classification.taskClass,
      consequenceClass: request.classification.consequenceClass,
      mode,
      reasonCodes: [`fixture-${mode}`],
      preInferenceDisclosure: {
        native: 'none',
        guardrail: 'guardrails-only',
        method: 'entrypoint-and-contract',
        review: 'none',
      }[mode],
      deferredReview: mode === 'review',
      methodEvidence: {
        eligible: false,
        matchedEvaluations: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        criticalRegressions: 0,
        overheadRatio: null,
        failedGates: ['fixture-evidence'],
      },
      policyDigest,
      evidenceDigest,
      authorityProjection: structuredClone(request.authorityProjection),
      authorityExpanded: false,
    };
    return { ...unsigned, decisionDigest: sha256(canonicalJson(unsigned)) };
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: request.protocolId,
    requestId: request.requestId,
    requestDigest: sha256(canonicalJson(request)),
    trustRootDigest: request.trustRootDigest,
    policyDigest,
    evidenceDigest,
    classification: structuredClone(request.classification),
    decisions,
  };
  return { ...unsigned, resultDigest: sha256(canonicalJson(unsigned)) };
}

function compiler({ mode = 'review', consequenceClass = 'consequential', reviewAvailable = true, extras = {}, events } = {}) {
  const state = { classifierCalls: 0, transportCalls: 0, classified: null, request: null };
  return {
    state,
    classifier(projection) {
      state.classifierCalls += 1;
      state.classified = projection;
      events?.push('classify');
      return {
        taskClass: 'creative-generation',
        consequenceClass,
        reviewAvailable,
        ...extras,
      };
    },
    transport(request) {
      state.transportCalls += 1;
      state.request = request;
      events?.push('activation');
      return activationResult(request, mode);
    },
  };
}

test('guardrail termination constraints come only from the verified contract', () => {
  const contract = {
    successCondition: 'contract success',
    failureModes: ['contract failure'],
    effects: ['read'],
    terminationConditions: ['contract termination'],
    activationPolicy: { mode: 'method' },
    methodProse: 'inject this method body',
    evidenceProfiles: [{ preferredMode: 'method' }],
  };
  const manifest = { terminationConditions: ['manifest termination'] };
  const guardrails = compileContractGuardrails(contract, 'fixture-capability');

  assert.deepEqual(guardrails.terminationConditions, ['contract termination']);
  assert.deepEqual(Object.keys(guardrails).sort(), [
    'effects', 'failureModes', 'successCondition', 'terminationConditions',
  ]);
  assert.equal(JSON.stringify(guardrails).includes('inject this method body'), false);
  assert.equal(JSON.stringify(guardrails).includes('preferredMode'), false);
  assert.equal(JSON.stringify(guardrails).includes('activationPolicy'), false);
  assert.equal(JSON.stringify(guardrails).includes(manifest.terminationConditions[0]), false);
  assert.throws(
    () => compileContractGuardrails({ ...contract, terminationConditions: undefined }, 'fixture-capability'),
    /terminationConditions/i,
  );
});

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
  const adaptive = compiler({ ...settings, mode });
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: routed,
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
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
  assert.equal(result.receipt.activation.trustRootDigest, trustRootDigest);
  assert.equal(result.receipt.activation.schemaVersion, 1);
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

test('method activation retains the exact certified entrypoint and contract disclosure', async () => {
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

test('adaptive configuration is all-or-nothing while the legacy path remains unbound', async () => {
  const adaptive = compiler();
  const legacy = await createGodskillsAdapter({ releasePin: legacyReleasePin(), transport: routed });
  assert.equal(typeof legacy.bindMission, 'function');

  const invalid = [
    { releasePin: releasePin() },
    { releasePin: releasePin(), activationClassifier: adaptive.classifier },
    { releasePin: releasePin(), activationTransport: adaptive.transport },
    { releasePin: legacyReleasePin(), activationClassifier: adaptive.classifier, activationTransport: adaptive.transport },
    { releasePin: legacyReleasePin(), activationClassifier: adaptive.classifier },
    { releasePin: legacyReleasePin(), activationTransport: adaptive.transport },
  ];
  for (const options of invalid) {
    let routeCalls = 0;
    await assert.rejects(
      createGodskillsAdapter({
        ...options,
        transport: () => { routeCalls += 1; throw new Error('route must not run'); },
      }),
      /activation/i,
    );
    assert.equal(routeCalls, 0);
  }
});

test('routes then classifies and compiles exact artifacts before any selected body read', async () => {
  const events = [];
  const adaptive = compiler({ mode: 'method', events });
  const io = {
    async readFile(path) {
      const normalized = String(path).replaceAll('\\', '/');
      if (normalized.includes('/skills/eternities-muse/')) events.push(`read:${normalized}`);
      return readFile(path);
    },
    realpath,
  };
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: (request) => { events.push('route'); return routed(request); },
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
    io,
  });
  events.length = 0;
  const supplied = input();
  supplied.mission.explicitMethodRequests = ['eternities-muse'];
  supplied.mission.ignoredSecret = 'must-not-cross';
  await adapter.bindMission(supplied);

  assert.deepEqual(events.slice(0, 3), ['route', 'classify', 'activation']);
  assert.equal(events.slice(3).every((event) => event.startsWith('read:')), true);
  assert.deepEqual(adaptive.state.classified, {
    mission: { requestId: 'adaptive-mission', text: 'implement and verify a consequential feature' },
    selected: [{ id: 'eternities-muse' }],
  });
  assert.equal(adaptive.state.request.selected[0].explicitMethodRequest, true);
});

test('adaptive no-route source identity binds the trust root and explicit requests without compiling', async () => {
  const noRoute = (request) => routed(request, [], 'no-qualified-route');
  const adaptive = compiler();
  const configured = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: noRoute,
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
  });
  const withExplicitInput = input();
  withExplicitInput.mission.explicitMethodRequests = ['eternities-muse'];
  const withExplicit = await configured.bindMission(withExplicitInput);
  const withoutExplicit = await configured.bindMission(input());
  const legacy = await createGodskillsAdapter({ releasePin: legacyReleasePin(), transport: noRoute });
  const unbound = await legacy.bindMission(input());

  assert.notEqual(withExplicit.receipt.sourceEnvelopeDigest, withoutExplicit.receipt.sourceEnvelopeDigest);
  assert.notEqual(withoutExplicit.receipt.sourceEnvelopeDigest, unbound.receipt.sourceEnvelopeDigest);
  assert.equal(Object.hasOwn(withExplicit.receipt, 'activation'), false);
  assert.equal(adaptive.state.classifierCalls, 0);
  assert.equal(adaptive.state.transportCalls, 0);
});

test('adaptive recovery reuses the exact activation binding without route classify or compile calls', async () => {
  const adaptive = compiler({ mode: 'guardrail' });
  const first = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: routed,
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
  });
  const bound = await first.bindMission(input());
  const recovery = compiler({ mode: 'method' });
  const second = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: async () => { throw new Error('routing must not run during recovery'); },
    activationClassifier: () => { recovery.state.classifierCalls += 1; throw new Error('classification must not run during recovery'); },
    activationTransport: () => { recovery.state.transportCalls += 1; throw new Error('activation must not run during recovery'); },
  });
  const rehydrated = await second.rehydrateMission({ ...input(), receipt: bound.receipt });
  assert.deepEqual(rehydrated.cortexPackage, bound.cortexPackage);
  assert.equal(adaptive.state.classifierCalls, 1);
  assert.equal(adaptive.state.transportCalls, 1);
  assert.equal(recovery.state.classifierCalls, 0);
  assert.equal(recovery.state.transportCalls, 0);
});

test('adaptive recovery fails closed on changed identity authority activation disclosure stack or package', async () => {
  const adaptive = compiler({ mode: 'guardrail' });
  const first = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: routed,
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
  });
  const originalInput = input();
  const bound = await first.bindMission(originalInput);
  const calls = { route: 0, classify: 0, activate: 0 };
  const recovery = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: () => { calls.route += 1; throw new Error('route must not run'); },
    activationClassifier: () => { calls.classify += 1; throw new Error('classify must not run'); },
    activationTransport: () => { calls.activate += 1; throw new Error('compile must not run'); },
  });
  const changedReceipt = (mutate) => {
    const receipt = structuredClone(bound.receipt);
    mutate(receipt);
    return receipt;
  };
  const attacks = [
    ['mission', { ...input(), mission: { ...input().mission, text: 'changed mission' } }, bound.receipt],
    ['selection', input(), changedReceipt((receipt) => { receipt.selected[0].entrypointSha256 = '9'.repeat(64); })],
    ['authority', { ...input(), hostEnvelope: { ...hostEnvelope, contextBudget: 8000 } }, bound.receipt],
    ['explicit request', { ...input(), mission: { ...input().mission, explicitMethodRequests: ['eternities-muse'] } }, bound.receipt],
    ['trust root', input(), changedReceipt((receipt) => { receipt.activation.trustRootDigest = '8'.repeat(64); })],
    ['activation bytes', input(), changedReceipt((receipt) => { receipt.activation.decisions[0].mode = 'method'; })],
    ['disclosure bytes', input(), changedReceipt((receipt) => { receipt.activation.decisions[0].preInferenceDisclosure = 'none'; })],
    ['stack', input(), changedReceipt((receipt) => { receipt.stackDigest = '7'.repeat(64); })],
    ['package', input(), changedReceipt((receipt) => { receipt.packageDigest = '6'.repeat(64); })],
  ];
  for (const [name, changedInput, receipt] of attacks) {
    await assert.rejects(
      recovery.rehydrateMission({ ...changedInput, receipt }),
      /activation|authority|digest|disclosure|identity|mission|package|selection|source|stack|trust/i,
      name,
    );
  }
  assert.deepEqual(calls, { route: 0, classify: 0, activate: 0 });
});

test('a mode-bearing classifier cannot forge method activation before selected artifact reads', async () => {
  const reads = [];
  const io = {
    async readFile(path) { reads.push(String(path).replaceAll('\\', '/')); return readFile(path); },
    realpath,
  };
  const adaptive = compiler({ extras: {
    mode: 'method',
    decisions: [{ id: 'eternities-muse', mode: 'method', decisionDigest: '0'.repeat(64) }],
  } });
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport: routed,
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
    io,
  });
  reads.length = 0;
  await assert.rejects(adapter.bindMission(input()), /classification fields/i);
  assert.deepEqual(reads, []);
});

test('adaptive no-qualified route never invokes classification and recovers its empty package', async () => {
  const adaptive = compiler();
  const transport = (request) => {
    const response = routed(request);
    response.routeReceipt.status = 'no-qualified-route';
    response.routeReceipt.selectionKind = 'none';
    response.routeReceipt.selectedIds = [];
    response.routeReceipt.selectedEntrypoints = [];
    return response;
  };
  const adapter = await createGodskillsAdapter({
    releasePin: releasePin(),
    transport,
    activationClassifier: adaptive.classifier,
    activationTransport: adaptive.transport,
  });
  const bound = await adapter.bindMission(input());
  assert.equal(bound.status, 'no-qualified-route');
  assert.equal(adaptive.state.classifierCalls, 0);
  assert.equal(adaptive.state.transportCalls, 0);
  assert.equal(Object.hasOwn(bound.receipt, 'activation'), false);
  assert.equal(Object.hasOwn(bound.cortexPackage, 'activation'), false);

  const recovered = await adapter.rehydrateMission({ ...input(), receipt: bound.receipt });
  assert.equal(recovered.status, 'no-qualified-route');
  assert.deepEqual(recovered.cortexPackage, bound.cortexPackage);
  assert.equal(adaptive.state.classifierCalls, 0);
  assert.equal(adaptive.state.transportCalls, 0);
});

test('runtime source contains no copied activation policy evidence profile or mode selection', async () => {
  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
  const relativeFiles = (await readdir(sourceRoot, { recursive: true }))
    .filter((path) => path.endsWith('.mjs'));
  const sources = await Promise.all(relativeFiles.map(async (path) => ({
    path: path.replaceAll('\\', '/'),
    text: await readFile(join(sourceRoot, path), 'utf8'),
  })));
  const combined = sources.map(({ path, text }) => `\n${path}\n${text}`).join('');
  for (const forbidden of [
    policyDigest,
    evidenceDigest,
    'minimumMatchedEvaluations',
    'minimumWins',
    'minimumWinRate',
    'maximumCriticalRegressions',
    'maximumOverheadRatio',
    'maximumObservedOverheadRatio',
    'eternities-muse:creative-generation',
  ]) {
    assert.equal(combined.includes(forbidden), false, `runtime copied external activation value: ${forbidden}`);
  }
  assert.equal(relativeFiles.some((path) => path.replaceAll('\\', '/') === 'skills/activation-resolver.mjs'), false);
  assert.doesNotMatch(combined, /\bmode\s*=\s*['"](?:native|guardrail|method|review)['"]/);
});
