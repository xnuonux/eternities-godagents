import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';
import { acquireFileLock } from '../../src/state/file-lock.mjs';
import { launchProviderBackedIdentity, verifyProviderBackedIdentityTerminalResult } from '../../src/host/provider-backed-cli.mjs';
import { writeAcceptedArtifact } from './artifact.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const pathIdentity = (path) => process.platform === 'win32' ? path.toLowerCase() : path;

async function boundedText(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) {
    throw new Error('workflow input is not a bounded regular file');
  }
  return readFile(path, 'utf8');
}

export async function runLocalWorkflow({ manifestPath, expectedManifestDigest, env = process.env,
  createProviderPhaseHostImpl } = {}) {
  if (typeof manifestPath !== 'string' || /[\0\r\n]/.test(manifestPath)
      || basename(manifestPath) !== 'workflow.json' || !DIGEST.test(expectedManifestDigest ?? '')) {
    throw new Error('workflow manifest reference is invalid');
  }
  const path = resolve(manifestPath);
  const root = await realpath(dirname(path));
  if (pathIdentity(root) !== pathIdentity(dirname(path))) throw new Error('workflow location is aliased');
  const text = await boundedText(path);
  if (sha256Text(text) !== expectedManifestDigest) throw new Error('workflow manifest digest changed');
  const manifest = JSON.parse(text);
  const keys = ['schemaVersion', 'status', 'workspaceRoot', 'family', 'instanceId', 'missionId', 'genesisId',
    'identityPolicyDigest', 'maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes', 'inputs'];
  if (text !== `${canonicalJson(manifest)}\n`
      || canonicalJson(Object.keys(manifest).sort()) !== canonicalJson(keys.sort())
      || manifest.schemaVersion !== 1 || manifest.status !== 'prepared'
      || pathIdentity(manifest.workspaceRoot) !== pathIdentity(root)
      || canonicalJson(Object.keys(manifest.inputs).sort()) !== '["identityPolicy","mission","providerPolicy"]') {
    throw new Error('workflow manifest is invalid');
  }
  const lock = await acquireFileLock({ lockPath: join(root, 'workflow-run.lock') });
  try {
    const texts = {};
    for (const [key, name] of Object.entries({ providerPolicy: 'provider-policy.json',
      identityPolicy: 'identity-policy.json', mission: 'mission-request.json' })) {
      texts[key] = await boundedText(join(root, name));
      if (sha256Text(texts[key]) !== manifest.inputs[key]) throw new Error('prepared workflow input changed');
    }
    const policy = JSON.parse(texts.identityPolicy);
    const mission = JSON.parse(texts.mission);
    if (policy.runtime.instanceId !== manifest.instanceId || mission.mission.missionId !== manifest.missionId) {
      throw new Error('workflow identity or mission differs from preparation');
    }
    const result = structuredClone(await launchProviderBackedIdentity({
      family: manifest.family,
      providerPolicyPath: join(root, 'provider-policy.json'),
      admissionRoot: join(root, 'admission'),
      identityPolicyPath: join(root, 'identity-policy.json'),
      identityPolicyDigest: manifest.identityPolicyDigest,
      missionPath: join(root, 'mission-request.json'),
      requestId: manifest.missionId,
      maximumReviewMaterializedBytes: manifest.maximumReviewMaterializedBytes,
      maximumRevisionMaterializedBytes: manifest.maximumRevisionMaterializedBytes,
      env,
      // Pin the request snapshot even if an operator edits its file during this invocation.
      readFileImpl: (input, encoding) => input === join(root, 'mission-request.json')
        ? Promise.resolve(texts.mission) : readFile(input, encoding),
      ...(createProviderPhaseHostImpl ? { createProviderPhaseHostImpl } : {}),
    }));
    if (result.status === 'needs-decision') {
      assertNoCredentialFields(result);
      if (canonicalJson(Object.keys(result).sort()) !== '["status","unresolvedDecisions"]'
          || !Array.isArray(result.unresolvedDecisions)
          || result.unresolvedDecisions.some((item) => typeof item !== 'string')
          || Buffer.byteLength(canonicalJson(result)) > 65_536) {
        throw new Error('workflow decision result is invalid');
      }
      return Object.freeze({ status: 'needs-decision', instanceId: manifest.instanceId,
        missionId: manifest.missionId, artifact: null,
        unresolvedDecisions: Object.freeze([...result.unresolvedDecisions]) });
    }
    if (result.status === 'pending') {
      return Object.freeze({ status: 'pending', instanceId: manifest.instanceId,
        missionId: manifest.missionId, artifact: null });
    }
    const receipt = verifyProviderBackedIdentityTerminalResult(result);
    const rejected = receipt.acceptedArtifactDigest === null;
    const disposition = rejected ? 'rejected' : 'accepted';
    if (result.mission.receipt.disposition !== disposition || result.mission.verdict.disposition !== disposition) {
      throw new Error('mission terminal disposition is inconsistent');
    }
    if (rejected) {
      return Object.freeze({ status: 'rejected', instanceId: manifest.instanceId,
        missionId: manifest.missionId, receipt, artifact: null, usage: result.mission.receipt.usage });
    }
    const directory = join(root, 'artifacts');
    try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const artifact = await writeAcceptedArtifact({
      directory,
      artifact: result.mission.artifact,
      expectedDigest: receipt.acceptedArtifactDigest,
      maximumBytes: policy.runtime.limits.maxArtifactBytes + 1,
    });
    return Object.freeze({ status: 'completed', instanceId: manifest.instanceId,
      missionId: manifest.missionId, receipt, artifact, usage: result.mission.receipt.usage });
  } finally {
    await lock.release();
  }
}
