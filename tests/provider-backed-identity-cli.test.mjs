import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  ProviderBackedIdentityCliError,
  parseProviderBackedIdentityCliArgs,
} from '../src/host/provider-backed-cli-contracts.mjs';
import {
  launchProviderBackedIdentity,
  runProviderBackedIdentityCli,
} from '../src/host/provider-backed-cli.mjs';
import { vesselRequest } from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';

const DIGEST = 'a'.repeat(64);
const SECRET = 'cli-provider-secret-value';

function options() {
  return parseProviderBackedIdentityCliArgs([
    '--family', 'anthropic-messages-v1',
    '--provider-policy', 'provider-policy.json',
    '--admission', 'admission',
    '--policy', 'identity-host-policy.json',
    '--identity-policy-digest', DIGEST,
    '--mission', 'mission-request.json',
    '--request-id', 'mission-001',
    '--review-materialized-bytes', '65536',
    '--revision-materialized-bytes', '32768',
  ]);
}

function missionRequest() {
  const request = vesselRequest();
  request.mission.missionId = 'mission-001';
  return request;
}

function identityPolicy() {
  return {
    runtime: {
      godskillsRelease: { release: 'verified-release' },
      reviewExecutor: { executorId: `provider-backed-review:${'b'.repeat(64)}` },
      revisionExecutor: { executorId: `provider-backed-revision:${'c'.repeat(64)}` },
    },
  };
}

function terminalResult(missionId) {
  const artifact = { artifactType: 'native', content: 'safe terminal artifact', schemaVersion: 1 };
  const acceptedArtifactDigest = sha256Text(canonicalJson(artifact));
  const admissionDigest = 'd'.repeat(64);
  const nativeResultDigest = 'e'.repeat(64);
  const transactionId = 'f'.repeat(64);
  const journalDigest = '1'.repeat(64);
  const verdictUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-verdict-v1',
    missionId,
    admissionDigest,
    disposition: 'accepted',
    reason: 'native-no-review',
    acceptedArtifactDigest,
    nativeResultDigest,
    reviewResultDigests: [],
    revisionResultDigest: null,
    authorityExpanded: false,
    realmEffects: 0,
  };
  const verdict = { ...verdictUnsigned, verdictDigest: sha256Value(verdictUnsigned) };
  const missionReceiptUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-review-completion-v1',
    status: 'completed',
    missionId,
    admissionDigest,
    transactionId,
    preCompletionJournalHeadDigest: journalDigest,
    verdictDigest: verdict.verdictDigest,
    disposition: 'accepted',
    acceptedArtifactDigest,
    phases: {
      nativeResultDigest,
      reviewResultDigests: [],
      revisionResultDigest: null,
    },
    usage: {
      inputTokens: 10,
      cachedInputTokens: 2,
      reasoningTokens: 3,
      visibleOutputTokens: 2,
      completionTokens: 5,
    },
    completedAt: '2026-09-03T12:00:00.000Z',
    authorityExpanded: false,
    realmEffects: 0,
  };
  const missionReceipt = {
    ...missionReceiptUnsigned,
    receiptDigest: sha256Value(missionReceiptUnsigned),
  };
  const mission = {
    artifact,
    receipt: missionReceipt,
    status: 'completed',
    verdict,
  };
  const outerUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-identity-bound-mission-vessel-completion-v1',
    status: 'completed',
    missionId,
    vesselAdmissionDigest: '2'.repeat(64),
    bindingCandidateId: '3'.repeat(64),
    candidateDigest: '4'.repeat(64),
    modelProjectionDigest: '5'.repeat(64),
    missionCompletionReceiptDigest: missionReceipt.receiptDigest,
    verdictDigest: verdict.verdictDigest,
    acceptedArtifactDigest,
    authority: {
      authorityExpanded: false,
      realmEffects: false,
      continuityAdmission: false,
      personalKeelWrite: false,
      identityOwnership: false,
      evolution: false,
      soul: false,
    },
  };
  return {
    status: 'completed',
    receipt: { ...outerUnsigned, receiptDigest: sha256Value(outerUnsigned) },
    mission,
  };
}

function streams() {
  const output = { stdout: '', stderr: '' };
  return {
    output,
    stdout: { write(value) { output.stdout += value; } },
    stderr: { write(value) { output.stderr += value; } },
  };
}

