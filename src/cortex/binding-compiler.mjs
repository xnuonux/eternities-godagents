import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { verifyGenesisAdmission } from '../genesis/verify.mjs';
import { assertNoCredentialFields } from './receipt-safety.mjs';

const protocolId = 'eternities-godagent-cortex-binding-v1';
const optionalProjectionOrder = Object.freeze(['expression', 'capability', 'continuity']);
const envelopeSections = Object.freeze([
  'binding', 'identity', 'expression', 'continuity', 'mission', 'capability', 'authority', 'causal',
]);
const mandatoryProjectionSections = Object.freeze(['binding', 'identity', 'mission', 'authority', 'causal', 'sectionDigests']);

const clone = (value) => structuredClone(value);
const bytes = (value) => Buffer.byteLength(canonicalJson(value), 'utf8');
const sorted = (values) => [...values].sort();
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;

function assertRequestValues(request) {
  for (const value of [
    request.task.taskId,
    request.task.hostAdapterId,
    request.mission.missionId,
    request.mission.observation.observationId,
  ]) {
    if (!identifierPattern.test(value) || value === '.' || value === '..') {
      throw new TypeError('invalid cortex binding identifier');
    }
  }
  for (const digest of request.mission.observation.evidenceDigests) {
    if (!digestPattern.test(digest)) throw new TypeError('invalid cortex binding evidence digest');
  }
}

function moduleProjection(moduleManifest, kind) {
  const row = moduleManifest.modules.find((entry) => entry.kind === kind);
  if (!row) throw new IntegrityError(`verified creation lacks ${kind} module`);
  return { ref: row.ref, digest: row.sha256 };
}

function assertVerifiedSources({ receipt, creationSnapshot, distributionSnapshot, keelSnapshot }) {
  const { manifest, candidate, expression, moduleManifest, genome } = creationSnapshot;
  if (manifest.buildId !== receipt.creationBuildId
      || distributionSnapshot.manifest.buildId !== receipt.distributionBuildId
      || manifest.policyDigest !== receipt.policyDigest
      || manifest.genomeDigest !== receipt.genomeValueDigest
      || distributionSnapshot.manifest.genomeDigest !== receipt.genomeContentDigest) {
    throw new IntegrityError('cortex binding source identity mismatch');
  }
  if (canonicalJson(genome) !== canonicalJson(distributionSnapshot.genome)) {
    throw new IntegrityError('cortex binding genome snapshots differ');
  }
  if (`expression:${expression.id}@${expression.version}` !== candidate.expressionRef) {
    throw new IntegrityError('cortex binding expression identity mismatch');
  }
  if (keelSnapshot.keelId !== receipt.keelId
      || keelSnapshot.instanceId !== receipt.instanceId
      || keelSnapshot.genesisId !== receipt.genesisId
      || keelSnapshot.status !== 'active') {
    throw new IntegrityError('cortex binding keel identity mismatch');
  }
  if (moduleManifest.candidateDigest !== manifest.candidateDigest
      || moduleManifest.expressionDigest !== manifest.expressionDigest
      || moduleManifest.policyDigest !== manifest.policyDigest) {
    throw new IntegrityError('cortex binding creation projection mismatch');
  }
}

function deriveBindingCandidateId({ receipt, keelSnapshot, task }) {
  return sha256Value({
    schemaVersion: 1,
    protocolId,
    status: 'compiled-inert',
    admissionReceiptDigest: receipt.receiptDigest,
    instanceId: receipt.instanceId,
    genesisId: receipt.genesisId,
    keelId: receipt.keelId,
    currentKeelHeadDigest: keelSnapshot.headDigest,
    task: clone(task),
  });
}

