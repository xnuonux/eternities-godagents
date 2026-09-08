import { sha256Value } from '../core/digest.mjs';
import { SchemaError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { localArtifactEffectProducer } from '../host/structured-effect-producer.mjs';

// Distribution compatibility only, not runtime issuance or authority. Consumers
// with fixture-only behavior retain their original v1 schema check.
export function verifyDistributionRealmContract(input) {
  const contract = structuredClone(input);
  let profile;
  if (contract?.schemaVersion === 1) {
    assertSchema('realm-contract', contract);
    profile = 'fixture-local-v1';
  } else if (contract?.schemaVersion === 2) {
    assertSchema('local-artifact-realm-contract', contract);
    if (contract.artifactStore.producerDescriptorDigest !== sha256Value(localArtifactEffectProducer)) {
      throw new SchemaError('local-artifact-realm-contract', '/artifactStore/producerDescriptorDigest', 'producer mismatch');
    }
    profile = contract.profile;
  } else {
    throw new SchemaError('distribution-realm-contract', '/schemaVersion', 'unsupported version');
  }
  return Object.freeze({ schemaVersion: contract.schemaVersion, profile,
    contractDigest: sha256Value(contract), capabilities: Object.freeze([...contract.capabilities]) });
}
