import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { appendEvent, readVerifiedJournal } from '../state/journal.mjs';
import { verifyGenesisInputs } from './preflight.mjs';
import { createGenesisStateStore } from './state-store.mjs';
import { verifyGenesisReceipt } from './verify.mjs';

const crashPoints = new Set([
  'after-prepared',
  'after-keel-prepared',
  'after-journal-prepared',
  'after-journal-bound',
  'after-keel-bound',
  'after-mutually-bound',
  'after-receipt-written',
]);
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

function maybeCrash(crashAt, point) {
  if (crashAt === point) throw new Error(`injected genesis crash ${point}`);
}

function assertAdapter(adapter) {
  const methods = ['prepareNamespace', 'appendGenesis', 'inspectNamespace', 'appendCheckpoint', 'quarantineNamespace'];
  if (!adapter || methods.some((method) => typeof adapter[method] !== 'function')) {
    throw new TypeError('a complete keel adapter is required');
  }
}

function assertCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    throw new TypeError('initial checkpoint is required');
  }
  const expectedKeys = ['carry', 'constraints', 'purpose'];
  if (canonicalJson(Object.keys(checkpoint).sort()) !== canonicalJson(expectedKeys)) {
    throw new TypeError('initial checkpoint has an unknown field');
  }
  if (typeof checkpoint.purpose !== 'string' || checkpoint.purpose.length < 1 || checkpoint.purpose.length > 1024) {
    throw new TypeError('initial checkpoint purpose is invalid');
  }
  for (const name of ['constraints', 'carry']) {
    if (!Array.isArray(checkpoint[name]) || checkpoint[name].length > 16
        || checkpoint[name].some((value) => typeof value !== 'string' || value.length < 1 || value.length > 512)) {
      throw new TypeError(`initial checkpoint ${name} is invalid`);
    }
  }
  if (Buffer.byteLength(canonicalJson(checkpoint), 'utf8') > 8192) {
    throw new TypeError('initial checkpoint exceeds byte limit');
  }
}

function eventProjection(event) {
  const {
    sequence: _sequence,
    previousDigest: _previousDigest,
    contentDigest: _contentDigest,
    recordedAt: _recordedAt,
    ...projection
  } = event;
  return projection;
}

async function ensureJournalPrefix({ journalPath, instanceId, events, clock }) {
  let journal = await readVerifiedJournal(journalPath);
  if (journal.quarantinedTail) throw new IntegrityError('cannot resume genesis with incomplete journal tail');
  if (journal.instanceId && journal.instanceId !== instanceId) throw new IntegrityError('genesis journal identity collision');
  if (journal.events.length > events.length) throw new IntegrityError('genesis journal contains an unexpected transition');
  for (let index = 0; index < journal.events.length; index += 1) {
    if (canonicalJson(eventProjection(journal.events[index])) !== canonicalJson(events[index])) {
      throw new IntegrityError(`genesis journal collision at event ${index + 1}`);
    }
  }
  for (const event of events.slice(journal.events.length)) {
    await appendEvent({ journalPath, event: { ...event, recordedAt: clock() } });
  }
  journal = await readVerifiedJournal(journalPath);
  return journal;
}

async function atomicReceipt(receiptPath, receipt) {
  await mkdir(join(receiptPath, '..'), { recursive: true });
  const existingText = await readFile(receiptPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existingText !== null) {
    if (existingText !== jsonBytes(receipt)) throw new IntegrityError('genesis receipt collision');
    return;
  }
  const temporaryPath = `${receiptPath}.writing`;
  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, jsonBytes(receipt), { encoding: 'utf8', flag: 'wx' });
  await rename(temporaryPath, receiptPath);
}

function genesisRows(inputs, request) {
  return [
    {
      kind: 'constitution',
      payload: {
        constitutionDigest: inputs.constitutionDigest,
        constitution: inputs.genome.constitution,
      },
    },
    {
      kind: 'provenance',
      payload: {
        creatorRef: request.creatorRef,
        lineage: inputs.lineage,
        archetype: inputs.archetype,
      },
    },
    { kind: 'soul-port', payload: { state: 'dormant', soulPortDigest: inputs.soulPortDigest } },
    { kind: 'checkpoint', payload: { kind: 'genesis', ...request.initialCheckpoint } },
  ];
}

