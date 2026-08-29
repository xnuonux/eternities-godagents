import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { AuthorityError, UncertainEffectError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertExpectedOutcome, assertHandPayload } from './hand-contract.mjs';

function observedProjection(observation, expected) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, observation[key]]));
}

function authorize({ decision, action, realm, authority, stateEpoch }) {
  if (decision.sourceStateEpoch !== stateEpoch) {
    throw new AuthorityError('decision state epoch is stale');
  }
  if (decision.budget.maxActions < 1) {
    throw new AuthorityError('decision action budget is exhausted');
  }
  if (action.handId !== decision.committedIntent.handId) {
    throw new AuthorityError('action hand does not match the committed decision');
  }
  const hand = realm.contract.hands.find((entry) => entry.id === action.handId);
  if (!hand) {
    throw new AuthorityError(`Realm hand ${action.handId} is not declared`);
  }
  if (!decision.allowedEffects.includes(hand.effect)) {
    throw new AuthorityError(`effect ${hand.effect} is outside the decision`);
  }
  const available = new Set(authority);
  const committedAuthority = new Set(decision.authorityBasis);
  for (const required of hand.requiredAuthority) {
    if (!available.has(required) || !committedAuthority.has(required)) {
      throw new AuthorityError(`required authority ${required} is unavailable`);
    }
  }
  return hand;
}

export async function executeCommittedAction({
  decision,
  action,
  realm,
  authority,
  stateEpoch,
}) {
  assertSchema('decision-commit', decision);
  const hand = authorize({ decision, action, realm, authority, stateEpoch });
  assertHandPayload(hand, action.payload);
  const observationBefore = await realm.observe();
  let invocation;
  let observation;

  const alreadyAtExpected = canonicalJson(observedProjection(observationBefore, decision.expectedOutcome))
    === canonicalJson(decision.expectedOutcome);
  if (alreadyAtExpected) {
    const existing = await realm.reconcile(action.idempotencyKey);
    if (existing.invocation) {
      invocation = existing.invocation;
      observation = existing.observation;
    }
  }

  if (!invocation) assertExpectedOutcome(hand, action.payload, observationBefore, decision.expectedOutcome);

  if (!invocation) {
    try {
      invocation = await realm.invoke({
        handId: action.handId,
        payload: action.payload,
        idempotencyKey: action.idempotencyKey,
      });
    } catch (error) {
      if (!(error instanceof UncertainEffectError)) throw error;
      const reconciled = await realm.reconcile(action.idempotencyKey);
      invocation = reconciled.invocation ?? {
        status: 'uncertain',
        externalReceipt: `unverified-${action.idempotencyKey}`,
      };
      observation = reconciled.observation;
    }
  }

  observation ??= await realm.observe();
  const observedTransition = observedProjection(observation, decision.expectedOutcome);
  const matches = canonicalJson(observedTransition) === canonicalJson(decision.expectedOutcome);
  const uncertain = invocation.status === 'uncertain';
  const discrepancyClass = uncertain ? 'unverified-effect' : matches ? 'none' : 'unexpected-state';
  const disposition = discrepancyClass === 'none' ? 'complete'
    : discrepancyClass === 'unexpected-state' ? 'repair'
      : 'escalate';
  const unsigned = {
    schemaVersion: 1,
    actionId: action.actionId,
    idempotencyKey: action.idempotencyKey,
    decisionId: decision.decisionId,
    realmId: realm.contract.realmId,
    handId: hand.id,
    authorityRef: hand.requiredAuthority[0],
    expectedTransition: decision.expectedOutcome,
    invocation: {
      status: invocation.status,
      externalReceipt: invocation.externalReceipt,
    },
    observedTransition,
    discrepancyClass,
    disposition,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('action-receipt', receipt);
  return receipt;
}
