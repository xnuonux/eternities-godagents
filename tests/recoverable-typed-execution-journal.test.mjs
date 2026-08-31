import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  pinnedGodskillsTypedCompositionRelease,
} from '../scripts/lib/pinned-godskills-typed-composition.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicRecoverableTypedExecutionJournalFixture } from './helpers/recoverable-typed-execution-journal-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const sourceCommit = '83e34059b3d384805047b00af7a865356ea18ecf';
const receiptDigest = '5caff10e19ec98020da451396af11a9e479afa61ba4d43546ce1559b23da2b17';
const fixtureDigest = 'f514832922c2a7bf9c941f1dbbeb5a257c52cd8558e49b6a283731a5812578df';
const executionDigest = 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7';

async function modules() {
  try {
    const [pins, verifier, adapter, journal] = await Promise.all([
      import('../scripts/lib/pinned-godskills-typed-execution-stepper.mjs'),
      import('../src/skills/typed-execution-stepper-verifier.mjs'),
      import('../src/skills/typed-execution-stepper-adapter.mjs'),
      import('../src/runtime/recoverable-typed-execution-journal.mjs'),
    ]);
    return { pins, verifier, adapter, journal };
  } catch (error) {
    assert.fail(`recoverable typed execution journal is unavailable: ${error.message}`);
  }
}

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

function executors(observed, overrides = {}) {
  return {
    'eternities-muse': async (input) => {
      observed.push(input.capabilityId);
      return outputFor(input);
    },
    'eternities-forge': async (input) => {
      observed.push(input.capabilityId);
      return outputFor(input);
    },
    ...overrides,
  };
}

async function compiledCanary(factory) {
  const [activationResult, checkedPlan] = await Promise.all([
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/activation.v1.json'), 'utf8').then(JSON.parse),
    readFile(resolve(godskillsRoot, 'artifacts/typed-composition/plan.v1.json'), 'utf8').then(JSON.parse),
  ]);
  const unsignedPlan = structuredClone(checkedPlan);
  delete unsignedPlan.planDigest;
  return factory.compile({ unsignedPlan, activationResult });
}

function changedReader(relativePath) {
  const target = resolve(godskillsRoot, ...relativePath.split('/')).toLowerCase();
  return {
    realpath,
    async readFile(filePath) {
      const bytes = await readFile(filePath);
      return resolve(filePath).toLowerCase() === target
        ? Buffer.concat([bytes, Buffer.from('\n')])
        : bytes;
    },
  };
}

async function harness(t, options = {}) {
  const { pins, adapter, journal } = await modules();
  const root = await mkdtemp(join(tmpdir(), 'godagents-typed-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stepperAdapter = await adapter.createPinnedTypedExecutionStepperAdapter({
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    stepperReleasePin: pins.pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot),
  });
  const compiled = await compiledCanary(stepperAdapter);
  const runner = await journal.createRecoverableTypedExecutionJournal({
    root,
    adapter: stepperAdapter,
    ...options,
  });
  return { root, stepperAdapter, compiled, runner, journal };
}

test('pins and verifies the exact certified Godskills typed execution stepper before import', async () => {
  const { pins, verifier, adapter } = await modules();
  const pin = pins.pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot);
  assert.equal(pins.pinnedGodskillsTypedExecutionStepperSourceCommit, sourceCommit);
  assert.equal(pin.releaseReceipt.receiptDigest, receiptDigest);
  assert.equal(pin.releaseReceipt.sha256,
    'c4e88277cc2b0047f3a428e94a185cbf6e0683c6ac1955bada0baebe71fe2d69');
  assert.equal(pin.module.sha256,
    '37adc58f65dc6dccdf02bfa3a5fb69dac293e7c3e4d29f9f181e8e252ebab993');
  assert.equal(pin.expected.fixtureDigest, fixtureDigest);

  const verified = await verifier.verifyGodskillsTypedExecutionStepperRelease({ releasePin: pin });
  assert.equal(verified.sourceCommit, sourceCommit);
  assert.equal(verified.trustRootDigest, receiptDigest);
  assert.equal(verified.sourceModules, 12);
  assert.equal(verified.authorityExpanded, false);
  assert.equal(verifier.assertVerifiedGodskillsTypedExecutionStepperRelease(verified), verified);
  assert.throws(
    () => verifier.assertVerifiedGodskillsTypedExecutionStepperRelease(structuredClone(verified)),
    /provenance|verified|brand/i,
  );

  const factory = await adapter.createPinnedTypedExecutionStepperAdapter({
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    stepperReleasePin: pin,
  });
  assert.equal(factory.descriptor.stepperTrustRootDigest, receiptDigest);
  assert.equal(factory.descriptor.parentTypedCompositionReceiptDigest,
    'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a');
  assert.equal(factory.descriptor.defaultLaunchEnabled, false);
});

