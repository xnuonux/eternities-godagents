import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { appendEvent, readVerifiedJournal } from '../state/journal.mjs';

const allowedKinds = new Set(['milestone', 'decision', 'verified-failure', 'landmine-candidate', 'handoff']);
const allowedVerification = new Set(['verified', 'unverified', 'blocked']);

function assertReceipt(receipt) {
  assertSchema('genesis-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('genesis receipt digest mismatch');
}

function assertCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    throw new TypeError('checkpoint is required');
  }
  const keys = Object.keys(checkpoint).sort();
  if (canonicalJson(keys) !== canonicalJson(['content', 'kind', 'method', 'verification'])) {
    throw new TypeError('checkpoint has an unknown field');
  }
  if (!allowedKinds.has(checkpoint.kind)) throw new TypeError('checkpoint kind is invalid');
  if (typeof checkpoint.content !== 'string' || checkpoint.content.length < 1 || checkpoint.content.length > 4096) {
    throw new TypeError('checkpoint content is invalid');
  }
  if (!allowedVerification.has(checkpoint.verification)) throw new TypeError('checkpoint verification is invalid');
  if (checkpoint.method !== null && (typeof checkpoint.method !== 'string' || checkpoint.method.length < 1 || checkpoint.method.length > 1024)) {
    throw new TypeError('checkpoint verification method is invalid');
  }
  if (checkpoint.verification === 'verified' && checkpoint.method === null) {
    throw new TypeError('verified checkpoint requires a verification method');
  }
}

function acknowledgementPayload({ receipt, source, checkpointDigest, keelHeadDigest }) {
  return {
    genesisId: receipt.genesisId,
    keelId: receipt.keelId,
    sourceSequence: source.sequence,
    sourceDigest: source.contentDigest,
    checkpointDigest,
    keelHeadDigest,
  };
}

export async function promoteCheckpoint({
  admittedReceipt,
  journalPath,
  keelAdapter,
  sourceSequence,
  checkpoint,
  expectedKeelHead,
  clock = () => new Date().toISOString(),
}) {
  assertReceipt(admittedReceipt);
  assertCheckpoint(checkpoint);
  if (!Number.isInteger(sourceSequence) || sourceSequence < 1) throw new TypeError('checkpoint source sequence is invalid');
  if (typeof clock !== 'function') throw new TypeError('checkpoint clock is required');

  let journal = await readVerifiedJournal(journalPath);
  if (journal.quarantinedTail) throw new IntegrityError('checkpoint source journal has an incomplete tail');
  if (journal.instanceId !== admittedReceipt.instanceId) throw new IntegrityError('checkpoint source instance mismatch');
  const source = journal.events[sourceSequence - 1];
  if (!source || source.sequence !== sourceSequence) throw new IntegrityError('checkpoint source sequence is unavailable');
  if (source.eventType === 'keel.checkpoint-promoted') throw new IntegrityError('checkpoint acknowledgement cannot promote itself');

  const keelBefore = await keelAdapter.inspectNamespace({ keelId: admittedReceipt.keelId });
  if (keelBefore.instanceId !== admittedReceipt.instanceId || keelBefore.genesisId !== admittedReceipt.genesisId) {
    throw new IntegrityError('checkpoint keel instance mismatch');
  }
  const payload = {
    ...structuredClone(checkpoint),
    genesisId: admittedReceipt.genesisId,
    sourceInstanceId: admittedReceipt.instanceId,
    sourceSequence: source.sequence,
    sourceDigest: source.contentDigest,
  };
  const checkpointDigest = sha256Value(payload);
  const keel = await keelAdapter.appendCheckpoint({
    keelId: admittedReceipt.keelId,
    expectedHeadDigest: expectedKeelHead,
    checkpoint: payload,
  });
  const acknowledgement = acknowledgementPayload({
    receipt: admittedReceipt,
    source,
    checkpointDigest,
    keelHeadDigest: keel.headDigest,
  });

  const existing = journal.events.find((event) => (
    event.eventType === 'keel.checkpoint-promoted'
      && event.payload.checkpointDigest === checkpointDigest
  ));
  if (existing) {
    if (canonicalJson(existing.payload) !== canonicalJson(acknowledgement)) {
      throw new IntegrityError('checkpoint acknowledgement collision');
    }
    return Object.freeze({
      checkpointDigest,
      keelHeadDigest: keel.headDigest,
      journalHeadDigest: journal.lastDigest,
    });
  }

  await appendEvent({
    journalPath,
    event: {
      schemaVersion: 1,
      instanceId: admittedReceipt.instanceId,
      stateEpoch: source.stateEpoch,
      eventType: 'keel.checkpoint-promoted',
      sourceClass: 'keel-promotion-policy',
      sourceRef: source.contentDigest,
      causationId: source.causationId,
      correlationId: admittedReceipt.genesisId,
      payload: acknowledgement,
      recordedAt: clock(),
    },
  });
  journal = await readVerifiedJournal(journalPath);
  return Object.freeze({
    checkpointDigest,
    keelHeadDigest: keel.headDigest,
    journalHeadDigest: journal.lastDigest,
  });
}
