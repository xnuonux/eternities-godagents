import { sha256Value } from '../core/digest.mjs';
import { DecisionRequiredError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const includesAll = (available, required) => required.every((entry) => available.has(entry));

function admissible(proposal, state, constitution, authority) {
  if (proposal.sourceStateEpoch !== state.epoch) return false;
  if (Date.parse(proposal.expiresAt) <= Date.parse(state.now)) return false;
  if (!constitution.allowedEffects.includes(proposal.intent.effect)) return false;
  if (!includesAll(authority, proposal.requiredAuthority)) return false;
  if (!includesAll(new Set(state.preconditions), proposal.preconditions)) return false;
  return true;
}

function rank(left, right) {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.cost !== right.cost) return left.cost - right.cost;
  return left.proposalId.localeCompare(right.proposalId);
}

export function commitDecision({ proposals, state, constitution, authority }) {
  const authoritySet = new Set(authority);
  const candidates = proposals
    .filter((proposal) => admissible(proposal, state, constitution, authoritySet))
    .sort(rank);
  if (candidates.length === 0) {
    throw new DecisionRequiredError(['no-admissible-proposal']);
  }

  const selected = candidates[0];
  const decisionSeed = {
    missionId: state.missionId,
    proposalId: selected.proposalId,
    sourceStateEpoch: state.epoch,
    intent: selected.intent,
  };
  const unsigned = {
    schemaVersion: 1,
    decisionId: `decision-${sha256Value(decisionSeed).slice(0, 20)}`,
    missionId: state.missionId,
    selectedProposalIds: [selected.proposalId],
    sourceStateEpoch: state.epoch,
    constitutionalBasis: [...constitution.principles].sort(),
    authorityBasis: [...selected.requiredAuthority].sort(),
    committedIntent: selected.intent,
    expectedOutcome: selected.expectedOutcome,
    allowedEffects: [selected.intent.effect],
    budget: { maxActions: 1 },
    expiresAt: selected.expiresAt,
    stopConditions: ['one-action-complete'],
  };
  const decision = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('decision-commit', decision);
  return decision;
}
