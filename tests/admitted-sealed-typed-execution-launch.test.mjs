import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import {
  AdmittedTypedExecutionHostError,
  launchAdmittedSealedTypedExecutionMission,
} from '../src/host/admitted-sealed-typed-execution-launch.mjs';
import {
  admittedTypedExecutionHostFixture,
  liveTypedExecutors,
} from './helpers/admitted-sealed-typed-execution-host-fixture.mjs';

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
  const launches = { route: 0, activation: 0 };
  const firstObserved = [];
  await assert.rejects(
    launchAdmittedSealedTypedExecutionMission({
      ...fixture.common,
      request: fixture.request,
      executors: liveTypedExecutors(firstObserved),
      processCheckpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
      },
      journalCheckpoint: async (name, record) => {
        if (name === 'after-typed-step-persisted' && record.order === 0) {
          throw new Error('simulated admitted typed host process death');
        }
      },
    }),
    (error) => error instanceof AdmittedTypedExecutionHostError && error.code === 'launch-failed',
  );
  assert.deepEqual(launches, { route: 1, activation: 1 });
  assert.deepEqual(firstObserved.map(({ capabilityId }) => capabilityId), ['eternities-muse']);

  const recoveredObserved = [];
  const recovered = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(recoveredObserved),
    processCheckpoint: async (name) => {
      if (name.startsWith('before-local-godskills-')) throw new Error('completed process relaunched');
    },
  });
  assert.deepEqual(recoveredObserved.map(({ capabilityId }) => capabilityId), ['eternities-forge']);
  assert.equal(recovered.execution.execution.recoveredSteps, 1);
  assert.equal(recovered.execution.execution.executedSteps, 1);

  const replayObserved = [];
  const replay = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(replayObserved),
    processCheckpoint: async (name) => {
      if (name.startsWith('before-local-godskills-')) throw new Error('terminal process replay');
    },
  });
  assert.deepEqual(replayObserved, []);
  assert.equal(replay.execution.execution.recoveredSteps, 2);
  assert.equal(replay.execution.execution.executedSteps, 0);
  assert.equal(replay.receipt.receiptDigest, recovered.receipt.receiptDigest);
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
    const launches = [];
    const args = {
      ...fixture.common,
      request: fixture.request,
      executors: liveTypedExecutors(observed),
      processCheckpoint: async (name) => launches.push(name),
    };
    await row.mutate(fixture, args);
    await assert.rejects(
      launchAdmittedSealedTypedExecutionMission(args),
      (error) => error instanceof AdmittedTypedExecutionHostError && error.code === row.code,
      row.suffix,
    );
    assert.deepEqual(observed, [], row.suffix);
    assert.deepEqual(launches, [], row.suffix);
  }
});