test('stepper pin drift and changed certified bytes fail before branding', async () => {
  const { pins, verifier } = await modules();
  const base = pins.pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot);
  for (const releasePin of [
    { ...base, sourceCommit: '0'.repeat(40) },
    { ...base, releaseReceipt: { ...base.releaseReceipt, receiptDigest: '0'.repeat(64) } },
    { ...base, module: { ...base.module, path: 'src/../src/typed-execution-stepper.mjs' } },
    { ...base, defaultLaunch: true },
  ]) {
    await assert.rejects(
      verifier.verifyGodskillsTypedExecutionStepperRelease({ releasePin }),
      /stepper|pin|commit|receipt|path|field/i,
    );
  }
  for (const relativePath of [
    'receipts/typed-execution-stepper-v1.json',
    'src/typed-execution-stepper.mjs',
    'src/typed-composition.mjs',
    'receipts/typed-composition-v1.json',
    'fixtures/typed-execution-stepper-v1.json',
    'docs/typed-execution-stepper-v1-terra-review.json',
  ]) {
    await assert.rejects(
      verifier.verifyGodskillsTypedExecutionStepperRelease({
        releasePin: base,
        io: changedReader(relativePath),
      }),
      /stepper|digest|receipt|source|fixture|review|parent/i,
      relativePath,
    );
  }
});

test('the frozen crash-and-recovery fixture rebuilds byte-for-byte', async () => {
  const expected = await readFile(new URL(
    '../fixtures/recoverable-typed-execution-journal-v1.json',
    import.meta.url,
  ), 'utf8');
  const rebuilt = await buildDeterministicRecoverableTypedExecutionJournalFixture();
  assert.equal(`${canonicalJson(rebuilt)}\n`, expected);
  assert.equal(rebuilt.fixtureDigest, '4c6b16f208bbbdb1c05829f8d9d7b9c1fbeec5ef890de5139244ad86a9201391');
});

test('a persisted accepted prefix resumes at the first unfinished node', async (t) => {
  const first = await harness(t, {
    checkpoint: async (name, value) => {
      if (name === 'after-typed-step-persisted' && value.order === 0) {
        throw new Error('simulated process death after persisted Muse output');
      }
    },
  });
  const firstObserved = [];
  await assert.rejects(
    first.runner.run({
      method: first.compiled.method,
      missionInputs: missionInputs(),
      executors: executors(firstObserved),
    }),
    /simulated process death/i,
  );
  assert.deepEqual(firstObserved, ['eternities-muse']);

  const recovered = await first.journal.createRecoverableTypedExecutionJournal({
    root: first.root,
    adapter: first.stepperAdapter,
  });
  const recoveredObserved = [];
  const result = await recovered.run({
    method: first.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(recoveredObserved),
  });
  assert.deepEqual(recoveredObserved, ['eternities-forge']);
  assert.equal(result.status, 'completed');
  assert.equal(result.recoveredSteps, 1);
  assert.equal(result.executedSteps, 1);
  assert.equal(result.completion.result.receipt.executionDigest, executionDigest);
  assert.equal(result.externalExactlyOnce, false);
  assert.equal(result.authorityExpanded, false);
});

