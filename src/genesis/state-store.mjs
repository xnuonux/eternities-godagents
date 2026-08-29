import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const zeroDigest = '0'.repeat(64);
const digestPattern = /^[a-f0-9]{64}$/;
const keelIdPattern = /^keel-[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

const transitions = Object.freeze({
  prepared: new Set(['keel-prepared', 'aborted', 'quarantined']),
  'keel-prepared': new Set(['journal-prepared', 'aborted', 'quarantined']),
  'journal-prepared': new Set(['mutually-bound', 'aborted', 'quarantined']),
  'mutually-bound': new Set(['admitted', 'aborted', 'quarantined']),
  admitted: new Set(),
  aborted: new Set(),
  quarantined: new Set(),
});

const evidenceKeys = Object.freeze({
  prepared: new Set(),
  'keel-prepared': new Set(['keelHeadDigest']),
  'journal-prepared': new Set(['journalHeadDigest']),
  'mutually-bound': new Set(['journalHeadDigest', 'keelHeadDigest']),
  admitted: new Set(['receiptDigest']),
  aborted: new Set(['reasonDigest']),
  quarantined: new Set(['reasonDigest']),
});

function assertIdentity(identity) {
  if (!identity || typeof identity !== 'object') throw new IntegrityError('genesis identity is required');
  if (!digestPattern.test(identity.genesisId ?? '')) throw new IntegrityError('invalid genesisId');
  if (!keelIdPattern.test(identity.keelId ?? '')) throw new IntegrityError('invalid keelId');
  if (!identifierPattern.test(identity.instanceId ?? '')
      || identity.instanceId === '.'
      || identity.instanceId === '..') {
    throw new IntegrityError('invalid instanceId');
  }
}

function assertEvidence(state, evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new IntegrityError('genesis transition evidence must be an object');
  }
  const allowed = evidenceKeys[state];
  const keys = Object.keys(evidence);
  if (!allowed || keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
    throw new IntegrityError(`genesis transition evidence is invalid for ${state}`);
  }
  for (const value of Object.values(evidence)) {
    if (!digestPattern.test(value)) throw new IntegrityError('genesis transition evidence digest is invalid');
  }
}

function stateValue({ identity, state, previousStateDigest, evidence, recordedAt }) {
  const unsigned = {
    schemaVersion: 1,
    genesisId: identity.genesisId,
    keelId: identity.keelId,
    instanceId: identity.instanceId,
    state,
    previousStateDigest,
    evidence,
    recordedAt,
  };
  const value = { ...unsigned, stateDigest: sha256Value(unsigned) };
  assertSchema('genesis-state', value);
  return value;
}

export function createGenesisStateStore({ transactionDir, clock = () => new Date().toISOString() }) {
  if (typeof transactionDir !== 'string' || transactionDir.length === 0) {
    throw new TypeError('transactionDir is required');
  }
  if (typeof clock !== 'function') throw new TypeError('state store clock is required');
  const root = resolve(transactionDir);
  const statePath = resolve(root, 'genesis-state.json');
  const lockPath = resolve(root, '.genesis-state.lock');

  async function read() {
    let text;
    try {
      text = await readFile(statePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    let state;
    try {
      state = JSON.parse(text);
    } catch {
      throw new IntegrityError('genesis state is not valid JSON');
    }
    if (text !== jsonBytes(state)) throw new IntegrityError('genesis state is not canonical');
    assertSchema('genesis-state', state);
    const { stateDigest, ...unsigned } = state;
    if (stateDigest !== sha256Value(unsigned)) throw new IntegrityError('genesis state digest mismatch');
    assertIdentity(state);
    assertEvidence(state.state, state.evidence);
    return Object.freeze(structuredClone(state));
  }

  async function underLock(operation) {
    await mkdir(root, { recursive: true });
    const lock = await acquireFileLock({ lockPath });
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  async function write(state) {
    const temporaryPath = `${statePath}.writing`;
    await rm(temporaryPath, { force: true });
    await writeFile(temporaryPath, jsonBytes(state), { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, statePath);
  }

  async function initialize(identity) {
    assertIdentity(identity);
    return underLock(async () => {
      const existing = await read();
      if (existing) {
        if (existing.genesisId !== identity.genesisId
            || existing.keelId !== identity.keelId
            || existing.instanceId !== identity.instanceId) {
          throw new IntegrityError('genesis state identity collision');
        }
        return existing;
      }
      const state = stateValue({
        identity,
        state: 'prepared',
        previousStateDigest: zeroDigest,
        evidence: {},
        recordedAt: clock(),
      });
      await write(state);
      return Object.freeze(structuredClone(state));
    });
  }

  async function transition({ expectedState, nextState, evidence }) {
    return underLock(async () => {
      const current = await read();
      if (!current) throw new IntegrityError('genesis state is not initialized');
      if (current.state !== expectedState) throw new IntegrityError('stale genesis transition state');
      if (!transitions[current.state]?.has(nextState)) {
        throw new IntegrityError(`invalid genesis transition ${current.state} to ${nextState}`);
      }
      assertEvidence(nextState, evidence);
      const next = stateValue({
        identity: current,
        state: nextState,
        previousStateDigest: current.stateDigest,
        evidence: structuredClone(evidence),
        recordedAt: clock(),
      });
      await write(next);
      return Object.freeze(structuredClone(next));
    });
  }

  return Object.freeze({ read, initialize, transition });
}
