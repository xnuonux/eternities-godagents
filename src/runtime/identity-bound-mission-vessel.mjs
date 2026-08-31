import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { compileCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import {
  buildCortexBindingRequestFromVesselRequest,
  buildIdentityBoundMissionVesselAdmission,
  buildIdentityBoundMissionVesselCompletion,
  projectIdentityBoundMissionAuthority,
  verifyIdentityBoundMissionVesselAdmission,
  verifyIdentityBoundMissionVesselRequest,
} from './identity-bound-mission-vessel-contracts.mjs';
import { createIdentityBoundMissionNativeTransport } from './identity-bound-native-transport.mjs';
import { createMissionNativeExecutor } from './mission-native-executor.mjs';
import { buildMissionAdmission } from './mission-phase-contracts.mjs';
import { createMissionReviewJournal } from './mission-review-journal.mjs';
import { createResumableMissionReviewKernel } from './mission-review-kernel.mjs';

const PROTOCOL_ID = 'eternities-identity-bound-mission-vessel-v1';

export class IdentityBoundMissionVesselError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'IdentityBoundMissionVesselError';
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new IdentityBoundMissionVesselError(code, message, cause === undefined ? undefined : { cause });
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function clockIso(clock) {
  const value = clock();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError('identity-bound mission vessel clock is invalid');
  return date.toISOString();
}

function verifyGodskillsAdapter(adapter) {
  object(adapter, 'Godskills adapter');
  if (typeof adapter.releaseDigest !== 'string' || !/^[a-f0-9]{64}$/.test(adapter.releaseDigest)
      || typeof adapter.bindMission !== 'function'
      || typeof adapter.rehydrateMission !== 'function') {
    throw new TypeError('verified Godskills adapter is required');
  }
}

function verifyInnerTransport(transport) {
  object(transport, 'identity-bound native transport');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof transport[method] !== 'function') throw new TypeError(`identity-bound native transport ${method} is required`);
  }
}

function verifyOptionalExecutor(executor, label) {
  if (executor === null) return;
  object(executor, label);
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof executor[method] !== 'function') throw new TypeError(`${label} ${method} is required`);
  }
}

function godskillsInput(request, candidate) {
  return {
    mission: {
      requestId: request.mission.missionId,
      text: request.mission.objective,
      authority: clone(request.requestedAuthority),
      explicitMethodRequests: clone(request.explicitMethodRequests),
    },
    observation: clone(request.observation),
    genomePolicy: clone(candidate.fullEnvelope.capability.godskills),
    hostEnvelope: {
      ...clone(request.hostCeiling),
      constitutionAllowedEffects: clone(candidate.fullEnvelope.authority.declaredEffectCeiling),
      realmHandContractDigest: candidate.fullEnvelope.authority.realmContractDigest,
    },
    sourceStateEpoch: request.sourceStateEpoch,
  };
}

function routeBinding(value, expectedReleaseDigest) {
  object(value, 'Godskills mission binding result');
  if (value.status === 'needs-decision') {
    if (!Array.isArray(value.unresolvedDecisions)) {
      fail('godskills-result-invalid', 'Godskills decision result is invalid');
    }
    return deepFreeze({
      status: 'needs-decision',
      unresolvedDecisions: clone(value.unresolvedDecisions),
    });
  }
  if (!['bound', 'no-qualified-route'].includes(value.status)
      || !value.receipt || !value.cortexPackage
      || value.receipt.releaseDigest !== expectedReleaseDigest) {
    fail('godskills-result-invalid', 'Godskills mission binding result is invalid');
  }
  return deepFreeze({
    status: value.status,
    receipt: clone(value.receipt),
    cortexPackage: clone(value.cortexPackage),
  });
}

