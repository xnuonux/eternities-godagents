import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { compileCreation } from '../../src/creation/compile.mjs';
import { localArtifactEffectProducer } from '../../src/host/structured-effect-producer.mjs';
import { prepareRecoveryFixture } from './local-workflow-recovery-fixture.mjs';

export const artifactRealmContract = () => ({
  schemaVersion: 2, profile: 'local-artifact-v2', realmId: 'operator-artifacts', version: '1.0.0',
  trustModel: 'operator-local', capabilities: ['artifact.publish', 'artifact.verify'],
  artifactStore: { operation: 'publish-local-artifact', producerDescriptorDigest: sha256Value(localArtifactEffectProducer),
    relativeRoot: 'artifacts', maximumBytes: 65536, naming: 'sha256-canonical-json',
    publication: 'exclusive-hard-link', replay: 'verify-identical-canonical-json' },
  privacy: { retention: 'operator-managed', automaticDeletion: false },
});
const json = value => `${canonicalJson(value)}\n`;
export async function prepareArtifactRealmFixture(t, configure = async () => {}) {
  return prepareRecoveryFixture(t, { effectOnlyTask: { question: 'what is two plus two?' },
    configure: async (configuration, workspace) => {
      const root = dirname(workspace);
      const source = join(root, 'creation-source');
      const candidatePath = join(source, 'creation-candidate.json');
      const policyPath = join(source, 'creation-policy.json');
      const embodimentPath = join(source, 'modules', 'embodiment.json');
      const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
      const policy = JSON.parse(await readFile(policyPath, 'utf8'));
      const embodiment = JSON.parse(await readFile(embodimentPath, 'utf8'));
      const capabilities = ['artifact.publish', 'artifact.verify'];
      candidate.realm.requiredCapabilities = capabilities;
      policy.allowedRealmCapabilities = capabilities;
      embodiment.payload.requiredRealmCapabilities = capabilities;
      await writeFile(candidatePath, json(candidate));
      await writeFile(policyPath, json(policy));
      await writeFile(embodimentPath, json(embodiment));
      const expectedPolicyDigest = sha256Value(policy);
      const creationDir = join(root, 'artifact-creation');
      const creation = await compileCreation({ candidatePath, policyPath, expectedPolicyDigest,
        expressionPath: join(source, 'expression-overlay.json'), moduleDirectory: join(source, 'modules'), outputDir: creationDir });
      configuration.schemaVersion = 3;
      Object.assign(configuration.admission, { creationDir, expectedPolicyDigest,
        expectedCreationBuildId: creation.manifest.buildId });
      configuration.hostPolicy.realmId = 'operator-artifacts';
      await writeFile(configuration.admission.realmContractPath, json(artifactRealmContract()));
      await configure(configuration, workspace);
    } });
}