function compileFullEnvelope({ verified, request, bindingCandidateId }) {
  const { receipt, creationSnapshot, distributionSnapshot, keelSnapshot } = verified;
  const { manifest, candidate, expression, moduleManifest, genome } = creationSnapshot;
  const realm = distributionSnapshot.realmContract;
  const declaredEffectCeiling = sorted(candidate.constitution.allowedEffects);
  const modules = moduleManifest.modules
    .map((row) => ({ kind: row.kind, ref: row.ref, digest: row.sha256 }))
    .sort((left, right) => left.kind.localeCompare(right.kind));

  const envelope = {
    schemaVersion: 1,
    protocolId,
    binding: {
      status: 'compiled-inert',
      active: false,
      bindingCandidateId,
      taskId: request.task.taskId,
      hostAdapterId: request.task.hostAdapterId,
      revocationEpoch: request.task.revocationEpoch,
      instanceId: receipt.instanceId,
      genesisId: receipt.genesisId,
      keelId: receipt.keelId,
      creationBuildId: receipt.creationBuildId,
      distributionBuildId: receipt.distributionBuildId,
      creationCandidateDigest: manifest.candidateDigest,
      policyDigest: receipt.policyDigest,
      expressionDigest: manifest.expressionDigest,
      moduleManifestDigest: manifest.moduleManifestDigest,
      genomeValueDigest: receipt.genomeValueDigest,
      genomeContentDigest: receipt.genomeContentDigest,
      admissionReceiptDigest: receipt.receiptDigest,
      admissionKeelHeadDigest: receipt.keelHeadDigest,
      currentKeelHeadDigest: keelSnapshot.headDigest,
    },
    identity: {
      blueprint: clone(candidate.blueprint),
      name: expression.name,
      pronouns: sorted(expression.pronouns),
      genderPresentation: expression.genderPresentation,
      voiceDisplayName: expression.voiceDisplayName,
      lineage: moduleProjection(moduleManifest, 'lineage'),
      archetype: moduleProjection(moduleManifest, 'archetype'),
      personality: moduleProjection(moduleManifest, 'personality'),
      voice: moduleProjection(moduleManifest, 'voice'),
      telos: clone(candidate.telos),
      constitution: {
        ...clone(candidate.constitution),
        principles: sorted(candidate.constitution.principles),
        allowedEffects: declaredEffectCeiling,
      },
      genesis: {
        createdBy: candidate.genesis.createdBy,
        creatorRef: receipt.creatorRef,
        sourceManifest: sorted(candidate.genesis.sourceManifest),
        genesisId: receipt.genesisId,
        soulPortStatus: candidate.soulPort.status,
      },
    },
    expression: {
      narrativeDescription: expression.narrativeDescription,
      visual: {
        ...clone(expression.visual),
        colors: sorted(expression.visual.colors),
      },
      presentationTags: sorted(expression.presentationTags),
      provenance: clone(expression.provenance),
    },
    continuity: {
      source: 'verified-keel-head-only',
      historyIncluded: false,
      keelId: keelSnapshot.keelId,
      status: keelSnapshot.status,
      stateDigest: keelSnapshot.stateDigest,
      recordCount: keelSnapshot.recordCount,
      headDigest: keelSnapshot.headDigest,
      admittedHeadDigest: receipt.keelHeadDigest,
      entries: [],
    },
    mission: clone(request.mission),
    capability: {
      cortex: {
        allowedAdapters: sorted(genome.cortex.allowedAdapters),
        requiredCapabilities: sorted(genome.cortex.requiredCapabilities),
      },
      promptOs: {
        edition: genome.promptOs.edition,
        allowedAdapters: sorted(genome.promptOs.allowedAdapters),
        requiredCapabilities: sorted(genome.promptOs.requiredCapabilities),
      },
      godskills: {
        protocolId: genome.godskills.protocolId,
        profile: genome.godskills.profile,
        preferredFamilies: sorted(genome.godskills.preferredFamilies),
        prohibitedFamilies: sorted(genome.godskills.prohibitedFamilies),
        prohibitedCapabilities: sorted(genome.godskills.prohibitedCapabilities),
        maxComposition: genome.godskills.maxComposition,
        selectedIds: [],
        selectedContractDigests: [],
      },
      realmRequiredCapabilities: sorted(genome.realm.requiredCapabilities),
      modules,
    },
    authority: {
      state: 'inert',
      grantedEffects: [],
      declaredEffectCeiling,
      realmId: realm.realmId,
      realmContractVersion: realm.version,
      realmContractDigest: sha256Value(realm),
      realmCapabilities: sorted(realm.capabilities),
      resourceLimits: realm.schemaVersion === 2
        ? { profile: realm.profile, maximumArtifactBytes: realm.artifactStore.maximumBytes }
        : clone(realm.resources),
      activationRequirements: [
        'verified-binding-registry',
        'exclusive-writer-lease',
        'host-issued-binding-receipt',
      ],
      blockedUntilActivation: declaredEffectCeiling,
      externalActionBoundary: 'host-validated-only',
    },
    causal: {
      runtimeState: 'not-bound',
      genesisReceiptDigest: receipt.receiptDigest,
      journalBindingBaseDigest: receipt.journalBindingBaseDigest,
      journalHeadDigest: receipt.journalHeadDigest,
      admissionKeelHeadDigest: receipt.keelHeadDigest,
      currentKeelHeadDigest: keelSnapshot.headDigest,
      keelStateDigest: keelSnapshot.stateDigest,
      priorDecisionReceipt: 'none',
      pendingReconciliation: false,
    },
  };
  envelope.sectionDigests = Object.fromEntries(
    envelopeSections.map((section) => [section, sha256Value(envelope[section])]),
  );
  assertNoCredentialFields(envelope);
  assertSchema('cortex-identity-envelope', envelope);
  return envelope;
}

