import assert from 'node:assert/strict';
import test from 'node:test';

import { ReceiptBoundTypedExecutionHostError, launchReceiptBoundAdmittedSealedTypedExecutionMission } from '../src/host/receipt-bound-admitted-sealed-typed-execution-launch.mjs';
import { admittedTypedExecutionHostFixture } from './helpers/admitted-sealed-typed-execution-host-fixture.mjs';
import {
  bindBundleToAdmittedFixture,
  receiptBoundExecutorBundleFixture,
} from './helpers/receipt-bound-typed-executor-bundle-fixture.mjs';

test('one pinned executor bundle completes the admitted Muse-to-Forge graph without caller functions', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'receipt-bound-complete');
  const bundle = await receiptBoundExecutorBundleFixture(t);
  const input = await bindBundleToAdmittedFixture(fixture, bundle);
  const completion = await launchReceiptBoundAdmittedSealedTypedExecutionMission(input);
  assert.equal(completion.status, 'completed');
  assert.equal(completion.receipt.missionId, fixture.request.missionRequest.mission.missionId);
  assert.equal(completion.receipt.authorityExpanded, false);
});

test('closed launcher rejects caller executors and changed bundle pins before execution', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'receipt-bound-closed');
  const bundle = await receiptBoundExecutorBundleFixture(t);
  const input = await bindBundleToAdmittedFixture(fixture, bundle);
  await assert.rejects(
    launchReceiptBoundAdmittedSealedTypedExecutionMission({ ...input, executors: [] }),
    (error) => error instanceof ReceiptBoundTypedExecutionHostError && error.code === 'input-invalid',
  );
  input.env.GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256 = '0'.repeat(64);
  await assert.rejects(
    launchReceiptBoundAdmittedSealedTypedExecutionMission(input),
    (error) => error instanceof ReceiptBoundTypedExecutionHostError && error.code === 'bundle-integrity',
  );
});

test('receipt-bound recovery runs only unfinished Forge and terminal replay runs no executor', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'receipt-bound-recovery');
  const bundle = await receiptBoundExecutorBundleFixture(t, { crashForgeOnce: true });
  const input = await bindBundleToAdmittedFixture(fixture, bundle);
  await assert.rejects(
    launchReceiptBoundAdmittedSealedTypedExecutionMission(input),
    (error) => error?.cause?.message === 'receipt-bound certification crash after persisted Muse output',
  );
  const recovered = await launchReceiptBoundAdmittedSealedTypedExecutionMission(input);
  const replay = await launchReceiptBoundAdmittedSealedTypedExecutionMission(input);
  assert.equal(recovered.status, 'completed');
  assert.deepEqual(replay.receipt, recovered.receipt);
  assert.equal(recovered.execution.execution.executedSteps, 1);
  assert.equal(recovered.execution.execution.recoveredSteps, 1);
  assert.equal(replay.execution.execution.executedSteps, 0);
  assert.equal(replay.execution.execution.recoveredSteps, 2);
});

test('policy descriptors must bind the verified bundle before executor work', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'receipt-bound-policy-mismatch');
  const bundle = await receiptBoundExecutorBundleFixture(t);
  fixture.common.env.GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256 = bundle.expectedSha256;
  await assert.rejects(
    launchReceiptBoundAdmittedSealedTypedExecutionMission({
      admissionRoot: fixture.common.admissionRoot,
      policyPath: fixture.common.policyPath,
      executorBundleRoot: bundle.repositoryRoot,
      executorBundleReceiptPath: bundle.receiptPath,
      request: fixture.request,
      env: fixture.common.env,
    }),
    (error) => error?.code === 'dependency-mismatch',
  );
});
