import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';

function executorId(bundleId, capabilityId, programSha256) {
  return sha256Value({
    protocolId: 'eternities-receipt-bound-typed-executor-program-identity-v1',
    bundleId,
    capabilityId,
    programSha256,
  });
}

function museProgram() {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-declarative-typed-executor-program-v1',
    capabilityId: 'eternities-muse',
    delayMs: 0,
    outputTemplate: {
      schemaVersion: 1,
      capabilityId: 'eternities-muse',
      missionId: { $input: 'missionId' },
      slots: {
        'visual-direction': { direction: 'receipt-bound-white-fire' },
        'visual-system': { visualPrimitives: ['luminance', 'motion'] },
        'specialist-handoff': { target: 'eternities-forge' },
        'acceptance-boundary': {
          invariants: ['activation-bound', 'receipt-bound-executor'],
          rejectionCriteria: ['caller-executor', 'unverified-program'],
        },
      },
    },
  };
}

function forgeProgram(forgeDelayMs) {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-declarative-typed-executor-program-v1',
    capabilityId: 'eternities-forge',
    delayMs: forgeDelayMs,
    outputTemplate: {
      schemaVersion: 1,
      capabilityId: 'eternities-forge',
      missionId: { $input: 'missionId' },
      slots: {
        implementation: { status: 'verified' },
        'claim-evidence-ledger': { claims: 3, evidence: 3 },
        'review-disposition': { disposition: 'accepted' },
        'integration-state': { state: 'ready' },
      },
    },
  };
}

export async function receiptBoundExecutorBundleFixture(context, {
  forgeDelayMs = 0,
  bundleId = `certification:${randomUUID()}`,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-receipt-bound-bundle-'));
  if (context) context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'executors'), { recursive: true });
  await mkdir(join(root, 'receipts'), { recursive: true });
  const programs = {
    'eternities-forge': forgeProgram(forgeDelayMs),
    'eternities-muse': museProgram(),
  };
  const executors = [];
  for (const capabilityId of Object.keys(programs).sort()) {
    const programText = `${canonicalJson(programs[capabilityId])}\n`;
    const programSha256 = sha256Text(programText);
    const path = `executors/${capabilityId}.json`;
    await writeFile(join(root, ...path.split('/')), programText, 'utf8');
    executors.push({
      capabilityId,
      program: { path, sha256: programSha256, bytes: Buffer.byteLength(programText) },
      descriptor: {
        schemaVersion: 1,
        protocolId: 'eternities-typed-capability-executor-v1',
        executorId: executorId(bundleId, capabilityId, programSha256),
        capabilityId,
        authority: [],
        maximumInputBytes: 65_536,
        maximumOutputBytes: 65_536,
      },
    });
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-receipt-bound-typed-executor-bundle-v1',
    bundleId,
    status: 'verified-build',
    executors,
    proofLimits: [
      'the host-owned declarative interpreter is trusted implementation',
      'external exactly-once effects remain unproved',
    ],
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  const receiptPath = 'receipts/executor-bundle-v1.json';
  const receiptText = `${canonicalJson(receipt)}\n`;
  await writeFile(join(root, ...receiptPath.split('/')), receiptText, 'utf8');
  return {
    repositoryRoot: root,
    receiptPath,
    expectedSha256: sha256Text(receiptText),
    receipt,
    descriptors: executors.map(({ descriptor }) => structuredClone(descriptor)),
  };
}