function compactEnvelope(fullEnvelope, fullEnvelopeDigest, maxProjectionBytes) {
  const projection = {
    schemaVersion: 1,
    protocolId,
    bindingCandidateId: fullEnvelope.binding.bindingCandidateId,
    fullEnvelopeDigest,
    binding: clone(fullEnvelope.binding),
    identity: clone(fullEnvelope.identity),
    expression: clone(fullEnvelope.expression),
    continuity: clone(fullEnvelope.continuity),
    mission: clone(fullEnvelope.mission),
    capability: clone(fullEnvelope.capability),
    authority: clone(fullEnvelope.authority),
    causal: clone(fullEnvelope.causal),
    sectionDigests: clone(fullEnvelope.sectionDigests),
    digestReferences: [],
  };

  for (const section of optionalProjectionOrder) {
    if (bytes(projection) <= maxProjectionBytes) break;
    projection.digestReferences.push({
      section,
      digest: fullEnvelope.sectionDigests[section],
      reason: 'projection-budget',
    });
    delete projection[section];
  }
  if (bytes(projection) > maxProjectionBytes) {
    throw new RangeError('mandatory cortex binding projection exceeds maxProjectionBytes');
  }
  assertSchema('cortex-model-projection', projection);
  return projection;
}

function assertProjectionIntegrity(candidate) {
  const { fullEnvelope, modelProjection, compaction } = candidate;
  if (candidate.bindingCandidateId !== fullEnvelope.binding.bindingCandidateId
      || candidate.bindingCandidateId !== modelProjection.bindingCandidateId) {
    throw new IntegrityError('binding candidate identity mismatch');
  }
  if (modelProjection.fullEnvelopeDigest !== candidate.fullEnvelopeDigest) {
    throw new IntegrityError('model projection envelope binding mismatch');
  }
  for (const section of mandatoryProjectionSections) {
    if (canonicalJson(modelProjection[section]) !== canonicalJson(fullEnvelope[section])) {
      throw new IntegrityError(`mandatory model projection section mismatch: ${section}`);
    }
  }
  for (const section of envelopeSections) {
    if (fullEnvelope.sectionDigests[section] !== sha256Value(fullEnvelope[section])) {
      throw new IntegrityError(`full envelope section digest mismatch: ${section}`);
    }
  }

  const references = new Map(modelProjection.digestReferences.map((row) => [row.section, row]));
  if (references.size !== modelProjection.digestReferences.length) {
    throw new IntegrityError('model projection repeats a digest reference');
  }
  const expectedReferenceOrder = [];
  let inlineSectionReached = false;
  for (const section of optionalProjectionOrder) {
    const inline = Object.hasOwn(modelProjection, section);
    const reference = references.get(section);
    if (inline === Boolean(reference)) {
      throw new IntegrityError(`model projection must inline or reference ${section}`);
    }
    if (inline && canonicalJson(modelProjection[section]) !== canonicalJson(fullEnvelope[section])) {
      throw new IntegrityError(`optional model projection section mismatch: ${section}`);
    }
    if (reference) {
      if (inlineSectionReached) throw new IntegrityError('model projection violates compaction priority');
      if (reference.digest !== fullEnvelope.sectionDigests[section]) {
        throw new IntegrityError(`model projection digest reference mismatch: ${section}`);
      }
      expectedReferenceOrder.push(section);
    } else {
      inlineSectionReached = true;
    }
  }
  if (canonicalJson(expectedReferenceOrder) !== canonicalJson(modelProjection.digestReferences.map((row) => row.section))) {
    throw new IntegrityError('model projection digest reference order mismatch');
  }
  if (canonicalJson(modelProjection.digestReferences) !== canonicalJson(compaction.referencedSections)) {
    throw new IntegrityError('compaction reference summary mismatch');
  }
  if (bytes(fullEnvelope) !== compaction.fullEnvelopeBytes
      || bytes(modelProjection) !== compaction.modelProjectionBytes) {
    throw new IntegrityError('cortex binding byte count mismatch');
  }
  if (compaction.modelProjectionBytes > compaction.maxProjectionBytes) {
    throw new IntegrityError('cortex binding projection exceeds declared budget');
  }
}

