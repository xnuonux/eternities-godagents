import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import {
  verifyPortablePhaseHostDescription,
} from '../sdk/portable-phase-host.mjs';

export const EXTERNAL_HOST_QUALIFICATION_PROTOCOL_ID =
  'eternities-external-host-qualification-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MAX_BYTES = 64 * 1024;
const BASELINE = Object.freeze({
  conformanceProtocolId: 'eternities-portable-phase-host-conformance-certification-v1',
  conformanceReceiptDigest: '4c82249de231aab58d35778e357ec03d8d830fe8421d58699fb95b2c55be0553',
  adversarialProtocolId: 'eternities-portable-phase-host-adversarial-certification-v1',
  adversarialReceiptDigest: '0c1923a3033668b56e8013a98f7adad0f73a5a8cc93496848ff1c9d6ad72a4cc',
});

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!same(actual, wanted)) throw new TypeError(`${label} fields are invalid`);
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} digest is invalid`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function verifyBaseline(value) {
  const baseline = clone(value);
  exactKeys(baseline, [
    'conformanceProtocolId',
    'conformanceReceiptDigest',
    'adversarialProtocolId',
    'adversarialReceiptDigest',
  ], 'external host qualification baseline');
  if (baseline.conformanceProtocolId !== BASELINE.conformanceProtocolId
      || baseline.adversarialProtocolId !== BASELINE.adversarialProtocolId
      || baseline.conformanceReceiptDigest !== BASELINE.conformanceReceiptDigest
      || baseline.adversarialReceiptDigest !== BASELINE.adversarialReceiptDigest) {
    throw new TypeError('external host qualification baseline protocol is invalid');
  }
  digest(baseline.conformanceReceiptDigest, 'portable host conformance receipt');
  digest(baseline.adversarialReceiptDigest, 'portable host adversarial receipt');
  return baseline;
}

function verifyLiveEvidence(value) {
  if (value === null) return null;
  const live = clone(value);
  exactKeys(live, [
    'providerFamily',
    'sourceCommit',
    'liveRunReceiptDigest',
    'securityReceiptDigest',
    'phaseReceiptDigests',
  ], 'external host live evidence');
  identifier(live.providerFamily, 'external host provider family');
  if (typeof live.sourceCommit !== 'string' || !COMMIT.test(live.sourceCommit)) {
    throw new TypeError('external host live evidence source commit is invalid');
  }
  digest(live.liveRunReceiptDigest, 'external host live run receipt');
  digest(live.securityReceiptDigest, 'external host security receipt');
  exactKeys(live.phaseReceiptDigests, ['native', 'review', 'revision'], 'external host phase receipt digests');
  for (const phase of ['native', 'review', 'revision']) {
    digest(live.phaseReceiptDigests[phase], `external host ${phase} receipt`);
  }
  return live;
}

function verifyDossier(value) {
  const copied = clone(value);
  const { hostDescription: _hostDescription, ...credentialFree } = copied;
  assertNoCredentialFields(credentialFree);
  assertSchema('external-host-qualification-dossier', copied);
  exactKeys(copied, [
    'schemaVersion',
    'protocolId',
    'status',
    'hostDescription',
    'hostDescriptionDigest',
    'baseline',
    'liveEvidence',
    'dossierDigest',
  ], 'external host qualification dossier');
  if (copied.schemaVersion !== 1 || copied.protocolId !== EXTERNAL_HOST_QUALIFICATION_PROTOCOL_ID) {
    throw new TypeError('external host qualification dossier protocol is invalid');
  }
  if (!['contract-only', 'live-evidence-bound'].includes(copied.status)) {
    throw new TypeError('external host qualification dossier status is invalid');
  }
  const hostDescription = verifyPortablePhaseHostDescription(copied.hostDescription);
  digest(copied.hostDescriptionDigest, 'external host description');
  if (copied.hostDescriptionDigest !== hostDescription.descriptionDigest) {
    throw new TypeError('external host description digest does not match');
  }
  const baseline = verifyBaseline(copied.baseline);
  const liveEvidence = verifyLiveEvidence(copied.liveEvidence);
  if ((liveEvidence === null && copied.status !== 'contract-only')
      || (liveEvidence !== null && copied.status !== 'live-evidence-bound')) {
    throw new TypeError('external host qualification status does not match live evidence');
  }
  digest(copied.dossierDigest, 'external host qualification dossier');
  const { dossierDigest, ...unsigned } = copied;
  if (dossierDigest !== sha256Value(unsigned)) {
    throw new TypeError('external host qualification dossier digest does not match');
  }
  if (Buffer.byteLength(`${canonicalJson(copied)}\n`, 'utf8') > MAX_BYTES) {
    throw new TypeError('external host qualification dossier exceeds byte ceiling');
  }
  return Object.freeze({
    ...copied,
    hostDescription: Object.freeze(clone(hostDescription)),
    baseline: Object.freeze(clone(baseline)),
    liveEvidence: liveEvidence === null
      ? null
      : Object.freeze({
        ...liveEvidence,
        phaseReceiptDigests: Object.freeze(clone(liveEvidence.phaseReceiptDigests)),
      }),
  });
}

export function buildExternalHostQualificationDossier(input = {}) {
  exactKeys(input, ['hostDescription', 'baseline', 'liveEvidence'], 'external host qualification options');
  const hostDescription = clone(input.hostDescription);
  const baseline = clone(input.baseline);
  const liveEvidence = input.liveEvidence === null ? null : clone(input.liveEvidence);
  const unsigned = {
    schemaVersion: 1,
    protocolId: EXTERNAL_HOST_QUALIFICATION_PROTOCOL_ID,
    status: liveEvidence === null ? 'contract-only' : 'live-evidence-bound',
    hostDescription,
    hostDescriptionDigest: hostDescription.descriptionDigest,
    baseline,
    liveEvidence,
  };
  return verifyDossier({ ...unsigned, dossierDigest: sha256Value(unsigned) });
}

export function verifyExternalHostQualificationDossier(value) {
  return verifyDossier(value);
}
