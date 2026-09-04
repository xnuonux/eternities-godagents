import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { AuthorityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { commitDecision } from '../runtime/arbiter.mjs';
import { executeNegotiatedAction } from './negotiated-action-adapter.mjs';
import { buildRealmNegotiation } from './negotiation.mjs';

export const REALM_NEGOTIATED_CONSEQUENCE_PROTOCOL_ID = 'eternities-realm-negotiated-consequence-v1';

const INPUT_KEYS = ['mission', 'proposal', 'contract', 'authority', 'constitution', 'realm', 'state'];
const MISSION_KEYS = ['missionId', 'authority'];
const AUTHORITY_KEYS = ['availableAuthority', 'permittedEffects'];
const CONSTITUTION_KEYS = ['id', 'version', 'principles', 'allowedEffects', 'amendmentPolicy'];
const STATE_KEYS = ['instanceId', 'epoch', 'now', 'preconditions'];
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} fields do not match the certified shape`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty safe string`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
}

function uniqueStrings(value, label, { required = false } = {}) {
  if (!Array.isArray(value) || (required && value.length < 1)
      || value.some((entry) => typeof entry !== 'string' || entry.length === 0 || /[\0\r\n]/.test(entry))
      || new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain unique safe strings`);
  }
}

function sorted(value) {
  return [...value].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function verifyMission(mission) {
  exactKeys(mission, MISSION_KEYS, 'consequence mission');
  identifier(mission.missionId, 'consequence mission missionId');
  uniqueStrings(mission.authority, 'consequence mission authority', { required: true });
  return mission;
}

function verifyAuthority(authority) {
  exactKeys(authority, AUTHORITY_KEYS, 'consequence host authority');
  uniqueStrings(authority.availableAuthority, 'consequence host availableAuthority');
  uniqueStrings(authority.permittedEffects, 'consequence host permittedEffects');
  return authority;
}

function verifyConstitution(constitution) {
  exactKeys(constitution, CONSTITUTION_KEYS, 'consequence constitution');
  nonEmptyString(constitution.id, 'consequence constitution id');
  nonEmptyString(constitution.version, 'consequence constitution version');
  uniqueStrings(constitution.principles, 'consequence constitution principles', { required: true });
  uniqueStrings(constitution.allowedEffects, 'consequence constitution allowedEffects');
  if (constitution.amendmentPolicy !== 'frozen-v0') {
    throw new AuthorityError('consequence constitution amendment policy is unsupported');
  }
  return constitution;
}

function verifyState(state) {
  exactKeys(state, STATE_KEYS, 'consequence execution state');
  identifier(state.instanceId, 'consequence execution state instanceId');
  if (!Number.isSafeInteger(state.epoch) || state.epoch < 0) {
    throw new TypeError('consequence execution state epoch is invalid');
  }
  nonEmptyString(state.now, 'consequence execution state now');
  if (!Number.isFinite(Date.parse(state.now))) {
    throw new TypeError('consequence execution state now is not a date');
  }
  uniqueStrings(state.preconditions, 'consequence execution state preconditions');
  return state;
}

function verifyRealm(realm) {
  object(realm, 'consequence Realm');
  for (const method of ['observe', 'invoke', 'reconcile']) {
    if (typeof realm[method] !== 'function') throw new TypeError(`consequence Realm ${method} is required`);
  }
  return realm;
}

function effectiveAuthority({ mission, proposal, authority, constitution, contract }) {
  const hostAuthority = new Set(authority.availableAuthority);
  for (const entry of mission.authority) {
    if (!hostAuthority.has(entry)) throw new AuthorityError('mission authority exceeds host ceiling');
  }

  const intent = object(proposal.intent, 'consequence proposal intent');
  nonEmptyString(intent.effect, 'consequence proposal intent effect');
  nonEmptyString(intent.handId, 'consequence proposal intent handId');
  const hand = contract.hands.find((entry) => entry.id === intent.handId);
  if (!hand || hand.effect !== intent.effect) {
    throw new AuthorityError('proposal effect does not match its Realm hand');
  }

  const permittedEffects = authority.permittedEffects
    .filter((effect) => effect === intent.effect && constitution.allowedEffects.includes(effect));
  if (permittedEffects.length === 0) {
    throw new AuthorityError('selected Realm hand is outside the effective authority ceiling');
  }

  const availableAuthority = sorted(mission.authority);
  if (hand.requiredAuthority.some((entry) => !availableAuthority.includes(entry))) {
    throw new AuthorityError('selected Realm hand is outside the effective authority ceiling');
  }
  return {
    availableAuthority,
    permittedEffects: sorted(permittedEffects),
  };
}

function actionFromDecision({ decision, state, mission }) {
  const intent = object(decision.committedIntent, 'consequence committed intent');
  nonEmptyString(intent.handId, 'consequence committed intent handId');
  nonEmptyString(intent.effect, 'consequence committed intent effect');
  const { effect: ignoredEffect, handId, ...payload } = intent;
  void ignoredEffect;
  return {
    actionId: `action:${state.instanceId}:${mission.missionId}:${state.epoch}`,
    idempotencyKey: `consequence:${state.instanceId}:${decision.decisionId}`,
    handId,
    payload,
  };
}

function receiptFor({ mission, proposal, state, negotiation, decision, action, actionReceipt }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: REALM_NEGOTIATED_CONSEQUENCE_PROTOCOL_ID,
    instanceId: state.instanceId,
    missionId: mission.missionId,
    proposalDigest: sha256Value(proposal),
    stateEpoch: state.epoch,
    negotiationDigest: negotiation.negotiationDigest,
    contractDigest: negotiation.contractDigest,
    authorityCeilingDigest: sha256Value(negotiation.authorityCeiling),
    decisionDigest: decision.receiptDigest,
    actionDigest: sha256Value(action),
    actionReceiptDigest: actionReceipt.receiptDigest,
    realmId: negotiation.realmId,
    handId: action.handId,
    decisionId: decision.decisionId,
    actionId: action.actionId,
    invocationStatus: actionReceipt.invocation.status,
    discrepancyClass: actionReceipt.discrepancyClass,
    disposition: actionReceipt.disposition,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('realm-negotiated-consequence', receipt);
  return receipt;
}

export async function executeNegotiatedConsequence(input) {
  exactKeys(input, INPUT_KEYS, 'negotiated consequence input');
  assertNoCredentialFields(input);
  const mission = verifyMission(input.mission);
  const authority = verifyAuthority(input.authority);
  const constitution = verifyConstitution(input.constitution);
  const state = verifyState(input.state);
  verifyRealm(input.realm);
  assertSchema('realm-contract', input.contract);
  assertNoCredentialFields(input.contract);
  assertNoCredentialFields(input.proposal);
  assertSchema('organ-proposal', input.proposal);
  const proposal = structuredClone(input.proposal);
  if (proposal.sourceStateEpoch !== state.epoch) {
    throw new AuthorityError('proposal source epoch does not match execution state');
  }
  const proposalExpiry = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(proposalExpiry) || proposalExpiry <= Date.parse(state.now)) {
    throw new AuthorityError('proposal expiry must be a finite date after execution state');
  }

  const effective = effectiveAuthority({
    mission,
    proposal,
    authority,
    constitution,
    contract: input.contract,
  });
  const negotiation = buildRealmNegotiation({ contract: input.contract, authority: effective });
  const decision = commitDecision({
    proposals: [proposal],
    state: {
      epoch: state.epoch,
      missionId: mission.missionId,
      now: state.now,
      preconditions: state.preconditions,
    },
    constitution,
    authority: effective.availableAuthority,
  });
  const action = actionFromDecision({ decision, state, mission });
  if (action.handId !== proposal.intent.handId || decision.committedIntent.effect !== proposal.intent.effect) {
    throw new AuthorityError('committed consequence diverges from the verified proposal');
  }
  const executed = await executeNegotiatedAction({
    negotiation,
    contract: input.contract,
    authority: effective,
    decision,
    action,
    realm: input.realm,
    stateEpoch: state.epoch,
  });
  const receipt = receiptFor({
    mission,
    proposal,
    state,
    negotiation,
    decision,
    action,
    actionReceipt: executed.actionReceipt,
  });

  return deepFreeze({
    negotiation,
    decision,
    action,
    actionReceipt: executed.actionReceipt,
    receipt,
  });
}