export function verifyCortexBindingCandidate(value) {
  const candidate = clone(value);
  assertNoCredentialFields(candidate);
  assertSchema('cortex-binding-candidate', candidate);
  assertSchema('cortex-identity-envelope', candidate.fullEnvelope);
  assertSchema('cortex-model-projection', candidate.modelProjection);
  if (sha256Value(candidate.fullEnvelope) !== candidate.fullEnvelopeDigest) {
    throw new IntegrityError('full envelope digest mismatch');
  }
  if (sha256Value(candidate.modelProjection) !== candidate.modelProjectionDigest) {
    throw new IntegrityError('model projection digest mismatch');
  }
  assertProjectionIntegrity(candidate);
  const { candidateDigest, ...unsigned } = candidate;
  if (sha256Value(unsigned) !== candidateDigest) throw new IntegrityError('cortex binding candidate digest mismatch');
  return deepFreeze(candidate);
}

export async function compileCortexBindingCandidate({ admission, request }) {
  assertNoCredentialFields(request);
  assertSchema('cortex-binding-request', request);
  assertRequestValues(request);
  const verified = await verifyGenesisAdmission(admission);
  assertVerifiedSources(verified);
  const bindingCandidateId = deriveBindingCandidateId({
    receipt: verified.receipt,
    keelSnapshot: verified.keelSnapshot,
    task: request.task,
  });
  const fullEnvelope = compileFullEnvelope({ verified, request, bindingCandidateId });
  const fullEnvelopeDigest = sha256Value(fullEnvelope);
  const modelProjection = compactEnvelope(fullEnvelope, fullEnvelopeDigest, request.maxProjectionBytes);
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    status: 'compiled-inert',
    active: false,
    bindingCandidateId,
    fullEnvelope,
    fullEnvelopeDigest,
    modelProjection,
    modelProjectionDigest: sha256Value(modelProjection),
    compaction: {
      strategy: 'priority-digest-reference-v1',
      maxProjectionBytes: request.maxProjectionBytes,
      fullEnvelopeBytes: bytes(fullEnvelope),
      modelProjectionBytes: bytes(modelProjection),
      referencedSections: clone(modelProjection.digestReferences),
    },
  };
  return verifyCortexBindingCandidate({ ...unsigned, candidateDigest: sha256Value(unsigned) });
}
