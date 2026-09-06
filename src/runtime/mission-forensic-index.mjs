import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { MISSION_OPERATION_AUTHORITY } from './mission-operation-adapter.mjs';
import {
  verifyMissionOperationEvidenceProjection,
} from './mission-operation-evidence.mjs';
import { verifyMissionProgramForensicsProjection } from './mission-program.mjs';

export const MISSION_FORENSIC_INDEX_PROTOCOL_ID = 'eternities-mission-forensic-index-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const MAX_PROGRAMS = 16;
const MAX_OPERATIONS = 8;
const MAX_BYTES = 96 * 1024;
const LIFECYCLE_STATUSES = ['absent', 'admitted', 'pending', 'completed', 'recovered', 'failed'];
const SOURCE_STATUSES = new Set(['absent', 'admitted', 'pending', 'completed']);

export class MissionForensicIndexError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MissionForensicIndexError';
    this.code = code;
  }
}

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function fail(code, message, cause = undefined) {
  throw new MissionForensicIndexError(code, message, cause);
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

function optionalDigest(value, label) {
  if (value !== null) digest(value, label);
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

function verifyOperationEvidence(value) {
  try {
    return verifyMissionOperationEvidenceProjection(value);
  } catch (error) {
    fail('operation-evidence-invalid', 'mission operation evidence projection is invalid', error);
  }
}

function verifyLifecycle(value, forensics) {
  const copied = credentialFreeClone(value, 'mission forensic lifecycle');
  exactKeys(copied, ['status', 'evidenceDigest'], 'mission forensic lifecycle');
  if (!LIFECYCLE_STATUSES.includes(copied.status)) fail('lifecycle-status', 'mission forensic lifecycle status is invalid');
  optionalDigest(copied.evidenceDigest, 'mission forensic lifecycle evidence digest');
  if (SOURCE_STATUSES.has(copied.status)) {
    if (copied.status !== forensics.status || copied.evidenceDigest !== null) {
      fail('lifecycle-drift', 'mission forensic lifecycle does not match its source projection');
    }
  } else if (copied.evidenceDigest === null) {
    fail('lifecycle-evidence', 'recovered or failed lifecycle requires evidence');
  }
  return copied;
}

function verifyReceiptBindings(value, operationEvidence) {
  if (!Array.isArray(value) || value.length !== operationEvidence.entries.length || value.length > MAX_OPERATIONS) {
    fail('receipt-binding-count', 'mission forensic source receipt bindings are incomplete or oversized');
  }
  const bindings = value.map((binding, index) => {
    const copied = credentialFreeClone(binding, `mission forensic source receipt binding ${index + 1}`);
    exactKeys(copied, [
      'operationReceiptDigest', 'disposition', 'completionDigest', 'sourceEvidenceDigest',
    ], `mission forensic source receipt binding ${index + 1}`);
    digest(copied.operationReceiptDigest, 'mission forensic operation receipt digest');
    if (!['absent', 'pending', 'completed'].includes(copied.disposition)) {
      fail('receipt-binding-disposition', 'mission forensic source receipt disposition is invalid');
    }
    optionalDigest(copied.completionDigest, 'mission forensic source completion digest');
    optionalDigest(copied.sourceEvidenceDigest, 'mission forensic source evidence digest');
    return copied;
  });
  const entryByReceipt = new Map(operationEvidence.entries.map((entry) => [entry.operationReceiptDigest, entry]));
  const seen = new Set();
  for (const binding of bindings) {
    if (seen.has(binding.operationReceiptDigest)) fail('receipt-binding-duplicate', 'mission forensic source receipt is duplicated');
    seen.add(binding.operationReceiptDigest);
    const entry = entryByReceipt.get(binding.operationReceiptDigest);
    if (!entry || !same({
      disposition: binding.disposition,
      completionDigest: binding.completionDigest,
      sourceEvidenceDigest: binding.sourceEvidenceDigest,
    }, {
      disposition: entry.disposition,
      completionDigest: entry.completionDigest,
      sourceEvidenceDigest: entry.sourceEvidenceDigest,
    })) {
      fail('receipt-binding-drift', 'mission forensic source receipt binding drifted from operation evidence');
    }
  }
  return bindings.sort((left, right) => left.operationReceiptDigest.localeCompare(right.operationReceiptDigest));
}

function verifyProgramRecord(value) {
  const copied = credentialFreeClone(value, 'mission forensic index program');
  exactKeys(copied, ['forensics', 'operationEvidence', 'receiptBindings', 'lifecycle'], 'mission forensic index program');
  const forensics = verifyForensics(copied.forensics);
  const operationEvidence = verifyOperationEvidence(copied.operationEvidence);
  if (operationEvidence.programId !== forensics.programId
      || operationEvidence.status !== forensics.status
      || operationEvidence.selectedSequence !== forensics.selectedSequence
      || operationEvidence.headSequence !== forensics.headSequence
      || operationEvidence.headDigest !== forensics.headDigest
      || operationEvidence.selectedHeadDigest !== forensics.selectedHeadDigest
      || operationEvidence.missionProjectionDigest !== forensics.projectionDigest) {
    fail('projection-binding', 'mission forensic projections do not describe the same program prefix');
  }
  const lifecycle = verifyLifecycle(copied.lifecycle, forensics);
  const sourceReceiptBindings = verifyReceiptBindings(copied.receiptBindings, operationEvidence);
  return {
    programId: forensics.programId,
    lifecycleStatus: lifecycle.status,
    lifecycleEvidenceDigest: lifecycle.evidenceDigest,
    selectedSequence: forensics.selectedSequence,
    headSequence: forensics.headSequence,
    headDigest: forensics.headDigest,
    selectedHeadDigest: forensics.selectedHeadDigest,
    missionProjectionDigest: forensics.projectionDigest,
    operationProjectionDigest: operationEvidence.projectionDigest,
    sourceReceiptBindings,
    operations: clone(operationEvidence.entries),
  };
}

function verifyIndex(value) {
  const copied = credentialFreeClone(value, 'mission forensic index');
  try {
    assertSchema('mission-forensic-index', copied);
  } catch (error) {
    fail('index-invalid', 'mission forensic index does not match its schema', error);
  }
  exactKeys(copied, ['schemaVersion', 'protocolId', 'status', 'programCount', 'programs', 'indexDigest'], 'mission forensic index');
  if (copied.schemaVersion !== 1 || copied.protocolId !== MISSION_FORENSIC_INDEX_PROTOCOL_ID || copied.status !== 'indexed') {
    fail('index-identity', 'mission forensic index identity is invalid');
  }
  if (!Array.isArray(copied.programs) || copied.programs.length > MAX_PROGRAMS || copied.programCount !== copied.programs.length) {
    fail('program-count', 'mission forensic index program count is invalid');
  }
  let previousProgramId = '';
  const programIds = new Set();
  for (let programIndex = 0; programIndex < copied.programs.length; programIndex += 1) {
    const program = copied.programs[programIndex];
    exactKeys(program, [
      'programId', 'lifecycleStatus', 'lifecycleEvidenceDigest', 'selectedSequence', 'headSequence',
      'headDigest', 'selectedHeadDigest', 'missionProjectionDigest', 'operationProjectionDigest',
      'sourceReceiptBindings', 'operations',
    ], `mission forensic index program ${programIndex + 1}`);
    digest(program.programId, 'mission forensic indexed program id');
    if (program.programId <= previousProgramId) fail('program-order', 'mission forensic index programs are not uniquely ordered');
    previousProgramId = program.programId;
    if (programIds.has(program.programId)) fail('program-duplicate', 'mission forensic index program is duplicated');
    programIds.add(program.programId);
    if (!LIFECYCLE_STATUSES.includes(program.lifecycleStatus)) fail('lifecycle-status', 'mission forensic indexed lifecycle status is invalid');
    optionalDigest(program.lifecycleEvidenceDigest, 'mission forensic indexed lifecycle evidence digest');
    if (['recovered', 'failed'].includes(program.lifecycleStatus)) {
      if (program.lifecycleEvidenceDigest === null) fail('lifecycle-evidence', 'indexed recovered or failed lifecycle lacks evidence');
    } else if (program.lifecycleEvidenceDigest !== null) {
      fail('lifecycle-evidence', 'ordinary indexed lifecycle cannot carry supplemental evidence');
    }
    nonNegativeInteger(program.selectedSequence, 'mission forensic indexed selected sequence', 32);
    nonNegativeInteger(program.headSequence, 'mission forensic indexed head sequence', 32);
    if (program.selectedSequence > program.headSequence) fail('sequence-invalid', 'indexed selected sequence exceeds head sequence');
    for (const [key, label] of [
      ['headDigest', 'indexed head digest'],
      ['selectedHeadDigest', 'indexed selected head digest'],
      ['missionProjectionDigest', 'indexed mission projection digest'],
      ['operationProjectionDigest', 'indexed operation projection digest'],
    ]) digest(program[key], label);
    if (!Array.isArray(program.operations) || program.operations.length > MAX_OPERATIONS) fail('operation-count', 'indexed operation count is invalid');
    let previousStepIndex = -1;
    const receiptDigests = new Set();
    for (let operationIndex = 0; operationIndex < program.operations.length; operationIndex += 1) {
      const operation = program.operations[operationIndex];
      exactKeys(operation, [
        'stepId', 'stepIndex', 'operationKind', 'journalStatus', 'missionStepDescriptorDigest',
        'sourceDescriptorDigest', 'requestDigest', 'dispatchDigest', 'operationReceiptDigest',
        'disposition', 'completionDigest', 'sourceEvidenceDigest', 'artifactDigest', 'authority',
      ], `mission forensic indexed operation ${operationIndex + 1}`);
      nonNegativeInteger(operation.stepIndex, 'indexed operation step index', 7);
      if (operation.stepIndex <= previousStepIndex) fail('operation-order', 'indexed operations are not ordered');
      previousStepIndex = operation.stepIndex;
      digest(operation.operationReceiptDigest, 'indexed operation receipt digest');
      if (receiptDigests.has(operation.operationReceiptDigest)) fail('operation-duplicate', 'indexed operation receipt is duplicated');
      receiptDigests.add(operation.operationReceiptDigest);
      verifyAuthority(operation.authority, 'indexed operation authority');
    }
    if (!Array.isArray(program.sourceReceiptBindings) || program.sourceReceiptBindings.length !== program.operations.length) {
      fail('receipt-binding-count', 'indexed source receipt bindings are incomplete');
    }
    let previousReceiptDigest = '';
    const bindingByReceipt = new Map();
    for (let bindingIndex = 0; bindingIndex < program.sourceReceiptBindings.length; bindingIndex += 1) {
      const binding = program.sourceReceiptBindings[bindingIndex];
      exactKeys(binding, [
        'operationReceiptDigest', 'disposition', 'completionDigest', 'sourceEvidenceDigest',
      ], `mission forensic indexed receipt binding ${bindingIndex + 1}`);
      digest(binding.operationReceiptDigest, 'indexed receipt binding digest');
      if (binding.operationReceiptDigest <= previousReceiptDigest) fail('receipt-binding-order', 'indexed receipt bindings are not ordered');
      previousReceiptDigest = binding.operationReceiptDigest;
      optionalDigest(binding.completionDigest, 'indexed completion digest');
      optionalDigest(binding.sourceEvidenceDigest, 'indexed source evidence digest');
      bindingByReceipt.set(binding.operationReceiptDigest, binding);
    }
    for (const operation of program.operations) {
      const binding = bindingByReceipt.get(operation.operationReceiptDigest);
      if (!binding || !same({
        disposition: binding.disposition,
        completionDigest: binding.completionDigest,
        sourceEvidenceDigest: binding.sourceEvidenceDigest,
      }, {
        disposition: operation.disposition,
        completionDigest: operation.completionDigest,
        sourceEvidenceDigest: operation.sourceEvidenceDigest,
      })) fail('receipt-binding-drift', 'indexed receipt binding drifted from operation evidence');
    }
  }
  const { indexDigest, ...unsigned } = copied;
  digest(indexDigest, 'mission forensic index digest');
  if (sha256Value(unsigned) !== indexDigest) fail('index-digest', 'mission forensic index digest mismatch');
  if (Buffer.byteLength(`${canonicalJson(copied)}\n`, 'utf8') > MAX_BYTES) fail('index-ceiling', 'mission forensic index exceeds its byte ceiling');
  return Object.freeze(copied);
}

export function buildMissionForensicIndex({ programs } = {}) {
  const input = arguments[0] ?? {};
  exactKeys(input, ['programs'], 'mission forensic index options');
  if (!Array.isArray(programs) || programs.length < 2 || programs.length > MAX_PROGRAMS) {
    fail('program-count', 'mission forensic index requires two to sixteen programs');
  }
  const projected = programs.map(verifyProgramRecord);
  const seen = new Set();
  for (const program of projected) {
    if (seen.has(program.programId)) fail('program-duplicate', 'mission forensic index program is duplicated');
    seen.add(program.programId);
  }
  projected.sort((left, right) => left.programId.localeCompare(right.programId));
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_FORENSIC_INDEX_PROTOCOL_ID,
    status: 'indexed',
    programCount: projected.length,
    programs: projected,
  };
  return verifyIndex({ ...unsigned, indexDigest: sha256Value(unsigned) });
}

export function verifyMissionForensicIndex(value) {
  return verifyIndex(value);
}