function missionTrustPin(binding) {
  if (binding.status !== 'bound') return null;
  const activation = binding.receipt.activation;
  if (!activation) fail('godskills-trust-invalid', 'default mission vessel requires adaptive Godskills activation');
  return {
    protocolId: binding.receipt.protocolId,
    releaseDigest: binding.receipt.releaseDigest,
    activationProtocolId: activation.protocolId,
    activationTrustRootDigest: activation.trustRootDigest,
  };
}

function buildKernelAdmission(request, binding, admittedAt) {
  const trustPin = missionTrustPin(binding);
  return buildMissionAdmission({
    mission: clone(request.mission),
    authorityCeilingDigest: binding.receipt.authorityCeilingDigest,
    budgets: clone(request.budgets),
    godskillsBinding: binding.status === 'bound'
      ? { receipt: clone(binding.receipt), cortexPackage: clone(binding.cortexPackage) }
      : null,
    godskillsTrustPin: trustPin,
    admittedAt,
  });
}

function bindingFromRecord(record) {
  return {
    status: record.godskills.status,
    receipt: clone(record.godskills.receipt),
    cortexPackage: clone(record.godskills.cortexPackage),
  };
}

function kernelInput(record) {
  const admission = record.missionAdmission;
  return {
    mission: clone(admission.mission),
    authorityCeilingDigest: admission.authorityCeilingDigest,
    budgets: clone(admission.budgets),
    godskillsBinding: admission.godskills === null ? null : {
      receipt: clone(admission.godskills.receipt),
      cortexPackage: clone(admission.godskills.cortexPackage),
    },
    godskillsTrustPin: admission.godskills === null ? null : clone(admission.godskills.trustPin),
  };
}

async function readAdmission(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail('admission-invalid', 'identity-bound vessel admission is not valid JSON', error);
  }
  if (text !== `${canonicalJson(value)}\n`) {
    fail('admission-invalid', 'identity-bound vessel admission bytes are not canonical');
  }
  return verifyIdentityBoundMissionVesselAdmission(value);
}

