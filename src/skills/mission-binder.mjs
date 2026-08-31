import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { createGodskillsActivationAdapter } from './activation-adapter.mjs';
import { compileCapabilityEligibility } from './capability-policy.mjs';
import { compileContractGuardrails } from './contract-guardrails.mjs';
import { routeGodskill } from './godskills-adapter.mjs';
import { verifyGodskillsRelease } from './release-verifier.mjs';

const sorted = (values) => [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));
const preferenceReasons = new Set([
  'equal-quality-tie-break',
  'selected-without-effect',
  'stronger-nonpreferred-selection',
  'preference-not-route-capable',
  'preference-not-semantic-candidate',
  'no-qualified-preference',
  'no-selection',
  'unresolved-decision',
]);

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

function equalArrays(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function deriveSpecialistPreference(release, genomePolicy, eligibility) {
  if (!release.preference || genomePolicy.profile !== 'specialist' || eligibility.preferredIds.length === 0) {
    return null;
  }
  return deepFreeze({
    protocolId: release.preference.protocolId,
    trustRootDigest: release.preference.trustRootDigest,
    preferredCapabilities: [...eligibility.preferredIds],
  });
}

function preferenceRequest(preference) {
  return preference === null ? null : {
    protocolId: preference.protocolId,
    preferredCapabilities: [...preference.preferredCapabilities],
  };
}

function bindPreference(preference, routeReceipt) {
  if (preference === null) return null;
  const routed = routeReceipt.preference;
  if (!routed) throw new Error('Godskills specialist route lacks its preference receipt');
  const body = {
    protocolId: preference.protocolId,
    trustRootDigest: preference.trustRootDigest,
    suppliedIds: [...routed.suppliedIds],
    qualifiedIds: [...routed.qualifiedIds],
    selectedIds: [...routed.selectedIds],
    baselineSelectedIds: [...routed.baselineSelectedIds],
    semanticCandidateIds: [...routed.semanticCandidateIds],
    applied: routed.applied,
    reason: routed.reason,
  };
  return deepFreeze({ ...body, preferenceDigest: sha256Value(body) });
}

function validateRecoveryPreference(binding, preference, selectedIds, selectionStatus) {
  if (preference === null) {
    if (binding !== undefined) throw new Error('Godskills recovery has an unexpected specialist preference binding');
    return;
  }
  if (!binding) throw new Error('Godskills recovery lacks its specialist preference binding');
  const { preferenceDigest, ...body } = binding;
  if (preferenceDigest !== sha256Value(body)) throw new Error('Godskills recovery preference digest mismatch');
  if (binding.protocolId !== preference.protocolId
      || binding.trustRootDigest !== preference.trustRootDigest
      || !equalArrays(binding.suppliedIds, preference.preferredCapabilities)
      || !equalArrays(binding.selectedIds, selectedIds)) {
    throw new Error('Godskills recovery preference identity mismatch');
  }
  for (const values of [
    binding.suppliedIds,
    binding.qualifiedIds,
    binding.selectedIds,
    binding.baselineSelectedIds,
    binding.semanticCandidateIds,
  ]) {
    if (new Set(values).size !== values.length || !equalArrays(values, [...values].sort())) {
      throw new Error('Godskills recovery preference sets must be sorted and unique');
    }
  }
  const supplied = new Set(binding.suppliedIds);
  const qualified = new Set(binding.qualifiedIds);
  const semantic = new Set(binding.semanticCandidateIds);
  for (const id of binding.qualifiedIds) {
    if (!supplied.has(id)) throw new Error('Godskills recovery preference qualification is inconsistent');
  }
  for (const id of [...binding.selectedIds, ...binding.baselineSelectedIds]) {
    if (!semantic.has(id)) throw new Error('Godskills recovery preference selection escaped semantic candidates');
    if (supplied.has(id) && !qualified.has(id)) {
      throw new Error('Godskills recovery selected preference was not qualified');
    }
  }
  if (!preferenceReasons.has(binding.reason)
      || binding.applied !== !equalArrays(binding.selectedIds, binding.baselineSelectedIds)
      || binding.applied !== (binding.reason === 'equal-quality-tie-break')) {
    throw new Error('Godskills recovery preference disposition is inconsistent');
  }
  if (selectionStatus === 'no-qualified-route'
      && (binding.reason !== 'no-selection' || binding.selectedIds.length > 0)) {
    throw new Error('Godskills recovery no-route preference is inconsistent');
  }
  if (selectionStatus === 'selected'
      && (binding.reason === 'no-selection' || binding.reason === 'unresolved-decision')) {
    throw new Error('Godskills recovery selected preference has a terminal-only reason');
  }
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
    permittedEffects: authority.permittedEffects,
    availableAuthority: authority.availableAuthority,
    availablePreconditions: authority.availablePreconditions,
    forbiddenCapabilities: sorted([...(hostEnvelope.forbiddenCapabilities ?? []), ...eligibility.prohibitedIds]),
    maximumRisk: hostEnvelope.maximumRisk,
    minimumEvidenceConfidence: hostEnvelope.minimumEvidenceConfidence,
    contextBudget: hostEnvelope.contextBudget,
    maxCompositionSize,
  };
}

