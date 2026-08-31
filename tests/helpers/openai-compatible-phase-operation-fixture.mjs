import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compileCortexBindingCandidate } from '../../src/cortex/binding-compiler.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import {
  buildIdentityBoundNativeDispatch,
} from '../../src/runtime/identity-bound-native-contracts.mjs';
import { createMissionNativeMaterializer } from '../../src/runtime/mission-native-materializer.mjs';
import {
  buildMissionAdmission,
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
} from '../../src/runtime/mission-phase-contracts.mjs';
import {
  buildMissionNativeDispatch,
  buildMissionNativeTransportDescriptor,
} from '../../src/runtime/mission-native-transport-contracts.mjs';
import { createMissionRevisionMaterializer } from '../../src/runtime/mission-revision-materializer.mjs';
import { buildMissionRevisionDispatch } from '../../src/runtime/mission-revision-transport-contracts.mjs';
import { createDeferredGodskillsReviewMaterializer } from '../../src/skills/deferred-review-materializer.mjs';
import { buildGodskillsReviewDispatch } from '../../src/skills/review-transport-contracts.mjs';
import { createOpenAICompatiblePhaseTransportSuite } from '../../src/transports/openai-compatible-phase-transport.mjs';
import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { cortexBindingRequest, setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import { buildReviewAdmission, buildReviewGodskillsBinding } from './mission-review-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhaseResolutionPolicy } from './openai-compatible-phase-resolution-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

function missionAdmission(bindingRequest) {
  return buildMissionAdmission({
    mission: {
      missionId: bindingRequest.mission.missionId,
      objective: bindingRequest.mission.objective,
      successEvidence: [...bindingRequest.mission.successEvidence].sort(),
      stopConditions: [...bindingRequest.mission.stopConditions].sort(),
    },
    authorityCeilingDigest: 'b'.repeat(64),
    budgets: {
      maxArtifactBytes: 32_768,
      nativeCompletionTokens: 400,
      reviewCompletionTokensPerRound: 400,
      revisionCompletionTokens: 600,
      totalCompletionTokens: 1800,
    },
    admittedAt: '2026-08-31T18:00:00.000Z',
  });
}

function missionOuterDispatch(admission) {
  const executorDescriptor = buildMissionExecutorDescriptor({
    executorId: 'phase-resolution-native-outer-fixture',
    phase: 'native',
  });
  const request = buildMissionPhaseRequest({
    admission,
    descriptor: executorDescriptor,
    phase: 'native',
    round: 1,
    inputs: [],
    maxCompletionTokens: admission.budgets.nativeCompletionTokens,
  });
  const packageValue = createMissionNativeMaterializer({ maximumMaterializedBytes: 65_536 }).materialize({
    admission,
    request,
    descriptor: executorDescriptor,
    mission: admission.mission,
    godskillsBinding: null,
  });
  return buildMissionNativeDispatch({
    admission,
    request,
    executorDescriptor,
    transportDescriptor: buildMissionNativeTransportDescriptor({
      transportId: 'phase-resolution-native-outer-transport-v1',
      maximumCompletionBytes: 65_536,
    }),
    packageValue,
  });
}

async function nativeDispatch(context, transportDescriptor) {
  const admitted = await setupAdmittedIdentity(context, 'openai-compatible-phase-resolution');
  const bindingRequest = cortexBindingRequest();
  const candidate = await compileCortexBindingCandidate({ admission: admitted.admission, request: bindingRequest });
  return buildIdentityBoundNativeDispatch({
    candidate,
    vesselAdmissionDigest: 'd'.repeat(64),
    outerDispatch: missionOuterDispatch(missionAdmission(bindingRequest)),
    transportDescriptor,
  });
}

export function recoveredNativeResponse(content = 'one externally recovered exact native artifact') {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: canonicalJson({
      id: 'chatcmpl-recovered-native-fixture',
      object: 'chat.completion',
      model: 'fixture-model-2026-08-31',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: canonicalJson({ content }) },
      }],
      usage: {
        prompt_tokens: 240,
        prompt_tokens_details: { cached_tokens: 180 },
        completion_tokens: 40,
        completion_tokens_details: { reasoning_tokens: 10 },
        total_tokens: 280,
      },
    }),
  };
}

function recoveredPhaseResponse(content) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: canonicalJson({
      id: 'chatcmpl-recovered-phase-fixture',
      object: 'chat.completion',
      model: 'fixture-model-2026-08-31',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: canonicalJson(content) },
      }],
      usage: {
        prompt_tokens: 240,
        prompt_tokens_details: { cached_tokens: 180 },
        completion_tokens: 40,
        completion_tokens_details: { reasoning_tokens: 10 },
        total_tokens: 280,
      },
    }),
  };
}

export function recoveredReviewResponse() {
  return recoveredPhaseResponse({
    recommendation: 'accept',
    findings: [],
    summary: 'the recovered subject satisfies the exact Godskills review contract',
  });
}

