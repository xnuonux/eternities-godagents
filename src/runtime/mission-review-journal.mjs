import { mkdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { publishFileExclusive, replaceFileAtomically } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import {
  verifyMissionCompletionReceipt,
  verifyMissionAdmission,
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseRequest,
  verifyMissionPhaseResult,
  verifyMissionVerdict,
} from './mission-phase-contracts.mjs';

const protocolId = 'eternities-mission-review-journal-v1';
const zeroDigest = '0'.repeat(64);
const DIGEST = /^[a-f0-9]{64}$/;
const maximumJournalBytes = 8 * 1024 * 1024;
const maximumEvents = 64;

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

export class MissionReviewJournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionReviewJournalError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionReviewJournalError(code, message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new IntegrityError(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new IntegrityError(`${label} is invalid`);
}

function parseTime(value, label) {
  const milliseconds = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== value) {
    throw new IntegrityError(`${label} is invalid`);
  }
  return milliseconds;
}

function clockTime(clock) {
  const milliseconds = Number(clock());
  if (!Number.isFinite(milliseconds)) throw new TypeError('mission review journal clock is invalid');
  return new Date(milliseconds).toISOString();
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function transactionIdFor(admission) {
  return sha256Value({ schemaVersion: 1, protocolId, admissionDigest: admission.admissionDigest });
}

function missionSlotIdFor(missionId) {
  return sha256Value({ schemaVersion: 1, protocolId, missionId });
}

function eventValue(events, transactionId, eventType, recordedAt, payload) {
  if (events.length >= maximumEvents) throw new IntegrityError('mission review journal event ceiling exceeded');
  const eventTime = parseTime(recordedAt, 'mission review event time');
  if (events.length > 0
      && eventTime < parseTime(events.at(-1).recordedAt, 'previous mission review event time')) {
    throw new IntegrityError('mission review event time moved backward');
  }
  const unsigned = {
    schemaVersion: 1,
    sequence: events.length + 1,
    previousDigest: events.at(-1)?.contentDigest ?? zeroDigest,
    eventType,
    transactionId,
    recordedAt,
    payload: clone(payload),
  };
  const event = { ...unsigned, contentDigest: sha256Value(unsigned) };
  assertSchema('mission-review-journal-event', event);
  return event;
}

function stateValue(transactionId, missionSlotId, events) {
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    transactionId,
    missionSlotId,
    events: clone(events),
    headDigest: events.at(-1)?.contentDigest ?? zeroDigest,
  };
  const state = { ...unsigned, stateDigest: sha256Value(unsigned) };
  assertSchema('mission-review-journal-state', state);
  return state;
}

function emptyProjection(admission, transactionId) {
  return {
    transactionId,
    admission,
    native: null,
    reviewBinding: null,
    reviews: [],
    revision: null,
    acceptedArtifactDigest: null,
    budgetExhaustion: null,
    verdict: null,
    terminal: null,
    completionTokens: 0,
  };
}

function resultSlot(projection, phase, round) {
  if (phase === 'native') return projection.native;
  if (phase === 'revision') return projection.revision;
  return projection.reviews.find((entry) => entry.request.round === round) ?? null;
}

function nextAction(projection) {
  if (projection.terminal) return 'none';
  if (projection.budgetExhaustion) return projection.verdict ? 'complete-mission' : 'commit-verdict';
  if (!projection.native) return 'prepare-native';
  if (!projection.native.result) return 'reconcile-native';
  const reviewRequired = projection.admission.godskills?.deferredReviews.length > 0;
  if (!reviewRequired) {
    if (!projection.acceptedArtifactDigest) return 'accept-native';
    if (!projection.verdict) return 'commit-verdict';
    return 'complete-mission';
  }
  if (!projection.reviewBinding) return 'bind-review';
  if (projection.reviews.length === 0) return 'prepare-review-1';
  const first = projection.reviews[0];
  if (!first.result) return 'reconcile-review-1';
  const recommendation = first.artifact.recommendation;
  if (recommendation === 'accept') {
    if (!projection.acceptedArtifactDigest) return 'accept-native';
    if (!projection.verdict) return 'commit-verdict';
    return 'complete-mission';
  }
  if (recommendation === 'reject') {
    if (!projection.verdict) return 'commit-verdict';
    return 'complete-mission';
  }
  if (!projection.revision) return 'prepare-revision';
  if (!projection.revision.result) return 'reconcile-revision';
  if (projection.reviews.length === 1) return 'prepare-review-2';
  if (!projection.reviews[1].result) return 'reconcile-review-2';
  if (projection.reviews[1].artifact.recommendation === 'accept' && !projection.acceptedArtifactDigest) {
    return 'accept-revision';
  }
  if (!projection.verdict) return 'commit-verdict';
  return 'complete-mission';
}

function expectedInputs(projection, action) {
  if (action === 'prepare-native') {
    return projection.admission.godskills === null ? [] : [{
      role: 'godskills-package',
      artifactDigest: projection.admission.godskills.receipt.packageDigest,
    }];
  }
  if (action === 'prepare-review-1') {
    return [
      { role: 'godskills-binding', artifactDigest: projection.admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: projection.native.result.artifactDigest },
    ];
  }
  if (action === 'prepare-revision') {
    return [
      { role: 'native', artifactDigest: projection.native.result.artifactDigest },
      { role: 'review', artifactDigest: projection.reviews[0].result.artifactDigest },
    ];
  }
  if (action === 'prepare-review-2') {
    return [
      { role: 'godskills-binding', artifactDigest: projection.admission.godskills.bindingDigest },
      { role: 'prior-review', artifactDigest: projection.reviews[0].result.artifactDigest },
      { role: 'revision', artifactDigest: projection.revision.result.artifactDigest },
      { role: 'subject', artifactDigest: projection.revision.result.artifactDigest },
    ];
  }
  throw new IntegrityError(`mission phase input action is unsupported: ${action}`);
}

function phaseResults(projection) {
  if (!projection.native?.result) throw new IntegrityError('mission lacks its native result');
  return {
    nativeResultDigest: projection.native.result.resultDigest,
    reviewResultDigests: projection.reviews.map(({ result }) => {
      if (!result) throw new IntegrityError('mission has an incomplete review result');
      return result.resultDigest;
    }),
    revisionResultDigest: projection.revision?.result?.resultDigest ?? null,
  };
}

function aggregateUsage(projection) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
  };
  const entries = [projection.native, ...projection.reviews, projection.revision].filter(Boolean);
  for (const entry of entries) {
    if (!entry.result) continue;
    for (const key of Object.keys(usage)) usage[key] += entry.result.usage[key];
  }
  return usage;
}

