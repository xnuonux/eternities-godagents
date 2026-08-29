import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createHttpsTransport } from '../cortex/http-transport.mjs';
import { createOpenAICompatibleCortex } from '../cortex/openai-compatible.mjs';
import { sha256Text } from '../core/digest.mjs';
import { createFixtureRealm } from '../realm/fixture-realm.mjs';
import { createVessel } from '../runtime/vessel.mjs';
import { createLocalGodskillsTransport } from '../skills/godskills-adapter.mjs';
import { createCredentialResolver, loadHostPolicy } from './policy.mjs';

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) throw new Error('invalid arguments');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--policy', '--mission'].includes(flag) || typeof value !== 'string' || value.length === 0) {
      throw new Error('invalid arguments');
    }
    if (Object.hasOwn(values, flag)) throw new Error('invalid arguments');
    values[flag] = value;
  }
  if (!values['--policy'] || !values['--mission']) throw new Error('invalid arguments');
  return { policyPath: resolve(values['--policy']), missionPath: resolve(values['--mission']) };
}

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function resolveRuntimePath(policyPath, path) {
  return resolve(dirname(policyPath), path);
}

export async function executeNetworkedVessel({
  policy,
  policyDigest,
  policyPath,
  mission,
  credentialResolver,
  fetchImpl,
  clock,
}) {
  const distributionDir = resolveRuntimePath(policyPath, policy.runtime.distributionDir);
  const contract = JSON.parse(await readFile(resolve(distributionDir, 'realm-contract.json'), 'utf8'));
  if (contract.realmId !== policy.realmId) throw new Error('host policy Realm does not match distribution');
  const realm = createFixtureRealm({ contract });
  const godskillsTransport = await createLocalGodskillsTransport({ repositoryRoot: policy.runtime.godskillsRepository });
  const cortex = createOpenAICompatibleCortex({
    adapterId: policy.provider.adapterId,
    profile: policy.provider.profile,
    endpoint: `${policy.provider.endpointOrigin}${policy.provider.endpointPath}`,
    modelId: policy.provider.selectedModel,
    timeoutMs: policy.provider.timeoutMs,
    maxResponseBytes: policy.provider.maxResponseBytes,
    maxProposalTtlMs: policy.provider.maxProposalTtlMs,
    transport: createHttpsTransport({ fetchImpl }),
    resolveCredential: credentialResolver.resolve,
  });
  const vessel = await createVessel({
    distributionDir,
    instanceId: policy.runtime.instanceId,
    journalPath: resolveRuntimePath(policyPath, policy.runtime.journalPath),
    snapshotPath: resolveRuntimePath(policyPath, policy.runtime.snapshotPath),
    cortex,
    realm,
    godskillsTransport,
    clock,
    inferencePolicy: {
      ...policy.inference,
      hostPolicyId: policy.policyId,
      hostPolicyDigest: policyDigest,
    },
  });
  const cycle = await vessel.runCycle(mission);
  if (cycle.status === 'failed') {
    return { status: 'failed', instanceId: policy.runtime.instanceId, reasonCode: cycle.inference.reasonCode };
  }
  return {
    status: 'completed',
    instanceId: policy.runtime.instanceId,
    decisionId: cycle.decision.decisionId,
    actionId: cycle.receipt.actionId,
    discrepancyClass: cycle.receipt.discrepancyClass,
  };
}

export async function runLocalHost({
  argv,
  env,
  stdout,
  stderr,
  fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString(),
  execute = executeNetworkedVessel,
}) {
  let paths;
  try {
    paths = parseArguments(argv);
  } catch {
    writeJson(stderr, { status: 'failed', reasonCode: 'invalid-arguments' });
    return 2;
  }

  try {
    const { policy, digest } = await loadHostPolicy(paths.policyPath);
    const text = (await readFile(paths.missionPath, 'utf8')).trim();
    if (!text) throw new Error('mission is empty');
    const credentialResolver = createCredentialResolver({ env, variableName: policy.provider.credentialEnv });
    if (text.includes(credentialResolver.resolve())) {
      writeJson(stderr, { status: 'failed', reasonCode: 'invalid-mission' });
      return 1;
    }
    const mission = Object.freeze({
      requestId: `mission-${sha256Text(text).slice(0, 24)}`,
      text,
      authority: [...policy.authority],
      hostContext: structuredClone(policy.hostContext),
    });
    const result = await execute({
      policy,
      policyDigest: digest,
      policyPath: paths.policyPath,
      mission,
      credentialResolver,
      fetchImpl,
      clock,
    });
    if (result.status === 'failed') {
      writeJson(stderr, { status: 'failed', reasonCode: result.reasonCode });
      return 1;
    }
    writeJson(stdout, {
      status: 'completed',
      instanceId: result.instanceId,
      decisionId: result.decisionId,
      actionId: result.actionId,
      discrepancyClass: result.discrepancyClass,
    });
    return 0;
  } catch {
    writeJson(stderr, { status: 'failed', reasonCode: 'host-failed' });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runLocalHost({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