export function recoveredRevisionResponse() {
  return recoveredPhaseResponse({
    addressedFindingIds: ['bind-evidence'],
    content: 'the recovered revision binds the required factual claim to exact evidence',
  });
}

export async function reviewDispatch(transportDescriptor) {
  const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
  const materializer = await createDeferredGodskillsReviewMaterializer({
    releasePin,
    maximumMaterializedBytes: 65_536,
    io: { readFile, realpath },
  });
  const manifest = JSON.parse(await readFile(
    `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
    'utf8',
  ));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  const missionId = 'mission-openai-compatible-resolution-review';
  const binding = buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: materializer.releaseDigest,
    activationTrustRootDigest: materializer.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const executorDescriptor = buildMissionExecutorDescriptor({
    executorId: 'phase-resolution-review-executor-v1',
    phase: 'review',
  });
  const subject = {
    schemaVersion: 1,
    artifactType: 'native',
    content: 'one exact native subject for recovered review',
  };
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'review',
    round: 1,
    descriptor: executorDescriptor,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: sha256Text(canonicalJson(subject)) },
    ],
    maxCompletionTokens: admission.budgets.reviewCompletionTokensPerRound,
  });
  const packageValue = await materializer.materialize({
    admission,
    request,
    descriptor: executorDescriptor,
    subject,
    priorReview: null,
  });
  return buildGodskillsReviewDispatch({
    request,
    executorDescriptor,
    transportDescriptor,
    packageValue,
  });
}

export function revisionDispatch(transportDescriptor) {
  const missionId = 'mission-openai-compatible-resolution-revision';
  const admission = buildReviewAdmission(missionId);
  const executorDescriptor = buildMissionExecutorDescriptor({
    executorId: 'phase-resolution-revision-executor-v1',
    phase: 'revision',
  });
  const native = {
    schemaVersion: 1,
    artifactType: 'native',
    content: 'one native artifact with an evidence gap',
  };
  const review = {
    schemaVersion: 1,
    artifactType: 'review',
    subjectDigest: sha256Text(canonicalJson(native)),
    recommendation: 'revise',
    findings: [{
      id: 'bind-evidence',
      severity: 'important',
      required: true,
      message: 'bind the factual claim to exact evidence',
    }],
    summary: 'one required evidence correction remains',
  };
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'revision',
    round: 1,
    descriptor: executorDescriptor,
    inputs: [
      { role: 'native', artifactDigest: sha256Text(canonicalJson(native)) },
      { role: 'review', artifactDigest: sha256Text(canonicalJson(review)) },
    ],
    maxCompletionTokens: admission.budgets.revisionCompletionTokens,
  });
  const packageValue = createMissionRevisionMaterializer({ maximumMaterializedBytes: 65_536 }).materialize({
    admission,
    request,
    descriptor: executorDescriptor,
    native,
    review,
  });
  return buildMissionRevisionDispatch({
    admission,
    request,
    executorDescriptor,
    transportDescriptor,
    packageValue,
  });
}

export async function setupPendingNativePhase(context, {
  checkpoint = async () => {},
  clock = () => '2026-08-31T20:02:00.000Z',
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-phase-resolution-operation-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const transportPolicy = validOpenAICompatiblePhasePolicy();
  const transportPolicyPath = join(root, 'transport-policy.json');
  const transportPolicyDigest = sha256Text(canonicalJson(transportPolicy));
  await writeFile(transportPolicyPath, `${canonicalJson(transportPolicy)}\n`, 'utf8');
  const runtimeRoot = join(root, 'operations');
  const transportEnv = {
    GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: transportPolicyDigest,
    [transportPolicy.provider.credentialEnv]: 'phase-resolution-credential-canary',
  };
  let networkCalls = 0;
  const suite = await createOpenAICompatiblePhaseTransportSuite({
    policyPath: transportPolicyPath,
    env: transportEnv,
    runtimeRoot,
    clock,
    checkpoint,
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture ambiguous provider outcome');
    },
  });
  const dispatch = await nativeDispatch(context, suite.descriptors.native);
  return {
    root,
    runtimeRoot,
    transportPolicy,
    transportPolicyPath,
    transportPolicyDigest,
    transportEnv,
    suite,
    dispatch,
    get networkCalls() { return networkCalls; },
  };
}

export async function createResolutionController(fixture, {
  suite = fixture.suite,
  policyOverrides = {},
} = {}) {
  const base = validOpenAICompatiblePhaseResolutionPolicy({
    transportPolicyDigest: fixture.transportPolicyDigest,
  });
  const policy = { ...base, ...policyOverrides };
  const policyPath = join(fixture.root, 'resolution-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const env = { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: policyDigest };
  const controller = await suite.createOperatorResolutionController({ policyPath, env });
  return { controller, policy, policyPath, policyDigest, env };
}
