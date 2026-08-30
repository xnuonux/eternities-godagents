import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthorityError } from '../src/core/errors.mjs';
import { createLocalGodskillsTransport, routeGodskill } from '../src/skills/godskills-adapter.mjs';

const hostContext = {
  permittedEffects: ['local-read', 'local-write'],
  availableAuthority: ['local-read', 'local-write', 'repository-write'],
  availablePreconditions: ['repository-present', 'settled-outcome'],
  forbiddenCapabilities: [],
  maximumRisk: 'moderate',
  minimumEvidenceConfidence: 'verified',
  contextBudget: 4000,
  maxCompositionSize: 3,
};

function result(overrides = {}) {
  const routeReceipt = {
    schemaVersion: 1,
    requestId: 'mission-1',
    requestDigest: 'a'.repeat(64),
    status: 'selected',
    selectionKind: 'single',
    requestFeatures: {
      candidateFamilies: ['implementation-engineering'],
      requiredCapabilities: ['implementation', 'tests', 'verification'],
      permittedEffects: ['local-read', 'local-write'],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 4000,
    },
    candidateIds: ['eternities-forge'],
    selectedIds: ['eternities-forge'],
    selectedEntrypoints: ['skills/eternities-forge/SKILL.md'],
    selectionConfidence: 'verified',
    rejected: [],
    unresolvedDecisions: [],
    decisionPolicy: 'coverage>card-count>extra-capabilities>effects>context>dependencies>evidence>id',
    ...overrides,
  };
  return {
    compilerReceipt: {
      schemaVersion: 1,
      requestId: 'mission-1',
      requestDigest: 'b'.repeat(64),
      textDigest: 'c'.repeat(64),
      requestedEffects: ['local-read', 'local-write'],
      unresolvedDecisions: [],
      envelope: {
        schemaVersion: 1,
        requestId: 'mission-1',
        outcome: 'deliver the settled local change with tests and proof',
        candidateFamilies: ['implementation-engineering'],
        requiredCapabilities: ['implementation', 'tests', 'verification'],
        forbiddenCapabilities: [],
        permittedEffects: ['local-read', 'local-write'],
        availableAuthority: ['local-read', 'local-write', 'repository-write'],
        availablePreconditions: ['repository-present', 'settled-outcome'],
        maximumRisk: 'moderate',
        minimumEvidenceConfidence: 'verified',
        contextBudget: 4000,
        maxCompositionSize: 3,
        unresolvedDecisions: [],
      },
      proofLimits: ['fixture-and-contract-evidence-only'],
    },
    routeReceipt,
  };
}

const mission = {
  requestId: 'mission-1',
  text: 'deliver the settled local change with tests and proof',
};

test('adapter preserves ordinary mission text and returns selected entrypoints only', async () => {
  let receivedRequest;
  const transport = async (request) => {
    receivedRequest = request;
    return result();
  };

  const routed = await routeGodskill({ request: mission, hostContext, transport });

  assert.equal(receivedRequest.text, mission.text);
  assert.deepEqual(receivedRequest.context, hostContext);
  assert.equal(routed.status, 'selected');
  assert.deepEqual(routed.selectedIds, ['eternities-forge']);
  assert.deepEqual(routed.entrypoints, ['skills/eternities-forge/SKILL.md']);
  assert.equal(Object.hasOwn(routed, 'candidateIds'), false);
});

test('needs-decision returns no entrypoint and preserves unresolved categories', async () => {
  const transport = async () => result({
    status: 'needs-decision',
    selectionKind: 'none',
    selectedIds: [],
    selectedEntrypoints: [],
    selectionConfidence: null,
    unresolvedDecisions: ['authority:repository-write'],
  });

  const routed = await routeGodskill({ request: mission, hostContext, transport });

  assert.equal(routed.status, 'needs-decision');
  assert.deepEqual(routed.entrypoints, []);
  assert.deepEqual(routed.unresolvedDecisions, ['authority:repository-write']);
});

test('unknown statuses and malformed selection identities fail closed', async () => {
  const invalidResults = [
    result({ status: 'executed' }),
    result({ selectedEntrypoints: ['C:/secrets/SKILL.md'] }),
    result({ selectedEntrypoints: ['skills/another-skill/SKILL.md'] }),
    result({
      selectionKind: 'composition',
      selectedIds: ['a', 'b', 'c', 'd'],
      selectedEntrypoints: ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md', 'skills/d/SKILL.md'],
      candidateIds: ['a', 'b', 'c', 'd'],
    }),
  ];

  for (const invalid of invalidResults) {
    await assert.rejects(
      () => routeGodskill({ request: mission, hostContext, transport: async () => invalid }),
      /route receipt/,
    );
  }
});

test('compiler result cannot add authority or effects beyond verified host context', async () => {
  const authorityExpansion = result();
  authorityExpansion.compilerReceipt.envelope.availableAuthority.push('root');
  const effectExpansion = result();
  effectExpansion.compilerReceipt.envelope.permittedEffects.push('external-write');

  for (const invalid of [authorityExpansion, effectExpansion]) {
    await assert.rejects(
      () => routeGodskill({ request: mission, hostContext, transport: async () => invalid }),
      AuthorityError,
    );
  }
});

test('compiler and route receipts cannot expand preconditions risk evidence or context ceilings', async () => {
  const preconditions = result();
  preconditions.compilerReceipt.envelope.availablePreconditions.push('production-ready');
  const risk = result();
  risk.routeReceipt.requestFeatures.maximumRisk = 'high';
  const evidence = result();
  evidence.compilerReceipt.envelope.minimumEvidenceConfidence = 'low';
  const context = result();
  context.routeReceipt.requestFeatures.contextBudget = 4001;
  const composition = result();
  composition.compilerReceipt.envelope.maxCompositionSize = 4;

  for (const invalid of [preconditions, risk, evidence, context, composition]) {
    await assert.rejects(
      () => routeGodskill({ request: mission, hostContext, transport: async () => invalid }),
      AuthorityError,
    );
  }
});

test('local file transport remains compatible with the certified Godskills router', async () => {
  const transport = await createLocalGodskillsTransport({
    repositoryRoot: 'C:\\dev\\eternities-godskills',
  });
  const routed = await routeGodskill({ request: mission, hostContext, transport });

  assert.ok(['selected', 'needs-decision', 'no-qualified-route'].includes(routed.status));
  if (routed.status === 'selected') {
    assert.ok(routed.entrypoints.length >= 1);
    assert.ok(routed.entrypoints.every((entrypoint) => /^skills\/[a-z0-9-]+\/SKILL\.md$/.test(entrypoint)));
  } else {
    assert.deepEqual(routed.entrypoints, []);
  }
});
