import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { sha256Value } from '../../src/core/digest.mjs';
import { createPinnedTypedCompositionAdapter } from '../../src/skills/typed-composition-adapter.mjs';
import {
  pinnedGodskillsTypedCompositionRelease,
  pinnedGodskillsTypedCompositionSourceCommit,
} from '../../scripts/lib/pinned-godskills-typed-composition.mjs';

const EXPECTED = Object.freeze({
  trustRootDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
  registryDigest: '5143a9ca74b5676605c33e94c7d610d830c3aafe7d57c32a48558d5112b713b8',
  activationResultDigest: 'f2210917bcb5d4d462332d2f871b026faf81317bfd6472c74d36c17f393a539c',
  planDigest: '9849b421071a74535028cabd70d92db3cd4df6d4b0433f83bb562fb14d47d48f',
  methodDigest: '63b0a268841992c55953415b279f8e76277a80b0152f49260b3a22db9a75e3c2',
  executionDigest: 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7',
});

function canaryInputs() {
  return {
    'available-specialists': ['interface', 'motion', 'accessibility'],
    'design-constraints': ['deterministic', 'bounded-authority'],
    'repository-state': { branch: 'feat/typed-composition-v1', clean: false },
    'settled-outcome': { objective: 'compile a typed Muse to Forge mission' },
    'visual-source-set': ['brand-system', 'implemented-interface'],
  };
}

function canaryExecutors(observed) {
  return {
    'eternities-muse': async (input) => {
      observed.push(structuredClone(input));
      return {
        schemaVersion: 1,
        capabilityId: 'eternities-muse',
        missionId: input.missionId,
        slots: {
          'visual-direction': { direction: 'white-fire-sovereign' },
          'visual-system': { tokens: ['luminance', 'motion'] },
          'specialist-handoff': { target: 'eternities-forge' },
          'acceptance-boundary': {
            invariants: ['typed-handoff', 'no-authority-expansion'],
            rejectionCriteria: ['implicit-coercion', 'missing-evidence'],
          },
        },
      };
    },
    'eternities-forge': async (input) => {
      observed.push(structuredClone(input));
      return {
        schemaVersion: 1,
        capabilityId: 'eternities-forge',
        missionId: input.missionId,
        slots: {
          implementation: { status: 'verified' },
          'claim-evidence-ledger': { claims: 2, evidence: 2 },
          'review-disposition': { disposition: 'accepted' },
          'integration-state': { state: 'ready' },
        },
      };
    },
  };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export async function buildDeterministicGodskillsTypedCompositionConsumerFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const root = await realpath(resolve(godskillsRoot));
  const observedReads = [];
  const adapter = await createPinnedTypedCompositionAdapter({
    releasePin: pinnedGodskillsTypedCompositionRelease(root),
    io: {
      realpath,
      async readFile(filePath) {
        const actual = await realpath(filePath);
        observedReads.push(relative(root, actual).replaceAll('\\', '/'));
        return readFile(actual);
      },
    },
  });
  const [activationResult, checkedPlan] = await Promise.all([
    readFile(resolve(root, 'artifacts/typed-composition/activation.v1.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'artifacts/typed-composition/plan.v1.json'), 'utf8').then(JSON.parse),
  ]);
  const unsignedPlan = structuredClone(checkedPlan);
  delete unsignedPlan.planDigest;
  const compiled = adapter.compile({ unsignedPlan, activationResult });
  const observedExecutions = [];
  const execution = await adapter.execute({
    method: compiled.method,
    missionInputs: canaryInputs(),
    executors: canaryExecutors(observedExecutions),
  });
  const uniqueReads = [...new Set(observedReads)].sort();
  const bodyReads = uniqueReads.filter((path) =>
    /artifacts\/capability-layers\/.*\/(?:method|reviewer)\.v1\.md$/i.test(path));
  const handoff = observedExecutions[1]?.slots?.['acceptance-risk-boundary'];

  ensure(adapter.descriptor.sourceCommit === pinnedGodskillsTypedCompositionSourceCommit,
    'typed composition source commit changed');
  ensure(adapter.descriptor.trustRootDigest === EXPECTED.trustRootDigest,
    'typed composition release root changed');
  ensure(adapter.descriptor.registryDigest === EXPECTED.registryDigest,
    'typed composition registry root changed');
  ensure(activationResult.resultDigest === EXPECTED.activationResultDigest,
    'typed composition activation root changed');
  ensure(compiled.plan.planDigest === EXPECTED.planDigest, 'typed composition plan root changed');
  ensure(compiled.method.methodDigest === EXPECTED.methodDigest, 'typed composition method root changed');
  ensure(execution.receipt.executionDigest === EXPECTED.executionDigest,
    'typed composition execution root changed');
  ensure(bodyReads.length === 0, 'typed composition loaded a capability method or reviewer body');
  ensure(compiled.method.aggregate.methodBodiesEmbedded === 0
    && compiled.method.aggregate.sourceBodiesTransported === 0,
  'typed composition transported method or source bodies');
  ensure(compiled.method.aggregate.authorityExpanded === false
    && execution.receipt.authorityExpanded === false
    && adapter.descriptor.authorityExpanded === false,
  'typed composition expanded authority');
  ensure(adapter.descriptor.defaultLaunchEnabled === false,
    'typed composition enabled a default launch path');
  ensure(JSON.stringify(handoff) === JSON.stringify({
    invariants: ['typed-handoff', 'no-authority-expansion'],
    rejectionCriteria: ['implicit-coercion', 'missing-evidence'],
  }), 'typed composition handoff changed');

  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagents-typed-composition-consumer-fixture-v1',
    godskills: {
      sourceCommit: adapter.descriptor.sourceCommit,
      releaseReceiptDigest: adapter.descriptor.trustRootDigest,
      capabilityLayerReceiptDigest: adapter.descriptor.capabilityLayerReceiptDigest,
      activationTrustRootDigest: adapter.descriptor.activationTrustRootDigest,
      registryDigest: adapter.descriptor.registryDigest,
    },
    composition: {
      missionId: compiled.method.missionId,
      activationResultDigest: activationResult.resultDigest,
      planDigest: compiled.plan.planDigest,
      methodDigest: compiled.method.methodDigest,
      executionDigest: execution.receipt.executionDigest,
      nodes: compiled.method.nodes.length,
      links: compiled.method.links.length,
      missionOutputs: Object.keys(execution.outputs).sort(),
    },
    execution: {
      outputs: structuredClone(execution.outputs),
      receipt: structuredClone(execution.receipt),
      acceptanceRiskBoundary: structuredClone(handoff),
    },
    evidence: {
      sourceModules: 9,
      declaredArtifacts: 9,
      generatedArtifacts: 9,
      observedArtifactFiles: uniqueReads,
      capabilityMethodOrReviewerBodyReads: bodyReads,
    },
    assertions: {
      exactReleaseVerified: true,
      exactRegistryReconstructed: true,
      exactPlanRecompiled: true,
      exactMethodRecompiled: true,
      exactExecutionReproduced: true,
      methodBodiesEmbedded: 0,
      sourceBodiesTransported: 0,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
    },
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}
