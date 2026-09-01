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
import { createProviderBackedMissionDependencies } from '../../src/host/provider-backed-mission-dependencies.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { vesselRequest } from './identity-bound-mission-vessel-certification-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';

const FIXTURE_PROTOCOL = 'eternities-provider-backed-mission-dependencies-fixture-v1';
const SECRET = 'provider-backed-mission-dependencies-certification-secret';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`provider-backed mission dependency fixture failed: ${message}`);
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
function normalizedRelative(from, to) { return relative(from, to).replaceAll('\\', '/'); }
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
function phaseOutput(input) {
  if (input.phase === 'native') return { content: 'provider-backed identity draft with one evidence gap' };
  if (input.phase === 'revision') {
    return {
      addressedFindingIds: ['bind-evidence'],
      content: 'provider-backed revision with the evidence gap repaired exactly',
    };
  }
  if (input.package.round === 1) {
    return {
      recommendation: 'revise',
      findings: [{
        id: 'bind-evidence', severity: 'important', required: true,
        message: 'bind the central claim to exact evidence',
      }],
      summary: 'one required evidence repair remains',
    };
  }
  return { recommendation: 'accept', findings: [], summary: 'the exact revision is accepted' };
}

const FAMILIES = Object.freeze({
  'openai-compatible-chat-completions-v1': Object.freeze({
    policy: validOpenAICompatiblePhasePolicy,
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    input(body) { return JSON.parse(body.messages[1].content); },
    credentialMatches(headers) { return headers.authorization === `Bearer ${SECRET}`; },
    response(model, phase, ordinal, content) {
      return {
        id: `chatcmpl-provider-backed-${phase}-${ordinal}`,
        object: 'chat.completion', model,
        choices: [{
          index: 0, finish_reason: 'stop',
          message: { role: 'assistant', content: canonicalJson(content) },
        }],
        usage: {
          prompt_tokens: 420 + ordinal,
          prompt_tokens_details: { cached_tokens: 300 },
          completion_tokens: 100,
          completion_tokens_details: { reasoning_tokens: 60 },
          total_tokens: 520 + ordinal,
        },
      };
    },
  }),
  'anthropic-messages-v1': Object.freeze({
    policy: validAnthropicMessagesPhasePolicy,
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    input(body) { return JSON.parse(body.messages[0].content[0].text); },
    credentialMatches(headers) { return headers['x-api-key'] === SECRET; },
    response(model, phase, ordinal, content) {
      return {
        id: `msg-provider-backed-${phase}-${ordinal}`,
        type: 'message', role: 'assistant', model,
        content: [{ type: 'text', text: canonicalJson(content) }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: {
          input_tokens: 420 + ordinal,
          cache_creation_input_tokens: 120,
          cache_read_input_tokens: 180,
          output_tokens: 100,
          output_tokens_details: { thinking_tokens: 0 },
        },
      };
    },
  }),
});

function requestFixture(family) {
  const request = vesselRequest();
  request.task.hostAdapterId = `provider-backed-${family}`;
  request.mission.objective = 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  return request;
}

async function buildFamilyRecord(family, godskillsRoot) {
  const definition = FAMILIES[family];
  const admitted = await setupAdmittedIdentity(null, `provider-backed-${family}`);
  try {
    const providerPolicy = definition.policy();
    providerPolicy.policyId = `provider-backed-${family}-certification-v1`;
    const providerPolicyPath = join(admitted.root, 'provider-policy.json');
    const providerPolicyDigest = sha256Text(canonicalJson(providerPolicy));
    await writeFile(providerPolicyPath, `${canonicalJson(providerPolicy)}\n`, 'utf8');
    const env = {
      [definition.pin]: providerPolicyDigest,
      [providerPolicy.provider.credentialEnv]: SECRET,
    };
    const calls = [];
    const host = await createProviderPhaseHost({
      family,
      policyPath: providerPolicyPath,
      env,
      runtimeRoot: join(admitted.root, 'provider-operations'),
      clock: increasingIsoClock('2026-08-31T23:40:00.000Z', 100),
      fetchImpl: async (url, request) => {
        const body = JSON.parse(request.body);
        const input = definition.input(body);
        const ordinal = calls.length + 1;
        calls.push({
          url: String(url),
          credentialMatches: definition.credentialMatches(request.headers),
          requestDigest: sha256Text(request.body),
          phase: input.phase,
        });
        return new Response(canonicalJson(definition.response(
          providerPolicy.provider.modelId,
          input.phase,
          ordinal,
          phaseOutput(input),
        )), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
    const providerCallsBeforeConstruction = calls.length;
    const bundle = await createProviderBackedMissionDependencies({
      host,
      releasePin,
      maximumReviewMaterializedBytes: 65_536,
      maximumRevisionMaterializedBytes: 32_768,
      executorIdPrefix: `provider-backed-${family}`,
    });
    const description = bundle.describe();
    const providerCallsAfterConstruction = calls.length;
    const routingPin = pinnedGodskillsRoutingExecutable();
    const verifiedRouting = await verifyGodskillsRoutingExecutable({ releasePin, routingPin });
    const classifier = createRoutingEvidenceActivationClassifier({
      verifiedRoutingExecutable: verifiedRouting,
      reviewAvailable: true,
    });
    const request = requestFixture(family);
    const policyPath = join(admitted.root, 'identity-host-policy.json');
    const policyRoot = dirname(policyPath);
    const policy = {
      schemaVersion: 1,
      policyId: `provider-backed-${family}-identity-v1`,
      runtime: {
        protocolId: 'eternities-admitted-sealed-identity-host-v1',
        instanceId: admitted.admission.instanceId,
        distributionDir: normalizedRelative(policyRoot, admitted.admission.distributionDir),
        journalPath: normalizedRelative(policyRoot, admitted.admission.journalPath),
        snapshotPath: normalizedRelative(policyRoot, join(admitted.admissionRoot, 'vessel', 'snapshot.json')),
        hostAdapterId: request.task.hostAdapterId,
        revocationEpoch: request.task.revocationEpoch,
        godskillsRelease: releasePin,
        routingExecutable: routingPin,
        activationClassifier: structuredClone(classifier.descriptor),
        nativeTransport: structuredClone(description.dependencies.nativeTransport),
        reviewExecutor: structuredClone(description.dependencies.reviewExecutor),
        revisionExecutor: structuredClone(description.dependencies.revisionExecutor),
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
    const policyDigest = sha256Text(canonicalJson(policy));
    await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
    const launches = { route: 0, activation: 0 };
    const common = {
      admissionRoot: admitted.admissionRoot,
      policyPath,
      request,
      env: { GODAGENT_IDENTITY_POLICY_SHA256: policyDigest },
      registryRoot: join(admitted.root, 'instance-registry'),
      nativeTransport: bundle.nativeTransport,
      reviewExecutor: bundle.reviewExecutor,
      revisionExecutor: bundle.revisionExecutor,
      clock: increasingClock('2026-08-31T23:00:00.000Z', 600_000),
      godskillsClock: increasingIsoClock('2026-08-31T22:00:00.000Z', 100),
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
      },
    };
    const completed = await launchAdmittedSealedIdentityMission(common);
    const beforeReplay = { provider: calls.length, ...launches };
    const replay = await launchAdmittedSealedIdentityMission(common);
    const afterReplay = { provider: calls.length, ...launches };
    const files = await allFiles(admitted.root);
    let credentialLeaks = 0;
    for (const path of files) {
      const metadata = await lstat(path);
      if (metadata.isFile() && (await readFile(path)).includes(Buffer.from(SECRET))) credentialLeaks += 1;
    }
    const phases = calls.map(({ phase }) => phase);
    const assertions = {
      providerCallsDuringConstruction: providerCallsAfterConstruction - providerCallsBeforeConstruction,
      exactHostDescriptionBound: canonicalJson(description.provider) === canonicalJson(host.describe()),
      exactPolicyDependenciesBound: canonicalJson({
        native: policy.runtime.nativeTransport,
        review: policy.runtime.reviewExecutor,
        revision: policy.runtime.revisionExecutor,
      }) === canonicalJson({
        native: description.dependencies.nativeTransport,
        review: description.dependencies.reviewExecutor,
        revision: description.dependencies.revisionExecutor,
      }),
      allCredentialsReachedOnlyHeaders: calls.every(({ credentialMatches }) => credentialMatches),
      exactReviewedPhaseOrder: canonicalJson(phases) === canonicalJson(['native', 'review', 'revision', 'review']),
      finalReviewAccepted: completed.mission.verdict.reason === 'revision-review-accepted',
      exactTerminalReplay: canonicalJson(completed) === canonicalJson(replay),
      replayProviderCalls: afterReplay.provider - beforeReplay.provider,
      replayRouteLaunches: afterReplay.route - beforeReplay.route,
      replayActivationLaunches: afterReplay.activation - beforeReplay.activation,
      credentialLeaks,
      noAuthorityExpansion: completed.receipt.authority.authorityExpanded === false,
    };
    for (const [name, value] of Object.entries(assertions)) {
      const expectsZero = name === 'providerCallsDuringConstruction'
        || name.startsWith('replay') || name === 'credentialLeaks';
      const detail = name === 'exactReviewedPhaseOrder' ? ` phases=${phases.join(',')}` : '';
      requireCondition(value === (expectsZero ? 0 : true), `assertion ${name} is ${String(value)}${detail}`);
    }
    return {
      family,
      providerPolicyDigest,
      identityPolicyDigest: policyDigest,
      dependencyBindingDigest: description.bindingDigest,
      providerDescriptionDigest: description.provider.descriptionDigest,
      descriptors: {
        native: description.dependencies.nativeTransport.descriptorDigest,
        review: description.dependencies.reviewExecutor.descriptorDigest,
        revision: description.dependencies.revisionExecutor.descriptorDigest,
      },
      execution: {
        phaseOrder: phases,
        requestDigests: calls.map(({ requestDigest }) => requestDigest),
        missionCompletionReceiptDigest: completed.receipt.missionCompletionReceiptDigest,
        vesselCompletionReceiptDigest: completed.receipt.receiptDigest,
      },
      recovery: {
        providerCalls: calls.length,
        routeLaunches: launches.route,
        activationLaunches: launches.activation,
      },
      assertions,
    };
  } finally {
    await rm(admitted.root, { recursive: true, force: true });
  }
}

export async function buildDeterministicProviderBackedMissionDependenciesFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const families = {};
  for (const family of Object.keys(FAMILIES)) {
    try {
      families[family] = await buildFamilyRecord(family, godskillsRoot);
    } catch (error) {
      throw new Error(`provider-backed family ${family} failed`, { cause: error });
    }
  }
  const records = Object.values(families);
  const assertions = {
    families: records.length,
    providerCalls: records.reduce((sum, record) => sum + record.recovery.providerCalls, 0),
    reviewedPhases: records.reduce((sum, record) => sum + record.execution.phaseOrder.length, 0),
    replayProviderCalls: records.reduce((sum, record) => sum + record.assertions.replayProviderCalls, 0),
    replayRouteLaunches: records.reduce((sum, record) => sum + record.assertions.replayRouteLaunches, 0),
    replayActivationLaunches: records.reduce((sum, record) => sum + record.assertions.replayActivationLaunches, 0),
    credentialLeaks: records.reduce((sum, record) => sum + record.assertions.credentialLeaks, 0),
    allFamiliesCompleted: records.every((record) => record.assertions.finalReviewAccepted),
    allFamiliesAuthorityClosed: records.every((record) => record.assertions.noAuthorityExpansion),
  };
  requireCondition(assertions.families === 2, 'family count differs');
  requireCondition(assertions.providerCalls === 8, 'provider call count differs');
  requireCondition(assertions.reviewedPhases === 8, 'reviewed phase count differs');
  requireCondition(assertions.replayProviderCalls === 0, 'terminal replay called provider');
  requireCondition(assertions.replayRouteLaunches === 0, 'terminal replay rerouted Godskills');
  requireCondition(assertions.replayActivationLaunches === 0, 'terminal replay reactivated Godskills');
  requireCondition(assertions.credentialLeaks === 0, 'credential reached persisted bytes');
  requireCondition(assertions.allFamiliesCompleted, 'one provider family did not complete');
  requireCondition(assertions.allFamiliesAuthorityClosed, 'one provider family expanded authority');
  const verifiedRelease = await verifyGodskillsRoutingExecutable({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: FIXTURE_PROTOCOL,
    godskills: {
      commit: pinnedGodskillsRoutingSourceCommit,
      releaseDigest: verifiedRelease.release.releaseDigest,
    },
    families,
    assertions,
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}
