import { sha256Value } from '../core/digest.mjs';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;

function assertIdentifier(label, value) {
  if (typeof value !== 'string'
      || !identifierPattern.test(value)
      || value === '.'
      || value === '..'
      || value.includes('/')
      || value.includes('\\')) {
    throw new TypeError(`${label} must be a closed identifier`);
  }
}

function assertDigest(label, value) {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new TypeError(`${label} must be a lowercase sha256 digest`);
  }
}

export function deriveGenesisIdentity({
  instanceId,
  creatorRef,
  creationBuildId,
  distributionBuildId,
  genomeValueDigest,
  genomeContentDigest,
}) {
  assertIdentifier('instanceId', instanceId);
  assertIdentifier('creatorRef', creatorRef);
  assertDigest('creationBuildId', creationBuildId);
  assertDigest('distributionBuildId', distributionBuildId);
  assertDigest('genomeValueDigest', genomeValueDigest);
  assertDigest('genomeContentDigest', genomeContentDigest);

  const genesisId = sha256Value({
    schemaVersion: 1,
    instanceId,
    creatorRef,
    creationBuildId,
    distributionBuildId,
    genomeValueDigest,
    genomeContentDigest,
  });
  const keelId = `keel-${sha256Value({
    schemaVersion: 1,
    instanceId,
    genesisId,
    genomeValueDigest,
    genomeContentDigest,
  })}`;
  return Object.freeze({ genesisId, keelId });
}
