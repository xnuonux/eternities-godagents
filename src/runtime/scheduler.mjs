import { assertSchema } from '../core/schema-validator.mjs';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeContext(context) {
  const forbidden = new Set(['realm', 'invoke', 'hands', 'actionGateway']);
  return Object.fromEntries(Object.entries(context).filter(([key]) => !forbidden.has(key)));
}

export async function collectProposals({ organs, state, context, onDiagnostic = () => {} }) {
  const frozenState = deepFreeze(structuredClone(state));
  const frozenContext = deepFreeze(structuredClone(safeContext(context)));
  const results = await Promise.allSettled(organs.map(async (organ) => ({
    organId: organ.id,
    proposal: await organ.propose(frozenState, frozenContext),
  })));
  const proposals = [];

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === 'rejected') {
      onDiagnostic({ organId: organs[index].id, status: 'rejected', errorClass: result.reason?.name ?? 'Error' });
      continue;
    }
    try {
      assertSchema('organ-proposal', result.value.proposal);
      proposals.push(result.value.proposal);
    } catch (error) {
      onDiagnostic({ organId: result.value.organId, status: 'invalid', errorClass: error.name });
    }
  }

  return proposals.sort((left, right) => left.proposalId.localeCompare(right.proposalId));
}
