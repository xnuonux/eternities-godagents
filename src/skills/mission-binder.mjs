import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { compileCapabilityEligibility } from './capability-policy.mjs';
import { routeGodskill } from './godskills-adapter.mjs';
import { verifyGodskillsRelease } from './release-verifier.mjs';

const sorted = (values) => [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function intersection(left, right) {
  const allowed = new Set(right);
  return sorted(left.filter((value) => allowed.has(value)));
}

function compileAuthority(mission, hostEnvelope) {
  return deepFreeze({
    availableAuthority: intersection(mission.authority ?? [], hostEnvelope.availableAuthority),
    permittedEffects: intersection(hostEnvelope.permittedEffects, hostEnvelope.constitutionAllowedEffects),
    availablePreconditions: sorted(hostEnvelope.availablePreconditions),
    maximumRisk: hostEnvelope.maximumRisk,
    minimumEvidenceConfidence: hostEnvelope.minimumEvidenceConfidence,
    contextBudget: hostEnvelope.contextBudget,
  });
}

function semanticEffects(release, authority) {
  const permitted = new Set(authority.permittedEffects);
  const effects = [];
  for (const [semantic, concrete] of Object.entries(release.pin.semanticEffectBindings)) {
    if (concrete.every((effect) => permitted.has(effect))) effects.push(semantic);
  }
  return sorted(effects);
}

function requireSelectedEffects(capability, release, authority) {
  const permitted = new Set(authority.permittedEffects);
  for (const semantic of capability.effectVocabulary ?? []) {
    const concrete = release.pin.semanticEffectBindings[semantic];
    if (!concrete) throw new Error(`Godskills semantic effect ${semantic} has no effect binding`);
    for (const effect of concrete) {
      if (!permitted.has(effect)) throw new Error(`Godskills concrete effect binding ${effect} exceeds the host ceiling`);
    }
  }
}

function requireOwnerSelection(capability, selectedIds) {
  if (capability.tier === 'operational-skill' && !selectedIds.includes(capability.ownerGodskillId)) {
    throw new Error(`Godskills operational capability ${capability.id} lacks its owner selection`);
  }
}

function parseContract(bytes, id) {
  try {
    const contract = JSON.parse(bytes.toString('utf8'));
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) throw new Error();
    return contract;
  } catch {
    throw new Error(`Godskills contract for ${id} is invalid`);
  }
}

function valuesFrom(packages, selector) {
  return sorted(packages.flatMap(selector).filter((value) => typeof value === 'string' && value.length > 0));
}

function routeContext({ release, eligibility, authority, hostEnvelope }) {
  const maxCompositionSize = Math.min(
    3,
    release.pin.maximumSelected,
    eligibility.maxComposition,
    hostEnvelope.maxCompositionSize,
  );
  return {
    permittedEffects: semanticEffects(release, authority),
    availableAuthority: authority.availableAuthority,
    availablePreconditions: authority.availablePreconditions,
    forbiddenCapabilities: sorted([...(hostEnvelope.forbiddenCapabilities ?? []), ...eligibility.prohibitedIds]),
    maximumRisk: hostEnvelope.maximumRisk,
    minimumEvidenceConfidence: hostEnvelope.minimumEvidenceConfidence,
    contextBudget: hostEnvelope.contextBudget,
    maxCompositionSize,
  };
}

async function loadPackages(release, selectedIds, entrypoints, eligibility, authority) {
  const eligible = new Set(eligibility.eligibleIds);
  const packages = [];
  for (let index = 0; index < selectedIds.length; index += 1) {
    const id = selectedIds[index];
    if (!eligible.has(id)) throw new Error(`Godskills capability ${id} is not eligible`);
    const capability = release.capabilitiesById.get(id);
    if (!capability) throw new Error(`Godskills capability ${id} is absent from the portable manifest`);
    if (entrypoints[index] !== capability.entrypoint.path) throw new Error(`Godskills entrypoint for ${id} does not match the portable manifest`);
    requireOwnerSelection(capability, selectedIds);
    requireSelectedEffects(capability, release, authority);
    const [entrypointBytes, contractBytes] = await Promise.all([
      release.readSelectedArtifact(capability.entrypoint, `selected entrypoint ${id}`),
      release.readSelectedArtifact(capability.contract, `selected contract ${id}`),
    ]);
    packages.push(deepFreeze({
      id,
      tier: capability.tier,
      ownerGodskillId: capability.ownerGodskillId,
      entrypointSha256: capability.entrypoint.sha256,
      contractSha256: capability.contract.sha256,
      entrypoint: entrypointBytes.toString('utf8'),
      contract: parseContract(contractBytes, id),
      capabilityVocabulary: sorted(capability.capabilityVocabulary),
      effectVocabulary: sorted(capability.effectVocabulary),
      riskObligations: sorted(capability.riskVocabulary),
      evidenceVocabulary: sorted(capability.evidenceVocabulary),
      preconditionObligations: sorted(capability.preconditionVocabulary),
      terminationConditions: sorted(capability.terminationConditions),
    }));
  }
  return packages;
}

