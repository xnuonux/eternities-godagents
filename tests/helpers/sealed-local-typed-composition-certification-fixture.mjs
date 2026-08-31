import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import {
  pinnedGodskillsRoutingExecutable,
  pinnedGodskillsRoutingSourceCommit,
} from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import {
  pinnedGodskillsTypedCompositionRelease,
  pinnedGodskillsTypedCompositionSourceCommit,
} from '../../scripts/lib/pinned-godskills-typed-composition.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { recoverableGodskillsBindingSlot } from '../../src/skills/recoverable-godskills-contracts.mjs';
import { recoverableTypedCompositionSlot } from '../../src/skills/recoverable-typed-composition-compiler.mjs';
import { createSealedLocalTypedCompositionCompiler } from '../../src/skills/sealed-local-typed-composition-compiler.mjs';
import {
  bindingInput,
  executors,
  godskillsRoot,
  missionInputs,
  topology,
} from './recoverable-typed-composition-fixture.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fixedClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-08-31T23:50:00.000Z') + tick++ * 100).toISOString();
}

async function allFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path.slice(root.length + 1).replaceAll('\\', '/'));
    }
  }
  await walk(root);
  return files.sort();
}

function localBindingInput(missionId) {
  const input = bindingInput(missionId);
  input.mission.text = 'define one visual language across interface motion and accessibility, then carry the approved cross-component change through implementation tests review and integration';
  return input;
}

export async function buildDeterministicSealedLocalTypedCompositionFixture() {
  const root = await mkdtemp(join(tmpdir(), 'godagents-sealed-local-typed-cert-'));
  const missionId = 'sealed-local-typed-composition-certification-v1';
  const input = localBindingInput(missionId);
  const declaredTopology = await topology(missionId);
  const launches = { route: 0, activation: 0 };
  const classifications = { count: 0 };
  const clock = fixedClock();
  const activationClassifier = () => {
    classifications.count += 1;
    return {
      taskClass: 'implementation',
      consequenceClass: 'consequential',
      reviewAvailable: false,
    };
  };
  const common = {
    runtimeRoot: root,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    activationClassifier,
    processClock: clock,
  };
  let processDeathObserved = false;
  try {
    let crash = true;
    const first = await createSealedLocalTypedCompositionCompiler({
      ...common,
      processCheckpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
        if (crash && name === 'after-local-godskills-activation-process') {
          crash = false;
          throw new Error('certification process death after local activation success');
        }
      },
    });
    try {
      await first.compileMission({ bindingInput: input, topology: declaredTopology });
    } catch (error) {
      if (error?.message !== 'certification process death after local activation success') throw error;
      processDeathObserved = true;
    }
    if (!processDeathObserved) throw new Error('sealed local typed certification process death was not observed');
    const interruptedFiles = await allFiles(root);
    const activationResultDurableBeforeRecovery = interruptedFiles.some(
      (path) => /local-process-terminal\/activation\/.+\/result\.json$/.test(path),
    );
    const activationSuccessDurableBeforeRecovery = interruptedFiles.some(
      (path) => /local-process-terminal\/activation\/.+\/success\.json$/.test(path),
    );
    const activationCompletionAbsentBeforeRecovery = !interruptedFiles.some(
      (path) => /local-process-terminal\/activation\/.+\/completion\.json$/.test(path),
    );

    const recovered = await createSealedLocalTypedCompositionCompiler({
      ...common,
      processCheckpoint: async (name) => {
        if (name.startsWith('before-local-godskills-')) {
          throw new Error('sealed local typed recovery relaunched a completed process');
        }
      },
    });
    const compilation = await recovered.resumeMission({ missionId });
    const replay = await recovered.resumeMission({ missionId });
    const execution = await recovered.execute({
      compilation,
      missionInputs: missionInputs(),
      executors: executors(),
    });
    const compilerSlot = recoverableTypedCompositionSlot(missionId);
    const bindingSlot = recoverableGodskillsBindingSlot(missionId);
    const intentText = await readFile(
      join(root, 'compilations', compilerSlot, 'intent.json'), 'utf8',
    );
    const recordText = await readFile(
      join(root, 'compilations', compilerSlot, 'result.json'), 'utf8',
    );
    const bindingText = await readFile(
      join(root, 'godskills', 'bindings', bindingSlot, 'result.json'), 'utf8',
    );
    const binding = JSON.parse(bindingText);
    const files = await allFiles(root);
    const terminalResultFiles = files.filter(
      (path) => /local-process-terminal\/(route|activation)\/.+\/result\.json$/.test(path),
    ).length;
    const terminalSuccessFiles = files.filter(
      (path) => /local-process-terminal\/(route|activation)\/.+\/success\.json$/.test(path),
    ).length;
    const terminalCompletionFiles = files.filter(
      (path) => /local-process-terminal\/(route|activation)\/.+\/completion\.json$/.test(path),
    ).length;
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-sealed-local-typed-composition-fixture-v1',
      godskills: {
        reviewSourceCommit: '3a63c07322808b6958593bd765c0fb32023a2da5',
        routingSourceCommit: pinnedGodskillsRoutingSourceCommit,
        typedCompositionSourceCommit: pinnedGodskillsTypedCompositionSourceCommit,
        releaseDigest: recovered.descriptor.godskillsReleaseDigest,
        routingReceiptDigest: common.routingPin.executableReceipt.receiptDigest,
        activationReceiptDigest: common.releasePin.activation.executableReceipt.receiptDigest,
        typedCompositionReceiptDigest: common.compositionReleasePin.releaseReceipt.receiptDigest,
      },
      localExecution: structuredClone(recovered.descriptor.localExecution),
      recovery: {
        processDeathObserved,
        activationResultDurableBeforeRecovery,
        activationSuccessDurableBeforeRecovery,
        activationCompletionAbsentBeforeRecovery,
        routeLaunches: launches.route,
        activationLaunches: launches.activation,
        classifications: classifications.count,
        terminalResultFiles,
        terminalSuccessFiles,
        terminalCompletionFiles,
        exactCompilationReplay: replay.compilationDigest === compilation.compilationDigest,
      },
      binding: {
        selectedIds: binding.binding.receipt.selected.map(({ id }) => id),
        bindingDigest: binding.bindingDigest,
        activationResultDigest: binding.binding.receipt.activation.resultDigest,
      },
      compilation: {
        missionId: compilation.missionId,
        planDigest: compilation.planDigest,
        methodDigest: compilation.methodDigest,
        compilationDigest: compilation.compilationDigest,
      },
      execution: {
        outputs: structuredClone(execution.outputs),
        receipt: structuredClone(execution.receipt),
      },
      state: {
        intentFileSha256: sha256(intentText),
        recordFileSha256: sha256(recordText),
        bindingFileSha256: sha256(bindingText),
        serializedMethodFields: (intentText.match(/"method"\s*:/g) ?? []).length
          + (recordText.match(/"method"\s*:/g) ?? []).length,
      },
      assertions: {
        exactPinnedExecutables: true,
        callerTransportInjection: false,
        recoveredWithoutRelaunch: launches.route === 1 && launches.activation === 1,
        methodSerialized: false,
        authorityExpanded: false,
        defaultLaunchEnabled: false,
        realmEffects: 0,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256(canonicalJson(unsigned)) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
