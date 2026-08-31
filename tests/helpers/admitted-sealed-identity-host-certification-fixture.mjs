import { execFile } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import {
  pinnedGodskillsRoutingExecutable,
  pinnedGodskillsRoutingSourceCommit,
} from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  AdmittedSealedIdentityLaunchError,
  launchAdmittedSealedIdentityMission,
} from '../../src/host/admitted-sealed-identity-launch.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import {
  executors,
  identityTransport,
  reviewTransport,
  revisionTransport,
  vesselRequest,
} from './identity-bound-mission-vessel-certification-fixture.mjs';

const execFileAsync = promisify(execFile);
const fixtureProtocol = 'eternities-admitted-sealed-identity-host-fixture-v1';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`admitted sealed identity host fixture failed: ${message}`);
}

function missionClock() {
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  return () => {
    const current = now;
    now += 600_000;
    return current;
  };
}

function processClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-08-31T22:00:00.000Z') + tick++ * 100).toISOString();
}

function operationCalls(calls) {
  return calls.filter(({ type }) => type !== 'descriptor').length;
}

function normalizedRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

function countForbiddenKeys(value) {
  const forbidden = new Set([
    'apiKey', 'authorization', 'credential', 'credentials', 'endpoint',
    'model', 'provider', 'providerConfig', 'retryPolicy', 'secret',
  ]);
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) {
    return value.reduce((total, child) => total + countForbiddenKeys(child), 0);
  }
  return Object.entries(value).reduce(
    (total, [key, child]) => total + Number(forbidden.has(key)) + countForbiddenKeys(child),
    0,
  );
}

async function allFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path.slice(root.length + 1).replaceAll('\\', '/'));
    }
  }
  await walk(root);
  return files.sort();
}

async function verifyGodskillsSource(root) {
  await execFileAsync('git', [
    '-C', root, 'merge-base', '--is-ancestor', pinnedGodskillsRoutingSourceCommit, 'HEAD',
  ], { windowsHide: true });
  return pinnedGodskillsRoutingSourceCommit;
}

function requestFixture() {
  const request = vesselRequest();
  request.task.hostAdapterId = 'godagents-admitted-sealed-v1';
  request.mission.objective = 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  return request;
}