function compilePackage({ sourceEnvelopeDigest, release, authority, packages }) {
  const stack = packages.map(({ id, tier, ownerGodskillId, entrypointSha256, contractSha256 }) => ({
    id, tier, ownerGodskillId, entrypointSha256, contractSha256,
  }));
  const stackDigest = sha256Value(stack);
  const cortexPackage = {
    protocolId: release.pin.adapterProtocol,
    sourceEnvelopeDigest,
    releaseDigest: release.releaseDigest,
    stackDigest,
    selectedCapabilities: packages.map(({ id }) => id),
    methods: valuesFrom(packages, ({ capabilityVocabulary }) => capabilityVocabulary),
    evidenceRequirements: valuesFrom(packages, ({ evidenceVocabulary, contract }) => [
      ...evidenceVocabulary,
      ...(contract.sourceIds ?? []),
    ]),
    proposalRequirements: valuesFrom(packages, ({ contract }) => [
      ...(contract.outputs ?? []),
      contract.successCondition,
    ]),
    riskObligations: valuesFrom(packages, ({ riskObligations }) => riskObligations),
    preconditionObligations: valuesFrom(packages, ({ preconditionObligations }) => preconditionObligations),
    terminationConditions: valuesFrom(packages, ({ terminationConditions }) => terminationConditions),
    authorityProjection: authority,
    selectedPackages: packages,
  };
  return { cortexPackage: deepFreeze(cortexPackage), stackDigest };
}

export async function createGodskillsAdapter({ releasePin, transport, artifactCache, io } = {}) {
  if (typeof transport !== 'function') throw new TypeError('Godskills routing transport is required');
  const release = await verifyGodskillsRelease(releasePin, { artifactCache, io });
  return Object.freeze({
    releaseDigest: release.releaseDigest,
    async bindMission({ mission, observation, genomePolicy, hostEnvelope, sourceStateEpoch }) {
      if (!mission?.requestId || !mission?.text) throw new TypeError('Godskills mission identity and text are required');
      const eligibility = compileCapabilityEligibility(genomePolicy, release.manifest);
      const authority = compileAuthority(mission, hostEnvelope);
      const context = routeContext({ release, eligibility, authority, hostEnvelope });
      if (context.permittedEffects.length === 0) throw new Error('Godskills has no permitted semantic effect binding');
      const sourceEnvelope = deepFreeze({
        requestId: mission.requestId,
        mission: mission.text,
        observationDigest: sha256Value(observation),
        sourceStateEpoch,
        genomePolicyDigest: sha256Value(genomePolicy),
        authorityCeilingDigest: sha256Value(authority),
        realmHandContractDigest: hostEnvelope.realmHandContractDigest,
        releaseDigest: release.releaseDigest,
      });
      const sourceEnvelopeDigest = sha256Value(sourceEnvelope);
      const route = await routeGodskill({
        request: { requestId: mission.requestId, text: mission.text },
        hostContext: context,
        transport,
      });
      if (route.status === 'needs-decision') {
        return deepFreeze({
          status: 'needs-decision',
          unresolvedDecisions: route.unresolvedDecisions,
          receipt: null,
          cortexPackage: null,
        });
      }
      const packages = route.status === 'selected'
        ? await loadPackages(release, route.selectedIds, route.entrypoints, eligibility, authority)
        : [];
      const { cortexPackage, stackDigest } = compilePackage({ sourceEnvelopeDigest, release, authority, packages });
      const packageBytes = Buffer.byteLength(canonicalJson(cortexPackage), 'utf8');
      const byteCeiling = Math.min(release.pin.maximumPackageBytes, hostEnvelope.contextBudget * 4);
      if (packageBytes > byteCeiling) throw new Error('Godskills package byte ceiling exceeded');
      const receipt = {
        schemaVersion: 1,
        protocolId: release.pin.adapterProtocol,
        requestId: mission.requestId,
        sourceEnvelopeDigest,
        releaseDigest: release.releaseDigest,
        routerReceiptDigest: sha256Value(route.routeReceipt),
        selectionStatus: route.status,
        selected: packages.map(({ id, entrypointSha256, contractSha256 }) => ({ id, entrypointSha256, contractSha256 })),
        authorityCeilingDigest: sourceEnvelope.authorityCeilingDigest,
        stackDigest,
        packageDigest: sha256Text(canonicalJson(cortexPackage)),
      };
      assertSchema('godskills-cycle-receipt', receipt);
      return deepFreeze({
        status: route.status === 'selected' ? 'bound' : 'no-qualified-route',
        receipt,
        cortexPackage,
      });
    },
  });
}
