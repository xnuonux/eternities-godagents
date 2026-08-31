import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { createMissionNativeExecutor } from '../src/runtime/mission-native-executor.mjs';
import {
  buildMissionNativeTransportCompletion,
  buildMissionNativeTransportDescriptor,
} from '../src/runtime/mission-native-transport-contracts.mjs';
import { createMissionReviewJournal } from '../src/runtime/mission-review-journal.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
import { createMissionRevisionExecutor } from '../src/runtime/mission-revision-executor.mjs';
import {
  buildMissionRevisionTransportCompletion,
  buildMissionRevisionTransportDescriptor,
} from '../src/runtime/mission-revision-transport-contracts.mjs';
import { createDeferredGodskillsReviewExecutor } from '../src/skills/deferred-review-executor.mjs';
import {
  buildGodskillsReviewTransportCompletion,
  buildGodskillsReviewTransportDescriptor,
} from '../src/skills/review-transport-contracts.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  buildReviewAdmission,
  buildReviewGodskillsBinding,
} from './helpers/mission-review-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

function usage(completionTokens) {
  return {
    inputTokens: 800,
    cachedInputTokens: 600,
    reasoningTokens: completionTokens - 40,
    visibleOutputTokens: 40,
    completionTokens,
  };
}

function nativeTransport() {
  const descriptor = buildMissionNativeTransportDescriptor({
    transportId: 'recoverable-native-integration-native-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  const complete = (dispatch) => buildMissionNativeTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'native',
      content: 'draft with an evidence link that requires exact repair',
    },
    usage: usage(120),
    startedAt: '2026-08-31T23:10:00.000Z',
    completedAt: '2026-08-31T23:10:00.500Z',
  });
  return {
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate integration native dispatch');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function reviewTransport() {
  const descriptor = buildGodskillsReviewTransportDescriptor({
    transportId: 'recoverable-native-integration-review-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  const complete = (dispatch) => buildGodskillsReviewTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: dispatch.package.subject.artifactDigest,
      recommendation: dispatch.package.round === 1 ? 'revise' : 'accept',
      findings: dispatch.package.round === 1
        ? [{
          id: 'repair-evidence-link',
          severity: 'important',
          required: true,
          message: 'replace the ambiguous evidence link with the exact committed digest',
        }]
        : [],
      summary: dispatch.package.round === 1
        ? 'one exact evidence repair is required'
        : 'the exact revision is accepted',
    },
    usage: usage(220),
    startedAt: dispatch.package.round === 1
      ? '2026-08-31T23:20:00.000Z'
      : '2026-08-31T23:40:00.000Z',
    completedAt: dispatch.package.round === 1
      ? '2026-08-31T23:20:00.500Z'
      : '2026-08-31T23:40:00.500Z',
  });
  return {
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate integration review dispatch');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function revisionTransport() {
  const descriptor = buildMissionRevisionTransportDescriptor({
    transportId: 'recoverable-native-integration-revision-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  const complete = (dispatch) => buildMissionRevisionTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'revision',
      nativeArtifactDigest: dispatch.package.native.artifactDigest,
      reviewArtifactDigest: dispatch.package.review.artifactDigest,
      addressedFindingIds: ['repair-evidence-link'],
      content: `revised draft bound to ${dispatch.package.native.artifactDigest}`,
    },
    usage: usage(300),
    startedAt: '2026-08-31T23:30:00.000Z',
    completedAt: '2026-08-31T23:30:00.500Z',
  });
  return {
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate integration revision dispatch');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

test('full real executor loop recovers completed native generation without redispatch', async (t) => {
  const journalRoot = await mkdtemp(join(tmpdir(), 'godagent-full-native-recovery-'));
  t.after(() => rm(journalRoot, { recursive: true, force: true }));
  const native = nativeTransport();
  const review = reviewTransport();
  const revision = revisionTransport();
  const io = { readFile, realpath };
  const firstNativeExecutor = await createMissionNativeExecutor({
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'recoverable-native',
    transport: native.adapter,
  });
  const firstReviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'recoverable-native-review',
    transport: review.adapter,
    io,
  });
  const firstRevisionExecutor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: 32_768,
    executorIdPrefix: 'recoverable-native-revision',
    transport: revision.adapter,
  });
  const manifest = JSON.parse(await readFile(
    `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
    'utf8',
  ));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  const missionId = 'mission-full-recoverable-native';
  const binding = buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: firstReviewExecutor.releaseDigest,
    activationTrustRootDigest: firstReviewExecutor.activationTrustRootDigest,
  });
  const baseline = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const input = {
    mission: structuredClone(baseline.mission),
    authorityCeilingDigest: baseline.authorityCeilingDigest,
    budgets: structuredClone(baseline.budgets),
    godskillsBinding: {
      receipt: structuredClone(baseline.godskills.receipt),
      cortexPackage: structuredClone(baseline.godskills.cortexPackage),
    },
    godskillsTrustPin: structuredClone(baseline.godskills.trustPin),
  };
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  const clock = () => {
    const current = now;
    now += 600_000;
    return current;
  };
  const lockOptions = {
    pid: 52031,
    now: () => now,
    staleAfterMs: 500,
    isProcessAlive: () => false,
    nonce: () => 'full-native-recovery-lock',
  };
  let crashed = false;
  const firstKernel = createResumableMissionReviewKernel({
    journalRoot,
    nativeExecutor: firstNativeExecutor,
    reviewExecutor: firstReviewExecutor,
    revisionExecutor: firstRevisionExecutor,
    clock,
    checkpoint: async (name) => {
      if (!crashed && name === 'after-native-execute') {
        crashed = true;
        throw new Error('simulated process death after native completion');
      }
    },
    lockOptions,
  });
  await assert.rejects(() => firstKernel.run(input), /process death/i);
  assert.equal(native.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(review.calls.filter(({ type }) => type === 'execute').length, 0);
  assert.equal(revision.calls.filter(({ type }) => type === 'execute').length, 0);
  const firstNativeDispatch = native.calls.find(({ type }) => type === 'execute').dispatch;

  const recoveredNativeExecutor = await createMissionNativeExecutor({
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'recoverable-native',
    transport: native.adapter,
  });
  const recoveredReviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'recoverable-native-review',
    transport: review.adapter,
    io,
  });
  const recoveredRevisionExecutor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: 32_768,
    executorIdPrefix: 'recoverable-native-revision',
    transport: revision.adapter,
  });
  assert.deepEqual(recoveredNativeExecutor.descriptor(), firstNativeExecutor.descriptor());
  assert.deepEqual(recoveredReviewExecutor.descriptor(), firstReviewExecutor.descriptor());
  assert.deepEqual(recoveredRevisionExecutor.descriptor(), firstRevisionExecutor.descriptor());
  const recoveredKernel = createResumableMissionReviewKernel({
    journalRoot,
    nativeExecutor: recoveredNativeExecutor,
    reviewExecutor: recoveredReviewExecutor,
    revisionExecutor: recoveredRevisionExecutor,
    clock,
    checkpoint: async () => {},
    lockOptions,
  });
  const completed = await recoveredKernel.run(input);

  assert.equal(completed.status, 'completed');
  assert.equal(completed.verdict.reason, 'revision-review-accepted');
  assert.match(completed.artifact.content, /^revised draft bound to [a-f0-9]{64}$/);
  assert.equal(native.calls.filter(({ type }) => type === 'execute').length, 1);
  const recoveredNativeDispatch = native.calls.filter(({ type }) => type === 'reconcile').at(-1).dispatch;
  assert.equal(recoveredNativeDispatch.dispatchDigest, firstNativeDispatch.dispatchDigest);
  assert.equal(review.calls.filter(({ type }) => type === 'execute').length, 2);
  assert.equal(revision.calls.filter(({ type }) => type === 'execute').length, 1);
  const finalReviewDispatch = review.calls.filter(({ type }) => type === 'execute').at(-1).dispatch;
  assert.equal(finalReviewDispatch.package.round, 2);
  assert.equal(finalReviewDispatch.package.subject.artifact.content, completed.artifact.content);

  const journal = createMissionReviewJournal({ journalRoot, clock, checkpoint: async () => {}, lockOptions });
  const evidence = await (await journal.openExisting(missionId)).recoverEvidence();
  assert.equal(evidence.native.result.executorEvidenceDigest, [...native.completions.values()][0].completionDigest);
  assert.equal(evidence.revision.result.executorEvidenceDigest, [...revision.completions.values()][0].completionDigest);
  assert.equal(evidence.reviews.length, 2);
  assert.equal(evidence.reviews[1].artifact.recommendation, 'accept');
  assert.equal(evidence.terminal.receiptDigest, completed.receipt.receiptDigest);
  assert.equal(new Set(native.calls.filter(({ dispatch }) => dispatch)
    .map(({ dispatch }) => dispatch.dispatchDigest)).size, 1);
  assert.equal(sha256Value(evidence.revision.artifact), sha256Value(completed.artifact));

  const counts = {
    native: native.calls.length,
    review: review.calls.length,
    revision: revision.calls.length,
  };
  assert.deepEqual(await recoveredKernel.run(input), completed);
  assert.deepEqual({
    native: native.calls.length,
    review: review.calls.length,
    revision: revision.calls.length,
  }, counts);
});
