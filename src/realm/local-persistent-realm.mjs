import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError, AuthorityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const jsonBytes = (value) => `${canonicalJson(value)}\n`;

function stateValue({ counter = 0, invocationCount = 0, outcomes = [] } = {}) {
  const unsigned = { schemaVersion: 1, counter, invocationCount, outcomes };
  return { ...unsigned, stateDigest: sha256Value(unsigned) };
}

function validateState(value, text) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || text !== jsonBytes(value)
      || value.schemaVersion !== 1
      || !Number.isSafeInteger(value.counter) || value.counter < 0
      || !Number.isSafeInteger(value.invocationCount) || value.invocationCount < 0
      || !Array.isArray(value.outcomes)
      || value.outcomes.some((row) => !row || typeof row !== 'object' || Array.isArray(row)
        || typeof row.idempotencyKey !== 'string' || row.idempotencyKey.length < 1 || row.idempotencyKey.length > 512
        || row.result?.status !== 'applied' || typeof row.result.externalReceipt !== 'string'
        || !Number.isSafeInteger(row.result.appliedTransition?.counter))
      || new Set(value.outcomes.map((row) => row.idempotencyKey)).size !== value.outcomes.length) {
    throw new IntegrityError('local Realm state is invalid');
  }
  const { stateDigest, ...unsigned } = value;
  if (stateDigest !== sha256Value(unsigned)) throw new IntegrityError('local Realm state digest mismatch');
  return value;
}

async function readState(statePath) {
  const text = await readFile(statePath, 'utf8');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new IntegrityError('local Realm state is invalid JSON');
  }
  return validateState(value, text);
}

async function atomicState(statePath, value) {
  const temporary = `${statePath}.writing`;
  await rm(temporary, { force: true });
  await writeFile(temporary, jsonBytes(value), { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, statePath);
}

export async function createPersistentLocalRealm({ contract, statePath }) {
  assertSchema('realm-contract', contract);
  if (typeof statePath !== 'string' || statePath.length === 0 || /[\0\r\n]/.test(statePath)) {
    throw new TypeError('local Realm state path is invalid');
  }
  await mkdir(dirname(statePath), { recursive: true });
  try {
    await writeFile(statePath, jsonBytes(stateValue()), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await readState(statePath);
  const lockPath = `${statePath}.lock`;

  async function withLock(work) {
    const lock = await acquireFileLock({ lockPath });
    try {
      return await work(await readState(statePath));
    } finally {
      await lock.release();
    }
  }

  function observation(state, name) {
    return { observationId: `${name}-${state.invocationCount}`, counter: state.counter };
  }

  return Object.freeze({
    contract,
    async observe() {
      return withLock(async (state) => observation(state, 'observation'));
    },
    async invoke({ handId, payload, idempotencyKey }) {
      return withLock(async (state) => {
        const hand = contract.hands.find((entry) => entry.id === handId);
        if (!hand) throw new AuthorityError(`Realm hand ${handId} is not declared`);
        const prior = state.outcomes.find((row) => row.idempotencyKey === idempotencyKey);
        if (prior) return structuredClone(prior.result);
        if (!Number.isInteger(payload?.amount) || payload.amount < 1) {
          throw new TypeError('counter increment amount must be a positive integer');
        }
        const counter = state.counter + payload.amount;
        const invocationCount = state.invocationCount + 1;
        const result = {
          status: 'applied',
          externalReceipt: `local-realm-receipt-${invocationCount}`,
          appliedTransition: { counter },
        };
        await atomicState(statePath, stateValue({
          counter,
          invocationCount,
          outcomes: [...state.outcomes, { idempotencyKey, result }],
        }));
        return structuredClone(result);
      });
    },
    async reconcile(idempotencyKey) {
      return withLock(async (state) => ({
        invocation: structuredClone(state.outcomes.find((row) => row.idempotencyKey === idempotencyKey)?.result ?? null),
        observation: observation(state, 'reconciliation'),
      }));
    },
    async inspect() {
      return withLock(async (state) => ({
        counter: state.counter,
        invocationCount: state.invocationCount,
        idempotencyCount: state.outcomes.length,
      }));
    },
  });
}
