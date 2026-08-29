import { AuthorityError, UncertainEffectError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

export function createFixtureRealm({ contract, initialCounter = 0, failureMode = 'none' }) {
  assertSchema('realm-contract', contract);
  let counter = initialCounter;
  let invocationCount = 0;
  let reconciliationCount = 0;
  let postEffectFailureDelivered = false;
  const outcomes = new Map();

  return Object.freeze({
    contract,
    async observe() {
      return {
        observationId: `observation-${invocationCount}`,
        counter: failureMode === 'observation-mismatch' ? counter + 1 : counter,
      };
    },
    async invoke({ handId, payload, idempotencyKey }) {
      const hand = contract.hands.find((entry) => entry.id === handId);
      if (!hand) throw new AuthorityError(`Realm hand ${handId} is not declared`);
      if (outcomes.has(idempotencyKey)) return outcomes.get(idempotencyKey);
      if (!Number.isInteger(payload.amount) || payload.amount < 1) {
        throw new TypeError('counter increment amount must be a positive integer');
      }

      counter += payload.amount;
      invocationCount += 1;
      const result = {
        status: 'applied',
        externalReceipt: `fixture-receipt-${invocationCount}`,
        appliedTransition: { counter },
      };
      outcomes.set(idempotencyKey, result);
      if (failureMode === 'post-effect-transport' && !postEffectFailureDelivered) {
        postEffectFailureDelivered = true;
        throw new UncertainEffectError(idempotencyKey);
      }
      return result;
    },
    async reconcile(idempotencyKey) {
      reconciliationCount += 1;
      const invocation = outcomes.get(idempotencyKey) ?? null;
      return {
        invocation,
        observation: { observationId: `reconciliation-${reconciliationCount}`, counter },
      };
    },
    inspect() {
      return {
        counter,
        invocationCount,
        reconciliationCount,
        idempotencyCount: outcomes.size,
      };
    },
  });
}
