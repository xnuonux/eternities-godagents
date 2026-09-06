import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  MISSION_OPERATION_AUTHORITY,
  verifyMissionOperationDescription,
  verifyMissionOperationReceipt,
  verifyMissionOperationRequest,
} from './mission-operation-adapter.mjs';
import { verifyMissionProgramForensicsProjection } from './mission-program.mjs';

export const MISSION_OPERATION_EVIDENCE_PROTOCOL_ID = 'eternities-mission-operation-evidence-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_ENTRIES = 8;
const MAX_BYTES = 32 * 1024;

export class MissionOperationEvidenceError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MissionOperationEvidenceError';
    this.code = code;
  }
}

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function fail(code, message, cause = undefined) {
  throw new MissionOperationEvidenceError(code, message, cause);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object-invalid', `${label} is invalid`);
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('fields-invalid', `${label} fields are invalid`);
  }
}

function credentialFreeClone(value, label) {
  let copied;
  try {
    copied = clone(value);
    assertNoCredentialFields(copied);
  } catch (error) {
    fail('credential-field', `${label} contains a credential-shaped field`, error);
  }
  return copied;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} is invalid`);
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
  return value;
}

function nonNegativeInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail('integer-invalid', `${label} is invalid`);
  return value;
}

function verifyAuthority(value, label) {
  exactKeys(value, Object.keys(MISSION_OPERATION_AUTHORITY), label);
  if (!same(value, MISSION_OPERATION_AUTHORITY)) fail('authority-expansion', `${label} is not empty`);
  return clone(value);
}

function verifyForensics(value) {
  try {
    return verifyMissionProgramForensicsProjection(value);
  } catch (error) {
    fail('forensics-invalid', 'mission program forensic projection is invalid', error);
  }
}

function verifyEntryShape(value, index) {
  const copied = credentialFreeClone(value, `mission operation evidence entry ${index + 1}`);
  exactKeys(copied, ['description', 'dispatch', 'request', 'receipt'], `mission operation evidence entry ${index + 1}`);
  return copied;
}

function preparedEventFor(forensics, request) {
  return forensics.events.find((event) => event.eventType === 'step.prepared'
    && event.stepId === request.stepId
    && event.stepIndex === request.stepIndex
    && event.dispatchDigest === request.dispatchDigest) ?? null;
}

function committedEventFor(forensics, request) {
  return forensics.events.find((event) => event.eventType === 'step.committed'
    && event.stepId === request.stepId
    && event.stepIndex === request.stepIndex) ?? null;
}

function stepFor(forensics, request) {
  return forensics.steps.find((step) => step.stepId === request.stepId && step.stepIndex === request.stepIndex) ?? null;
}

function verifyEntry(value, forensics, index) {
  const entry = verifyEntryShape(value, index);
  let description;
  let request;
  let receipt;
  try {
    description = verifyMissionOperationDescription(entry.description);
    request = verifyMissionOperationRequest(entry.request, {
      description,
      dispatch: entry.dispatch,
    });
    receipt = verifyMissionOperationReceipt(entry.receipt, {
      description,
      request,
      dispatch: entry.dispatch,
    });
  } catch (error) {
    fail('operation-invalid', `mission operation evidence entry ${index + 1} is invalid`, error);
  }
  if (request.programId !== forensics.programId) fail('program-binding', 'operation evidence program differs from forensics');
  const step = stepFor(forensics, request);
  if (!step || step.kind !== request.operationKind) fail('step-binding', 'operation evidence does not identify one mission step');
  const prepared = preparedEventFor(forensics, request);
  if (!prepared) fail('future-evidence', 'operation evidence is not present in the selected journal prefix');
  const committed = committedEventFor(forensics, request);
  verifyAuthority(description.authority, 'mission operation description authority');
  verifyAuthority(receipt.authority, 'mission operation receipt authority');
  return {
    stepId: request.stepId,
    stepIndex: request.stepIndex,
    operationKind: request.operationKind,
    journalStatus: step.status,
    missionStepDescriptorDigest: request.missionStepDescriptorDigest,
    sourceDescriptorDigest: description.sourceDescriptorDigest,
    requestDigest: request.requestDigest,
    dispatchDigest: request.dispatchDigest,
    operationReceiptDigest: receipt.receiptDigest,
    disposition: receipt.disposition,
    completionDigest: receipt.completionDigest,
    sourceEvidenceDigest: receipt.sourceEvidenceDigest,
    artifactDigest: committed?.artifactDigest ?? null,
    authority: clone(MISSION_OPERATION_AUTHORITY),
  };
}

function verifyProjection(value) {
  const copied = credentialFreeClone(value, 'mission operation evidence projection');
  try {
    assertSchema('mission-operation-evidence', copied);
  } catch (error) {
    fail('projection-invalid', 'mission operation evidence projection is invalid', error);
  }
  exactKeys(copied, [
    'schemaVersion', 'protocolId', 'programId', 'status', 'selectedSequence',
    'headSequence', 'headDigest', 'selectedHeadDigest', 'missionProjectionDigest',
    'entries', 'projectionDigest',
  ], 'mission operation evidence projection');
  if (copied.schemaVersion !== 1 || copied.protocolId !== MISSION_OPERATION_EVIDENCE_PROTOCOL_ID) {
    fail('projection-identity', 'mission operation evidence projection identity is invalid');
  }
  digest(copied.programId, 'mission operation evidence program id');
  nonNegativeInteger(copied.selectedSequence, 'mission operation evidence selected sequence', 32);
  nonNegativeInteger(copied.headSequence, 'mission operation evidence head sequence', 32);
  if (copied.selectedSequence > copied.headSequence) fail('sequence-invalid', 'selected sequence exceeds head sequence');
  digest(copied.headDigest, 'mission operation evidence head digest');
  digest(copied.selectedHeadDigest, 'mission operation evidence selected head digest');
  digest(copied.missionProjectionDigest, 'mission operation evidence mission projection digest');
  digest(copied.projectionDigest, 'mission operation evidence projection digest');
  if (!Array.isArray(copied.entries) || copied.entries.length > MAX_ENTRIES) fail('entry-ceiling', 'operation evidence entry count exceeds its ceiling');
  let previousIndex = -1;
  const seen = new Set();
  for (let index = 0; index < copied.entries.length; index += 1) {
    const entry = copied.entries[index];
    exactKeys(entry, [
      'stepId', 'stepIndex', 'operationKind', 'journalStatus',
      'missionStepDescriptorDigest', 'sourceDescriptorDigest', 'requestDigest',
      'dispatchDigest', 'operationReceiptDigest', 'disposition', 'completionDigest',
      'sourceEvidenceDigest', 'artifactDigest', 'authority',
    ], `mission operation evidence projection entry ${index + 1}`);
    identifier(entry.stepId, 'mission operation evidence step id');
    nonNegativeInteger(entry.stepIndex, 'mission operation evidence step index', 7);
    identifier(entry.operationKind, 'mission operation evidence kind');
    if (entry.stepIndex <= previousIndex) fail('entry-order', 'operation evidence entries are not ordered');
    previousIndex = entry.stepIndex;
    if (seen.has(entry.stepId)) fail('entry-duplicate', 'operation evidence step is duplicated');
    seen.add(entry.stepId);
    if (!['admitted', 'pending', 'committed'].includes(entry.journalStatus)) fail('journal-status', 'operation evidence journal status is invalid');
    if (!['absent', 'pending', 'completed'].includes(entry.disposition)) fail('disposition-invalid', 'operation evidence disposition is invalid');
    for (const [key, label] of [
      ['missionStepDescriptorDigest', 'mission step descriptor'],
      ['sourceDescriptorDigest', 'source descriptor'],
      ['requestDigest', 'request'],
      ['dispatchDigest', 'dispatch'],
      ['operationReceiptDigest', 'operation receipt'],
    ]) digest(entry[key], label);
    for (const [key, label] of [
      ['completionDigest', 'completion'],
      ['sourceEvidenceDigest', 'source evidence'],
      ['artifactDigest', 'artifact'],
    ]) {
      if (entry[key] !== null) digest(entry[key], label);
    }
    verifyAuthority(entry.authority, 'mission operation evidence authority');
  }
  const { projectionDigest, ...unsigned } = copied;
  if (sha256Value(unsigned) !== projectionDigest) fail('projection-digest', 'mission operation evidence projection digest mismatch');
  const bytes = Buffer.byteLength(`${canonicalJson(copied)}\n`, 'utf8');
  if (bytes > MAX_BYTES) fail('projection-ceiling', 'mission operation evidence projection exceeds its byte ceiling');
  return Object.freeze(copied);
}

export function buildMissionOperationEvidenceProjection({ missionForensics, entries } = {}) {
  const input = arguments[0] ?? {};
  exactKeys(input, ['missionForensics', 'entries'], 'mission operation evidence options');
  const forensics = verifyForensics(credentialFreeClone(missionForensics, 'mission operation evidence forensics'));
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) fail('entry-ceiling', 'operation evidence entries are invalid');
  const projected = entries.map((entry, index) => verifyEntry(entry, forensics, index));
  projected.sort((left, right) => left.stepIndex - right.stepIndex);
  const stepIds = new Set();
  for (const entry of projected) {
    if (stepIds.has(entry.stepId)) fail('entry-duplicate', 'operation evidence step is duplicated');
    stepIds.add(entry.stepId);
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_OPERATION_EVIDENCE_PROTOCOL_ID,
    programId: forensics.programId,
    status: forensics.status,
    selectedSequence: forensics.selectedSequence,
    headSequence: forensics.headSequence,
    headDigest: forensics.headDigest,
    selectedHeadDigest: forensics.selectedHeadDigest,
    missionProjectionDigest: forensics.projectionDigest,
    entries: projected,
  };
  return verifyProjection({ ...unsigned, projectionDigest: sha256Value(unsigned) });
}

export function verifyMissionOperationEvidenceProjection(value) {
  return verifyProjection(value);
}