export function createIdentityBoundMissionVessel({
  genesisAdmission,
  vesselRoot,
  journalRoot,
  godskillsAdapter,
  nativeTransport,
  reviewExecutor = null,
  revisionExecutor = null,
  maximumNativeMaterializedBytes = 1_048_576,
  clock = Date.now,
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  object(genesisAdmission, 'verified genesis admission arguments');
  if (typeof vesselRoot !== 'string' || vesselRoot.length < 1 || /[\0\r\n]/.test(vesselRoot)
      || typeof journalRoot !== 'string' || journalRoot.length < 1 || /[\0\r\n]/.test(journalRoot)) {
    throw new TypeError('identity-bound vessel and journal roots are required');
  }
  verifyGodskillsAdapter(godskillsAdapter);
  verifyInnerTransport(nativeTransport);
  verifyOptionalExecutor(reviewExecutor, 'review executor');
  verifyOptionalExecutor(revisionExecutor, 'revision executor');
  if (!Number.isSafeInteger(maximumNativeMaterializedBytes)
      || maximumNativeMaterializedBytes < 1024 || maximumNativeMaterializedBytes > 16_777_216) {
    throw new TypeError('native materialized byte ceiling is invalid');
  }
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') {
    throw new TypeError('identity-bound vessel clock and checkpoint are required');
  }
  const admissionRoot = resolve(vesselRoot);
  const missionJournalRoot = resolve(journalRoot);

  async function admit(request, candidate) {
    const slot = sha256Value({ protocolId: PROTOCOL_ID, missionId: request.mission.missionId });
    const slotRoot = join(admissionRoot, slot);
    const admissionPath = join(slotRoot, 'admission.json');
    const lockPath = join(slotRoot, 'admission.lock');
    await mkdir(slotRoot, { recursive: true });
    const lock = await acquireFileLock({ ...lockOptions, lockPath });
    try {
      const existing = await readAdmission(admissionPath);
      const input = godskillsInput(request, candidate);
      if (existing) {
        if (existing.requestDigest !== sha256Value(request)
            || existing.identity.candidateDigest !== candidate.candidateDigest
            || existing.identity.modelProjectionDigest !== candidate.modelProjectionDigest) {
          fail('admission-collision', 'existing vessel admission differs from the request or identity');
        }
        const storedBinding = bindingFromRecord(existing);
        const recovered = routeBinding(await godskillsAdapter.rehydrateMission({
          receipt: clone(storedBinding.receipt),
          ...input,
        }), godskillsAdapter.releaseDigest);
        if (!same(recovered, storedBinding)) {
          fail('godskills-recovery-changed', 'rehydrated Godskills binding differs from vessel admission');
        }
        const rebuiltMissionAdmission = buildKernelAdmission(
          request,
          recovered,
          existing.missionAdmission.admittedAt,
        );
        return verifyIdentityBoundMissionVesselAdmission(existing, {
          request,
          candidate,
          routeBinding: recovered,
          missionAdmission: rebuiltMissionAdmission,
        });
      }

      const bound = routeBinding(await godskillsAdapter.bindMission(input), godskillsAdapter.releaseDigest);
      if (bound.status === 'needs-decision') return bound;
      const missionAdmission = buildKernelAdmission(request, bound, clockIso(clock));
      const record = buildIdentityBoundMissionVesselAdmission({
        request,
        candidate,
        routeBinding: bound,
        missionAdmission,
      });
      const published = await publishFileExclusive({
        destinationPath: admissionPath,
        content: `${canonicalJson(record)}\n`,
      });
      if (!published) {
        const raced = await readAdmission(admissionPath);
        if (!raced || !same(raced, record)) {
          fail('admission-collision', 'concurrent vessel admission differs from the verified record');
        }
        return raced;
      }
      return record;
    } finally {
      await lock.release();
    }
  }

  async function run(inputRequest) {
    const request = deepFreeze(clone(verifyIdentityBoundMissionVesselRequest(inputRequest)));
    const candidate = await compileCortexBindingCandidate({
      admission: genesisAdmission,
      request: buildCortexBindingRequestFromVesselRequest(request),
    });
    const projectedAuthority = projectIdentityBoundMissionAuthority(request, candidate);
    if (projectedAuthority.permittedEffects.length === 0) {
      fail('authority-empty', 'identity-bound vessel has no permitted effect ceiling for Godskills routing');
    }
    const vesselAdmission = await admit(request, candidate);
    if (vesselAdmission.status === 'needs-decision') return vesselAdmission;

    const identityTransport = await createIdentityBoundMissionNativeTransport({
      candidate,
      vesselAdmissionDigest: vesselAdmission.vesselAdmissionDigest,
      transport: nativeTransport,
    });
    const nativeExecutor = await createMissionNativeExecutor({
      maximumMaterializedBytes: maximumNativeMaterializedBytes,
      executorIdPrefix: `identity-bound-vessel:${candidate.bindingCandidateId.slice(0, 24)}`,
      transport: identityTransport,
    });
    const missionJournal = createMissionReviewJournal({
      journalRoot: missionJournalRoot,
      clock,
      checkpoint,
      lockOptions,
    });
    await missionJournal.open(vesselAdmission.missionAdmission);
    const kernel = createResumableMissionReviewKernel({
      journalRoot: missionJournalRoot,
      nativeExecutor,
      reviewExecutor,
      revisionExecutor,
      clock,
      checkpoint,
      lockOptions,
    });
    const result = await kernel.run(kernelInput(vesselAdmission));
    if (result.status === 'pending') {
      return deepFreeze({
        status: 'pending',
        vesselAdmissionDigest: vesselAdmission.vesselAdmissionDigest,
        identity: clone(vesselAdmission.identity),
        mission: clone(result),
      });
    }
    const receipt = buildIdentityBoundMissionVesselCompletion({
      vesselAdmission,
      missionResult: result,
    });
    return deepFreeze({
      status: 'completed',
      receipt,
      mission: clone(result),
    });
  }

  return Object.freeze({ run });
}
