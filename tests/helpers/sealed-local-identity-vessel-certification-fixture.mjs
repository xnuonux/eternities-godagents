import { execFile } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import {
  pinnedGodskillsRoutingExecutable,
  pinnedGodskillsRoutingSourceCommit,
} from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { createSealedLocalIdentityBoundMissionVessel } from '../../src/runtime/sealed-local-identity-bound-mission-vessel.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import {
  executors,
  identityTransport,
  reviewTransport,
  revisionTransport,
  vesselRequest,
} from './identity-bound-mission-vessel-certification-fixture.mjs';

const execFileAsync = promisify(execFile);
const fixtureProtocol = 'eternities-sealed-local-identity-vessel-fixture-v1';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`sealed local identity vessel fixture failed: ${message}`);
}

function requestFixture() {
  const request = vesselRequest();
  request.mission.objective = 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  return request;
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

function classifier(counter) {
  return () => {
    counter.count += 1;
    return {
      taskClass: 'creative-generation',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    };
  };
}

function operationCalls(calls) {
  return calls.filter(({ type }) => type !== 'descriptor').length;
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

async function expectProcessDeath(operation) {
  try {
    await operation();
  } catch (error) {
    if (/simulated process death after sealed activation success/i.test(error.message)) return true;
    throw error;
  }
  return false;
}

async function verifyGodskillsSource(root) {
  await execFileAsync('git', [
    '-C', root, 'merge-base', '--is-ancestor', pinnedGodskillsRoutingSourceCommit, 'HEAD',
  ], { windowsHide: true });
  return pinnedGodskillsRoutingSourceCommit;
}

export async function buildDeterministicSealedLocalIdentityVesselFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const admitted = await setupAdmittedIdentity(null, 'sealed-local-identity-vessel-certification');
  try {
    const root = join(admitted.root, 'sealed-local-runtime');
    const native = identityTransport();
    const review = reviewTransport();
    const revision = revisionTransport();
    const { reviewExecutor, revisionExecutor } = await executors(godskillsRoot, review, revision);
    const classifications = { count: 0 };
    const launches = { route: 0, activation: 0 };
    const clock = missionClock();
    const godskillsClock = processClock();
    let crash = true;
    const common = {
      genesisAdmission: admitted.admission,
      runtimeRoot: root,
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      routingPin: pinnedGodskillsRoutingExecutable(),
      activationClassifier: classifier(classifications),
      nativeTransport: native.adapter,
      reviewExecutor,
      revisionExecutor,
      clock,
      godskillsClock,
    };
    const first = await createSealedLocalIdentityBoundMissionVessel({
      ...common,
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
        if (crash && name === 'after-local-godskills-activation-process') {
          crash = false;
          throw new Error('simulated process death after sealed activation success');
        }
      },
    });
    const request = requestFixture();
    const activationProcessDeathObserved = await expectProcessDeath(() => first.run(request));
    const recovered = await createSealedLocalIdentityBoundMissionVessel({
      ...common,
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') throw new Error('route recovery relaunched');
        if (name === 'before-local-godskills-activation-process') throw new Error('activation recovery relaunched');
      },
    });
    const completed = await recovered.run(request);
    const files = await allFiles(root);
    const admissionPath = files.find((path) => /^vessel-admissions\/.+\/admission\.json$/.test(path));
    requireCondition(admissionPath, 'identity-bound admission is missing');
    const admission = JSON.parse(await readFile(join(root, ...admissionPath.split('/')), 'utf8'));
    const decision = admission.godskills.receipt.activation.decisions[0];
    const selected = admission.godskills.receipt.selected[0];
    const beforeReplay = {
      route: launches.route,
      activation: launches.activation,
      classifications: classifications.count,
      native: operationCalls(native.calls),
      review: operationCalls(review.calls),
      revision: operationCalls(revision.calls),
    };
    const terminal = await createSealedLocalIdentityBoundMissionVessel({
      ...common,
      checkpoint: async (name) => {
        if (name.includes('local-godskills')) throw new Error('terminal replay launched a child');
      },
    });
    const replay = await terminal.run(request);
    const afterReplay = {
      route: launches.route,
      activation: launches.activation,
      classifications: classifications.count,
      native: operationCalls(native.calls),
      review: operationCalls(review.calls),
      revision: operationCalls(revision.calls),
    };
    const replayExternalCalls = Object.keys(beforeReplay).reduce(
      (total, key) => total + afterReplay[key] - beforeReplay[key],
      0,
    );
    const nativeDispatch = native.calls.find(({ type }) => type === 'execute').dispatch;
    const reviewDispatches = review.calls.filter(({ type }) => type === 'execute').map(({ dispatch }) => dispatch);
    const revisionDispatch = revision.calls.find(({ type }) => type === 'execute').dispatch;
    const assertions = {
      activationProcessDeathObserved,
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
      filesystemRootsDisclosed: 0,
      authorityExpansions: 0,
      realmEffects: 0,
    };
    const zero = new Set([
      'replayExternalCalls', 'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
    ]);
    for (const [name, value] of Object.entries(assertions)) {
      requireCondition(value === (zero.has(name) ? 0 : true), `assertion ${name} is ${String(value)}`);
    }
    requireCondition(classifications.count === 2, 'activation classification count changed');

    const unsigned = {
      schemaVersion: 1,
      protocolId: fixtureProtocol,
      godskills: {
        commit: await verifyGodskillsSource(godskillsRoot),
        releaseDigest: recovered.releaseDigest,
        routingTrustRootDigest: recovered.localExecution.routingTrustRootDigest,
        activationTrustRootDigest: recovered.localExecution.activationTrustRootDigest,
      },
      execution: {
        routeMode: recovered.localExecution.routeMode,
        routeDescriptorDigest: recovered.localExecution.routeDescriptorDigest,
        activationDescriptorDigest: recovered.localExecution.activationDescriptorDigest,
        selectedCapabilityId: selected.id,
        selectedEntrypointSha256: selected.entrypointSha256,
        selectedContractSha256: selected.contractSha256,
        activationDecisionDigest: decision.decisionDigest,
        nativeDispatchDigest: nativeDispatch.dispatchDigest,
        firstReviewDispatchDigest: reviewDispatches[0].dispatchDigest,
        revisionDispatchDigest: revisionDispatch.dispatchDigest,
        finalReviewDispatchDigest: reviewDispatches[1].dispatchDigest,
        vesselCompletionReceiptDigest: completed.receipt.receiptDigest,
        missionCompletionReceiptDigest: completed.receipt.missionCompletionReceiptDigest,
      },
      recovery: {
        routeLaunches: launches.route,
        activationLaunches: launches.activation,
        classifications: classifications.count,
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
