import assert from 'node:assert/strict';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import {
  AdmittedTypedExecutionHostError,
  launchAdmittedSealedTypedExecutionMission,
} from '../src/host/admitted-sealed-typed-execution-launch.mjs';
import {
  admittedTypedExecutionHostFixture,
  buildDeterministicAdmittedSealedTypedExecutionHostFixture,
  liveTypedExecutors,
} from './helpers/admitted-sealed-typed-execution-host-fixture.mjs';

test('the frozen admitted typed execution host fixture rebuilds byte-for-byte', async () => {
  const text = await readFile(
    new URL('../fixtures/admitted-sealed-typed-execution-host-v1.json', import.meta.url),
    'utf8',
  );
  const expected = JSON.parse(text);
  assert.equal(text, `${canonicalJson(expected)}\n`);
  assert.deepEqual(await buildDeterministicAdmittedSealedTypedExecutionHostFixture(), expected);
});

test('one pinned admitted identity completes the typed Muse-to-Forge graph', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'complete');
  const observed = [];
  const result = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(observed),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.receipt.missionId, fixture.request.missionRequest.mission.missionId);
  assert.equal(result.receipt.authorityExpanded, false);
  assert.deepEqual(observed.map(({ capabilityId }) => capabilityId), [
    'eternities-muse',
    'eternities-forge',
  ]);
});

test('a persisted node recovers through the admitted host without relaunching local processes', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'recovery');
  const firstObserved = [];
  const firstExecutors = liveTypedExecutors(firstObserved).map((executor) => (
    executor.descriptor().capabilityId === 'eternities-forge'
      ? { ...executor, execute: async () => { throw new Error('simulated admitted typed host process death'); } }
      : executor
  ));
  await assert.rejects(
    launchAdmittedSealedTypedExecutionMission({
      ...fixture.common,
      request: fixture.request,
      executors: firstExecutors,
    }),
    (error) => error instanceof AdmittedTypedExecutionHostError && error.code === 'launch-failed',
  );
  assert.deepEqual(firstObserved.map(({ capabilityId }) => capabilityId), ['eternities-muse']);
  const processStateAfterFailure = await fileTextsBelow(
    fixture.admitted.admissionRoot,
    (path) => path.includes('/local-process-terminal/'),
  );
  assert.ok(processStateAfterFailure.length > 0);

  const recoveredObserved = [];
  const recovered = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(recoveredObserved),
  });
  assert.deepEqual(recoveredObserved.map(({ capabilityId }) => capabilityId), ['eternities-forge']);
  assert.equal(recovered.execution.execution.recoveredSteps, 1);
  assert.equal(recovered.execution.execution.executedSteps, 1);
  assert.deepEqual(
    await fileTextsBelow(fixture.admitted.admissionRoot, (path) => path.includes('/local-process-terminal/')),
    processStateAfterFailure,
  );

  const replayObserved = [];
  const replay = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(replayObserved),
  });
  assert.deepEqual(replayObserved, []);
  assert.equal(replay.execution.execution.recoveredSteps, 2);
  assert.equal(replay.execution.execution.executedSteps, 0);
  assert.equal(replay.receipt.receiptDigest, recovered.receipt.receiptDigest);
  assert.deepEqual(
    await fileTextsBelow(fixture.admitted.admissionRoot, (path) => path.includes('/local-process-terminal/')),
    processStateAfterFailure,
  );
});

test('caller runner components and direct Godskills input fail at the host boundary', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'closed-input');
  for (const injected of [
    { bindingInput: {} },
    { routingTransport: {} },
    { activationTransport: {} },
    { activationResult: {} },
    { typedMethod: {} },
    { runnerFactory: () => {} },
    { io: { readFile: async () => Buffer.from('forged') } },
    { compositionIo: { readFile: async () => Buffer.from('forged') } },
    { stepperIo: { readFile: async () => Buffer.from('forged') } },
    { processLockOptions: { isProcessAlive: () => false } },
    { admissionLockOptions: { isProcessAlive: () => false } },
    { compilerLockOptions: { isProcessAlive: () => false } },
    { journalLockOptions: { isProcessAlive: () => false } },
    { registryRoot: join(fixture.admitted.root, 'caller-selected-registry') },
    { clock: () => '2026-09-01T00:00:00.000Z' },
    { processClock: () => '2026-09-01T00:00:00.000Z' },
    { processCheckpoint: async () => {} },
    { admissionCheckpoint: async () => {} },
    { compilerCheckpoint: async () => {} },
    { journalCheckpoint: async () => {} },
    { artifactCache: new Map() },
  ]) {
    const observed = [];
    await assert.rejects(
      launchAdmittedSealedTypedExecutionMission({
        ...fixture.common,
        request: fixture.request,
        executors: liveTypedExecutors(observed),
        ...injected,
      }),
      (error) => error instanceof AdmittedTypedExecutionHostError && error.code === 'input-invalid',
    );
    assert.deepEqual(observed, []);
  }
});