function expectedVerdict(projection) {
  if (!projection.native?.result) throw new IntegrityError('mission verdict lacks a native result');
  const nativeResultDigest = projection.native.result.resultDigest;
  const reviewResultDigests = projection.reviews.map(({ result }) => result?.resultDigest);
  if (reviewResultDigests.some((value) => !value)) throw new IntegrityError('mission verdict lacks a review result');
  if (projection.budgetExhaustion) {
    const revisionResultDigest = projection.revision?.result?.resultDigest ?? null;
    const reason = projection.budgetExhaustion.phase === 'revision'
      ? 'budget-exhausted-before-revision'
      : projection.budgetExhaustion.round === 2
        ? 'budget-exhausted-before-final-review'
        : 'budget-exhausted-before-review';
    return {
      disposition: 'rejected',
      reason,
      acceptedArtifactDigest: null,
      nativeResultDigest,
      reviewResultDigests,
      revisionResultDigest,
    };
  }
  if (projection.reviews.length === 0) {
    return {
      disposition: 'accepted',
      reason: 'native-no-review',
      acceptedArtifactDigest: projection.native.result.artifactDigest,
      nativeResultDigest,
      reviewResultDigests,
      revisionResultDigest: null,
    };
  }
  const first = projection.reviews[0].artifact.recommendation;
  if (first === 'accept') {
    return {
      disposition: 'accepted',
      reason: 'review-accepted',
      acceptedArtifactDigest: projection.native.result.artifactDigest,
      nativeResultDigest,
      reviewResultDigests,
      revisionResultDigest: null,
    };
  }
  if (first === 'reject') {
    return {
      disposition: 'rejected',
      reason: 'review-rejected',
      acceptedArtifactDigest: null,
      nativeResultDigest,
      reviewResultDigests,
      revisionResultDigest: null,
    };
  }
  if (!projection.revision?.result || projection.reviews.length !== 2) {
    throw new IntegrityError('mission verdict lacks its bounded revision evidence');
  }
  const second = projection.reviews[1].artifact.recommendation;
  return {
    disposition: second === 'accept' ? 'accepted' : 'rejected',
    reason: second === 'accept'
      ? 'revision-review-accepted'
      : second === 'reject' ? 'revision-review-rejected' : 'revision-budget-exhausted',
    acceptedArtifactDigest: second === 'accept' ? projection.revision.result.artifactDigest : null,
    nativeResultDigest,
    reviewResultDigests,
    revisionResultDigest: projection.revision.result.resultDigest,
  };
}

function assertVerdictMatchesProjection(verdict, projection) {
  const expected = expectedVerdict(projection);
  for (const key of ['disposition', 'reason', 'acceptedArtifactDigest', 'nativeResultDigest', 'revisionResultDigest']) {
    if (verdict[key] !== expected[key]) throw new IntegrityError(`mission verdict ${key} mismatch`);
  }
  if (!same(verdict.reviewResultDigests, expected.reviewResultDigests)) {
    throw new IntegrityError('mission verdict review result set mismatch');
  }
}

