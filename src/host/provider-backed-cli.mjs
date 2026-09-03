import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  assertAdmissionPolicyBinding,
  assertSafeAdmissionTree,
  readAdmissionBinding,
} from './admitted-identity-boundary.mjs';
import { createAdmittedProviderBackedIdentityLauncher } from './admitted-provider-backed-identity-launcher.mjs';
import { loadIdentityHostPolicy } from './identity-policy.mjs';
import { createProviderPhaseHost } from './provider-phase-host-sdk.mjs';
import {
  loadAnthropicMessagesPhaseTransportPolicy,
} from '../transports/anthropic-messages-phase-policy.mjs';
import {
  loadOpenAICompatiblePhaseTransportPolicy,
} from '../transports/openai-compatible-phase-policy.mjs';
import {
  ProviderBackedIdentityCliError,
  loadProviderBackedMissionRequest,
  parseProviderBackedIdentityCliArgs,
  providerPolicyDigest,
} from './provider-backed-cli-contracts.mjs';

const PROTOCOL_ID = 'eternities-provider-backed-identity-cli-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const EXECUTOR_ID = /^(.+)-(review|revision):([a-f0-9]{64})$/;
const POLICY_PINS = Object.freeze({
  'openai-compatible-chat-completions-v1': 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
  'anthropic-messages-v1': 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
});
const POLICY_LOADERS = Object.freeze({
  'openai-compatible-chat-completions-v1': loadOpenAICompatiblePhaseTransportPolicy,
  'anthropic-messages-v1': loadAnthropicMessagesPhaseTransportPolicy,
});
const RESULT_KEYS = Object.freeze(['mission', 'receipt', 'status']);
const MISSION_KEYS = Object.freeze(['artifact', 'receipt', 'status', 'verdict']);
const INPUT_CODES = new Set([
  'argument-invalid',
  'option-duplicate',
  'option-missing',
  'option-unexpected',
  'value-invalid',
  'mission-invalid',
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactKeys(value, expected, label) {
  if (!object(value) || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function fail(code) {
  throw new ProviderBackedIdentityCliError(code);
}

function safePath(value) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
    fail('value-invalid');
  }
  return resolve(value);
}

function equalDigest(left, right) {
  return DIGEST.test(left ?? '') && DIGEST.test(right ?? '')
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function boundedLimit(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('value-invalid');
  }
  return value;
}

function deriveExecutorIdPrefix(policy) {
  const reviewId = policy?.runtime?.reviewExecutor?.executorId;
  const revisionId = policy?.runtime?.revisionExecutor?.executorId;
  const review = typeof reviewId === 'string' ? EXECUTOR_ID.exec(reviewId) : null;
  const revision = typeof revisionId === 'string' ? EXECUTOR_ID.exec(revisionId) : null;
  if (!review || !revision || review[2] !== 'review' || revision[2] !== 'revision') {
    fail('identity-policy-incompatible');
  }
  const reviewPrefix = review[1];
  const revisionPrefix = revision[1];
  if (!reviewPrefix || reviewPrefix !== revisionPrefix
      || reviewPrefix.length > 128 || /[\0\r\n]/.test(reviewPrefix)) {
    fail('identity-policy-incompatible');
  }
  return reviewPrefix;
}

async function defaultLoadProviderPolicy({ family, path, env, readFileImpl }) {
  let text;
  try {
    text = await readFileImpl(path, 'utf8');
  } catch {
    fail('provider-policy-integrity');
  }
  let hashed;
  try {
    hashed = providerPolicyDigest(text);
  } catch (error) {
    if (error instanceof ProviderBackedIdentityCliError) throw error;
    fail('provider-policy-integrity');
  }
  const pin = POLICY_PINS[family];
  const pinnedEnv = { ...(env ?? {}), [pin]: hashed.digest };
  let loaded;
  try {
    loaded = await POLICY_LOADERS[family]({ path, env: pinnedEnv });
  } catch {
    fail('provider-policy-integrity');
  }
  if (!loaded || loaded.digest !== hashed.digest) fail('provider-policy-integrity');
  return Object.freeze({ policy: loaded.policy, digest: loaded.digest });
}

function validateProviderPolicyResult(value) {
  if (!object(value) || !object(value.policy) || !DIGEST.test(value.digest)) {
    fail('provider-policy-integrity');
  }
  return value;
}

function validateIdentityPolicyResult(value) {
  if (!object(value) || !object(value.policy) || !DIGEST.test(value.digest)) {
    fail('identity-policy-integrity');
  }
  return value;
}

function verifyTerminalResult(value) {
  try {
    assertNoCredentialFields(value);
    exactKeys(value, RESULT_KEYS, 'provider-backed terminal result');
    if (value.status !== 'completed') throw new Error('terminal result status is invalid');
    exactKeys(value.mission, MISSION_KEYS, 'provider-backed mission result');
    if (value.mission.status !== 'completed') throw new Error('mission result status is invalid');
    assertSchema('identity-bound-mission-vessel-completion', value.receipt);
    assertSchema('mission-review-completion', value.mission.receipt);
    assertSchema('mission-verdict', value.mission.verdict);
    if (value.receipt.missionId !== value.mission.receipt.missionId
        || value.receipt.missionId !== value.mission.verdict.missionId
        || value.receipt.missionCompletionReceiptDigest !== value.mission.receipt.receiptDigest
        || value.receipt.verdictDigest !== value.mission.receipt.verdictDigest
        || value.receipt.verdictDigest !== value.mission.verdict.verdictDigest
        || value.receipt.acceptedArtifactDigest !== value.mission.receipt.acceptedArtifactDigest
        || value.receipt.acceptedArtifactDigest !== value.mission.verdict.acceptedArtifactDigest) {
      throw new Error('terminal result evidence is incoherent');
    }
    const { receiptDigest: outerDigest, ...outerUnsigned } = value.receipt;
    const { receiptDigest: missionDigest, ...missionUnsigned } = value.mission.receipt;
    const { verdictDigest, ...verdictUnsigned } = value.mission.verdict;
    if (sha256Value(outerUnsigned) !== outerDigest
        || sha256Value(missionUnsigned) !== missionDigest
        || sha256Value(verdictUnsigned) !== verdictDigest) {
      throw new Error('terminal result digest is invalid');
    }
    if (value.mission.artifact === null) {
      if (value.receipt.acceptedArtifactDigest !== null) throw new Error('accepted artifact is missing');
    } else if (value.receipt.acceptedArtifactDigest !== null
        && sha256Text(canonicalJson(value.mission.artifact)) !== value.receipt.acceptedArtifactDigest) {
      throw new Error('accepted artifact digest is invalid');
    }
    if (value.receipt.authority.authorityExpanded !== false) {
      throw new Error('terminal result expanded authority');
    }
    return Object.freeze({
      acceptedArtifactDigest: value.receipt.acceptedArtifactDigest,
      authorityExpanded: false,
      missionCompletionReceiptDigest: value.receipt.missionCompletionReceiptDigest,
      missionId: value.receipt.missionId,
      protocolId: PROTOCOL_ID,
      receiptDigest: value.receipt.receiptDigest,
      schemaVersion: 1,
      status: 'completed',
      verdictDigest: value.receipt.verdictDigest,
    });
  } catch (error) {
    if (error instanceof ProviderBackedIdentityCliError) throw error;
    fail('launch-failed');
  }
}

export async function launchProviderBackedIdentity({
  family,
  providerPolicyPath,
  admissionRoot,
  identityPolicyPath,
  identityPolicyDigest,
  missionPath,
  requestId,
  maximumReviewMaterializedBytes,
  maximumRevisionMaterializedBytes,
  env = process.env,
  readFileImpl = readFile,
  assertSafeAdmissionTreeImpl = assertSafeAdmissionTree,
  readAdmissionBindingImpl = readAdmissionBinding,
  loadIdentityHostPolicyImpl = loadIdentityHostPolicy,
  assertAdmissionPolicyBindingImpl = assertAdmissionPolicyBinding,
  loadProviderPolicyImpl = defaultLoadProviderPolicy,
  createProviderPhaseHostImpl = createProviderPhaseHost,
  createLauncherImpl = createAdmittedProviderBackedIdentityLauncher,
} = {}) {
  if (!Object.hasOwn(POLICY_PINS, family)) fail('value-invalid');
  const root = safePath(admissionRoot);
  const resolvedProviderPolicyPath = safePath(providerPolicyPath);
  const resolvedIdentityPolicyPath = safePath(identityPolicyPath);
  const resolvedMissionPath = safePath(missionPath);
  const reviewMaterializedBytes = boundedLimit(
    maximumReviewMaterializedBytes,
    128,
    16_777_216,
  );
  const revisionMaterializedBytes = boundedLimit(
    maximumRevisionMaterializedBytes,
    1_024,
    16_777_216,
  );

  try {
    await assertSafeAdmissionTreeImpl(root);
  } catch {
    fail('admission-invalid');
  }
  let binding;
  try {
    binding = await readAdmissionBindingImpl(root);
  } catch {
    fail('admission-invalid');
  }

  let loadedIdentity;
  try {
    loadedIdentity = validateIdentityPolicyResult(
      await loadIdentityHostPolicyImpl(resolvedIdentityPolicyPath),
    );
  } catch (error) {
    if (error instanceof ProviderBackedIdentityCliError) throw error;
    fail('identity-policy-integrity');
  }
  if (!equalDigest(identityPolicyDigest, loadedIdentity.digest)) {
    fail('identity-policy-integrity');
  }
  try {
    assertAdmissionPolicyBindingImpl({
      policy: loadedIdentity.policy,
      policyPath: resolvedIdentityPolicyPath,
      admissionRoot: root,
      binding,
    });
  } catch {
    fail('identity-policy-incompatible');
  }
  const executorIdPrefix = deriveExecutorIdPrefix(loadedIdentity.policy);

  let requestText;
  try {
    requestText = await readFileImpl(resolvedMissionPath, 'utf8');
  } catch {
    fail('mission-invalid');
  }
  const request = loadProviderBackedMissionRequest(requestText, requestId);

  const normalizedEnv = object(env) ? { ...env } : {};
  let loadedProvider;
  try {
    loadedProvider = validateProviderPolicyResult(await loadProviderPolicyImpl({
      family,
      path: resolvedProviderPolicyPath,
      env: normalizedEnv,
      readFileImpl,
    }));
  } catch (error) {
    if (error instanceof ProviderBackedIdentityCliError) throw error;
    fail('provider-policy-integrity');
  }
  const providerEnv = {
    ...normalizedEnv,
    [POLICY_PINS[family]]: loadedProvider.digest,
  };

  let host;
  try {
    host = await createProviderPhaseHostImpl({
      family,
      policyPath: resolvedProviderPolicyPath,
      env: providerEnv,
      runtimeRoot: join(root, 'vessel', 'provider-phase', family),
    });
  } catch {
    fail('provider-policy-integrity');
  }
  let launcher;
  try {
    launcher = await createLauncherImpl({
      host,
      releasePin: loadedIdentity.policy.runtime.godskillsRelease,
      maximumReviewMaterializedBytes: reviewMaterializedBytes,
      maximumRevisionMaterializedBytes: revisionMaterializedBytes,
      executorIdPrefix,
    });
  } catch {
    fail('identity-policy-incompatible');
  }
  if (!object(launcher) || typeof launcher.launch !== 'function') fail('launch-failed');
  let result;
  try {
    result = await launcher.launch({
      admissionRoot: root,
      policyPath: resolvedIdentityPolicyPath,
      request,
      identityPolicyDigest: loadedIdentity.digest,
    });
  } catch {
    fail('launch-failed');
  }
  return result;
}

function writeCanonical(stream, value) {
  stream.write(`${canonicalJson(value)}\n`);
}

export async function runProviderBackedIdentityCli({
  argv,
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  service = launchProviderBackedIdentity,
} = {}) {
  try {
    const options = parseProviderBackedIdentityCliArgs(argv);
    if (typeof service !== 'function') throw new TypeError('provider-backed identity cli service is invalid');
    const result = await service({ ...options, env });
    writeCanonical(stdout, verifyTerminalResult(result));
    return 0;
  } catch (error) {
    const known = error instanceof ProviderBackedIdentityCliError;
    const code = known ? error.code : 'internal-failure';
    writeCanonical(stderr, { code, schemaVersion: 1, status: 'failed' });
    if (known && INPUT_CODES.has(code)) return 2;
    return known ? 3 : 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  process.exitCode = await runProviderBackedIdentityCli({ argv: process.argv.slice(2) });
}
