import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import {
  createRecoverableTypedCompositionCompiler,
  recoverableTypedCompositionSlot,
} from '../../src/skills/recoverable-typed-composition-compiler.mjs';
import {
  buildRecoverableGodskillsCompletion,
  buildRecoverableGodskillsTransportDescriptor,
} from '../../src/skills/recoverable-godskills-contracts.mjs';
import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../../scripts/lib/pinned-godskills-typed-composition.mjs';

export const godskillsRoot = 'C:/dev/eternities-godskills';
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function routeResult(request, selectedIds = ['eternities-muse', 'eternities-forge']) {
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
      status: selectedIds.length === 0 ? 'no-qualified-route' : 'selected',
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

function activationResult(request) {
  const decisions = request.selected.map(({ selectedId }) => {
    const unsigned = {
      schemaVersion: 1,
      selectedId,
      taskClass: request.classification.taskClass,
      consequenceClass: request.classification.consequenceClass,
      mode: 'guardrail',
      reasonCodes: ['recoverable-typed-composition-fixture'],
      preInferenceDisclosure: 'guardrails-only',
      deferredReview: false,
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

export function recoverableTransport(stage, resultFor, { onCall = () => {}, reconciliation = 'absent' } = {}) {
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage,
    transportId: `recoverable-typed-composition-${stage}-fixture-v1`,
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 262_144,
  });
  const completions = new Map();
  const calls = [];
  return {
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        onCall(`${stage}:descriptor`);
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', digest: dispatch.dispatchDigest });
        onCall(`${stage}:reconcile`);
        const completion = completions.get(dispatch.dispatchDigest);
        if (completion) return { status: 'completed', completion: structuredClone(completion) };
        return { status: reconciliation };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', digest: dispatch.dispatchDigest });
        onCall(`${stage}:execute`);
        if (completions.has(dispatch.dispatchDigest)) throw new Error(`duplicate ${stage} execution`);
        const completion = buildRecoverableGodskillsCompletion({
          dispatch,
          transportDescriptor: descriptor,
          result: resultFor(dispatch.request),
          startedAt: stage === 'route'
            ? '2026-08-31T19:00:00.000Z'
            : '2026-08-31T19:01:00.000Z',
          completedAt: stage === 'route'
            ? '2026-08-31T19:00:00.500Z'
            : '2026-08-31T19:01:00.500Z',
        });
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

export function fixtureTransports({ selectedIds, onCall, routeReconciliation = 'absent' } = {}) {
  return {
    route: recoverableTransport('route', (request) => routeResult(request, selectedIds), {
      onCall,
      reconciliation: routeReconciliation,
    }),
    activation: recoverableTransport('activation', activationResult, { onCall }),
  };
}

export function activationClassifier(counter = { count: 0 }) {
  return () => {
    counter.count += 1;
    return { taskClass: 'implementation', consequenceClass: 'consequential', reviewAvailable: false };
  };
}

export function bindingInput(missionId = 'recoverable-typed-composition-canary') {
  const authorityProjection = {
    availableAuthority: ['local-read', 'local-write', 'repository-write'],
    permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['repository-present', 'settled-outcome'],
    maximumRisk: 'high',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 4096,
  };
  return {
    mission: {
      requestId: missionId,
      text: 'design and implement one deterministic typed visual system',
      authority: [...authorityProjection.availableAuthority],
      explicitMethodRequests: [],
    },
    observation: { observationId: `${missionId}-observation`, counter: 0 },
    genomePolicy: {
      protocolId: 'eternities-godskills-adapter-v1',
      profile: 'all-rounder',
      preferredFamilies: [],
      prohibitedFamilies: [],
      prohibitedCapabilities: [],
      maxComposition: 3,
    },
    hostEnvelope: {
      ...structuredClone(authorityProjection),
      forbiddenCapabilities: [],
      maxCompositionSize: 3,
      constitutionAllowedEffects: [...authorityProjection.permittedEffects],
      realmHandContractDigest: 'a'.repeat(64),
    },
    sourceStateEpoch: 0,
  };
}

export async function topology(missionId = 'recoverable-typed-composition-canary') {
  const checked = JSON.parse(await readFile(
    resolve(godskillsRoot, 'artifacts/typed-composition/plan.v1.json'), 'utf8',
  ));
  return {
    schemaVersion: 1,
    protocolId: 'eternities-recoverable-typed-composition-topology-v1',
    missionId,
    authorityProjection: structuredClone(checked.authorityProjection),
    maximumContextBytes: checked.maximumContextBytes,
    missionInputs: structuredClone(checked.missionInputs),
    nodes: checked.nodes.map(({ activationDecisionDigest: _ignored, ...node }) => node),
    links: structuredClone(checked.links),
    missionOutputs: structuredClone(checked.missionOutputs),
  };
}

export function compilerOptions(root, transports, overrides = {}) {
  return {
    root,
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    godskills: {
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      routingTransport: transports.route.adapter,
      activationClassifier: activationClassifier(),
      activationTransport: transports.activation.adapter,
    },
    ...overrides,
  };
}

export function missionInputs() {
  return {
    'available-specialists': ['interface', 'motion', 'accessibility'],
    'design-constraints': ['deterministic', 'bounded-authority'],
    'repository-state': { branch: 'feat/recoverable-typed-composition-v1', clean: false },
    'settled-outcome': { objective: 'compile one recoverable typed mission' },
    'visual-source-set': ['brand-system', 'implemented-interface'],
  };
}

export function executors(observed = []) {
  return {
    'eternities-muse': async (input) => {
      observed.push(structuredClone(input));
      return {
        schemaVersion: 1,
        capabilityId: 'eternities-muse',
        missionId: input.missionId,
        slots: {
          'visual-direction': { direction: 'recoverable-white-fire' },
          'visual-system': { tokens: ['luminance', 'motion'] },
          'specialist-handoff': { target: 'eternities-forge' },
          'acceptance-boundary': {
            invariants: ['activation-bound', 'recoverable-compilation'],
            rejectionCriteria: ['caller-activation', 'serialized-method'],
          },
        },
      };
    },
    'eternities-forge': async (input) => {
      observed.push(structuredClone(input));
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
    },
  };
}

export function executeCount(transport) {
  return transport.calls.filter(({ type }) => type === 'execute').length;
}

export async function buildDeterministicRecoverableTypedCompositionCompilerFixture() {
  const root = await mkdtemp(join(tmpdir(), 'godagents-recoverable-typed-cert-'));
  const missionId = 'recoverable-typed-composition-certification-v1';
  const input = bindingInput(missionId);
  const declaredTopology = await topology(missionId);
  const events = [];
  const compositionReads = [];
  const transports = fixtureTransports({ onCall: (event) => events.push(event) });
  const compositionIo = {
    async readFile(path, ...args) {
      compositionReads.push(String(path));
      return readFile(path, ...args);
    },
  };
  let crashObserved = false;
  try {
    const first = await createRecoverableTypedCompositionCompiler(compilerOptions(
      root,
      transports,
      {
        compositionIo,
        checkpoint: async (name) => {
          events.push(`checkpoint:${name}`);
          if (name === 'after-recoverable-typed-composition-godskills-bound') {
            throw new Error('certification process death after Godskills binding');
          }
        },
      },
    ));
    try {
      await first.compileMission({ bindingInput: input, topology: declaredTopology });
    } catch (error) {
      if (error?.message !== 'certification process death after Godskills binding') throw error;
      crashObserved = true;
    }
    if (!crashObserved) throw new Error('recoverable typed composition certification crash was not observed');

    const resumed = await createRecoverableTypedCompositionCompiler(compilerOptions(
      root, transports, { compositionIo },
    ));
    const [left, right] = await Promise.all([
      resumed.resumeMission({ missionId }),
      resumed.resumeMission({ missionId }),
    ]);
    if (left.compilationDigest !== right.compilationDigest) {
      throw new Error('concurrent recoverable typed composition replay diverged');
    }
    const execution = await resumed.execute({
      compilation: left,
      missionInputs: missionInputs(),
      executors: executors(),
    });
    const slot = recoverableTypedCompositionSlot(missionId);
    const intentText = await readFile(join(root, 'compilations', slot, 'intent.json'), 'utf8');
    const recordText = await readFile(join(root, 'compilations', slot, 'result.json'), 'utf8');
    const intent = JSON.parse(intentText);
    const record = JSON.parse(recordText);
    const observedArtifactFiles = [...new Set(compositionReads.map((path) => relative(
      resolve(godskillsRoot), resolve(path),
    ).replaceAll('\\', '/')))].sort();
    const capabilityMethodOrReviewerBodyReads = observedArtifactFiles.filter(
      (path) => path.startsWith('skills/') || path.endsWith('/SKILL.md'),
    );
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-recoverable-typed-composition-compiler-fixture-v1',
      missionId,
      roots: {
        godskillsReleaseDigest: resumed.descriptor.godskillsReleaseDigest,
        composition: structuredClone(resumed.descriptor.composition),
      },
      recovery: {
        crashObserved,
        routeExecutions: executeCount(transports.route),
        activationExecutions: executeCount(transports.activation),
        concurrentReplayMatched: left.compilationDigest === right.compilationDigest,
        intentDigest: intent.intentDigest,
        topologyDigest: intent.topologyDigest,
        activationResultDigest: record.activationResultDigest,
        planDigest: record.planDigest,
        methodDigest: record.methodDigest,
        compilationDigest: record.compilationDigest,
      },
      state: {
        intentFileSha256: sha256(intentText),
        recordFileSha256: sha256(recordText),
        canonicalIntent: intentText === `${canonicalJson(intent)}\n`,
        canonicalRecord: recordText === `${canonicalJson(record)}\n`,
        serializedMethodFields: (intentText.match(/"method"\s*:/g) ?? []).length
          + (recordText.match(/"method"\s*:/g) ?? []).length,
      },
      execution: {
        outputs: structuredClone(execution.outputs),
        receipt: structuredClone(execution.receipt),
      },
      evidence: {
        intentPublishedBeforeRoute: events.indexOf('checkpoint:after-recoverable-typed-composition-intent')
          < events.indexOf('route:execute'),
        observedArtifactFiles,
        capabilityMethodOrReviewerBodyReads,
      },
      assertions: {
        authorityExpanded: false,
        defaultLaunchEnabled: false,
        methodSerialized: false,
        replayExternalExecutions: executeCount(transports.route) + executeCount(transports.activation) - 2,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256(canonicalJson(unsigned)) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