async function readBounded(path, maximumBytes, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.size > maximumBytes) throw new IntegrityError(`${label} exceeds maximum size`);
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) throw new IntegrityError(`${label} exceeds maximum size`);
  return text;
}

async function readArtifactFile(artifactsDir, reference) {
  exactKeys(reference, ['bytes', 'digest'], 'mission artifact reference');
  requireDigest(reference.digest, 'mission artifact digest');
  if (!Number.isSafeInteger(reference.bytes) || reference.bytes < 1 || reference.bytes > 16_777_216) {
    throw new IntegrityError('mission artifact byte length is invalid');
  }
  const path = join(artifactsDir, `${reference.digest}.json`);
  const text = await readBounded(path, reference.bytes + 1, 'mission artifact');
  if (text === null) throw new IntegrityError('mission artifact is missing');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new IntegrityError('mission artifact is invalid JSON');
  }
  if (text !== jsonBytes(value)) throw new IntegrityError('mission artifact is not canonical');
  const body = canonicalJson(value);
  if (Buffer.byteLength(body, 'utf8') !== reference.bytes || sha256Text(body) !== reference.digest) {
    throw new IntegrityError('mission artifact digest or byte length mismatch');
  }
  return value;
}

async function replayState(state, artifactsDir) {
  assertSchema('mission-review-journal-state', state);
  exactKeys(state, [
    'events', 'headDigest', 'missionSlotId', 'protocolId', 'schemaVersion', 'stateDigest', 'transactionId',
  ], 'mission review journal');
  if (state.schemaVersion !== 1 || state.protocolId !== protocolId || !Array.isArray(state.events)
      || state.events.length < 1 || state.events.length > maximumEvents) {
    throw new IntegrityError('mission review journal protocol is invalid');
  }
  requireDigest(state.transactionId, 'mission review transaction id');
  requireDigest(state.missionSlotId, 'mission review slot id');
  requireDigest(state.headDigest, 'mission review journal head');
  requireDigest(state.stateDigest, 'mission review journal state');
  const { stateDigest, ...stateUnsigned } = state;
  if (sha256Value(stateUnsigned) !== stateDigest) throw new IntegrityError('mission review journal state digest mismatch');

  let previousDigest = zeroDigest;
  let previousTime = Number.NEGATIVE_INFINITY;
  let projection = null;
  for (const [index, event] of state.events.entries()) {
    assertSchema('mission-review-journal-event', event);
    exactKeys(event, [
      'contentDigest', 'eventType', 'payload', 'previousDigest', 'recordedAt', 'schemaVersion', 'sequence', 'transactionId',
    ], `mission review event ${index + 1}`);
    if (event.schemaVersion !== 1 || event.sequence !== index + 1
        || event.previousDigest !== previousDigest || event.transactionId !== state.transactionId) {
      throw new IntegrityError('mission review journal event chain mismatch');
    }
    const eventTime = parseTime(event.recordedAt, 'mission review event time');
    if (eventTime < previousTime) throw new IntegrityError('mission review event time moved backward');
    previousTime = eventTime;
    const { contentDigest, ...unsigned } = event;
    requireDigest(contentDigest, 'mission review event content digest');
    if (sha256Value(unsigned) !== contentDigest) throw new IntegrityError('mission review journal event digest mismatch');
    previousDigest = contentDigest;

    if (index === 0) {
      if (event.eventType !== 'mission.admitted') throw new IntegrityError('mission review journal must begin with admission');
      exactKeys(event.payload, ['admission'], 'mission admission event');
      const admission = verifyMissionAdmission(event.payload.admission);
      if (state.transactionId !== transactionIdFor(admission)
          || state.missionSlotId !== missionSlotIdFor(admission.mission.missionId)) {
        throw new IntegrityError('mission review journal admission identity mismatch');
      }
      projection = emptyProjection(admission, state.transactionId);
      continue;
    }

    if (projection.terminal) throw new IntegrityError('mission review journal contains events after completion');
    if (['native.prepared', 'review.prepared', 'revision.prepared'].includes(event.eventType)) {
      exactKeys(event.payload, ['descriptor', 'request'], 'mission phase preparation');
      const { request, descriptor } = event.payload;
      verifyMissionPhaseRequest(request, { admission: projection.admission, descriptor });
      const expected = nextAction(projection);
      if (expected !== `prepare-${request.phase}${request.phase === 'review' ? `-${request.round}` : ''}`) {
        throw new IntegrityError('mission phase preparation transition is invalid');
      }
      if (!same(request.inputs, expectedInputs(projection, expected))) {
        throw new IntegrityError('mission phase request inputs do not match journal evidence');
      }
      const entry = { request, descriptor, result: null, artifact: null };
      if (request.phase === 'native') projection.native = entry;
      else if (request.phase === 'revision') projection.revision = entry;
      else projection.reviews.push(entry);
      continue;
    }
    if (['native.committed', 'review.committed', 'revision.committed'].includes(event.eventType)) {
      exactKeys(event.payload, ['artifact', 'receipt'], 'mission phase completion');
      const phase = event.eventType.slice(0, -'.committed'.length);
      const round = phase === 'review' ? event.payload.receipt.round : 1;
      const slot = resultSlot(projection, phase, round);
      if (!slot || slot.result) throw new IntegrityError('mission phase completion lacks its preparation');
      const artifact = await readArtifactFile(artifactsDir, event.payload.artifact);
      const result = { receipt: event.payload.receipt, artifact };
      verifyMissionPhaseResult(result, { request: slot.request, descriptor: slot.descriptor });
      if (Date.parse(result.receipt.startedAt) < Date.parse(projection.admission.admittedAt)) {
        throw new IntegrityError('mission phase execution predates admission');
      }
      if (event.payload.artifact.digest !== result.receipt.artifactDigest
          || event.payload.artifact.bytes !== result.receipt.artifactBytes) {
        throw new IntegrityError('mission phase completion artifact reference mismatch');
      }
      projection.completionTokens += result.receipt.usage.completionTokens;
      if (projection.completionTokens > projection.admission.budgets.totalCompletionTokens) {
        throw new IntegrityError('mission completion token budget exceeded');
      }
      slot.result = result.receipt;
      slot.artifact = artifact;
      continue;
    }
    if (event.eventType === 'review.bound') {
      exactKeys(event.payload, ['bindingDigest', 'deferredReviews'], 'review binding');
      if (nextAction(projection) !== 'bind-review') throw new IntegrityError('review binding transition is invalid');
      const expected = projection.admission.godskills;
      if (!expected || event.payload.bindingDigest !== expected.bindingDigest
          || !same(event.payload.deferredReviews, expected.deferredReviews)) {
        throw new IntegrityError('review binding does not match admitted Godskills');
      }
      projection.reviewBinding = clone(event.payload);
      continue;
    }
    if (event.eventType === 'native.accepted' || event.eventType === 'revision.accepted') {
      exactKeys(event.payload, ['artifactDigest'], 'mission artifact acceptance');
      requireDigest(event.payload.artifactDigest, 'mission accepted artifact');
      const expectedAction = event.eventType === 'native.accepted' ? 'accept-native' : 'accept-revision';
      if (nextAction(projection) !== expectedAction) throw new IntegrityError('mission artifact acceptance transition is invalid');
      const expectedDigest = event.eventType === 'native.accepted'
        ? projection.native.result.artifactDigest
        : projection.revision.result.artifactDigest;
      if (event.payload.artifactDigest !== expectedDigest) throw new IntegrityError('mission accepted artifact digest mismatch');
      projection.acceptedArtifactDigest = event.payload.artifactDigest;
      continue;
    }
    if (event.eventType === 'budget.exhausted') {
      exactKeys(event.payload, [
        'phase', 'remainingCompletionTokens', 'requiredCompletionTokens', 'round',
      ], 'mission budget exhaustion');
      const action = nextAction(projection);
      const expected = event.payload.phase === 'review'
        ? `prepare-review-${event.payload.round}`
        : `prepare-${event.payload.phase}`;
      if (action !== expected || !['review', 'revision'].includes(event.payload.phase)
          || !Number.isSafeInteger(event.payload.round)
          || !Number.isSafeInteger(event.payload.remainingCompletionTokens)
          || !Number.isSafeInteger(event.payload.requiredCompletionTokens)) {
        throw new IntegrityError('mission budget exhaustion transition is invalid');
      }
      const required = event.payload.phase === 'review'
        ? projection.admission.budgets.reviewCompletionTokensPerRound
        : projection.admission.budgets.revisionCompletionTokens;
      const remaining = projection.admission.budgets.totalCompletionTokens - projection.completionTokens;
      if (event.payload.requiredCompletionTokens !== required
          || event.payload.remainingCompletionTokens !== remaining || required <= remaining) {
        throw new IntegrityError('mission budget exhaustion evidence is invalid');
      }
      projection.budgetExhaustion = clone(event.payload);
      continue;
    }
    if (event.eventType === 'verdict.committed') {
      exactKeys(event.payload, ['verdict'], 'mission verdict event');
      if (nextAction(projection) !== 'commit-verdict') throw new IntegrityError('mission verdict transition is invalid');
      const verdict = verifyMissionVerdict(event.payload.verdict, projection.admission);
      assertVerdictMatchesProjection(verdict, projection);
      if (verdict.disposition === 'accepted' && verdict.acceptedArtifactDigest !== projection.acceptedArtifactDigest) {
        throw new IntegrityError('mission verdict lacks its accepted artifact event');
      }
      if (verdict.disposition === 'rejected' && projection.acceptedArtifactDigest !== null) {
        throw new IntegrityError('rejected mission unexpectedly accepted an artifact');
      }
      projection.verdict = verdict;
      continue;
    }
    if (event.eventType === 'mission.completed') {
      exactKeys(event.payload, ['receipt'], 'mission completion event');
      if (nextAction(projection) !== 'complete-mission') throw new IntegrityError('mission completion transition is invalid');
      const receipt = verifyMissionCompletionReceipt(event.payload.receipt, {
        admission: projection.admission,
        verdict: projection.verdict,
      });
      if (receipt.transactionId !== projection.transactionId
          || receipt.preCompletionJournalHeadDigest !== event.previousDigest
          || !same(receipt.phases, phaseResults(projection))
          || !same(receipt.usage, aggregateUsage(projection))
          || Date.parse(receipt.completedAt) < Math.max(
            ...[projection.native, ...projection.reviews, projection.revision]
              .filter((entry) => entry?.result)
              .map((entry) => Date.parse(entry.result.completedAt)),
          )) {
        throw new IntegrityError('mission completion receipt does not match journal evidence');
      }
      projection.terminal = receipt;
      continue;
    }
    throw new IntegrityError(`mission review journal event type is unsupported: ${event.eventType}`);
  }
  if (state.headDigest !== previousDigest) throw new IntegrityError('mission review journal head mismatch');
  return projection;
}