test('a repinned policy and executor set cannot recover durable work from an older binding', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'policy-replay');
  const firstObserved = [];
  const first = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(firstObserved),
  });
  assert.deepEqual(firstObserved.map(({ capabilityId }) => capabilityId), [
    'eternities-muse',
    'eternities-forge',
  ]);

  fixture.policy.runtime.executors = fixture.policy.runtime.executors.map((descriptor) => ({
    ...descriptor,
    executorId: `${descriptor.executorId}:repinned`,
  }));
  await writeFile(fixture.policyPath, `${canonicalJson(fixture.policy)}\n`, 'utf8');
  const secondObserved = [];
  const executors = liveTypedExecutors(secondObserved).map((executor) => {
    const descriptor = executor.descriptor();
    return {
      ...executor,
      descriptor: () => ({ ...descriptor, executorId: `${descriptor.executorId}:repinned` }),
    };
  });
  const second = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    env: { GODAGENT_TYPED_EXECUTION_POLICY_SHA256: sha256Text(canonicalJson(fixture.policy)) },
    request: fixture.request,
    executors,
  });
  assert.deepEqual(secondObserved.map(({ capabilityId }) => capabilityId), [
    'eternities-muse',
    'eternities-forge',
  ]);
  assert.notEqual(second.receipt.executionBindingDigest, first.receipt.executionBindingDigest);
  assert.notEqual(second.receipt.receiptDigest, first.receipt.receiptDigest);
});

async function fileTextsBelow(root, select = () => true) {
  const rows = [];
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const logicalPath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(path, logicalPath);
      else if (select(logicalPath)) rows.push({ path: logicalPath, text: await readFile(path, 'utf8') });
    }
  }
  await visit(root);
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

test('credential-shaped executor output is rejected before durable publication', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'credential-output');
  const fields = [
    'secret', 'x-api-key', 'apiToken', 'oauthToken', 'sessionToken',
    'sessionCookie', 'proxyAuthorization', 'authorizationHeader', 'accessTokens',
    'privateKeys', 'passwords', 'tokens', 'auth', 'basicAuth', 'authHeader',
    'authentication',
  ];
  for (const field of fields) {
    const executors = liveTypedExecutors().map((executor) => {
      if (executor.descriptor().capabilityId !== 'eternities-forge') return executor;
      return {
        ...executor,
        execute: async (input) => {
          const output = await executor.execute(input);
          output.slots.implementation[field] = `must-not-persist-${field}`;
          return output;
        },
      };
    });
    await assert.rejects(
      launchAdmittedSealedTypedExecutionMission({
        ...fixture.common,
        request: fixture.request,
        executors,
      }),
      (error) => error instanceof AdmittedTypedExecutionHostError && error.code === 'launch-failed',
      field,
    );
  }
  const nestedExecutors = liveTypedExecutors().map((executor) => {
    if (executor.descriptor().capabilityId !== 'eternities-forge') return executor;
    return {
      ...executor,
      execute: async (input) => {
        const output = await executor.execute(input);
        output.slots.implementation['visual-system'] = { tokens: ['credential-canary'] };
        return output;
      },
    };
  });
  await assert.rejects(
    launchAdmittedSealedTypedExecutionMission({
      ...fixture.common,
      request: fixture.request,
      executors: nestedExecutors,
    }),
    (error) => error instanceof AdmittedTypedExecutionHostError && error.code === 'launch-failed',
    'nested visual-system tokens',
  );
  const durableFiles = await fileTextsBelow(fixture.admitted.admissionRoot, (path) => path.endsWith('.json'));
  assert.equal(durableFiles.some(({ text }) => text.includes('must-not-persist')), false);
});