function journalBaseEvents(inputs, request, keelHeadDigest) {
  const common = {
    schemaVersion: 1,
    instanceId: request.instanceId,
    stateEpoch: 0,
    sourceClass: 'genesis-coordinator',
    sourceRef: inputs.identity.genesisId,
    causationId: inputs.identity.genesisId,
    correlationId: inputs.identity.genesisId,
  };
  return [
    {
      ...common,
      eventType: 'genesis.prepared',
      payload: {
        genesisId: inputs.identity.genesisId,
        keelId: inputs.identity.keelId,
        creationBuildId: inputs.creation.buildId,
        distributionBuildId: inputs.distribution.buildId,
        genomeValueDigest: inputs.creation.genomeDigest,
        genomeContentDigest: inputs.distribution.genomeDigest,
        keelHeadDigest,
        initialCheckpoint: request.initialCheckpoint,
      },
    },
    {
      ...common,
      eventType: 'vessel.created',
      payload: {
        artifactId: inputs.distribution.artifactId,
        buildId: inputs.distribution.buildId,
        constitutionDigest: inputs.constitutionDigest,
        soulPort: inputs.soulPort,
        genesisId: inputs.identity.genesisId,
        keelId: inputs.identity.keelId,
      },
    },
  ];
}

function receiptValue({ inputs, request, state, journalBindingBaseDigest, journalHeadDigest, keelBindingBaseDigest, keelHeadDigest }) {
  const unsigned = {
    schemaVersion: 1,
    status: 'admitted',
    genesisId: inputs.identity.genesisId,
    keelId: inputs.identity.keelId,
    instanceId: request.instanceId,
    creatorRef: request.creatorRef,
    creationBuildId: inputs.creation.buildId,
    distributionBuildId: inputs.distribution.buildId,
    policyDigest: inputs.creation.policyDigest,
    genomeValueDigest: inputs.creation.genomeDigest,
    genomeContentDigest: inputs.distribution.genomeDigest,
    constitutionDigest: inputs.constitutionDigest,
    soulPortDigest: inputs.soulPortDigest,
    journalBindingBaseDigest,
    journalHeadDigest,
    keelBindingBaseDigest,
    keelHeadDigest,
    transactionStateDigest: state.stateDigest,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('genesis-receipt', receipt);
  return receipt;
}

export async function prepareGenesis(request) {
  assertAdapter(request.keelAdapter);
  assertCheckpoint(request.initialCheckpoint);
  if (request.crashAt !== undefined && !crashPoints.has(request.crashAt)) {
    throw new TypeError('unknown genesis crash point');
  }
  const inputs = await verifyGenesisInputs(request);
  const stateStore = createGenesisStateStore({ transactionDir: request.transactionDir, clock: request.clock });
  const receiptPath = join(request.transactionDir, 'genesis-receipt.json');
  let state = await stateStore.initialize({ ...inputs.identity, instanceId: request.instanceId });
  maybeCrash(request.crashAt, 'after-prepared');

  const baseRows = genesisRows(inputs, request);
  if (state.state === 'prepared') {
    await request.keelAdapter.prepareNamespace({
      ...inputs.identity,
      instanceId: request.instanceId,
      bedrock: {
        genesisId: inputs.identity.genesisId,
        keelId: inputs.identity.keelId,
        instanceId: request.instanceId,
        creatorRef: request.creatorRef,
        creationBuildId: inputs.creation.buildId,
        distributionBuildId: inputs.distribution.buildId,
        genomeValueDigest: inputs.creation.genomeDigest,
        genomeContentDigest: inputs.distribution.genomeDigest,
      },
    });
    const keel = await request.keelAdapter.appendGenesis({
      keelId: inputs.identity.keelId,
      genesisId: inputs.identity.genesisId,
      rows: baseRows,
    });
    state = await stateStore.transition({
      expectedState: 'prepared',
      nextState: 'keel-prepared',
      evidence: { keelHeadDigest: keel.headDigest },
    });
  }
  maybeCrash(request.crashAt, 'after-keel-prepared');

  if (state.state === 'keel-prepared') {
    const keel = await request.keelAdapter.inspectNamespace({ keelId: inputs.identity.keelId });
    if (keel.headDigest !== state.evidence.keelHeadDigest) throw new IntegrityError('prepared keel head mismatch');
    const journal = await ensureJournalPrefix({
      journalPath: request.journalPath,
      instanceId: request.instanceId,
      events: journalBaseEvents(inputs, request, keel.headDigest),
      clock: request.clock,
    });
    state = await stateStore.transition({
      expectedState: 'keel-prepared',
      nextState: 'journal-prepared',
      evidence: { journalHeadDigest: journal.lastDigest },
    });
  }
  maybeCrash(request.crashAt, 'after-journal-prepared');

  if (state.state === 'journal-prepared') {
    const journalBeforeBinding = await readVerifiedJournal(request.journalPath);
    if (journalBeforeBinding.events.length < 2) throw new IntegrityError('prepared genesis journal is incomplete');
    const journalBindingBaseDigest = state.evidence.journalHeadDigest;
    const keelBindingBaseDigest = journalBeforeBinding.events[0].payload.keelHeadDigest;
    const baseEvents = journalBaseEvents(inputs, request, keelBindingBaseDigest);
    const boundEvent = {
      schemaVersion: 1,
      instanceId: request.instanceId,
      stateEpoch: 0,
      eventType: 'genesis.bound',
      sourceClass: 'genesis-coordinator',
      sourceRef: inputs.identity.genesisId,
      causationId: inputs.identity.genesisId,
      correlationId: inputs.identity.genesisId,
      payload: {
        genesisId: inputs.identity.genesisId,
        keelId: inputs.identity.keelId,
        journalBindingBaseDigest,
        keelBindingBaseDigest,
      },
    };
    const journal = await ensureJournalPrefix({
      journalPath: request.journalPath,
      instanceId: request.instanceId,
      events: [...baseEvents, boundEvent],
      clock: request.clock,
    });
    maybeCrash(request.crashAt, 'after-journal-bound');
    const binding = {
      kind: 'binding',
      payload: {
        genesisId: inputs.identity.genesisId,
        instanceId: request.instanceId,
        journalBindingBaseDigest,
        journalHeadDigest: journal.lastDigest,
      },
    };
    const boundKeel = await request.keelAdapter.appendGenesis({
      keelId: inputs.identity.keelId,
      genesisId: inputs.identity.genesisId,
      rows: [...baseRows, binding],
    });
    maybeCrash(request.crashAt, 'after-keel-bound');
    state = await stateStore.transition({
      expectedState: 'journal-prepared',
      nextState: 'mutually-bound',
      evidence: { journalHeadDigest: journal.lastDigest, keelHeadDigest: boundKeel.headDigest },
    });
  }
  maybeCrash(request.crashAt, 'after-mutually-bound');

  if (state.state === 'mutually-bound') {
    const journal = await readVerifiedJournal(request.journalPath);
    const keel = await request.keelAdapter.inspectNamespace({ keelId: inputs.identity.keelId });
    const bound = journal.events[2];
    const receipt = receiptValue({
      inputs,
      request,
      state,
      journalBindingBaseDigest: bound.payload.journalBindingBaseDigest,
      journalHeadDigest: state.evidence.journalHeadDigest,
      keelBindingBaseDigest: bound.payload.keelBindingBaseDigest,
      keelHeadDigest: state.evidence.keelHeadDigest,
    });
    if (journal.events[2].contentDigest !== receipt.journalHeadDigest
        || keel.records[5]?.contentDigest !== receipt.keelHeadDigest) {
      throw new IntegrityError('mutual genesis heads changed before receipt');
    }
    await atomicReceipt(receiptPath, receipt);
    maybeCrash(request.crashAt, 'after-receipt-written');
    state = await stateStore.transition({
      expectedState: 'mutually-bound',
      nextState: 'admitted',
      evidence: { receiptDigest: receipt.receiptDigest },
    });
  }

  if (state.state !== 'admitted') throw new IntegrityError(`genesis cannot admit from ${state.state}`);
  const genesisReceipt = await verifyGenesisReceipt({ ...request, receiptPath });
  return Object.freeze({
    status: 'admitted',
    genesisReceipt,
    receiptPath,
    journalPath: request.journalPath,
    snapshotPath: request.snapshotPath,
  });
}