function publicProjection(state, projection) {
  const phaseProjection = (entry) => entry === null ? null : {
    phase: entry.request.phase,
    round: entry.request.round,
    requestDigest: entry.request.requestDigest,
    resultDigest: entry.result?.resultDigest ?? zeroDigest,
    artifactDigest: entry.result?.artifactDigest ?? zeroDigest,
    completionTokens: entry.result?.usage.completionTokens ?? 0,
  };
  return {
    schemaVersion: 1,
    protocolId,
    transactionId: projection.transactionId,
    missionId: projection.admission.mission.missionId,
    admissionDigest: projection.admission.admissionDigest,
    status: projection.terminal ? 'completed'
      : projection.verdict ? 'verdict-committed'
        : projection.acceptedArtifactDigest ? 'artifact-accepted'
          : projection.revision?.result ? 'revision-committed'
            : projection.revision ? 'revision-prepared'
              : projection.reviews.at(-1)?.result ? `review-${projection.reviews.length}-committed`
                : projection.reviews.length > 0 ? `review-${projection.reviews.length}-prepared`
                  : projection.reviewBinding ? 'review-bound'
                    : projection.native?.result ? 'native-committed'
                      : projection.native ? 'native-prepared' : 'admitted',
    nextAction: nextAction(projection),
    eventCount: state.events.length,
    headDigest: state.headDigest,
    completionTokens: projection.completionTokens,
    native: phaseProjection(projection.native),
    reviews: projection.reviews.map(phaseProjection),
    revision: phaseProjection(projection.revision),
    acceptedArtifactDigest: projection.acceptedArtifactDigest,
    verdictDigest: projection.verdict?.verdictDigest ?? zeroDigest,
    missionReceiptDigest: projection.terminal?.receiptDigest ?? zeroDigest,
  };
}

