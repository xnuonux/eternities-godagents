import { sha256Value } from '../../src/core/digest.mjs';
import { buildPortableAdversarialDescription } from './portable-phase-host-adversarial-fixture.mjs';

export const PORTABLE_CONFORMANCE_RECEIPT_DIGEST =
  '4c82249de231aab58d35778e357ec03d8d830fe8421d58699fb95b2c55be0553';
export const PORTABLE_ADVERSARIAL_RECEIPT_DIGEST =
  '0c1923a3033668b56e8013a98f7adad0f73a5a8cc93496848ff1c9d6ad72a4cc';

export const RESERVED_LIVE_EVIDENCE = Object.freeze({
  providerFamily: 'fixture-provider-v1',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  liveRunReceiptDigest: '1'.repeat(64),
  securityReceiptDigest: '2'.repeat(64),
  phaseReceiptDigests: Object.freeze({
    native: '3'.repeat(64),
    review: '4'.repeat(64),
    revision: '5'.repeat(64),
  }),
});

export async function buildDeterministicExternalHostQualificationFixture() {
  const input = {
    hostDescription: buildPortableAdversarialDescription({
      adapterId: 'qualification-fixture',
    }),
    baseline: {
      conformanceProtocolId: 'eternities-portable-phase-host-conformance-certification-v1',
      conformanceReceiptDigest: PORTABLE_CONFORMANCE_RECEIPT_DIGEST,
      adversarialProtocolId: 'eternities-portable-phase-host-adversarial-certification-v1',
      adversarialReceiptDigest: PORTABLE_ADVERSARIAL_RECEIPT_DIGEST,
    },
    liveEvidence: null,
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-external-host-qualification-v1',
    status: 'contract-only',
    hostDescription: input.hostDescription,
    hostDescriptionDigest: input.hostDescription.descriptionDigest,
    baseline: input.baseline,
    liveEvidence: null,
  };
  return Object.freeze({
    input,
    liveEvidence: structuredClone(RESERVED_LIVE_EVIDENCE),
    dossier: Object.freeze({ ...unsigned, dossierDigest: sha256Value(unsigned) }),
  });
}
