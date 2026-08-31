import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { createLocalRecoverableGodskillsAdapter } from '../../src/skills/local-recoverable-godskills-adapter.mjs';

const execFileAsync = promisify(execFile);
const fixtureProtocol = 'eternities-sealed-local-godskills-transport-fixture-v1';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`sealed local Godskills fixture failed: ${message}`);
}

function bindingInput() {
  const requestId = 'sealed-local-godskills-certification';
  return {
    mission: {
      requestId,
      text: 'coordinate implementation tests review verification and integration for the settled release',
      authority: ['local-read', 'local-write', 'realm:write', 'repository-write'],
      explicitMethodRequests: [],
    },
    observation: { observationId: `${requestId}-observation`, counter: 0 },
    genomePolicy: {
      protocolId: 'eternities-godskills-adapter-v1',
      profile: 'all-rounder',
      preferredFamilies: [],
      prohibitedFamilies: [],
      prohibitedCapabilities: [],
      maxComposition: 3,
    },
    hostEnvelope: {
      availableAuthority: ['local-read', 'local-write', 'realm:write', 'repository-write'],
      permittedEffects: ['local-read', 'local-write'],
      availablePreconditions: ['repository-present', 'settled-outcome'],
      forbiddenCapabilities: [],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 16_000,
      maxCompositionSize: 3,
      constitutionAllowedEffects: ['local-read', 'local-write'],
      realmHandContractDigest: 'a'.repeat(64),
    },
    sourceStateEpoch: 0,
  };
}

function classifier(counter) {
  return () => {
    counter.count += 1;
    return {
      taskClass: 'verification',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    };
  };
}

function fixedClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-08-31T22:00:00.000Z') + tick++ * 100).toISOString();
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

async function repositoryCommit(root) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
    env: environment,
  });
  const commit = stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Godskills fixture commit is invalid');
  return commit;
}

async function expectProcessDeath(operation) {
  try {
    await operation();
  } catch (error) {
    if (/simulated process death after activation result/i.test(error.message)) return true;
    throw error;
  }
  return false;
}

export async function buildDeterministicSealedLocalGodskillsTransportFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-sealed-local-certification-'));
  try {
    const launches = { route: 0, activation: 0 };
    const classifications = { count: 0 };
    const clock = fixedClock();
    let crash = true;
    const common = {
      admissionRoot: root,
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      routingPin: pinnedGodskillsRoutingExecutable(),
      activationClassifier: classifier(classifications),
      clock,
    };
    const first = await createLocalRecoverableGodskillsAdapter({
      ...common,
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
        if (crash && name === 'after-local-godskills-activation-process') {
          crash = false;
          throw new Error('simulated process death after activation result');
        }
      },
    });
    const input = bindingInput();
    const processDeathObserved = await expectProcessDeath(() => first.bindMission(input));
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

    const recovered = await createLocalRecoverableGodskillsAdapter({
      ...common,
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') {
          launches.route += 1;
          throw new Error('route recovery relaunched the process');
        }
        if (name === 'before-local-godskills-activation-process') {
          launches.activation += 1;
          throw new Error('activation recovery relaunched the process');
        }
      },
    });
    const binding = await recovered.bindMission(input);
    const replay = await recovered.bindMission(input);
    const rehydrated = await recovered.rehydrateMission({ receipt: binding.receipt, ...input });
    const files = await allFiles(root);
    const processSource = await readFile(
      new URL('../../src/skills/local-recoverable-godskills-process-transport.mjs', import.meta.url),
      'utf8',
    );
    const ambientEnvironmentAbsent = processSource.includes('env: minimalChildEnvironment()')
      && processSource.includes("new Set(['SYSTEMROOT', 'WINDIR'])")
      && !/env:\s*process\.env/.test(processSource);
    const selectedCapabilities = binding.cortexPackage.selectedCapabilities;
    const assertions = {
      processDeathObserved,
      activationResultDurableBeforeRecovery,
      activationSuccessDurableBeforeRecovery,
      activationCompletionAbsentBeforeRecovery,
      routeExecutedOnce: launches.route === 1,
      activationExecutedOnce: launches.activation === 1,
      recoveredWithoutRelaunch: launches.route === 1 && launches.activation === 1,
      exactBindingReplay: canonicalJson(replay) === canonicalJson(binding),
      exactRehydration: canonicalJson(rehydrated) === canonicalJson(binding),
      ambientEnvironmentAbsent,
      authorityExpansions: 0,
      realmEffects: 0,
    };
    const zero = new Set(['authorityExpansions', 'realmEffects']);
    for (const [name, value] of Object.entries(assertions)) {
      requireCondition(value === (zero.has(name) ? 0 : true), `assertion ${name} is ${String(value)}`);
    }
    requireCondition(binding.status === 'bound', 'recovered binding is not bound');
    requireCondition(selectedCapabilities.length > 0, 'real routing selected no capabilities');
    requireCondition(classifications.count === 2, 'activation classification count changed');

    const routingPin = pinnedGodskillsRoutingExecutable();
    const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
    const unsigned = {
      schemaVersion: 1,
      protocolId: fixtureProtocol,
      godskills: {
        commit: await repositoryCommit(godskillsRoot),
        releaseDigest: recovered.releaseDigest,
        routingReceiptDigest: routingPin.executableReceipt.receiptDigest,
        routingReceiptFileSha256: routingPin.executableReceipt.sha256,
        routingEntrypointSha256: routingPin.entrypoint.sha256,
        activationReceiptDigest: releasePin.activation.executableReceipt.receiptDigest,
        activationReceiptFileSha256: releasePin.activation.executableReceipt.sha256,
        activationEntrypointSha256: releasePin.activation.entrypoint.sha256,
      },
      execution: {
        routeMode: recovered.localExecution.routeMode,
        routeDescriptorDigest: recovered.localExecution.routeDescriptorDigest,
        activationDescriptorDigest: recovered.localExecution.activationDescriptorDigest,
        selectedCapabilities: selectedCapabilities.length,
        selectedCapabilitiesDigest: sha256Value(selectedCapabilities),
        bindingDigest: sha256Value(binding),
      },
      recovery: {
        routeLaunches: launches.route,
        activationLaunches: launches.activation,
        classifications: classifications.count,
        terminalResultFiles: files.filter(
          (path) => /local-process-terminal\/(?:route|activation)\/.+\/result\.json$/.test(path),
        ).length,
        terminalSuccessFiles: files.filter(
          (path) => /local-process-terminal\/(?:route|activation)\/.+\/success\.json$/.test(path),
        ).length,
        terminalCompletionFiles: files.filter(
          (path) => /local-process-terminal\/(?:route|activation)\/.+\/completion\.json$/.test(path),
        ).length,
      },
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
