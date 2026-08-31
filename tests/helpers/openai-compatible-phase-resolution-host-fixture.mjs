import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import {
  pinnedGodskillsRoutingExecutable,
  pinnedGodskillsRoutingSourceCommit,
} from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { launchAdmittedSealedIdentityMission } from '../../src/host/admitted-sealed-identity-launch.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { buildOpenAICompatiblePhaseResponseWitness } from '../../src/transports/openai-compatible-phase-resolution.mjs';
import { createOpenAICompatiblePhaseTransportSuite } from '../../src/transports/openai-compatible-phase-transport.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import { executors, vesselRequest } from './identity-bound-mission-vessel-certification-fixture.mjs';
import { recoveredNativeResponse } from './openai-compatible-phase-operation-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';
import {
  signResolutionDecision,
  unsignedResolutionDecision,
  validOpenAICompatiblePhaseResolutionPolicy,
} from './openai-compatible-phase-resolution-fixture.mjs';

const FIXTURE_PROTOCOL = 'eternities-signed-openai-phase-resolution-host-fixture-v1';
const SECRET = 'signed-resolution-host-secret-never-persist';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`signed phase resolution host fixture failed: ${message}`);
}

function increasingClock(start, step) {
  let current = Date.parse(start);
  return () => {
    const value = current;
    current += step;
    return value;
  };
}

function increasingIsoClock(start, step) {
  const clock = increasingClock(start, step);
  return () => new Date(clock()).toISOString();
}

function normalizedRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

async function allFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

function providerEnvelope({ ordinal, phase, content }) {
  return {
    id: `chatcmpl-resolved-${phase}-${ordinal}`,
    object: 'chat.completion',
    model: 'fixture-model-2026-08-31',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: canonicalJson(content) },
    }],
    usage: {
      prompt_tokens: 400 + ordinal,
      prompt_tokens_details: { cached_tokens: 300 },
      completion_tokens: 100,
      completion_tokens_details: { reasoning_tokens: 60 },
      total_tokens: 500 + ordinal,
    },
  };
}

function phaseOutput(input) {
  if (input.phase === 'revision') {
    return {
      addressedFindingIds: ['bind-evidence'],
      content: 'identity-bound revision with the evidence gap repaired exactly',
    };
  }
  if (input.package.round === 1) {
    return {
      recommendation: 'revise',
      findings: [{
        id: 'bind-evidence',
        severity: 'important',
        required: true,
        message: 'bind the central claim to exact evidence',
      }],
      summary: 'one required evidence repair remains',
    };
  }
  return {
    recommendation: 'accept',
    findings: [],
    summary: 'the revised subject satisfies the exact review contract',
  };
}

function requestFixture() {
  const request = vesselRequest();
  request.task.hostAdapterId = 'godagents-signed-phase-resolution-host-v1';
  request.mission.objective = 'direct a consequential visual identity and recover one ambiguous native cognition call without duplication';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  return request;
}

