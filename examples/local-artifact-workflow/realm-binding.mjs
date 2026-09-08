import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { verifyDistributionRealmContract } from '../../src/realm/distribution-contract.mjs';
import { localArtifactEffectProducer } from '../../src/host/structured-effect-producer.mjs';

export function inspectArtifactRealmForHost({ contract, maximumArtifactBytes }) {
  const inspected = verifyDistributionRealmContract(contract);
  if (inspected.profile !== 'local-artifact-v2'
      || !Number.isSafeInteger(maximumArtifactBytes) || maximumArtifactBytes < 1
      || maximumArtifactBytes > contract.artifactStore.maximumBytes) {
    throw new Error('artifact Realm profile or host byte ceiling is incompatible');
  }
  return inspected;
}

// Consistency projection from an independently loaded/verified distribution.
// This object is not an issuance receipt or a source of authority.
export function captureArtifactRealmBinding({ verifiedDistribution, maximumArtifactBytes }) {
  const { realmContract: contract, manifest } = verifiedDistribution;
  const inspected = inspectArtifactRealmForHost({ contract, maximumArtifactBytes });
  const source = manifest?.sources?.find(row => row.role === 'realm');
  if (!/^[a-f0-9]{64}$/.test(manifest?.buildId ?? '')
      || source?.path !== 'realm-contract.json'
      || source.sha256 !== sha256Text(`${canonicalJson(contract)}\n`)) {
    throw new Error('artifact Realm distribution source binding is invalid');
  }
  return Object.freeze({ profile: inspected.profile, contractDigest: inspected.contractDigest,
    distributionBuildId: manifest.buildId, producerDescriptorDigest: sha256Value(localArtifactEffectProducer) });
}

export function verifyArtifactRealmBinding({ verifiedDistribution, binding, maximumArtifactBytes }) {
  const expected = captureArtifactRealmBinding({ verifiedDistribution, maximumArtifactBytes });
  if (canonicalJson(binding) !== canonicalJson(expected)) throw new Error('artifact Realm binding changed');
  return verifiedDistribution.realmContract.artifactStore.maximumBytes;
}
