import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import {
  ProviderBackedIdentityCliError,
  loadProviderBackedMissionRequest,
  parseProviderBackedIdentityCliArgs,
} from '../src/host/provider-backed-cli-contracts.mjs';
import { vesselRequest } from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';

const DIGEST = 'a'.repeat(64);

function validArgv() {
  return [
    '--family', 'anthropic-messages-v1',
    '--provider-policy', 'provider-policy.json',
    '--admission', 'admission',
    '--policy', 'identity-host-policy.json',
    '--identity-policy-digest', DIGEST,
    '--mission', 'mission-request.json',
    '--request-id', 'mission-001',
    '--review-materialized-bytes', '65536',
    '--revision-materialized-bytes', '32768',
  ];
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ProviderBackedIdentityCliError
    && error.code === code);
}

test('provider-backed identity cli parser accepts the closed option set in any order', async () => {
  const parsed = parseProviderBackedIdentityCliArgs([
    '--revision-materialized-bytes', '32768',
    '--request-id', 'mission-001',
    '--mission', 'mission-request.json',
    '--family', 'openai-compatible-chat-completions-v1',
    '--identity-policy-digest', DIGEST,
    '--policy', 'identity-host-policy.json',
    '--provider-policy', 'provider-policy.json',
    '--admission', 'admission',
    '--review-materialized-bytes', '65536',
  ]);

  assert.deepEqual(parsed, {
    family: 'openai-compatible-chat-completions-v1',
    providerPolicyPath: 'provider-policy.json',
    admissionRoot: 'admission',
    identityPolicyPath: 'identity-host-policy.json',
    identityPolicyDigest: DIGEST,
    missionPath: 'mission-request.json',
    requestId: 'mission-001',
    maximumReviewMaterializedBytes: 65536,
    maximumRevisionMaterializedBytes: 32768,
  });
  assert.equal(Object.isFrozen(parsed), true);
});

test('provider-backed identity cli parser rejects missing, duplicate, unknown, and malformed options', () => {
  const valid = validArgv();
  assertCode(() => parseProviderBackedIdentityCliArgs(valid.slice(0, -2)), 'option-missing');
  assertCode(() => parseProviderBackedIdentityCliArgs([...valid, '--family', 'anthropic-messages-v1']), 'option-duplicate');
  assertCode(() => parseProviderBackedIdentityCliArgs([...valid, '--api-key', 'secret']), 'option-unexpected');
  assertCode(() => parseProviderBackedIdentityCliArgs(['--family']), 'option-missing');
  assertCode(() => parseProviderBackedIdentityCliArgs(['--family', 'anthropic-messages-v1', '--unexpected']), 'option-unexpected');
  assertCode(() => parseProviderBackedIdentityCliArgs(['family', 'anthropic-messages-v1']), 'argument-invalid');
  assertCode(() => parseProviderBackedIdentityCliArgs(['--family', 'anthropic-messages-v1', '--provider-policy', 'x\n']), 'value-invalid');
  assertCode(() => parseProviderBackedIdentityCliArgs(['--family', 'anthropic-messages-v1', '--provider-policy', 'x', '--admission', 'a', '--policy', 'p', '--identity-policy-digest', 'A'.repeat(64), '--mission', 'm', '--request-id', 'id', '--review-materialized-bytes', '65536', '--revision-materialized-bytes', '32768']), 'value-invalid');
});

test('provider-backed identity cli parser validates family, identifiers, digests, and bounds', () => {
  const invalidCases = [
    ['--family', 'unknown-v1'],
    ['--request-id', '.'],
    ['--request-id', 'bad/id'],
    ['--identity-policy-digest', 'b'.repeat(63)],
    ['--review-materialized-bytes', '127'],
    ['--review-materialized-bytes', '65536.5'],
    ['--revision-materialized-bytes', '1023'],
    ['--revision-materialized-bytes', '-1'],
  ];
  for (const [name, replacement] of invalidCases) {
    const argv = validArgv();
    const index = argv.indexOf(name);
    argv[index + 1] = replacement;
    assertCode(() => parseProviderBackedIdentityCliArgs(argv), 'value-invalid');
  }
});

test('provider-backed identity cli request loader requires canonical structured vessel JSON', () => {
  const request = vesselRequest();
  request.mission.missionId = 'mission-001';
  const text = `${canonicalJson(request)}\n`;
  const loaded = loadProviderBackedMissionRequest(text, 'mission-001');
  assert.deepEqual(loaded, request);
  assert.equal(Object.isFrozen(loaded), true);

  assertCode(() => loadProviderBackedMissionRequest(canonicalJson(request), 'mission-001'), 'mission-invalid');
  assertCode(() => loadProviderBackedMissionRequest(`${canonicalJson({ ...request, credential: 'secret' })}\n`, 'mission-001'), 'mission-invalid');
  assertCode(() => loadProviderBackedMissionRequest(text, 'mission-002'), 'mission-invalid');
  assertCode(() => loadProviderBackedMissionRequest('not-json\n', 'mission-001'), 'mission-invalid');
});

test('provider-backed identity cli error codes and messages never contain supplied values', () => {
  const secret = 'super-secret-provider-value';
  assert.throws(
    () => parseProviderBackedIdentityCliArgs(['--api-key', secret]),
    (error) => error instanceof ProviderBackedIdentityCliError
      && error.code === 'option-unexpected'
      && !error.message.includes(secret),
  );
  assert.equal(sha256Text(DIGEST).length, 64);
});
