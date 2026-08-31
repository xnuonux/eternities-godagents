import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { compileCreation } from '../../src/creation/compile.mjs';
import { admitLocalCreation } from '../../src/genesis/local-admission.mjs';
import { createLocalKeelBackend } from '../../src/keel/local-reference-backend.mjs';

const creationFixture = new URL('../../fixtures/creation/', import.meta.url);
const realmFixture = new URL('../../fixtures/realm-contract.json', import.meta.url);

export const expectedCreationPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
export const admittedIdentityClock = () => '2026-08-31T12:00:00.000Z';

export function cortexBindingRequest({
  missionId = 'mission-identity-bound-vessel',
  taskId = 'task-identity-bound-vessel',
  objective = 'produce one identity-bound evidence artifact',
  maxProjectionBytes = 65_536,
  observationId = 'observation-identity-bound-vessel',
  evidenceDigests = ['a'.repeat(64)],
} = {}) {
  return {
    schemaVersion: 1,
    task: {
      taskId,
      hostAdapterId: 'universal-mission-vessel-v1',
      revocationEpoch: 0,
    },
    mission: {
      missionId,
      objective,
      successEvidence: ['identity projection is bound', 'mission artifact is committed'],
      stopConditions: ['transport evidence is ambiguous', 'verified admission changes'],
      budget: { maxCycles: 4, maxCompletionTokens: 2800 },
      observation: {
        observationId,
        summary: 'the admitted identity is ready for bounded native cognition',
        evidenceDigests,
      },
    },
    maxProjectionBytes,
  };
}

export async function setupAdmittedIdentity(context, suffix, { variant = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), `godagent-identity-vessel-${suffix}-`));
  const sourceRoot = join(root, 'creation-source');
  await cp(creationFixture, sourceRoot, { recursive: true });
  if (variant) {
    const candidatePath = join(sourceRoot, 'creation-candidate.json');
    const expressionPath = join(sourceRoot, 'expression-overlay.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    const expression = JSON.parse(await readFile(expressionPath, 'utf8'));
    candidate.blueprint = { id: 'quiet-architect', version: '1.0.0' };
    candidate.telos.mission = 'map uncertainty into precise evidence-bound paths';
    candidate.expressionRef = 'expression:quiet-architect@1.0.0';
    expression.id = 'quiet-architect';
    expression.name = 'Quiet Architect';
    expression.voiceDisplayName = 'quiet-precise';
    expression.narrativeDescription = 'A quiet architect who maps uncertainty before acting.';
    await writeFile(candidatePath, `${canonicalJson(candidate)}\n`, 'utf8');
    await writeFile(expressionPath, `${canonicalJson(expression)}\n`, 'utf8');
  }

  const creationDir = join(root, 'compiled-creation');
  const creation = await compileCreation({
    candidatePath: join(sourceRoot, 'creation-candidate.json'),
    policyPath: join(sourceRoot, 'creation-policy.json'),
    expectedPolicyDigest: expectedCreationPolicyDigest,
    expressionPath: join(sourceRoot, 'expression-overlay.json'),
    moduleDirectory: join(sourceRoot, 'modules'),
    outputDir: creationDir,
  });

  const promptArtifactPath = join(root, 'prompt-os.md');
  await writeFile(
    promptArtifactPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: identity-bound-vessel.test.json -->\n# Identity-bound mission vessel fixture\n',
    'utf8',
  );
  const realm = JSON.parse(await readFile(realmFixture, 'utf8'));
  realm.capabilities = ['filesystem.read', 'filesystem.write'];
  realm.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(root, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');

  const workspace = join(root, 'workspace');
  const instanceId = `identity-vessel-${suffix}`;
  const creatorRef = 'creator:dom';
  await admitLocalCreation({
    creationDir,
    expectedPolicyDigest: expectedCreationPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId,
    creatorRef,
    checkpointPurpose: 'compile an identity-bound mission vessel',
    clock: admittedIdentityClock,
  });

  const admissionRoot = join(workspace, 'admission');
  const keelRoot = join(admissionRoot, 'keels');
  const admission = {
    receiptPath: join(admissionRoot, 'transaction', 'genesis-receipt.json'),
    creationDir: join(admissionRoot, 'creation'),
    distributionDir: join(admissionRoot, 'distribution'),
    expectedPolicyDigest: expectedCreationPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    instanceId,
    creatorRef,
    transactionDir: join(admissionRoot, 'transaction'),
    journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
    keelAdapter: createLocalKeelBackend({ root: keelRoot }),
  };
  return { root, admissionRoot, keelRoot, admission, creation };
}
