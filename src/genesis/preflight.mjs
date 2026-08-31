import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { loadVerifiedCreationBuild } from '../creation/compile.mjs';
import { loadVerifiedDistribution } from '../foundry/compile.mjs';
import { createDormantSoulPort } from '../soul/dormant-port.mjs';
import { deriveGenesisIdentity } from './identity.mjs';

export async function verifyGenesisInputs({
  creationDir,
  distributionDir,
  expectedPolicyDigest,
  expectedCreationBuildId,
  instanceId,
  creatorRef,
}) {
  const creationSnapshot = await loadVerifiedCreationBuild(creationDir, { expectedPolicyDigest });
  const creation = creationSnapshot.manifest;
  if (creation.buildId !== expectedCreationBuildId) {
    throw new IntegrityError('creation build id pin mismatch');
  }
  const distributionSnapshot = await loadVerifiedDistribution(distributionDir);
  const distribution = distributionSnapshot.manifest;
  const genomeArtifact = creation.artifacts.find((row) => row.path === 'agent-genome.json');
  if (!genomeArtifact || genomeArtifact.sha256 !== distribution.genomeDigest) {
    throw new IntegrityError('creation and distribution genome content digest mismatch');
  }
  if (creation.artifactId !== distribution.artifactId) {
    throw new IntegrityError('creation and distribution artifact identity mismatch');
  }

  const { genome, moduleManifest } = creationSnapshot;
  const identity = deriveGenesisIdentity({
    instanceId,
    creatorRef,
    creationBuildId: creation.buildId,
    distributionBuildId: distribution.buildId,
    genomeValueDigest: creation.genomeDigest,
    genomeContentDigest: distribution.genomeDigest,
  });
  const soulPort = createDormantSoulPort();
  const selected = Object.fromEntries(moduleManifest.modules.map((row) => [row.kind, row]));
  for (const kind of ['lineage', 'archetype']) {
    if (!selected[kind]) throw new IntegrityError(`creation module manifest lacks ${kind}`);
  }
  return Object.freeze({
    creation,
    creationSnapshot,
    distribution,
    distributionSnapshot,
    genome,
    moduleManifest,
    identity,
    constitutionDigest: sha256Value(genome.constitution),
    soulPort,
    soulPortDigest: sha256Value(soulPort),
    lineage: structuredClone(selected.lineage),
    archetype: structuredClone(selected.archetype),
  });
}
