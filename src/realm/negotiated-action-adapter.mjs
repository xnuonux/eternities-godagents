import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { AuthorityError, IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { executeCommittedAction } from './action-gateway.mjs';
import { assertHandPayload } from './hand-contract.mjs';
import { verifyRealmNegotiation } from './negotiation.mjs';

export const REALM_NEGOTIATED_ACTION_PROTOCOL_ID = 'eternities-realm-negotiated-action-v1';

const INPUT_KEYS = ['negotiation', 'contract', 'authority', 'decision', 'action', 'realm', 'stateEpoch'];
const ACTION_KEYS = ['actionId', 'idempotencyKey', 'handId', 'payload'];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const expectedSet = new Set(expected);
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const extra = actual.filter((key) => !expectedSet.has(key));
  if (missing.length || extra.length) {
    throw new TypeError(`${label} fields do not match the certified shape`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty safe string`);
  }
}

function assertRealmPort(realm) {
  assertObject(realm, 'Realm port');
  for (const method of ['observe', 'invoke', 'reconcile']) {
    if (typeof realm[method] !== 'function') throw new TypeError(`Realm port ${method} is required`);
  }
  assertObject(realm.contract, 'Realm port contract');
}

function assertInputShape(input) {
  assertExactKeys(input, INPUT_KEYS, 'negotiated action input');
  assertRealmPort(input.realm);
  if (!Number.isSafeInteger(input.stateEpoch) || input.stateEpoch < 0) {
    throw new TypeError('negotiated action stateEpoch must be a non-negative integer');
  }

  assertExactKeys(input.action, ACTION_KEYS, 'Realm action');
  for (const key of ['actionId', 'idempotencyKey', 'handId']) {
    assertNonEmptyString(input.action[key], `Realm action ${key}`);
  }
  assertSchema('decision-commit', input.decision);
  assertNoCredentialFields(input.contract);
  assertNoCredentialFields(input.authority);
  assertNoCredentialFields(input.decision);
  assertNoCredentialFields(input.action);
  assertNoCredentialFields(input.realm);
}

function selectedHand({ negotiation, contract, decision, action, authority }) {
  if (typeof decision.committedIntent?.handId !== 'string') {
    throw new AuthorityError('committed decision does not declare a Realm hand');
  }
  if (action.handId !== decision.committedIntent.handId) {
    throw new AuthorityError('action hand does not match the committed decision');
  }

  const available = negotiation.availableHands.find((hand) => hand.id === action.handId);
  if (!available) throw new AuthorityError(`Realm hand ${action.handId} is outside the negotiated ceiling`);
  const declared = contract.hands.find((hand) => hand.id === action.handId);
  if (!declared || canonicalJson(available) !== canonicalJson(declared)) {
    throw new IntegrityError(`Realm hand ${action.handId} differs from the negotiated contract`);
  }
  if (available.idempotent !== true) {
    throw new AuthorityError(`Realm hand ${action.handId} is not eligible for the idempotent adapter`);
  }
  if (!decision.allowedEffects.includes(available.effect)) {
    throw new AuthorityError(`effect ${available.effect} is outside the committed decision`);
  }
  const availableAuthority = new Set(authority.availableAuthority);
  const committedAuthority = new Set(decision.authorityBasis);
  for (const required of available.requiredAuthority) {
    if (!availableAuthority.has(required) || !committedAuthority.has(required)) {
      throw new AuthorityError(`required authority ${required} is unavailable`);
    }
  }
  assertHandPayload(available, action.payload);
  return available;
}

export async function executeNegotiatedAction(input) {
  assertInputShape(input);
  const { negotiation, contract, authority, decision, action, realm, stateEpoch } = input;
  const verifiedNegotiation = verifyRealmNegotiation(negotiation, { contract, authority });

  if (canonicalJson(realm.contract) !== canonicalJson(contract)) {
    throw new IntegrityError('runtime Realm Contract differs from the negotiated source');
  }
  const hand = selectedHand({
    negotiation: verifiedNegotiation,
    contract,
    decision,
    action,
    authority: verifiedNegotiation.authorityCeiling,
  });

  const actionReceipt = await executeCommittedAction({
    decision,
    action,
    realm,
    authority: verifiedNegotiation.authorityCeiling.availableAuthority,
    stateEpoch,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: REALM_NEGOTIATED_ACTION_PROTOCOL_ID,
    negotiationDigest: verifiedNegotiation.negotiationDigest,
    contractDigest: verifiedNegotiation.contractDigest,
    authorityCeilingDigest: sha256Value(verifiedNegotiation.authorityCeiling),
    decisionDigest: decision.receiptDigest,
    actionDigest: sha256Value(action),
    actionReceiptDigest: actionReceipt.receiptDigest,
    realmId: verifiedNegotiation.realmId,
    handId: hand.id,
    decisionId: decision.decisionId,
    actionId: action.actionId,
    invocationStatus: actionReceipt.invocation.status,
    discrepancyClass: actionReceipt.discrepancyClass,
    disposition: actionReceipt.disposition,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('realm-negotiated-action', receipt);
  return deepFreeze({ actionReceipt, receipt });
}