async function readState(statePath, artifactsDir) {
  const text = await readBounded(statePath, maximumJournalBytes, 'mission review journal');
  if (text === null) return null;
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    throw new IntegrityError('mission review journal is invalid JSON');
  }
  if (text !== jsonBytes(state)) throw new IntegrityError('mission review journal is not canonical');
  const projection = await replayState(state, artifactsDir);
  return { state, projection };
}

async function writeAndVerify(statePath, artifactsDir, state) {
  const content = jsonBytes(state);
  if (Buffer.byteLength(content, 'utf8') > maximumJournalBytes) {
    throw new IntegrityError('mission review journal exceeds maximum size');
  }
  await replaceFileAtomically({ destinationPath: statePath, content });
  return readState(statePath, artifactsDir);
}

export function createMissionReviewJournal({
  journalRoot,
  clock = Date.now,
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof journalRoot !== 'string' || journalRoot.length < 1 || /[\0\r\n]/.test(journalRoot)) {
    throw new TypeError('mission review journal root is invalid');
  }
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') {
    throw new TypeError('mission review journal clock and checkpoint are required');
  }
  const root = resolve(journalRoot);

  async function open(inputAdmission) {
    const admission = verifyMissionAdmission(clone(inputAdmission));
    const transactionId = transactionIdFor(admission);
    const missionSlotId = missionSlotIdFor(admission.mission.missionId);
    const transactionDir = join(root, missionSlotId);
    const statePath = join(transactionDir, 'journal.json');
    const artifactsDir = join(transactionDir, 'artifacts');
    const lockPath = join(transactionDir, 'journal.lock');

    async function underLock(operation) {
      await mkdir(transactionDir, { recursive: true });
      const lock = await acquireFileLock({ ...lockOptions, lockPath });
      try {
        return await operation(await readState(statePath, artifactsDir));
      } finally {
        await lock.release();
      }
    }

    const opened = await underLock(async (existing) => {
      if (existing) {
        if (existing.projection.transactionId !== transactionId
            || !same(existing.projection.admission, admission)) {
          fail('mission-id-collision', 'mission review journal admission collision');
        }
        return existing;
      }
      const events = [eventValue([], transactionId, 'mission.admitted', clockTime(clock), { admission })];
      return writeAndVerify(statePath, artifactsDir, stateValue(transactionId, missionSlotId, events));
    });
    if (!opened) throw new IntegrityError('mission review journal failed to open');

    async function mutate(callback) {
      return underLock(async (verified) => {
        if (!verified) throw new IntegrityError('mission review journal disappeared');
        if (verified.projection.transactionId !== transactionId
            || !same(verified.projection.admission, admission)) {
          fail('mission-id-collision', 'mission review journal admission collision');
        }
        const outcome = await callback(verified);
        if (!outcome?.eventType) return outcome;
        const events = clone(verified.state.events);
        events.push(eventValue(events, transactionId, outcome.eventType, clockTime(clock), outcome.payload));
        const next = await writeAndVerify(statePath, artifactsDir, stateValue(transactionId, missionSlotId, events));
        return outcome.project(next);
      });
    }

    async function inspect() {
      const verified = await readState(statePath, artifactsDir);
      if (!verified) throw new IntegrityError('mission review journal is missing');
      return deepFreeze(publicProjection(verified.state, verified.projection));
    }

    async function preparePhase({ request: inputRequest, descriptor: inputDescriptor } = {}) {
      const descriptor = verifyMissionExecutorDescriptor(clone(inputDescriptor), inputRequest?.phase);
      const request = verifyMissionPhaseRequest(clone(inputRequest), { admission, descriptor });
      return mutate(async (verified) => {
        const existing = resultSlot(verified.projection, request.phase, request.round);
        if (existing) {
          if (!same(existing.request, request) || !same(existing.descriptor, descriptor)) {
            throw new IntegrityError('mission phase has a changed prepared retry');
          }
          return { requestDigest: existing.request.requestDigest };
        }
        const expected = `prepare-${request.phase}${request.phase === 'review' ? `-${request.round}` : ''}`;
        if (nextAction(verified.projection) !== expected) {
          throw new IntegrityError('mission phase preparation transition is invalid');
        }
        if (!same(request.inputs, expectedInputs(verified.projection, expected))) {
          throw new IntegrityError('mission phase request inputs do not match journal evidence');
        }
        return {
          eventType: `${request.phase}.prepared`,
          payload: { request, descriptor },
          project: () => ({ requestDigest: request.requestDigest }),
        };
      });
    }

    async function commitPhase(inputResult) {
      return mutate(async (verified) => {
        const phase = inputResult?.receipt?.phase;
        const round = inputResult?.receipt?.round;
        const prepared = resultSlot(verified.projection, phase, round);
        if (!prepared) throw new IntegrityError('mission phase completion lacks a prepared request');
        const result = verifyMissionPhaseResult(clone(inputResult), {
          request: prepared.request,
          descriptor: prepared.descriptor,
        });
        if (Date.parse(result.receipt.startedAt) < Date.parse(admission.admittedAt)) {
          throw new IntegrityError('mission phase execution predates admission');
        }
        if (prepared.result) {
          if (!same(prepared.result, result.receipt) || !same(prepared.artifact, result.artifact)) {
            throw new IntegrityError('mission phase has a changed completion retry');
          }
          return clone(prepared.result);
        }
        if (result.receipt.artifactBytes > admission.budgets.maxArtifactBytes) {
          throw new IntegrityError('mission phase artifact exceeds admitted byte ceiling');
        }
        if (verified.projection.completionTokens + result.receipt.usage.completionTokens
            > admission.budgets.totalCompletionTokens) {
          throw new IntegrityError('mission completion token budget exceeded');
        }
        if (prepared.request.phase === 'revision') {
          const findings = verified.projection.reviews[0]?.artifact?.findings ?? [];
          const required = findings.filter(({ required: isRequired }) => isRequired).map(({ id }) => id);
          const known = new Set(findings.map(({ id }) => id));
          const addressed = new Set(result.artifact.addressedFindingIds);
          const missing = required.filter((id) => !addressed.has(id));
          if (missing.length > 0) {
            throw new IntegrityError(`mission revision does not address required finding ${missing[0]}`);
          }
          const unknown = result.artifact.addressedFindingIds.find((id) => !known.has(id));
          if (unknown) throw new IntegrityError(`mission revision addresses unknown finding ${unknown}`);
        }
        await mkdir(artifactsDir, { recursive: true });
        const reference = {
          digest: result.receipt.artifactDigest,
          bytes: result.receipt.artifactBytes,
        };
        const artifactPath = join(artifactsDir, `${reference.digest}.json`);
        const content = jsonBytes(result.artifact);
        const published = await publishFileExclusive({ destinationPath: artifactPath, content });
        if (!published) {
          const existing = await readArtifactFile(artifactsDir, reference);
          if (!same(existing, result.artifact)) throw new IntegrityError('mission artifact digest collision');
        }
        const phaseLabel = prepared.request.phase === 'review'
          ? `review-${prepared.request.round}`
          : prepared.request.phase;
        await checkpoint(`after-${phaseLabel}-artifact-publish`, deepFreeze({
          missionId: admission.mission.missionId,
          requestDigest: prepared.request.requestDigest,
          artifactDigest: reference.digest,
        }));
        return {
          eventType: `${prepared.request.phase}.committed`,
          payload: { receipt: result.receipt, artifact: reference },
          project: () => clone(result.receipt),
        };
      });
    }

    async function bindReview() {
      return mutate(async (verified) => {
        if (verified.projection.reviewBinding) return clone(verified.projection.reviewBinding);
        if (nextAction(verified.projection) !== 'bind-review') {
          throw new IntegrityError('review binding transition requires a committed native artifact');
        }
        const godskills = admission.godskills;
        if (!godskills || godskills.deferredReviews.length === 0) {
          throw new IntegrityError('review binding requires admitted deferred Godskills reviews');
        }
        const payload = {
          bindingDigest: godskills.bindingDigest,
          deferredReviews: clone(godskills.deferredReviews),
        };
        return {
          eventType: 'review.bound',
          payload,
          project: () => clone(payload),
        };
      });
    }

    async function acceptArtifact(artifactDigest) {
      requireDigest(artifactDigest, 'mission accepted artifact digest');
      return mutate(async (verified) => {
        if (verified.projection.acceptedArtifactDigest !== null) {
          if (verified.projection.acceptedArtifactDigest !== artifactDigest) {
            throw new IntegrityError('mission has a changed accepted artifact retry');
          }
          return { artifactDigest };
        }
        const action = nextAction(verified.projection);
        if (action !== 'accept-native' && action !== 'accept-revision') {
          throw new IntegrityError('mission artifact acceptance transition is invalid');
        }
        const expected = action === 'accept-native'
          ? verified.projection.native.result.artifactDigest
          : verified.projection.revision.result.artifactDigest;
        if (artifactDigest !== expected) throw new IntegrityError('mission accepted artifact digest mismatch');
        return {
          eventType: action === 'accept-native' ? 'native.accepted' : 'revision.accepted',
          payload: { artifactDigest },
          project: () => ({ artifactDigest }),
        };
      });
    }

    async function commitVerdict(inputVerdict) {
      const verdict = verifyMissionVerdict(clone(inputVerdict), admission);
      return mutate(async (verified) => {
        if (verified.projection.verdict) {
          if (!same(verified.projection.verdict, verdict)) throw new IntegrityError('mission has a changed verdict retry');
          return clone(verdict);
        }
        if (nextAction(verified.projection) !== 'commit-verdict') {
          throw new IntegrityError('mission verdict transition is invalid');
        }
        assertVerdictMatchesProjection(verdict, verified.projection);
        if (verdict.disposition === 'accepted'
            && verdict.acceptedArtifactDigest !== verified.projection.acceptedArtifactDigest) {
          throw new IntegrityError('mission verdict lacks its accepted artifact event');
        }
        return {
          eventType: 'verdict.committed',
          payload: { verdict },
          project: () => clone(verdict),
        };
      });
    }

    async function recordBudgetExhaustion({ phase, round } = {}) {
      return mutate(async (verified) => {
        if (verified.projection.budgetExhaustion) {
          if (verified.projection.budgetExhaustion.phase !== phase
              || verified.projection.budgetExhaustion.round !== round) {
            throw new IntegrityError('mission has a changed budget exhaustion retry');
          }
          return clone(verified.projection.budgetExhaustion);
        }
        const action = nextAction(verified.projection);
        const expected = phase === 'review' ? `prepare-review-${round}` : `prepare-${phase}`;
        if (action !== expected || !['review', 'revision'].includes(phase)
            || !Number.isSafeInteger(round) || round < 1 || round > 2) {
          throw new IntegrityError('mission budget exhaustion transition is invalid');
        }
        const requiredCompletionTokens = phase === 'review'
          ? admission.budgets.reviewCompletionTokensPerRound
          : admission.budgets.revisionCompletionTokens;
        const remainingCompletionTokens = admission.budgets.totalCompletionTokens
          - verified.projection.completionTokens;
        if (requiredCompletionTokens <= remainingCompletionTokens) {
          throw new IntegrityError('mission still has enough completion budget for the phase');
        }
        const payload = { phase, round, remainingCompletionTokens, requiredCompletionTokens };
        return {
          eventType: 'budget.exhausted',
          payload,
          project: () => clone(payload),
        };
      });
    }

    async function complete(inputReceipt) {
      return mutate(async (verified) => {
        if (verified.projection.terminal) {
          if (!same(verified.projection.terminal, inputReceipt)) {
            throw new IntegrityError('mission has a changed completion retry');
          }
          return clone(verified.projection.terminal);
        }
        if (nextAction(verified.projection) !== 'complete-mission') {
          throw new IntegrityError('mission completion transition is invalid');
        }
        const receipt = verifyMissionCompletionReceipt(clone(inputReceipt), {
          admission,
          verdict: verified.projection.verdict,
        });
        if (receipt.transactionId !== transactionId
            || receipt.preCompletionJournalHeadDigest !== verified.state.headDigest
            || !same(receipt.phases, phaseResults(verified.projection))
            || !same(receipt.usage, aggregateUsage(verified.projection))
            || Date.parse(receipt.completedAt) < Math.max(
              ...[verified.projection.native, ...verified.projection.reviews, verified.projection.revision]
                .filter((entry) => entry?.result)
                .map((entry) => Date.parse(entry.result.completedAt)),
            )) {
          throw new IntegrityError('mission completion receipt does not match journal evidence');
        }
        return {
          eventType: 'mission.completed',
          payload: { receipt },
          project: () => clone(receipt),
        };
      });
    }

    async function recoverEvidence() {
      const verified = await readState(statePath, artifactsDir);
      if (!verified) throw new IntegrityError('mission review journal is missing');
      return deepFreeze({
        transactionId,
        admission: clone(verified.projection.admission),
        native: clone(verified.projection.native),
        reviewBinding: clone(verified.projection.reviewBinding),
        reviews: clone(verified.projection.reviews),
        revision: clone(verified.projection.revision),
        acceptedArtifactDigest: verified.projection.acceptedArtifactDigest,
        budgetExhaustion: clone(verified.projection.budgetExhaustion),
        verdict: clone(verified.projection.verdict),
        terminal: clone(verified.projection.terminal),
        completionTokens: verified.projection.completionTokens,
        eventCount: verified.state.events.length,
        headDigest: verified.state.headDigest,
      });
    }

    async function readArtifact(digest) {
      requireDigest(digest, 'mission artifact digest');
      const verified = await readState(statePath, artifactsDir);
      if (!verified) throw new IntegrityError('mission review journal is missing');
      const entries = [verified.projection.native, verified.projection.revision, ...verified.projection.reviews];
      const result = entries.find((entry) => entry?.result?.artifactDigest === digest);
      if (!result) throw new IntegrityError('mission artifact is not committed by this journal');
      return deepFreeze(await readArtifactFile(artifactsDir, {
        digest,
        bytes: result.result.artifactBytes,
      }));
    }

    function artifactPath(digest) {
      requireDigest(digest, 'mission artifact digest');
      return join(artifactsDir, `${digest}.json`);
    }

    return Object.freeze({
      transactionId,
      transactionDir,
      statePath,
      inspect,
      preparePhase,
      commitPhase,
      bindReview,
      acceptArtifact,
      commitVerdict,
      recordBudgetExhaustion,
      complete,
      recoverEvidence,
      readArtifact,
      artifactPath,
    });
  }

  async function openExisting(missionId) {
    if (typeof missionId !== 'string' || missionId.length < 1) throw new TypeError('mission id is required');
    const missionSlotId = missionSlotIdFor(missionId);
    const transactionDir = join(root, missionSlotId);
    const statePath = join(transactionDir, 'journal.json');
    const artifactsDir = join(transactionDir, 'artifacts');
    const existing = await readState(statePath, artifactsDir);
    if (!existing) return null;
    if (existing.projection.admission.mission.missionId !== missionId) {
      throw new IntegrityError('mission review journal slot mismatch');
    }
    return open(existing.projection.admission);
  }

  return Object.freeze({ open, openExisting });
}
