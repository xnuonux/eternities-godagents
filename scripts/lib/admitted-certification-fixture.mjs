import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { compileCreation } from '../../src/creation/compile.mjs';
import { admitLocalCreation } from '../../src/genesis/local-admission.mjs';
import { createLocalKeelBackend } from '../../src/keel/local-reference-backend.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';

export async function prepareAdmittedCertificationFixture({
  repositoryRoot,
  prefix,
  instanceId,
  promptTitle,
  checkpointPurpose,
  clock = () => '2026-08-31T20:00:00.000Z',
}) {
  const root = resolve(repositoryRoot);
  const temporaryRoot = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const sourceRoot = join(temporaryRoot, 'creation-source');
  await cp(join(root, 'fixtures', 'creation'), sourceRoot, { recursive: true });
  const sourceCreationDir = join(temporaryRoot, 'compiled-creation');
  const creation = await compileCreation({
    candidatePath: join(sourceRoot, 'creation-candidate.json'),
    policyPath: join(sourceRoot, 'creation-policy.json'),
    expectedPolicyDigest,
    expressionPath: join(sourceRoot, 'expression-overlay.json'),
    moduleDirectory: join(sourceRoot, 'modules'),
    outputDir: sourceCreationDir,
  });
  const promptArtifactPath = join(temporaryRoot, 'prompt-os.md');
  await writeFile(
    promptArtifactPath,
    `<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: codex-bound-turn.certification.json -->\n# ${promptTitle}\n`,
    'utf8',
  );
  const realm = JSON.parse(await readFile(join(root, 'fixtures', 'realm-contract.json'), 'utf8'));
  realm.capabilities = ['filesystem.read', 'filesystem.write'];
  realm.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(temporaryRoot, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const workspace = join(temporaryRoot, 'workspace');
  const creatorRef = 'creator:dom';
  await admitLocalCreation({
    creationDir: sourceCreationDir,
    expectedPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId,
    creatorRef,
    checkpointPurpose,
    clock,
  });
  const admissionRoot = join(workspace, 'admission');
  return {
    temporaryRoot,
    admissionRoot,
    admission: {
      receiptPath: join(admissionRoot, 'transaction', 'genesis-receipt.json'),
      creationDir: join(admissionRoot, 'creation'),
      distributionDir: join(admissionRoot, 'distribution'),
      expectedPolicyDigest,
      expectedCreationBuildId: creation.manifest.buildId,
      instanceId,
      creatorRef,
      transactionDir: join(admissionRoot, 'transaction'),
      journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
      keelAdapter: createLocalKeelBackend({ root: join(admissionRoot, 'keels') }),
    },
  };
}