export async function buildDeterministicReceiptBoundTypedExecutorBundleHostFixture() {
  const cleanup = [];
  const context = { after: (action) => cleanup.push(action) };
  try {
    const { admittedTypedExecutionHostFixture } = await import(
      './admitted-sealed-typed-execution-host-fixture.mjs'
    );
    const admitted = await admittedTypedExecutionHostFixture(context, 'receipt-bound-certification');
    const bundle = await receiptBoundExecutorBundleFixture(context, {
      forgeDelayMs: 250,
      bundleId: 'certification:receipt-bound-typed-executor-bundle-v1',
    });
    const input = await bindBundleToAdmittedFixture(admitted, bundle);
    const inputPath = join(bundle.repositoryRoot, 'certification-input.json');
    await writeFile(inputPath, `${canonicalJson(input)}\n`, 'utf8');
    const interrupted = await runHostChild(inputPath, {
      terminateAfterFirstStep: true,
      admissionRoot: admitted.admitted.admissionRoot,
    });
    await expireDeadLocks(admitted.admitted.admissionRoot);
    const recovered = await runHostChild(inputPath);
    const replay = await runHostChild(inputPath);
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-receipt-bound-typed-executor-bundle-host-fixture-v1',
      bundle: {
        bundleId: bundle.receipt.bundleId,
        receiptDigest: bundle.receipt.receiptDigest,
        receiptSha256: bundle.expectedSha256,
        executors: bundle.receipt.executors.map((row) => ({
          capabilityId: row.capabilityId,
          program: structuredClone(row.program),
          descriptor: structuredClone(row.descriptor),
        })),
      },
      policy: {
        policyId: admitted.policy.policyId,
        policyDigest: admitted.common.env.GODAGENT_TYPED_EXECUTION_POLICY_SHA256,
        executorIds: admitted.policy.runtime.executors.map(({ executorId }) => executorId),
      },
      completion: {
        receiptDigest: recovered.receipt.receiptDigest,
        executionBindingDigest: recovered.receipt.executionBindingDigest,
        compilationDigest: recovered.receipt.compilationDigest,
        executionDigest: recovered.receipt.executionDigest,
      },
      recovery: {
        crashObserved: interrupted.terminatedAfterFirstStep,
        freshProcessRecovery: true,
        executedSteps: recovered.execution.execution.executedSteps,
        recoveredSteps: recovered.execution.execution.recoveredSteps,
        replayExecutedSteps: replay.execution.execution.executedSteps,
        replayRecoveredSteps: replay.execution.execution.recoveredSteps,
        replayReceiptMatched: replay.receipt.receiptDigest === recovered.receipt.receiptDigest,
      },
      guarantees: {
        externalBundlePin: true,
        canonicalReceipt: true,
        exactVerifiedProgramsInterpreted: true,
        callerExecutorsAccepted: false,
        callerLoaderHooksAccepted: false,
        policyDescriptorMatched: true,
        authorityExpanded: false,
        defaultLaunchEnabled: false,
        externalExactlyOnce: false,
      },
      proofLimits: structuredClone(bundle.receipt.proofLimits),
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const action of cleanup.reverse()) await action();
  }
}

async function expireDeadLocks(root) {
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.lock')) {
        const owner = JSON.parse(await readFile(path, 'utf8'));
        owner.createdAt = '2000-01-01T00:00:00.000Z';
        await writeFile(path, `${canonicalJson(owner)}\n`, 'utf8');
      }
    }
  }
  await visit(root);
}

function runHostChild(inputPath, { terminateAfterFirstStep = false, admissionRoot } = {}) {
  const worker = new URL('./receipt-bound-typed-execution-child.mjs', import.meta.url);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [fileURLToPath(worker), inputPath], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let terminatedAfterFirstStep = false;
    let polling = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const monitor = terminateAfterFirstStep ? setInterval(async () => {
      if (polling || terminatedAfterFirstStep) return;
      polling = true;
      try {
        const paths = await readdir(admissionRoot, { recursive: true });
        if (paths.some((path) => /(?:^|[\\/])steps[\\/]000000\.json$/.test(String(path)))) {
          terminatedAfterFirstStep = child.kill();
        }
      } catch {}
      polling = false;
    }, 10) : null;
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      if (monitor) clearInterval(monitor);
      if (terminateAfterFirstStep && terminatedAfterFirstStep) {
        resolvePromise({ terminatedAfterFirstStep: true });
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(`receipt-bound child failed with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        rejectPromise(new Error('receipt-bound child returned invalid completion', { cause: error }));
      }
    });
  });
}

export async function bindBundleToAdmittedFixture(fixture, bundle) {
  fixture.policy.runtime.executors = structuredClone(bundle.descriptors);
  const text = `${canonicalJson(fixture.policy)}\n`;
  await writeFile(fixture.policyPath, text, 'utf8');
  fixture.common.env.GODAGENT_TYPED_EXECUTION_POLICY_SHA256 = sha256Text(canonicalJson(fixture.policy));
  fixture.common.env.GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256 = bundle.expectedSha256;
  return {
    admissionRoot: fixture.common.admissionRoot,
    policyPath: fixture.common.policyPath,
    executorBundleRoot: bundle.repositoryRoot,
    executorBundleReceiptPath: bundle.receiptPath,
    request: fixture.request,
    env: fixture.common.env,
  };
}