test('invalid output is rejected by Godskills before any durable step is published', async (t) => {
  const value = await harness(t);
  const observed = [];
  const malformed = executors(observed, {
    'eternities-muse': async (input) => {
      observed.push(input.capabilityId);
      return { schemaVersion: 1, capabilityId: input.capabilityId, missionId: input.missionId, slots: {} };
    },
  });
  await assert.rejects(
    value.runner.run({ method: value.compiled.method, missionInputs: missionInputs(), executors: malformed }),
    (error) => error?.code === 'output-invalid',
  );
  const executionDirectories = await readdir(join(value.root, 'executions'));
  assert.equal(executionDirectories.length, 1);
  const stepFiles = await readdir(join(value.root, 'executions', executionDirectories[0], 'steps'));
  assert.deepEqual(stepFiles, []);

  const retried = [];
  const result = await value.runner.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(retried),
  });
  assert.deepEqual(retried, ['eternities-muse', 'eternities-forge']);
  assert.equal(result.completion.result.receipt.executionDigest, executionDigest);
});

test('executor selection remains a closed exact capability set', async (t) => {
  const value = await harness(t);
  const observed = [];
  await assert.rejects(value.runner.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: {
      ...executors(observed),
      'unselected-capability': async () => ({ status: 'should-not-run' }),
    },
  }), /exactly one executor|executor set|executor/i);
  assert.deepEqual(observed, []);
});

test('executor bindings are snapshotted before asynchronous node work begins', async (t) => {
  const value = await harness(t);
  const observed = [];
  const selected = executors(observed);
  selected['eternities-muse'] = async (input) => {
    observed.push(input.capabilityId);
    selected['eternities-forge'] = async () => {
      throw new Error('mutated executor must not run');
    };
    return outputFor(input);
  };
  const result = await value.runner.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: selected,
  });
  assert.deepEqual(observed, ['eternities-muse', 'eternities-forge']);
  assert.equal(result.completion.result.receipt.executionDigest, executionDigest);
});

test('an uncommitted atomic writing file is inert during recovery', async (t) => {
  const value = await harness(t);
  await assert.rejects(value.runner.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors([], {
      'eternities-muse': async (input) => ({
        schemaVersion: 1,
        capabilityId: input.capabilityId,
        missionId: input.missionId,
        slots: {},
      }),
    }),
  }), (error) => error?.code === 'output-invalid');
  const [executionDirectory] = await readdir(join(value.root, 'executions'));
  const stepsRoot = join(value.root, 'executions', executionDirectory, 'steps');
  await writeFile(join(stepsRoot, '000000.json.writing'), '{"partial":', 'utf8');

  const recovered = await value.journal.createRecoverableTypedExecutionJournal({
    root: value.root,
    adapter: value.stepperAdapter,
  });
  const observed = [];
  const result = await recovered.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(observed),
  });
  assert.deepEqual(observed, ['eternities-muse', 'eternities-forge']);
  assert.equal(result.completion.result.receipt.executionDigest, executionDigest);
});

test('changed durable output fails closed before another executor runs', async (t) => {
  const value = await harness(t, {
    checkpoint: async (name, record) => {
      if (name === 'after-typed-step-persisted' && record.order === 0) throw new Error('stop after record');
    },
  });
  await assert.rejects(value.runner.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors([]),
  }), /stop after record/i);
  const [executionDirectory] = await readdir(join(value.root, 'executions'));
  const recordPath = join(value.root, 'executions', executionDirectory, 'steps', '000000.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  record.output.slots['visual-direction'].direction = 'tampered';
  await writeFile(recordPath, `${JSON.stringify(record)}\n`, 'utf8');

  const recovered = await value.journal.createRecoverableTypedExecutionJournal({
    root: value.root,
    adapter: value.stepperAdapter,
  });
  const observed = [];
  await assert.rejects(recovered.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(observed),
  }), /canonical|digest|record|journal/i);
  assert.deepEqual(observed, []);
});