test('provider-backed identity runner preflights and delegates the exact bounded request', async () => {
  const parsed = options();
  const request = missionRequest();
  const requestText = `${canonicalJson(request)}\n`;
  const providerPolicy = { policyId: 'provider-policy' };
  const providerPolicyDigest = sha256Text(canonicalJson(providerPolicy));
  const policy = identityPolicy();
  const calls = [];
  const result = terminalResult(request.mission.missionId);
  const identityDigest = sha256Text(canonicalJson(policy));
  const fakeOptions = { ...parsed, identityPolicyDigest: identityDigest };

  const completed = await launchProviderBackedIdentity({
    ...fakeOptions,
    env: { PROVIDER_SECRET: SECRET, unrelated: 'ambient-value' },
    readFileImpl: async (path) => {
      calls.push(['read', path]);
      return path.endsWith('mission-request.json') ? requestText : '';
    },
    assertSafeAdmissionTreeImpl: async (root) => calls.push(['admission-tree', root]),
    readAdmissionBindingImpl: async (root) => {
      calls.push(['binding', root]);
      return { binding: 'verified' };
    },
    loadIdentityHostPolicyImpl: async (path) => {
      calls.push(['identity-policy', path]);
      return { policy, digest: identityDigest };
    },
    assertAdmissionPolicyBindingImpl: (value) => calls.push(['policy-binding', value]),
    loadProviderPolicyImpl: async (value) => {
      calls.push(['provider-policy', value]);
      return { policy: providerPolicy, digest: providerPolicyDigest };
    },
    createProviderPhaseHostImpl: async (value) => {
      calls.push(['host', value]);
      return { certified: true };
    },
    createLauncherImpl: async (value) => {
      calls.push(['launcher', value]);
      return {
        launch: async (input) => {
          calls.push(['launch', input]);
          return result;
        },
      };
    },
  });

  assert.deepEqual(completed, result);
  const hostCall = calls.find(([name]) => name === 'host')[1];
  assert.equal(hostCall.family, 'anthropic-messages-v1');
  assert.equal(hostCall.policyPath.endsWith('provider-policy.json'), true);
  assert.equal(hostCall.env.GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256, providerPolicyDigest);
  assert.equal(hostCall.env.PROVIDER_SECRET, SECRET);
  assert.equal(hostCall.runtimeRoot.endsWith('admission\\vessel\\provider-phase\\anthropic-messages-v1'), true);

  const launcherCall = calls.find(([name]) => name === 'launcher')[1];
  assert.equal(launcherCall.maximumReviewMaterializedBytes, 65536);
  assert.equal(launcherCall.maximumRevisionMaterializedBytes, 32768);
  assert.equal(launcherCall.executorIdPrefix, 'provider-backed');
  assert.deepEqual(launcherCall.releasePin, policy.runtime.godskillsRelease);

  const launchCall = calls.find(([name]) => name === 'launch')[1];
  assert.equal(launchCall.identityPolicyDigest, identityDigest);
  assert.deepEqual(launchCall.request, request);
  assert.equal(launchCall.admissionRoot.endsWith('admission'), true);
});

test('provider-backed identity runner stops before host construction on identity policy digest mismatch', async () => {
  const parsed = options();
  let hostCalls = 0;
  await assert.rejects(
    () => launchProviderBackedIdentity({
      ...parsed,
      readFileImpl: async () => `${canonicalJson(missionRequest())}\n`,
      assertSafeAdmissionTreeImpl: async () => {},
      readAdmissionBindingImpl: async () => ({}),
      loadIdentityHostPolicyImpl: async () => ({ policy: identityPolicy(), digest: 'b'.repeat(64) }),
      assertAdmissionPolicyBindingImpl: () => {},
      loadProviderPolicyImpl: async () => ({ digest: DIGEST, policy: {} }),
      createProviderPhaseHostImpl: async () => { hostCalls += 1; return {}; },
    }),
    (error) => error instanceof ProviderBackedIdentityCliError && error.code === 'identity-policy-integrity',
  );
  assert.equal(hostCalls, 0);
});

test('provider-backed identity cli emits only the compact safe terminal projection', async () => {
  const parsed = options();
  const result = terminalResult(parsed.requestId);
  const io = streams();
  const code = await runProviderBackedIdentityCli({
    argv: [
      '--family', parsed.family,
      '--provider-policy', parsed.providerPolicyPath,
      '--admission', parsed.admissionRoot,
      '--policy', parsed.identityPolicyPath,
      '--identity-policy-digest', parsed.identityPolicyDigest,
      '--mission', parsed.missionPath,
      '--request-id', parsed.requestId,
      '--review-materialized-bytes', String(parsed.maximumReviewMaterializedBytes),
      '--revision-materialized-bytes', String(parsed.maximumRevisionMaterializedBytes),
    ],
    env: { PROVIDER_SECRET: SECRET },
    ...io,
    service: async () => result,
  });

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.output.stdout), {
    acceptedArtifactDigest: result.receipt.acceptedArtifactDigest,
    authorityExpanded: false,
    missionCompletionReceiptDigest: result.receipt.missionCompletionReceiptDigest,
    missionId: result.receipt.missionId,
    protocolId: 'eternities-provider-backed-identity-cli-v1',
    receiptDigest: result.receipt.receiptDigest,
    schemaVersion: 1,
    status: 'completed',
    verdictDigest: result.receipt.verdictDigest,
  });
  assert.equal(io.output.stderr, '');
  assert.equal(io.output.stdout.includes(SECRET), false);
});

test('provider-backed identity cli keeps stdout empty and errors closed', async () => {
  const io = streams();
  const secretPath = 'C:\\private\\provider-policy.json';
  const code = await runProviderBackedIdentityCli({
    argv: ['--provider-policy', secretPath],
    ...io,
  });
  assert.equal(code, 2);
  assert.equal(io.output.stdout, '');
  assert.deepEqual(JSON.parse(io.output.stderr), {
    code: 'option-missing',
    schemaVersion: 1,
    status: 'failed',
  });
  assert.equal(io.output.stderr.includes(secretPath), false);

  const failed = streams();
  const failureCode = await runProviderBackedIdentityCli({
    argv: [],
    ...failed,
    service: async () => { throw new Error(`leak ${SECRET}`); },
  });
  assert.equal(failureCode, 2);
  assert.equal(failed.output.stdout, '');
  assert.equal(failed.output.stderr.includes(SECRET), false);
});