export async function buildDeterministicSignedPhaseResolutionHostFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const admitted = await setupAdmittedIdentity(null, 'signed-phase-resolution-host-certification');
  try {
    const providerPolicy = validOpenAICompatiblePhasePolicy();
    providerPolicy.policyId = 'signed-phase-resolution-host-certification-v1';
    const providerPolicyPath = join(admitted.root, 'phase-transport-policy.json');
    const providerPolicyDigest = sha256Text(canonicalJson(providerPolicy));
    await writeFile(providerPolicyPath, `${canonicalJson(providerPolicy)}\n`, 'utf8');
    const providerEnv = {
      GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: providerPolicyDigest,
      [providerPolicy.provider.credentialEnv]: SECRET,
    };
    const networkCalls = [];
    const phaseTransport = await createOpenAICompatiblePhaseTransportSuite({
      policyPath: providerPolicyPath,
      env: providerEnv,
      runtimeRoot: join(admitted.root, 'phase-operations'),
      clock: increasingIsoClock('2026-08-31T23:40:00.000Z', 100),
      fetchImpl: async (_url, providerRequest) => {
        const body = JSON.parse(providerRequest.body);
        const input = JSON.parse(body.messages[1].content);
        const ordinal = networkCalls.length + 1;
        networkCalls.push({ phase: input.phase, requestDigest: sha256Text(providerRequest.body) });
        if (input.phase === 'native') throw new Error('fixture ambiguous native provider outcome');
        return new Response(canonicalJson(providerEnvelope({
          ordinal,
          phase: input.phase,
          content: phaseOutput(input),
        })), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const resolutionPolicy = validOpenAICompatiblePhaseResolutionPolicy({
      transportPolicyDigest: providerPolicyDigest,
    });
    resolutionPolicy.policyId = 'signed-phase-resolution-host-certification-v1';
    const resolutionPolicyPath = join(admitted.root, 'phase-resolution-policy.json');
    const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
    await writeFile(resolutionPolicyPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
    const controller = await phaseTransport.createOperatorResolutionController({
      policyPath: resolutionPolicyPath,
      env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: resolutionPolicyDigest },
    });

    let capturedNativeDispatch = null;
    const nativeTransport = Object.freeze({
      descriptor: () => phaseTransport.native.descriptor(),
      async reconcile(dispatch) {
        capturedNativeDispatch = structuredClone(dispatch);
        return phaseTransport.native.reconcile(dispatch);
      },
      async execute(dispatch) {
        capturedNativeDispatch = structuredClone(dispatch);
        return phaseTransport.native.execute(dispatch);
      },
    });
    const { reviewExecutor, revisionExecutor } = await executors(
      godskillsRoot,
      { adapter: phaseTransport.review },
      { adapter: phaseTransport.revision },
    );
    const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
    const routingPin = pinnedGodskillsRoutingExecutable();
    const verifiedRouting = await verifyGodskillsRoutingExecutable({ releasePin, routingPin });
    const classifier = createRoutingEvidenceActivationClassifier({
      verifiedRoutingExecutable: verifiedRouting,
      reviewAvailable: true,
    });
    const request = requestFixture();
    const identityPolicyPath = join(admitted.root, 'identity-host-policy.json');
    const identityPolicyRoot = dirname(identityPolicyPath);
    const identityPolicy = {
      schemaVersion: 1,
      policyId: 'signed-phase-resolution-host-certification-v1',
      runtime: {
        protocolId: 'eternities-admitted-sealed-identity-host-v1',
        instanceId: admitted.admission.instanceId,
        distributionDir: normalizedRelative(identityPolicyRoot, admitted.admission.distributionDir),
        journalPath: normalizedRelative(identityPolicyRoot, admitted.admission.journalPath),
        snapshotPath: normalizedRelative(identityPolicyRoot, join(admitted.admissionRoot, 'vessel', 'snapshot.json')),
        hostAdapterId: request.task.hostAdapterId,
        revocationEpoch: request.task.revocationEpoch,
        godskillsRelease: releasePin,
        routingExecutable: routingPin,
        activationClassifier: structuredClone(classifier.descriptor),
        nativeTransport: structuredClone(phaseTransport.descriptors.native),
        reviewExecutor: reviewExecutor.descriptor(),
        revisionExecutor: revisionExecutor.descriptor(),
        limits: {
          timeoutMs: 30_000,
          maximumGodskillsDispatchBytes: 1_048_576,
          maximumGodskillsCompletionBytes: 1_048_576,
          maximumGodskillsResultBytes: 1_048_576,
          maximumNativeMaterializedBytes: 65_536,
          maxArtifactBytes: request.budgets.maxArtifactBytes,
          nativeCompletionTokens: request.budgets.nativeCompletionTokens,
          reviewCompletionTokensPerRound: request.budgets.reviewCompletionTokensPerRound,
          revisionCompletionTokens: request.budgets.revisionCompletionTokens,
          totalCompletionTokens: request.budgets.totalCompletionTokens,
          maxProjectionBytes: request.maxProjectionBytes,
          maxCycles: request.maxCycles,
        },
      },
      realmId: 'fixture-workbench',
      authority: structuredClone(request.requestedAuthority),
      hostContext: structuredClone(request.hostCeiling),
    };
    const identityPolicyDigest = sha256Text(canonicalJson(identityPolicy));
    await writeFile(identityPolicyPath, `${canonicalJson(identityPolicy)}\n`, 'utf8');
    const launches = { route: 0, activation: 0 };
    const common = {
      admissionRoot: admitted.admissionRoot,
      policyPath: identityPolicyPath,
      request,
      env: { GODAGENT_IDENTITY_POLICY_SHA256: identityPolicyDigest },
      registryRoot: join(admitted.root, 'instance-registry'),
      nativeTransport,
      reviewExecutor,
      revisionExecutor,
      clock: increasingClock('2026-08-31T23:00:00.000Z', 600_000),
      godskillsClock: increasingIsoClock('2026-08-31T22:00:00.000Z', 100),
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
      },
    };
    await launchAdmittedSealedIdentityMission(common).then(
      () => { throw new Error('ambiguous native launch unexpectedly completed'); },
      () => {},
    );
    requireCondition(capturedNativeDispatch !== null, 'native dispatch was not captured');
    const inspected = await controller.inspect({ phase: 'native', dispatch: capturedNativeDispatch });
    requireCondition(inspected.status === 'pending', 'native provider call is not pending');
    const recoveredResponse = recoveredNativeResponse('identity-bound native draft recovered from provider evidence');
    const witness = buildOpenAICompatiblePhaseResponseWitness(recoveredResponse);
    const signedDecision = signResolutionDecision(unsignedResolutionDecision({
      policyDigest: resolutionPolicyDigest,
      phase: inspected.operation.phase,
      dispatchDigest: inspected.operation.dispatchDigest,
      requestDigest: inspected.operation.requestDigest,
      attemptId: inspected.operation.attemptId,
      disposition: 'adopt-response',
      responseDigest: witness.witnessDigest,
      issuedAt: '2026-08-31T23:39:00.000Z',
      expiresAt: '2026-08-31T23:44:00.000Z',
      nonce: 'signed-resolution-host-native-001',
    }));
    const resolution = await controller.resolve({
      phase: 'native',
      dispatch: capturedNativeDispatch,
      signedDecision,
      response: recoveredResponse,
    });
    const completed = await launchAdmittedSealedIdentityMission(common);
    const beforeReplay = { provider: networkCalls.length, ...launches };
    const replay = await launchAdmittedSealedIdentityMission(common);
    const afterReplay = { provider: networkCalls.length, ...launches };
    const files = await allFiles(admitted.root);
    let secretLeaks = 0;
    for (const path of files) {
      const metadata = await lstat(path);
      if (metadata.isFile() && (await readFile(path)).includes(Buffer.from(SECRET))) secretLeaks += 1;
    }
    const resolutionText = await readFile(join(
      admitted.root,
      'phase-operations',
      'native',
      capturedNativeDispatch.dispatchDigest,
      'resolution.json',
    ), 'utf8');
    const assertions = {
      ambiguousNativeObserved: networkCalls[0]?.phase === 'native',
      signedResolutionAccepted: resolution.status === 'completed',
      nativeResponseAdoptedWithoutRedispatch: networkCalls.filter(({ phase }) => phase === 'native').length === 1,
      exactReviewedPhaseOrder: canonicalJson(networkCalls.map(({ phase }) => phase))
        === canonicalJson(['native', 'review', 'revision', 'review']),
      finalReviewAccepted: completed.mission.verdict.reason === 'revision-review-accepted',
      exactTerminalReplay: canonicalJson(completed) === canonicalJson(replay),
      replayExternalCalls: (afterReplay.provider - beforeReplay.provider)
        + (afterReplay.route - beforeReplay.route)
        + (afterReplay.activation - beforeReplay.activation),
      resolutionBodyAbsent: !resolutionText.includes('identity-bound native draft recovered from provider evidence'),
      secretLeaks,
      noRealmAuthorityExpansion: completed.receipt.authority.authorityExpanded === false,
    };
    for (const [name, value] of Object.entries(assertions)) {
      const expectsZero = name === 'replayExternalCalls' || name === 'secretLeaks';
      requireCondition(value === (expectsZero ? 0 : true), `assertion ${name} is ${String(value)}`);
    }
    const unsigned = {
      schemaVersion: 1,
      protocolId: FIXTURE_PROTOCOL,
      godskills: {
        commit: pinnedGodskillsRoutingSourceCommit,
        releaseDigest: verifiedRouting.release.releaseDigest,
        routingTrustRootDigest: verifiedRouting.routing.trustRootDigest,
        activationTrustRootDigest: releasePin.activation.executableReceipt.receiptDigest,
      },
      providerPolicyDigest,
      resolutionPolicyDigest,
      identityPolicyDigest,
      resolution: {
        decisionDigest: signedDecision.decision.decisionDigest,
        responseWitnessDigest: witness.witnessDigest,
        resolutionRecordDigest: resolution.resolutionRecordDigest,
      },
      execution: {
        phaseOrder: networkCalls.map(({ phase }) => phase),
        missionCompletionReceiptDigest: completed.receipt.missionCompletionReceiptDigest,
        vesselCompletionReceiptDigest: completed.receipt.receiptDigest,
      },
      recovery: {
        providerCalls: networkCalls.length,
        nativeProviderCalls: networkCalls.filter(({ phase }) => phase === 'native').length,
        routeLaunches: launches.route,
        activationLaunches: launches.activation,
      },
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(admitted.root, { recursive: true, force: true });
  }
}
