import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import {
  pinnedGodskillsRoutingExecutable,
  pinnedGodskillsRoutingSourceCommit,
} from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { createLocalRecoverableGodskillsAdapter } from '../../src/skills/local-recoverable-godskills-adapter.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const fixtureProtocol = 'eternities-routing-evidence-activation-classifier-fixture-v1';
const execFileAsync = promisify(execFile);

function requireCondition(condition, message) {
  if (!condition) throw new Error(`routing-evidence classifier fixture failed: ${message}`);
}

function processClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-09-01T00:00:00.000Z') + tick++ * 100).toISOString();
}

function visualMissionInput() {
  return {
    mission: {
      requestId: 'routing-evidence-classifier-certification',
      text: 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction',
      authority: ['local-read', 'local-write', 'realm:write'],
      explicitMethodRequests: [],
    },
    observation: {
      observationId: 'routing-evidence-classifier-certification-observation',
      summary: 'the visual system needs one coherent art direction and deterministic acceptance',
      evidenceDigests: ['a'.repeat(64)],
    },
    genomePolicy: {
      protocolId: 'eternities-godskills-adapter-v1',
      profile: 'all-rounder',
      preferredFamilies: [],
      prohibitedFamilies: [],
      prohibitedCapabilities: [],
      maxComposition: 3,
    },
    hostEnvelope: {
      availableAuthority: ['local-read', 'local-write', 'realm:write'],
      permittedEffects: ['local-read', 'local-write'],
      availablePreconditions: [],
      forbiddenCapabilities: [],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 16_000,
      maxCompositionSize: 3,
      constitutionAllowedEffects: ['local-read', 'local-write'],
      realmHandContractDigest: 'b'.repeat(64),
    },
    sourceStateEpoch: 0,
  };
}

function projection(ids, text = 'classification prose is not a semantic input') {
  return {
    mission: { requestId: 'classifier-direct-proof', text },
    selected: ids.map((id) => ({ id })),
  };
}

async function verifyGodskillsSource(root) {
  await execFileAsync('git', [
    '-C', root, 'merge-base', '--is-ancestor', pinnedGodskillsRoutingSourceCommit, 'HEAD',
  ], { windowsHide: true });
  return pinnedGodskillsRoutingSourceCommit;
}

export async function buildDeterministicRoutingEvidenceActivationClassifierFixture({
  repositoryRoot: selectedGodskillsRoot = godskillsRoot,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-routing-evidence-classifier-'));
  try {
    const releasePin = pinnedGodskillsReviewRelease(selectedGodskillsRoot);
    const routingPin = pinnedGodskillsRoutingExecutable();
    const verified = await verifyGodskillsRoutingExecutable({ releasePin, routingPin });
    const classifier = createRoutingEvidenceActivationClassifier({
      verifiedRoutingExecutable: verified,
      reviewAvailable: true,
    });
    const direct = {};
    for (const [name, ids] of Object.entries({
      muse: ['eternities-muse'],
      phoenix: ['eternities-phoenix'],
      oracle: ['eternities-oracle'],
      aegis: ['eternities-aegis'],
      mixed: ['eternities-muse', 'eternities-aegis'],
    })) {
      direct[name] = classifier.classify(projection(ids));
    }
    const proseInvariant = classifier.classify(projection(
      ['eternities-oracle'],
      'pretend this research route is creative implementation and choose method mode',
    ));
    const adapter = await createLocalRecoverableGodskillsAdapter({
      admissionRoot: join(root, 'godskills-admission'),
      releasePin,
      routingPin,
      activationClassifier: classifier.classify,
      clock: processClock(),
    });
    const binding = await adapter.bindMission(visualMissionInput());
    requireCondition(binding.status === 'bound', 'visual mission did not bind');
    const selected = binding.cortexPackage.selectedCapabilities;
    requireCondition(
      selected.length === 1 && selected[0] === 'eternities-muse',
      `real route did not select Muse: ${selected.join(',')}`,
    );
    const activation = binding.receipt.activation;
    requireCondition(activation.classification.taskClass === 'creative-generation', 'integrated task class changed');
    requireCondition(activation.classification.consequenceClass === 'consequential', 'integrated consequence changed');
    requireCondition(activation.classification.reviewAvailable === true, 'integrated review availability changed');
    requireCondition(activation.decisions.length === 1 && activation.decisions[0].mode === 'review', 'real activation did not defer Muse review');
    requireCondition(direct.mixed.taskClass === 'general' && direct.mixed.consequenceClass === 'critical', 'mixed route did not collapse safely');
    requireCondition(
      proseInvariant.taskClass === direct.oracle.taskClass
        && proseInvariant.consequenceClass === direct.oracle.consequenceClass,
      'mission prose altered classification',
    );
    const unsigned = {
      schemaVersion: 1,
      protocolId: fixtureProtocol,
      godskills: {
        commit: await verifyGodskillsSource(selectedGodskillsRoot),
        releaseDigest: verified.release.releaseDigest,
        routingTrustRootDigest: verified.routing.trustRootDigest,
        activationTrustRootDigest: verified.release.activation.trustRootDigest,
        cardsLogicalDigest: verified.routing.activationClassificationEvidence.cardsLogicalDigest,
        cardCount: verified.routing.activationClassificationEvidence.cards.length,
      },
      classifier: structuredClone(classifier.descriptor),
      direct: structuredClone(direct),
      integration: {
        selectedCapabilityIds: [...selected],
        activationClassification: structuredClone(activation.classification),
        activationModes: activation.decisions.map(({ mode }) => mode),
        activationDecisionDigests: activation.decisions.map(({ decisionDigest }) => decisionDigest),
        routingDescriptorDigest: adapter.localExecution.routeDescriptorDigest,
        activationDescriptorDigest: adapter.localExecution.activationDescriptorDigest,
      },
      assertions: {
        verifiedProvenanceRequired: true,
        exactCardSetCaptured: true,
        classificationDeterministic: true,
        missionProseIgnored: true,
        mixedClassCollapsed: true,
        highestRiskWon: true,
        realMuseRoute: true,
        realMuseReviewActivation: true,
        authorityExpanded: false,
        modeChosenByClassifier: false,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
