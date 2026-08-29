function createFixtureCortex(adapterId, claim) {
  return Object.freeze({
    adapterId,
    async infer({ missionId, observation, stateEpoch, now }) {
      const expiresAt = new Date(Date.parse(now) + 60_000).toISOString();
      return {
        schemaVersion: 1,
        proposalId: `${adapterId}:${missionId}:${stateEpoch}`,
        organId: adapterId,
        organVersion: '1',
        sourceStateEpoch: stateEpoch,
        claim,
        evidenceRefs: [observation.observationId],
        intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
        expectedOutcome: { counter: observation.counter + 1 },
        cost: 1,
        risk: 'low',
        uncertainty: 'verified-fixture',
        requiredAuthority: ['realm:write'],
        preconditions: ['realm-observed'],
        expiresAt,
        priority: 10,
      };
    },
  });
}

export function createFixtureCortexA() {
  return createFixtureCortex('fixture-a', 'advance the observed counter by one governed step');
}

export function createFixtureCortexB() {
  return createFixtureCortex('fixture-b', 'perform exactly one authorized increment from current evidence');
}
