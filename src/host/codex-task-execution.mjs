import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import {
  verifyCodexTaskDispatch,
  verifyCodexTaskTransportResult,
} from './codex-bound-turn.mjs';

const protocolId = 'eternities-codex-task-execution-v1';
const digestPattern = /^[a-f0-9]{64}$/;
const clone = (value) => structuredClone(value);

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new IntegrityError(`${label} is invalid`);
}

function parseTime(value, label) {
  const milliseconds = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== value) {
    throw new IntegrityError(`${label} is invalid`);
  }
  return milliseconds;
}

export function buildCodexTaskExecutionReceipt({
  dispatch: inputDispatch,
  transportReceipt: inputTransportReceipt,
  responseText,
  startedAt,
  completedAt,
}) {
  const dispatch = verifyCodexTaskDispatch(inputDispatch);
  const transport = verifyCodexTaskTransportResult({
    responseText,
    receipt: inputTransportReceipt,
  }, dispatch);
  const start = parseTime(startedAt, 'task execution startedAt');
  const completion = parseTime(completedAt, 'task execution completedAt');
  if (completion < start) throw new IntegrityError('task execution completed before it started');
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    status: 'completed',
    dispatchDigest: sha256Value(dispatch),
    transportReceiptDigest: transport.receipt.receiptDigest,
    responseBytes: transport.receipt.responseBytes,
    responseDigest: transport.receipt.responseDigest,
    startedAt,
    completedAt,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('codex-task-execution-receipt', receipt);
  return deepFreeze(receipt);
}

export function verifyCodexTaskExecutionReceipt(value) {
  const receipt = clone(value);
  assertSchema('codex-task-execution-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  requireDigest(receiptDigest, 'task execution receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('task execution receipt digest mismatch');
  const started = parseTime(receipt.startedAt, 'task execution startedAt');
  const completed = parseTime(receipt.completedAt, 'task execution completedAt');
  if (completed < started) throw new IntegrityError('task execution completed before it started');
  requireDigest(receipt.dispatchDigest, 'task execution dispatch digest');
  requireDigest(receipt.transportReceiptDigest, 'task execution transport receipt digest');
  requireDigest(receipt.responseDigest, 'task execution response digest');
  return deepFreeze(receipt);
}