test('executor output is snapshotted once before screening and durable publication', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'credential-output-getter');
  let reads = 0;
  const executors = liveTypedExecutors().map((executor) => {
    if (executor.descriptor().capabilityId !== 'eternities-forge') return executor;
    return {
      ...executor,
      execute: async (input) => {
        const output = await executor.execute(input);
        const safe = output.slots.implementation;
        Object.defineProperty(output.slots, 'implementation', {
          configurable: true,
          enumerable: true,
          get() {
            reads += 1;
            return reads === 1 ? safe : { ...safe, secret: 'late-accessor-secret' };
          },
        });
        return output;
      },
    };
  });
  const result = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors,
  });
  assert.equal(result.status, 'completed');
  assert.equal(reads, 1);
  const durableFiles = await fileTextsBelow(fixture.admitted.admissionRoot, (path) => path.endsWith('.json'));
  assert.equal(durableFiles.some(({ text }) => text.includes('late-accessor-secret')), false);
});

test('policy request topology executor and release drift fail before child or node execution', async (t) => {
  const cases = [
    {
      suffix: 'pin-drift',
      code: 'policy-integrity',
      mutate: async (fixture, args) => {
        args.env = { GODAGENT_TYPED_EXECUTION_POLICY_SHA256: '0'.repeat(64) };
      },
    },
    {
      suffix: 'path-drift',
      code: 'policy-mismatch',
      mutate: async (fixture, args) => {
        fixture.policy.runtime.distributionDir = 'foreign-distribution';
        await writeFile(fixture.policyPath, `${canonicalJson(fixture.policy)}\n`, 'utf8');
        args.env = { GODAGENT_TYPED_EXECUTION_POLICY_SHA256: sha256Text(canonicalJson(fixture.policy)) };
      },
    },
    {
      suffix: 'authority-drift',
      code: 'request-invalid',
      mutate: async (_fixture, args) => {
        args.request = structuredClone(args.request);
        args.request.missionRequest.requestedAuthority.push('realm:write');
        args.request.missionRequest.requestedAuthority.sort();
      },
    },
    {
      suffix: 'executor-drift',
      code: 'dependency-mismatch',
      mutate: async (_fixture, args) => {
        const descriptor = args.executors[0].descriptor();
        args.executors[0] = {
          ...args.executors[0],
          descriptor: () => ({ ...descriptor, executorId: 'fixture:changed-forge' }),
        };
      },
    },
    {
      suffix: 'topology-drift',
      code: 'dependency-mismatch',
      mutate: async (_fixture, args) => {
        args.request = structuredClone(args.request);
        args.request.topology.nodes[0].capabilityId = 'eternities-architect';
      },
    },
    {
      suffix: 'stepper-drift',
      code: 'dependency-mismatch',
      mutate: async (fixture, args) => {
        fixture.policy.runtime.typedExecutionStepperRelease.releaseReceipt.receiptDigest = '0'.repeat(64);
        await writeFile(fixture.policyPath, `${canonicalJson(fixture.policy)}\n`, 'utf8');
        args.env = { GODAGENT_TYPED_EXECUTION_POLICY_SHA256: sha256Text(canonicalJson(fixture.policy)) };
      },
    },
  ];
  for (const row of cases) {
    const fixture = await admittedTypedExecutionHostFixture(t, row.suffix);
    const observed = [];
    const args = {
      ...fixture.common,
      request: fixture.request,
      executors: liveTypedExecutors(observed),
    };
    await row.mutate(fixture, args);
    await assert.rejects(
      launchAdmittedSealedTypedExecutionMission(args),
      (error) => error instanceof AdmittedTypedExecutionHostError && error.code === row.code,
      row.suffix,
    );
    assert.deepEqual(observed, [], row.suffix);
    await assert.rejects(
      access(join(fixture.admitted.admissionRoot, 'vessel', 'sealed-typed-execution-v1')),
      (error) => error?.code === 'ENOENT',
      row.suffix,
    );
  }
});
