import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import { admitLocalCreation } from '../../src/genesis/local-admission.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { createAdmittedProviderBackedIdentityLauncher } from '../../src/host/admitted-provider-backed-identity-launcher.mjs';
import { loadIdentityHostPolicy } from '../../src/host/identity-policy.mjs';
import { verifyIdentityHostRequest } from '../../src/host/admitted-sealed-identity-launch.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';

const pins = {
  'openai-compatible-chat-completions-v1': 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
  'anthropic-messages-v1': 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
};
const pathIdentity = (path) => process.platform === 'win32' ? path.toLowerCase() : path;
const textOf = (value) => `${canonicalJson(value)}\n`;

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw new Error('workflow configuration fields are invalid');
  }
}

export async function prepareLocalWorkflow({ workspace, configuration } = {}) {
  const config = structuredClone(configuration);
  exact(config, ['admission', 'family', 'providerPolicyPath', 'releasePin', 'routingPin', 'request',
    'hostPolicy', 'maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes']);
  exact(config.admission, ['creationDir', 'expectedPolicyDigest', 'expectedCreationBuildId',
    'promptArtifactPath', 'realmContractPath', 'instanceId', 'creatorRef', 'checkpointPurpose']);
  exact(config.hostPolicy, ['policyId', 'realmId', 'authority', 'hostContext', 'limits']);
  if (!Object.hasOwn(pins, config.family)) throw new Error('workflow provider family is unsupported');
  for (const path of [workspace, config.providerPolicyPath, config.admission.creationDir,
    config.admission.promptArtifactPath, config.admission.realmContractPath]) {
    if (typeof path !== 'string' || !isAbsolute(path) || /[\0\r\n]/.test(path)) {
      throw new Error('workflow input paths must be absolute');
    }
  }
  const root = resolve(workspace);
  const parent = dirname(root);
  if (pathIdentity(await realpath(parent)) !== pathIdentity(parent)) {
    throw new Error('workflow parent directory is not canonical');
  }
  const sourceStat = await lstat(config.providerPolicyPath);
  if (!sourceStat.isFile() || sourceStat.size > 1_048_576) throw new Error('provider policy is not bounded');
  const providerText = await readFile(config.providerPolicyPath, 'utf8');
  const providerPolicy = JSON.parse(providerText);
  if (providerText !== textOf(providerPolicy)) throw new Error('provider policy must be canonical JSON');
  const realm = JSON.parse(await readFile(config.admission.realmContractPath, 'utf8'));
  if (realm.realmId !== config.hostPolicy.realmId) throw new Error('workflow Realm does not match the admission');

  // Exclusive creation protects existing operator data. Partial preparation is retained on failure.
  await mkdir(root, { mode: 0o700 });
  const admission = await admitLocalCreation({ ...config.admission, workspace: root });
  const admissionRoot = join(root, 'admission');
  const providerPolicyPath = join(root, 'provider-policy.json');
  await writeFile(providerPolicyPath, providerText, { flag: 'wx', mode: 0o600 });
  const host = await createProviderPhaseHost({
    family: config.family,
    policyPath: providerPolicyPath,
    env: { [pins[config.family]]: sha256Text(canonicalJson(providerPolicy)) },
    runtimeRoot: join(admissionRoot, 'vessel', 'provider-phase', config.family),
  });
  const launcher = await createAdmittedProviderBackedIdentityLauncher({
    host,
    releasePin: config.releasePin,
    maximumReviewMaterializedBytes: config.maximumReviewMaterializedBytes,
    maximumRevisionMaterializedBytes: config.maximumRevisionMaterializedBytes,
    executorIdPrefix: 'local-workflow',
  });
  const dependencies = launcher.describe().providerBackedDependencies.dependencies;
  const verifiedRoutingExecutable = await verifyGodskillsRoutingExecutable({
    releasePin: config.releasePin, routingPin: config.routingPin,
  });
  const classifier = createRoutingEvidenceActivationClassifier({ verifiedRoutingExecutable, reviewAvailable: true });
  const policy = {
    schemaVersion: 1,
    policyId: config.hostPolicy.policyId,
    runtime: {
      protocolId: 'eternities-admitted-sealed-identity-host-v1',
      instanceId: config.admission.instanceId,
      distributionDir: 'admission/distribution',
      journalPath: 'admission/vessel/journal.jsonl',
      snapshotPath: 'admission/vessel/snapshot.json',
      hostAdapterId: config.request.task.hostAdapterId,
      revocationEpoch: config.request.task.revocationEpoch,
      godskillsRelease: config.releasePin,
      routingExecutable: config.routingPin,
      activationClassifier: classifier.descriptor,
      nativeTransport: dependencies.nativeTransport,
      reviewExecutor: dependencies.reviewExecutor,
      revisionExecutor: dependencies.revisionExecutor,
      limits: config.hostPolicy.limits,
    },
    realmId: config.hostPolicy.realmId,
    authority: config.hostPolicy.authority,
    hostContext: config.hostPolicy.hostContext,
  };
  const identityText = textOf(policy);
  const identityPolicyPath = join(root, 'identity-policy.json');
  await writeFile(identityPolicyPath, identityText, { flag: 'wx', mode: 0o600 });
  const loaded = await loadIdentityHostPolicy(identityPolicyPath);
  verifyIdentityHostRequest(loaded.policy, config.request);
  const missionText = textOf(config.request);
  await writeFile(join(root, 'mission-request.json'), missionText, { flag: 'wx', mode: 0o600 });
  const manifest = {
    schemaVersion: 1,
    status: 'prepared',
    workspaceRoot: await realpath(root),
    family: config.family,
    instanceId: config.admission.instanceId,
    missionId: config.request.mission.missionId,
    genesisId: admission.genesisId,
    identityPolicyDigest: loaded.digest,
    maximumReviewMaterializedBytes: config.maximumReviewMaterializedBytes,
    maximumRevisionMaterializedBytes: config.maximumRevisionMaterializedBytes,
    inputs: {
      providerPolicy: sha256Text(providerText),
      identityPolicy: sha256Text(identityText),
      mission: sha256Text(missionText),
    },
  };
  const manifestText = textOf(manifest);
  const manifestPath = join(root, 'workflow.json');
  // The ready manifest is the final publication; no live host is started here.
  await writeFile(manifestPath, manifestText, { flag: 'wx', mode: 0o600 });
  return Object.freeze({ manifestPath, manifestDigest: sha256Text(manifestText) });
}
