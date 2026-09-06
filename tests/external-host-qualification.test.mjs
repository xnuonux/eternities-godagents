import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import {
  buildExternalHostQualificationDossier,
  verifyExternalHostQualificationDossier,
} from '../src/host/external-host-qualification.mjs';
import {
  RESERVED_LIVE_EVIDENCE,
  buildDeterministicExternalHostQualificationFixture,
} from './helpers/external-host-qualification-fixture.mjs';

test('builds a deterministic contract-only dossier', async () => {
  const fixture = await buildDeterministicExternalHostQualificationFixture();
  const dossier = buildExternalHostQualificationDossier(fixture.input);
  assert.deepEqual(dossier, fixture.dossier);
  assert.equal(dossier.status, 'contract-only');
  assert.equal(dossier.liveEvidence, null);
});

test('verifies a contract-only dossier without provider work', async () => {
  const fixture = await buildDeterministicExternalHostQualificationFixture();
  assert.deepEqual(
    verifyExternalHostQualificationDossier(fixture.dossier),
    fixture.dossier,
  );
});

test('binds a reserved live-evidence dossier without calling a provider', async () => {
  const fixture = await buildDeterministicExternalHostQualificationFixture();
  const dossier = buildExternalHostQualificationDossier({
    ...fixture.input,
    liveEvidence: RESERVED_LIVE_EVIDENCE,
  });
  assert.equal(dossier.status, 'live-evidence-bound');
  assert.deepEqual(verifyExternalHostQualificationDossier(dossier), dossier);
});

const hostileCases = [
  ['host-description-digest-drift', (dossier) => {
    dossier.hostDescription.adapterId = 'forged-host';
    return dossier;
  }],
  ['host-authority-expansion', (dossier) => {
    dossier.hostDescription.authority.realmEffects = true;
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
  ['baseline-receipt-drift', (dossier) => {
    dossier.baseline.conformanceReceiptDigest = 'f'.repeat(64);
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
  ['contract-only-live-evidence', (dossier) => {
    dossier.liveEvidence = structuredClone(RESERVED_LIVE_EVIDENCE);
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
  ['missing-live-phase', (dossier) => {
    dossier.liveEvidence = structuredClone(RESERVED_LIVE_EVIDENCE);
    delete dossier.liveEvidence.phaseReceiptDigests.review;
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
  ['invalid-source-commit', (dossier) => {
    dossier.liveEvidence = structuredClone(RESERVED_LIVE_EVIDENCE);
    dossier.liveEvidence.sourceCommit = 'not-a-commit';
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
  ['credential-shaped-field', (dossier) => {
    dossier.apiKey = 'never-public';
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
  ['unknown-field', (dossier) => {
    dossier.unexpected = true;
    const { dossierDigest: _old, ...unsigned } = dossier;
    dossier.dossierDigest = sha256Value(unsigned);
    return dossier;
  }],
];

for (const [label, mutate] of hostileCases) {
  test(`rejects ${label}`, async () => {
    const fixture = await buildDeterministicExternalHostQualificationFixture();
    assert.throws(() => verifyExternalHostQualificationDossier(mutate(structuredClone(fixture.dossier))));
  });
}

test('rejects an oversized dossier before publication', async () => {
  const fixture = await buildDeterministicExternalHostQualificationFixture();
  const oversized = structuredClone(fixture.input);
  oversized.hostDescription.adapterId = 'x'.repeat(100000);
  assert.throws(() => buildExternalHostQualificationDossier(oversized), /size|byte|digest|description/i);
});