export async function buildDeterministicAdmittedSealedIdentityHostFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const admitted = await setupAdmittedIdentity(null, 'admitted-sealed-identity-host-certification');
  try {
    const native = identityTransport();
    const review = reviewTransport();
    const revision = revisionTransport();
    const { reviewExecutor, revisionExecutor } = await executors(godskillsRoot, review, revision);
    const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
    const routingPin = pinnedGodskillsRoutingExecutable();
    const verifiedRouting = await verifyGodskillsRoutingExecutable({ releasePin, routingPin });
    const classifier = createRoutingEvidenceActivationClassifier({
      verifiedRoutingExecutable: verifiedRouting,
      reviewAvailable: true,
    });
    const request = requestFixture();
    const policyPath = join(admitted.root, 'identity-host-policy.json');
    const policyRoot = dirname(policyPath);
    const policy = {
      schemaVersion: 1,
      policyId: 'admitted-sealed-identity-host-certification-v1',
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
        nativeTransport: structuredClone(native.descriptor),
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
    const policyText = `${canonicalJson(policy)}\n`;
    const policyDigest = sha256Text(canonicalJson(policy));
    await writeFile(policyPath, policyText, 'utf8');
    const registryRoot = join(admitted.root, 'instance-registry');
    const clock = missionClock();
    const godskillsClock = processClock();
    const launches = { route: 0, activation: 0 };
    let crash = true;
    const common = {
      admissionRoot: admitted.admissionRoot,
      policyPath,
      request,
      env: { GODAGENT_IDENTITY_POLICY_SHA256: policyDigest },
      registryRoot,
      nativeTransport: native.adapter,
      reviewExecutor,
      revisionExecutor,
      clock,
      godskillsClock,
    };
    let activationProcessDeathObserved = false;
    try {
      await launchAdmittedSealedIdentityMission({
        ...common,
        checkpoint: async (name) => {
          if (name === 'before-local-godskills-route-process') launches.route += 1;
          if (name === 'before-local-godskills-activation-process') launches.activation += 1;
          if (crash && name === 'after-local-godskills-activation-process') {
            crash = false;
            throw new Error('simulated process death after admitted host activation success');
          }
        },
      });
    } catch (error) {
      if (!(error instanceof AdmittedSealedIdentityLaunchError)
          || error.code !== 'launch-failed'
          || !/process death after admitted host activation success/i.test(error.cause?.message ?? '')) {
        throw error;
      }
      activationProcessDeathObserved = true;
    }
    const completed = await launchAdmittedSealedIdentityMission({
      ...common,
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') throw new Error('route recovery relaunched');
        if (name === 'before-local-godskills-activation-process') throw new Error('activation recovery relaunched');
      },
    });
    const runtimeRoot = join(admitted.admissionRoot, 'vessel', 'sealed-identity-v1');
    const files = await allFiles(runtimeRoot);
    const admissionPath = files.find((path) => /^vessel-admissions\/.+\/admission\.json$/.test(path));
    requireCondition(admissionPath, 'identity-bound vessel admission is missing');
    const vesselAdmission = JSON.parse(await readFile(join(runtimeRoot, ...admissionPath.split('/')), 'utf8'));
    const selected = vesselAdmission.godskills.receipt.selected[0];
    const decision = vesselAdmission.godskills.receipt.activation.decisions[0];
    const beforeReplay = {
      native: operationCalls(native.calls),
      review: operationCalls(review.calls),
      revision: operationCalls(revision.calls),
      route: launches.route,
      activation: launches.activation,
    };
    const replay = await launchAdmittedSealedIdentityMission({
      ...common,
      checkpoint: async (name) => {
        if (name.includes('local-godskills')) throw new Error('terminal replay launched a child');
      },
    });
    const afterReplay = {
      native: operationCalls(native.calls),
      review: operationCalls(review.calls),
      revision: operationCalls(revision.calls),
      route: launches.route,
      activation: launches.activation,
    };
    const replayExternalCalls = Object.keys(beforeReplay).reduce(
      (total, key) => total + afterReplay[key] - beforeReplay[key],
      0,
    );
    const nativeDispatch = native.calls.find(({ type }) => type === 'execute').dispatch;
    const nativeCompletion = native.completions.get(nativeDispatch.dispatchDigest);
    const reviewDispatches = review.calls.filter(({ type }) => type === 'execute').map(({ dispatch }) => dispatch);
    const revisionDispatch = revision.calls.find(({ type }) => type === 'execute').dispatch;
    const registryFiles = (await readdir(registryRoot)).filter((path) => path.endsWith('.json'));
    const wireText = canonicalJson(nativeDispatch).toLowerCase();
    const filesystemRootsDisclosed = [admitted.root, admitted.admissionRoot, admitted.keelRoot]
      .filter((root) => wireText.includes(root.replaceAll('\\', '/').toLowerCase()))
      .length;
    const authorityExpansions = [
      nativeDispatch.authority.authorityExpanded,
      nativeCompletion.authority.authorityExpanded,
      completed.receipt.authority.authorityExpanded,
    ].filter(Boolean).length;
    const realmEffects = [
      nativeDispatch.authority.realmEffects,
      nativeCompletion.authority.realmEffects,
      completed.receipt.authority.realmEffects,
    ].filter(Boolean).length;
    const assertions = {
      activationProcessDeathObserved,
      externalPolicyDigestPinned: common.env.GODAGENT_IDENTITY_POLICY_SHA256 === policyDigest,
      policyPathsBoundToAdmission: [
        policy.runtime.distributionDir,
        policy.runtime.journalPath,
        policy.runtime.snapshotPath,
      ].every((path) => path.startsWith('workspace/admission/')),
      residencyRecordPresent: registryFiles.length === 1,
      classifierDerivedFromVerifiedRouting: classifier.descriptor.routingTrustRootDigest
        === verifiedRouting.routing.trustRootDigest,
      exactNativeDescriptorPinned: canonicalJson(native.descriptor) === canonicalJson(policy.runtime.nativeTransport),
      exactReviewDescriptorPinned: canonicalJson(reviewExecutor.descriptor()) === canonicalJson(policy.runtime.reviewExecutor),
      exactRevisionDescriptorPinned: canonicalJson(revisionExecutor.descriptor()) === canonicalJson(policy.runtime.revisionExecutor),
      routeRecoveredWithoutRelaunch: launches.route === 1,
      activationRecoveredWithoutRelaunch: launches.activation === 1,
      actualMuseSelected: selected.id === 'eternities-muse',
      actualMuseReviewMode: decision.mode === 'review',
      nativeExecutedOnce: native.calls.filter(({ type }) => type === 'execute').length === 1,
      reviewExecutedTwice: reviewDispatches.length === 2,
      revisionExecutedOnce: revision.calls.filter(({ type }) => type === 'execute').length === 1,
      finalReviewAccepted: completed.mission.verdict.reason === 'revision-review-accepted',
      runtimeLayoutClosed: files.every((path) => /^(?:godskills|mission-journals|vessel-admissions)\//.test(path)),
      exactTerminalReplay: canonicalJson(replay) === canonicalJson(completed),
      replayExternalCalls,
      forbiddenPolicyKeys: countForbiddenKeys(policy),
      filesystemRootsDisclosed,
      authorityExpansions,
      realmEffects,
    };
    const zero = new Set([
      'replayExternalCalls', 'forbiddenPolicyKeys', 'filesystemRootsDisclosed',
      'authorityExpansions', 'realmEffects',
    ]);
    for (const [name, value] of Object.entries(assertions)) {
      requireCondition(value === (zero.has(name) ? 0 : true), `assertion ${name} is ${String(value)}`);
    }

    const unsigned = {
      schemaVersion: 1,
      protocolId: fixtureProtocol,
      godskills: {
        commit: await verifyGodskillsSource(godskillsRoot),
        releaseDigest: verifiedRouting.release.releaseDigest,
        routingTrustRootDigest: verifiedRouting.routing.trustRootDigest,
        activationTrustRootDigest: releasePin.activation.executableReceipt.receiptDigest,
      },
      policy: {
        policyId: policy.policyId,
        policyDigest,
        classifierDescriptorDigest: classifier.descriptor.descriptorDigest,
        nativeTransportDescriptorDigest: native.descriptor.descriptorDigest,
        reviewExecutorDescriptorDigest: reviewExecutor.descriptor().descriptorDigest,
        revisionExecutorDescriptorDigest: revisionExecutor.descriptor().descriptorDigest,
      },
      identity: {
        instanceId: vesselAdmission.identity.instanceId,
        genesisId: vesselAdmission.identity.genesisId,
        keelId: vesselAdmission.identity.keelId,
        candidateDigest: vesselAdmission.identity.candidateDigest,
        modelProjectionDigest: vesselAdmission.identity.modelProjectionDigest,
      },
      execution: {
        selectedCapabilityId: selected.id,
        selectedEntrypointSha256: selected.entrypointSha256,
        selectedContractSha256: selected.contractSha256,
        activationDecisionDigest: decision.decisionDigest,
        nativeDispatchDigest: nativeDispatch.dispatchDigest,
        nativeCompletionDigest: nativeCompletion.completionDigest,
        firstReviewDispatchDigest: reviewDispatches[0].dispatchDigest,
        revisionDispatchDigest: revisionDispatch.dispatchDigest,
        finalReviewDispatchDigest: reviewDispatches[1].dispatchDigest,
        vesselCompletionReceiptDigest: completed.receipt.receiptDigest,
        missionCompletionReceiptDigest: completed.receipt.missionCompletionReceiptDigest,
      },
      recovery: {
        routeLaunches: launches.route,
        activationLaunches: launches.activation,
        nativeExecutions: native.calls.filter(({ type }) => type === 'execute').length,
        reviewExecutions: reviewDispatches.length,
        revisionExecutions: revision.calls.filter(({ type }) => type === 'execute').length,
        replayExternalCalls,
      },
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(admitted.root, { recursive: true, force: true });
  }
}
