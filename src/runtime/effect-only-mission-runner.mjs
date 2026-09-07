import { canonicalJson } from '../core/canonical-json.mjs';
import { join } from 'node:path';
import { verifyEffectOnlyVesselAdmission, buildEffectOnlyVesselCompletion } from './effect-only-vessel-admission.mjs';
import { verifyIdentityBoundNativeTransportDescriptor } from './identity-bound-native-contracts.mjs';
import { createIdentityBoundMissionNativeTransport } from './identity-bound-native-transport.mjs';
import { createMissionNativeExecutor } from './mission-native-executor.mjs';
import { createMissionReviewJournal } from './mission-review-journal.mjs';
import { createResumableMissionReviewKernel } from './mission-review-kernel.mjs';

// Internal bridge. The host owns authenticated inputs, canonical journal-root
// ownership and the transport implementation. No caller-supplied terminal result
// is accepted: completion comes exclusively from the recovering mission kernel.
export async function runEffectOnlyAdmittedMission({ vesselAdmission, admissionContext,
  journalRoot, nativeTransport, maximumNativeMaterializedBytes,
  clock = Date.now, checkpoint = async () => {}, lockOptions = {} }) {
  admissionContext = { ...admissionContext,
    request: structuredClone(admissionContext.request),
    policy: structuredClone(admissionContext.policy),
    candidate: structuredClone(admissionContext.candidate) };
  const admission = verifyEffectOnlyVesselAdmission(vesselAdmission, admissionContext);
  // Kernel admission deliberately excludes actor/policy identity. Isolate its
  // persisted state by the verified outer admission, never by mission alone.
  journalRoot = join(journalRoot, admission.vesselAdmissionDigest);
  const candidate = structuredClone(admissionContext.candidate);
  const pinnedDescriptor = structuredClone(admissionContext.policy.runtime.nativeTransport);
  const descriptor = verifyIdentityBoundNativeTransportDescriptor(await nativeTransport.descriptor());
  if (canonicalJson(descriptor) !== canonicalJson(pinnedDescriptor)) {
    throw new Error('effect-only native transport differs from admitted policy');
  }
  const checkedTransport = {
    async descriptor() {
      const current = verifyIdentityBoundNativeTransportDescriptor(await nativeTransport.descriptor());
      if (canonicalJson(current) !== canonicalJson(pinnedDescriptor)) throw new Error('native descriptor changed after preflight');
      return structuredClone(current);
    },
    reconcile: dispatch => nativeTransport.reconcile(dispatch),
    execute: dispatch => nativeTransport.execute(dispatch),
  };
  const transport = await createIdentityBoundMissionNativeTransport({ candidate,
    vesselAdmissionDigest: admission.vesselAdmissionDigest, transport: checkedTransport });
  const nativeExecutor = await createMissionNativeExecutor({
    maximumMaterializedBytes: maximumNativeMaterializedBytes,
    executorIdPrefix: `effect-only-vessel:${candidate.bindingCandidateId.slice(0, 24)}`, transport });
  const journal = createMissionReviewJournal({ journalRoot, clock, checkpoint, lockOptions });
  await journal.open(admission.missionAdmission);
  const kernel = createResumableMissionReviewKernel({ journalRoot, nativeExecutor,
    reviewExecutor: null, revisionExecutor: null, clock, checkpoint, lockOptions });
  const mission = await kernel.run({ mission: admission.missionAdmission.mission,
    authorityCeilingDigest: admission.missionAdmission.authorityCeilingDigest,
    budgets: admission.missionAdmission.budgets, godskillsBinding: null, godskillsTrustPin: null });
  if (mission.status === 'pending') return { status: 'pending',
    vesselAdmissionDigest: admission.vesselAdmissionDigest, mission };
  return { status: 'completed', mission,
    receipt: buildEffectOnlyVesselCompletion({ vesselAdmission: admission, admissionContext, missionResult: mission }) };
}
