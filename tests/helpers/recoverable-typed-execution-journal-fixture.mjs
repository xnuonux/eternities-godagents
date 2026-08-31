import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { sha256Value } from '../../src/core/digest.mjs';
import { createRecoverableTypedExecutionJournal } from '../../src/runtime/recoverable-typed-execution-journal.mjs';
import { createPinnedTypedExecutionStepperAdapter } from '../../src/skills/typed-execution-stepper-adapter.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../../scripts/lib/pinned-godskills-typed-composition.mjs';
import { pinnedGodskillsTypedExecutionStepperRelease } from '../../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';

function missionInputs() {
  return {
    'available-specialists': ['interface', 'motion', 'accessibility'],
    'design-constraints': ['deterministic', 'bounded-authority'],
    'repository-state': { branch: 'feat/typed-composition-v1', clean: false },
    'settled-outcome': { objective: 'compile a typed Muse to Forge mission' },
    'visual-source-set': ['brand-system', 'implemented-interface'],
  };
}

function outputFor(input) {
  if (input.capabilityId === 'eternities-muse') {
    return {
      schemaVersion: 1,
      capabilityId: input.capabilityId,
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
  }
  return {
    schemaVersion: 1,
    capabilityId: input.capabilityId,
    missionId: input.missionId,
    slots: {
      implementation: { status: 'verified' },
      'claim-evidence-ledger': { claims: 2, evidence: 2 },
      'review-disposition': { disposition: 'accepted' },
      'integration-state': { state: 'ready' },
    },
  };
}

function executors(observed) {
  return Object.fromEntries(['eternities-muse', 'eternities-forge'].map((capabilityId) => [
    capabilityId,
    async (input) => {
      observed.push(input.capabilityId);
      return outputFor(input);
    },
  ]));
}

export async function buildDeterministicRecoverableTypedExecutionJournalFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'godagents-typed-journal-fixture-'));
  try {
    const adapter = await createPinnedTypedExecutionStepperAdapter({
      compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
      stepperReleasePin: pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot),
    });
    const [activationResult, checkedPlan] = await Promise.all([
      readFile(resolve(godskillsRoot, 'artifacts/typed-composition/activation.v1.json'), 'utf8').then(JSON.parse),
      readFile(resolve(godskillsRoot, 'artifacts/typed-composition/plan.v1.json'), 'utf8').then(JSON.parse),
    ]);
    const unsignedPlan = structuredClone(checkedPlan);
    delete unsignedPlan.planDigest;
    const compiled = adapter.compile({ unsignedPlan, activationResult });
    const firstExecutions = [];
    const first = await createRecoverableTypedExecutionJournal({
      root: runtimeRoot,
      adapter,
      checkpoint: async (name, record) => {
        if (name === 'after-typed-step-persisted' && record.order === 0) {
          throw new Error('certification crash after first persisted node');
        }
      },
    });
    let crashObserved = false;
    try {
      await first.run({
        method: compiled.method,
        missionInputs: missionInputs(),
        executors: executors(firstExecutions),
      });
    } catch (error) {
      if (!/certification crash/.test(error.message)) throw error;
      crashObserved = true;
    }
    const recoveryExecutions = [];
    const recovered = await createRecoverableTypedExecutionJournal({ root: runtimeRoot, adapter });
    const completion = await recovered.run({
      method: compiled.method,
      missionInputs: missionInputs(),
      executors: executors(recoveryExecutions),
    });
    const [slot] = await readdir(join(runtimeRoot, 'executions'));
    const slotRoot = join(runtimeRoot, 'executions', slot);
    const intent = JSON.parse(await readFile(join(slotRoot, 'intent.json'), 'utf8'));
    const recordNames = (await readdir(join(slotRoot, 'steps'))).sort();
    const records = await Promise.all(recordNames.map((name) =>
      readFile(join(slotRoot, 'steps', name), 'utf8').then(JSON.parse)));
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-recoverable-typed-execution-journal-fixture-v1',
      godskills: {
        stepperSourceCommit: adapter.descriptor.stepperSourceCommit,
        stepperTrustRootDigest: adapter.descriptor.stepperTrustRootDigest,
        parentTypedCompositionReceiptDigest: adapter.descriptor.parentTypedCompositionReceiptDigest,
        registryDigest: adapter.descriptor.registryDigest,
      },
      execution: {
        executionId: completion.executionId,
        missionId: compiled.method.missionId,
        methodDigest: compiled.method.methodDigest,
        missionInputDigest: intent.missionInputDigest,
        completionDigest: completion.completion.completionDigest,
        executionDigest: completion.completion.result.receipt.executionDigest,
        journalHeadDigest: completion.journalHeadDigest,
      },
      recovery: {
        crashObserved,
        firstExecutions,
        recoveryExecutions,
        recoveredSteps: completion.recoveredSteps,
        executedSteps: completion.executedSteps,
        recordNames,
        recordDigests: records.map(({ recordDigest }) => recordDigest),
        stepDigests: records.map(({ stepDigest }) => stepDigest),
      },
      guarantees: {
        persistedAfterGodskillsValidation: true,
        resumesFirstUnfinishedNode: true,
        invalidOutputPersisted: false,
        methodSerialized: false,
        authorityExpanded: false,
        defaultLaunchEnabled: false,
        externalExactlyOnce: false,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}
