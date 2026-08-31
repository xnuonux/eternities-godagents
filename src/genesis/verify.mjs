import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { readVerifiedJournal } from '../state/journal.mjs';
import { createGenesisStateStore } from './state-store.mjs';
import { verifyGenesisInputs } from './preflight.mjs';

const jsonBytes = (value) => `${canonicalJson(value)}\n`;

async function readReceipt(receiptPath) {
  const text = await readFile(receiptPath, 'utf8');
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    throw new IntegrityError('genesis receipt is not valid JSON');
  }
  if (text !== jsonBytes(receipt)) throw new IntegrityError('genesis receipt is not canonical');
  assertSchema('genesis-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('genesis receipt digest mismatch');
  return receipt;
}

export async function verifyGenesisAdmission({
  receiptPath,
  creationDir,
  distributionDir,
  expectedPolicyDigest,
  expectedCreationBuildId,
  instanceId,
  creatorRef,
  transactionDir,
  journalPath,
  keelAdapter,
}) {
  const receipt = await readReceipt(receiptPath);
  const inputs = await verifyGenesisInputs({
    creationDir,
    distributionDir,
    expectedPolicyDigest,
    expectedCreationBuildId,
    instanceId,
    creatorRef,
  });
  const expectedIdentity = {
    genesisId: inputs.identity.genesisId,
    keelId: inputs.identity.keelId,
    instanceId,
    creatorRef,
    creationBuildId: inputs.creation.buildId,
    distributionBuildId: inputs.distribution.buildId,
    policyDigest: inputs.creation.policyDigest,
    genomeValueDigest: inputs.creation.genomeDigest,
    genomeContentDigest: inputs.distribution.genomeDigest,
    constitutionDigest: inputs.constitutionDigest,
    soulPortDigest: inputs.soulPortDigest,
  };
  for (const [key, value] of Object.entries(expectedIdentity)) {
    if (receipt[key] !== value) throw new IntegrityError(`genesis receipt ${key} mismatch`);
  }

  const state = await createGenesisStateStore({ transactionDir }).read();
  if (!state || state.state !== 'admitted') throw new IntegrityError('genesis transaction is not admitted');
  if (state.genesisId !== receipt.genesisId
      || state.keelId !== receipt.keelId
      || state.instanceId !== receipt.instanceId) {
    throw new IntegrityError('genesis transaction identity mismatch');
  }
  if (state.previousStateDigest !== receipt.transactionStateDigest) {
    throw new IntegrityError('genesis transaction binding mismatch');
  }
  if (state.evidence.receiptDigest !== receipt.receiptDigest) {
    throw new IntegrityError('genesis transaction receipt mismatch');
  }

  const journal = await readVerifiedJournal(journalPath);
  if (journal.quarantinedTail) throw new IntegrityError('genesis journal has an incomplete tail');
  if (journal.instanceId !== receipt.instanceId || journal.events.length < 3) {
    throw new IntegrityError('genesis journal identity or length mismatch');
  }
  const genesisEvents = journal.events.slice(0, 3);
  if (canonicalJson(genesisEvents.map((event) => event.eventType))
      !== canonicalJson(['genesis.prepared', 'vessel.created', 'genesis.bound'])) {
    throw new IntegrityError('genesis journal prefix mismatch');
  }
  const [prepared, created, bound] = genesisEvents;
  if (prepared.payload.genesisId !== receipt.genesisId
      || created.payload.genesisId !== receipt.genesisId
      || created.payload.keelId !== receipt.keelId
      || bound.payload.genesisId !== receipt.genesisId) {
    throw new IntegrityError('genesis journal binding identity mismatch');
  }
  if (bound.previousDigest !== receipt.journalBindingBaseDigest
      || bound.contentDigest !== receipt.journalHeadDigest
      || bound.payload.journalBindingBaseDigest !== receipt.journalBindingBaseDigest
      || bound.payload.keelBindingBaseDigest !== receipt.keelBindingBaseDigest) {
    throw new IntegrityError('genesis journal head binding mismatch');
  }

  const keel = await keelAdapter.inspectNamespace({ keelId: receipt.keelId });
  if (keel.status !== 'active'
      || keel.instanceId !== receipt.instanceId
      || keel.genesisId !== receipt.genesisId
      || keel.records.length < 6) {
    throw new IntegrityError('genesis keel identity or length mismatch');
  }
  const binding = keel.records[5];
  if (binding.kind !== 'binding'
      || binding.previousDigest !== receipt.keelBindingBaseDigest
      || binding.contentDigest !== receipt.keelHeadDigest
      || binding.payload.genesisId !== receipt.genesisId
      || binding.payload.journalHeadDigest !== receipt.journalHeadDigest) {
    throw new IntegrityError('genesis keel head binding mismatch');
  }
  return Object.freeze({
    receipt: Object.freeze(structuredClone(receipt)),
    creationSnapshot: inputs.creationSnapshot,
    distributionSnapshot: inputs.distributionSnapshot,
    keelSnapshot: deepFreeze(structuredClone(keel)),
  });
}

export async function verifyGenesisReceipt(input) {
  return (await verifyGenesisAdmission(input)).receipt;
}