function sourceEnvelopeFor({
  mission,
  observation,
  genomePolicy,
  hostEnvelope,
  sourceStateEpoch,
  authority,
  release,
  activationTrustRootDigest = null,
  preference = null,
}) {
  const envelope = {
    requestId: mission.requestId,
    mission: mission.text,
    observationDigest: sha256Value(observation),
    sourceStateEpoch,
    genomePolicyDigest: sha256Value(genomePolicy),
    authorityCeilingDigest: sha256Value(authority),
    realmHandContractDigest: hostEnvelope.realmHandContractDigest,
    releaseDigest: release.releaseDigest,
  };
  if (activationTrustRootDigest !== null) {
    envelope.activationTrustRootDigest = activationTrustRootDigest;
    envelope.explicitMethodRequests = sorted(mission.explicitMethodRequests ?? []);
  }
  if (preference !== null) {
    envelope.preferenceTrustRootDigest = preference.trustRootDigest;
    envelope.preferredCapabilities = [...preference.preferredCapabilities];
  }
  return deepFreeze(envelope);
}

function resolveSelectedCapabilities(release, selectedIds, entrypoints, eligibility, authority, forbiddenIds) {
  const eligible = new Set(eligibility.eligibleIds);
  const forbidden = new Set(forbiddenIds);
  const selected = [];
  for (let index = 0; index < selectedIds.length; index += 1) {
    const id = selectedIds[index];
    if (forbidden.has(id)) throw new Error(`Godskills capability ${id} is forbidden by host`);
    if (!eligible.has(id)) throw new Error(`Godskills capability ${id} is not eligible`);
    const capability = release.capabilitiesById.get(id);
    if (!capability) throw new Error(`Godskills capability ${id} is absent from the portable manifest`);
    if (entrypoints[index] !== capability.entrypoint.path) throw new Error(`Godskills entrypoint for ${id} does not match the portable manifest`);
    requireOwnerSelection(capability, selectedIds);
    requireSelectedEffects(capability, release, authority);
    selected.push({ id, capability });
  }
  return selected;
}