test('gapped, reordered, and digest-consistent forged records fail before execution', async (t) => {
  async function persistedRoot() {
    const value = await harness(t, {
      checkpoint: async (name, record) => {
        if (name === 'after-typed-step-persisted' && record.order === 0) throw new Error('stop after record');
      },
    });
    await assert.rejects(value.runner.run({
      method: value.compiled.method,
      missionInputs: missionInputs(),
      executors: executors([]),
    }), /stop after record/i);
    const [executionDirectory] = await readdir(join(value.root, 'executions'));
    return { ...value, stepsRoot: join(value.root, 'executions', executionDirectory, 'steps') };
  }

  const gapped = await persistedRoot();
  await rename(join(gapped.stepsRoot, '000000.json'), join(gapped.stepsRoot, '000001.json'));
  await assert.rejects(gapped.runner.run({
    method: gapped.compiled.method,
    missionInputs: missionInputs(),
    executors: executors([]),
  }), (error) => error?.code === 'record-gap');

  const forged = await persistedRoot();
  const forgedPath = join(forged.stepsRoot, '000000.json');
  const forgedRecord = JSON.parse(await readFile(forgedPath, 'utf8'));
  forgedRecord.stepDigest = 'f'.repeat(64);
  delete forgedRecord.recordDigest;
  forgedRecord.recordDigest = sha256Value(forgedRecord);
  await writeFile(forgedPath, `${canonicalJson(forgedRecord)}\n`, 'utf8');
  const forgedObserved = [];
  await assert.rejects(forged.runner.run({
    method: forged.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(forgedObserved),
  }), (error) => error?.code === 'record-replay-mismatch');
  assert.deepEqual(forgedObserved, []);

  const reordered = await harness(t);
  await reordered.runner.run({
    method: reordered.compiled.method,
    missionInputs: missionInputs(),
    executors: executors([]),
  });
  const [reorderedDirectory] = await readdir(join(reordered.root, 'executions'));
  const reorderedRoot = join(reordered.root, 'executions', reorderedDirectory, 'steps');
  const first = await readFile(join(reorderedRoot, '000000.json'), 'utf8');
  const second = await readFile(join(reorderedRoot, '000001.json'), 'utf8');
  await writeFile(join(reorderedRoot, '000000.json'), second, 'utf8');
  await writeFile(join(reorderedRoot, '000001.json'), first, 'utf8');
  await assert.rejects(reordered.runner.run({
    method: reordered.compiled.method,
    missionInputs: missionInputs(),
    executors: executors([]),
  }), /record|order|identity|digest/i);
});

test('a filesystem alias cannot become the journal root', async (t) => {
  const { pins, adapter, journal } = await modules();
  const parent = await mkdtemp(join(tmpdir(), 'godagents-typed-journal-alias-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const actual = join(parent, 'actual');
  const alias = join(parent, 'alias');
  await mkdir(actual);
  try {
    await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.diagnostic('filesystem alias probe unavailable without Windows symlink privilege');
      return;
    }
    throw error;
  }
  const stepperAdapter = await adapter.createPinnedTypedExecutionStepperAdapter({
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    stepperReleasePin: pins.pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot),
  });
  await assert.rejects(
    journal.createRecoverableTypedExecutionJournal({ root: alias, adapter: stepperAdapter }),
    /real directory|path alias|journal root/i,
  );
});

test('the pre-publication crash window is explicitly at-least-once', async (t) => {
  const value = await harness(t, {
    checkpoint: async (name, record) => {
      if (name === 'after-typed-step-validated' && record.order === 0) {
        throw new Error('simulated death before durable publication');
      }
    },
  });
  const firstObserved = [];
  await assert.rejects(value.runner.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(firstObserved),
  }), /before durable publication/i);
  assert.deepEqual(firstObserved, ['eternities-muse']);

  const recovered = await value.journal.createRecoverableTypedExecutionJournal({
    root: value.root,
    adapter: value.stepperAdapter,
  });
  const secondObserved = [];
  const result = await recovered.run({
    method: value.compiled.method,
    missionInputs: missionInputs(),
    executors: executors(secondObserved),
  });
  assert.deepEqual(secondObserved, ['eternities-muse', 'eternities-forge']);
  assert.equal(result.externalExactlyOnce, false);
  assert.equal(result.completion.result.receipt.executionDigest, executionDigest);
});
