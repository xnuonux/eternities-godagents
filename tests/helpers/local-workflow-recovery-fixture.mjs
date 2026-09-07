import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import { defaultLocalInstanceRegistryRoot } from '../../src/host/local-instance-registry.mjs';
import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { prepareLocalWorkflow } from '../../examples/local-artifact-workflow/prepare.mjs';
import { setupAdmittedIdentity, expectedCreationPolicyDigest } from './admitted-identity-fixture.mjs';
import { vesselRequest } from './identity-bound-mission-vessel-certification-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';

export async function prepareRecoveryFixture(t) {
  const source = await setupAdmittedIdentity(null, `process-recovery-${randomUUID()}`);
  const workspace = join(source.root, 'operator-workspace');
  t.after(async () => {
    const pathIdentity = (path) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
    if (pathIdentity(dirname(source.root)) !== pathIdentity(tmpdir())
        || !basename(source.root).startsWith('godagent-identity-vessel-process-recovery-')) {
      throw new Error('refusing cleanup outside the owned recovery fixture');
    }
    const recordPath = join(defaultLocalInstanceRegistryRoot(), `${sha256Text(source.admission.instanceId)}.json`);
    try {
      const record = JSON.parse(await readFile(recordPath, 'utf8'));
      if (record.instanceId !== source.admission.instanceId
          || pathIdentity(record.admissionRoot) !== pathIdentity(join(workspace, 'admission'))) {
        throw new Error('refusing to remove another identity residency record');
      }
      await rm(recordPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rm(source.root, { recursive: true, force: true });
  });
  const providerPolicyPath = join(source.root, 'provider-policy.json');
  await writeFile(providerPolicyPath, `${canonicalJson(validOpenAICompatiblePhasePolicy())}\n`);
  const request = vesselRequest();
  request.mission.missionId = `recovery-${randomUUID()}`;
  request.mission.objective = 'write a short answer to the supplied arithmetic question';
  request.observation.summary = 'what is two plus two?';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = [...request.requestedAuthority];
  const configuration = {
    admission: {
      creationDir: join(source.root, 'compiled-creation'), expectedPolicyDigest: expectedCreationPolicyDigest,
      expectedCreationBuildId: source.creation.manifest.buildId,
      promptArtifactPath: join(source.root, 'prompt-os.md'), realmContractPath: join(source.root, 'realm-contract.json'),
      instanceId: source.admission.instanceId, creatorRef: 'creator:dom',
      checkpointPurpose: 'owned process interruption fixture; no live provider or Soul',
    },
    family: 'openai-compatible-chat-completions-v1', providerPolicyPath,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    routingPin: pinnedGodskillsRoutingExecutable(), request,
    hostPolicy: {
      policyId: 'process-recovery-fixture', realmId: 'fixture-workbench',
      authority: request.requestedAuthority, hostContext: request.hostCeiling,
      limits: { timeoutMs: 30_000, maximumGodskillsDispatchBytes: 1_048_576,
        maximumGodskillsCompletionBytes: 1_048_576, maximumGodskillsResultBytes: 1_048_576,
        maximumNativeMaterializedBytes: 65_536, ...request.budgets,
        maxProjectionBytes: request.maxProjectionBytes, maxCycles: request.maxCycles },
    },
    maximumReviewMaterializedBytes: 65_536, maximumRevisionMaterializedBytes: 32_768,
  };
  const prepared = await prepareLocalWorkflow({ workspace, configuration });
  return { ...prepared, workspace, instanceId: source.admission.instanceId, missionId: request.mission.missionId };
}