async function loadPackages(release, selectedIds, entrypoints, eligibility, authority, forbiddenIds) {
  const selected = resolveSelectedCapabilities(
    release, selectedIds, entrypoints, eligibility, authority, forbiddenIds,
  );
  const packages = [];
  for (const { id, capability } of selected) {
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

function selectionRows(selected) {
  return selected.map(({ id, capability }) => ({
    id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
  }));
}

async function loadAdaptivePackages(release, selected, activation) {
  const decisions = new Map(activation.decisions.map((decision) => [decision.selectedId, decision]));
  const packages = [];
  const deferredReviews = [];
  let disclosureBytes = 0;
  for (const { id, capability } of selected) {
    const decision = decisions.get(id);
    if (!decision) throw new Error(`Godskills activation decision for ${id} is missing`);
    if (decision.mode === 'native') continue;
    if (decision.mode === 'review') {
      deferredReviews.push({
        id,
        entrypointSha256: capability.entrypoint.sha256,
        contractSha256: capability.contract.sha256,
        status: 'scheduled-not-executed',
      });
      continue;
    }
    if (decision.mode === 'method') {
      const [entrypointBytes, contractBytes] = await Promise.all([
        release.readSelectedArtifact(capability.entrypoint, `selected entrypoint ${id}`),
        release.readSelectedArtifact(capability.contract, `selected contract ${id}`),
      ]);
      const entrypoint = entrypointBytes.toString('utf8');
      const contract = parseContract(contractBytes, id);
      disclosureBytes += Buffer.byteLength(entrypoint, 'utf8') + Buffer.byteLength(canonicalJson(contract), 'utf8');
      packages.push(deepFreeze({
        id,
        tier: capability.tier,
        ownerGodskillId: capability.ownerGodskillId,
        entrypointSha256: capability.entrypoint.sha256,
        contractSha256: capability.contract.sha256,
        activationMode: 'method',
        entrypoint,
        contract,
        capabilityVocabulary: sorted(capability.capabilityVocabulary),
        effectVocabulary: sorted(capability.effectVocabulary),
        riskObligations: sorted(capability.riskVocabulary),
        evidenceVocabulary: sorted(capability.evidenceVocabulary),
        preconditionObligations: sorted(capability.preconditionVocabulary),
        terminationConditions: sorted(capability.terminationConditions),
      }));
      continue;
    }
    const contractBytes = await release.readSelectedArtifact(capability.contract, `selected contract ${id}`);
    const contract = parseContract(contractBytes, id);
    const guardrails = compileContractGuardrails(contract, id);
    disclosureBytes += Buffer.byteLength(canonicalJson(guardrails), 'utf8');
    packages.push(deepFreeze({
      id,
      tier: capability.tier,
      ownerGodskillId: capability.ownerGodskillId,
      entrypointSha256: capability.entrypoint.sha256,
      contractSha256: capability.contract.sha256,
      activationMode: 'guardrail',
      guardrails,
    }));
  }
  return { packages, deferredReviews, disclosureBytes };
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

function compileAdaptivePackage({
  sourceEnvelopeDigest, release, authority, selected, activation, packages, deferredReviews, disclosureBytes,
}) {
  const stack = selected.map(({ id, capability }, index) => ({
    id,
    tier: capability.tier,
    ownerGodskillId: capability.ownerGodskillId,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    activation: activation?.decisions[index],
  }));
  const stackDigest = sha256Value(stack);
  const methodPackages = packages.filter(({ activationMode }) => activationMode === 'method');
  const cortexPackage = {
    protocolId: release.pin.adapterProtocol,
    sourceEnvelopeDigest,
    releaseDigest: release.releaseDigest,
    stackDigest,
    selectedCapabilities: selected.map(({ id }) => id),
    methods: valuesFrom(methodPackages, ({ capabilityVocabulary }) => capabilityVocabulary),
    evidenceRequirements: valuesFrom(packages, ({ evidenceVocabulary, contract, guardrails }) => [
      ...(evidenceVocabulary ?? []),
      ...(contract?.sourceIds ?? []),
      ...(guardrails?.failureModes ?? []),
    ]),
    proposalRequirements: valuesFrom(packages, ({ contract, guardrails }) => [
      ...(contract?.outputs ?? []),
      contract?.successCondition,
      guardrails?.successCondition,
    ]),
    riskObligations: valuesFrom(packages, ({ riskObligations }) => riskObligations),
    preconditionObligations: valuesFrom(packages, ({ preconditionObligations }) => preconditionObligations),
    terminationConditions: valuesFrom(packages, ({ terminationConditions, guardrails }) => [
      ...(terminationConditions ?? []),
      ...(guardrails?.terminationConditions ?? []),
    ]),
    authorityProjection: authority,
    disclosureBytes,
    selectedPackages: packages,
    deferredReviews,
  };
  if (activation) cortexPackage.activation = activation;
  return { cortexPackage: deepFreeze(cortexPackage), stackDigest };
}

export async function createGodskillsAdapter({
  releasePin,
  transport,
  artifactCache,
  io,
  activationClassifier,
  activationTransport,
} = {}) {
  if (typeof transport !== 'function') throw new TypeError('Godskills routing transport is required');
  const release = await verifyGodskillsRelease(releasePin, { artifactCache, io });
  const hasActivationRoot = release.activation !== undefined;
  const hasClassifier = activationClassifier !== undefined;
  const hasActivationTransport = activationTransport !== undefined;
  const adaptive = hasActivationRoot && hasClassifier && hasActivationTransport
    ? createGodskillsActivationAdapter({
      verifiedActivation: release.activation,
      classifier: activationClassifier,
      transport: activationTransport,
    })
    : null;
  if ((hasActivationRoot || hasClassifier || hasActivationTransport) && !adaptive) {
    throw new Error('Godskills adaptive activation requires one verified root, classifier, and transport');
  }
  return Object.freeze({
    releaseDigest: release.releaseDigest,
    async bindMission({ mission, observation, genomePolicy, hostEnvelope, sourceStateEpoch }) {
      if (!mission?.requestId || !mission?.text) throw new TypeError('Godskills mission identity and text are required');
      const eligibility = compileCapabilityEligibility(genomePolicy, release.manifest);
      const preference = deriveSpecialistPreference(release, genomePolicy, eligibility);
      const authority = compileAuthority(mission, hostEnvelope);
      const context = routeContext({ release, eligibility, authority, hostEnvelope });
      if (context.permittedEffects.length === 0) throw new Error('Godskills has no permitted semantic effect binding');
      const sourceEnvelope = sourceEnvelopeFor({
        mission, observation, genomePolicy, hostEnvelope, sourceStateEpoch, authority, release,
        activationTrustRootDigest: adaptive?.trustRootDigest ?? null,
        preference,
      });
      const sourceEnvelopeDigest = sha256Value(sourceEnvelope);
      const routingRequestId = `${mission.requestId}:${sourceEnvelopeDigest}`;
      const route = await routeGodskill({
        request: { requestId: routingRequestId, text: mission.text },
        hostContext: context,
        transport,
        preference: preferenceRequest(preference),
      });
      if (route.status === 'needs-decision') {
        return deepFreeze({
          status: 'needs-decision',
          unresolvedDecisions: route.unresolvedDecisions,
          receipt: null,
          cortexPackage: null,
        });
      }
      const selected = route.status === 'selected'
        ? resolveSelectedCapabilities(
          release,
          route.selectedIds,
          route.entrypoints,
          eligibility,
          authority,
          hostEnvelope.forbiddenCapabilities ?? [],
        )
        : [];
      let packages;
      let cortexPackage;
      let stackDigest;
      let activation = null;
      if (adaptive) {
        activation = selected.length === 0 ? null : await adaptive.compile({
          mission,
          selected: selectionRows(selected),
          authority,
        });
        const loaded = activation
          ? await loadAdaptivePackages(release, selected, activation)
          : { packages: [], deferredReviews: [], disclosureBytes: 0 };
        packages = loaded.packages;
        ({ cortexPackage, stackDigest } = compileAdaptivePackage({
          sourceEnvelopeDigest,
          release,
          authority,
          selected,
          activation,
          packages,
          deferredReviews: loaded.deferredReviews,
          disclosureBytes: loaded.disclosureBytes,
        }));
      } else {
        packages = route.status === 'selected'
          ? await loadPackages(
            release,
            route.selectedIds,
            route.entrypoints,
            eligibility,
            authority,
            hostEnvelope.forbiddenCapabilities ?? [],
          )
          : [];
        ({ cortexPackage, stackDigest } = compilePackage({ sourceEnvelopeDigest, release, authority, packages }));
      }
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
        selected: adaptive
          ? selectionRows(selected)
          : packages.map(({ id, entrypointSha256, contractSha256 }) => ({ id, entrypointSha256, contractSha256 })),
        authorityCeilingDigest: sourceEnvelope.authorityCeilingDigest,
        stackDigest,
        packageDigest: sha256Text(canonicalJson(cortexPackage)),
      };
      if (activation) receipt.activation = activation;
      const preferenceBinding = bindPreference(preference, route.routeReceipt);
      if (preferenceBinding) receipt.preference = preferenceBinding;
      assertSchema('godskills-cycle-receipt', receipt);
      return deepFreeze({
        status: route.status === 'selected' ? 'bound' : 'no-qualified-route',
        receipt,
        cortexPackage,
      });
    },
    async rehydrateMission({ receipt, mission, observation, genomePolicy, hostEnvelope, sourceStateEpoch }) {
      assertSchema('godskills-cycle-receipt', receipt);
      if (receipt.releaseDigest !== release.releaseDigest) throw new Error('Godskills recovery release digest mismatch');
      if (receipt.requestId !== mission?.requestId) throw new Error('Godskills recovery request identity mismatch');
      if (receipt.activation && !adaptive) throw new Error('Godskills recovery requires its activation trust root');
      if (adaptive && receipt.selectionStatus === 'selected' && !receipt.activation) {
        throw new Error('Godskills recovery receipt lacks its adaptive activation binding');
      }
      if (receipt.selectionStatus === 'no-qualified-route' && receipt.activation) {
        throw new Error('Godskills no-route recovery cannot carry an activation binding');
      }
      const eligibility = compileCapabilityEligibility(genomePolicy, release.manifest);
      const preference = deriveSpecialistPreference(release, genomePolicy, eligibility);
      const authority = compileAuthority(mission, hostEnvelope);
      const sourceEnvelope = sourceEnvelopeFor({
        mission, observation, genomePolicy, hostEnvelope, sourceStateEpoch, authority, release,
        activationTrustRootDigest: adaptive?.trustRootDigest ?? null,
        preference,
      });
      const sourceEnvelopeDigest = sha256Value(sourceEnvelope);
      if (receipt.sourceEnvelopeDigest !== sourceEnvelopeDigest
          || receipt.authorityCeilingDigest !== sourceEnvelope.authorityCeilingDigest) {
        throw new Error('Godskills recovery source envelope mismatch');
      }
      const selectedIds = receipt.selected.map(({ id }) => id);
      validateRecoveryPreference(receipt.preference, preference, selectedIds, receipt.selectionStatus);
      const entrypoints = selectedIds.map((id) => release.capabilitiesById.get(id)?.entrypoint.path);
      const forbiddenIds = sorted(hostEnvelope.forbiddenCapabilities ?? []);
      const selected = resolveSelectedCapabilities(
        release, selectedIds, entrypoints, eligibility, authority, forbiddenIds,
      );
      for (let index = 0; index < selected.length; index += 1) {
        if (selected[index].capability.entrypoint.sha256 !== receipt.selected[index].entrypointSha256
            || selected[index].capability.contract.sha256 !== receipt.selected[index].contractSha256) {
          throw new Error('Godskills recovery selected artifact digest mismatch');
        }
      }
      let compiled;
      if (adaptive) {
        const activation = receipt.activation
          ? adaptive.rehydrate({
            binding: receipt.activation,
            mission,
            selected: selectionRows(selected),
            authority,
          })
          : null;
        const loaded = activation
          ? await loadAdaptivePackages(release, selected, activation)
          : { packages: [], deferredReviews: [], disclosureBytes: 0 };
        compiled = compileAdaptivePackage({
          sourceEnvelopeDigest,
          release,
          authority,
          selected,
          activation,
          packages: loaded.packages,
          deferredReviews: loaded.deferredReviews,
          disclosureBytes: loaded.disclosureBytes,
        });
      } else {
        const packages = await loadPackages(
          release, selectedIds, entrypoints, eligibility, authority, forbiddenIds,
        );
        compiled = compilePackage({ sourceEnvelopeDigest, release, authority, packages });
      }
      if (compiled.stackDigest !== receipt.stackDigest
          || sha256Text(canonicalJson(compiled.cortexPackage)) !== receipt.packageDigest) {
        throw new Error('Godskills recovery package digest mismatch');
      }
      return deepFreeze({
        status: receipt.selectionStatus === 'selected' ? 'bound' : 'no-qualified-route',
        receipt,
        cortexPackage: compiled.cortexPackage,
      });
    },
  });
}
