import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { setupAdmittedIdentity } from './helpers/admitted-identity-fixture.mjs';
import {
  executors,
  identityTransport,
  reviewTransport,
  revisionTransport,
  vesselRequest,
} from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

async function factoryModule() {
  try {
    return await import('../src/runtime/sealed-local-identity-bound-mission-vessel.mjs');
  } catch (error) {
    assert.fail(`sealed local identity-bound vessel factory is unavailable: ${error.message}`);
  }
}

function creativeRequest() {
  const request = vesselRequest();
  request.mission.objective = 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  return request;
}

function missionClock() {
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  return () => {
    const current = now;
    now += 600_000;
    return current;
  };
}

function processClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-08-31T22:00:00.000Z') + tick++ * 100).toISOString();
}

function classifier(counter) {
  return () => {
    counter.count += 1;
    return {
      taskClass: 'creative-generation',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    };
  };
}

function operationCalls(calls) {
  return calls.filter(({ type }) => type !== 'descriptor').length;
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

async function admittedFixture(t, name) {
  const admitted = await setupAdmittedIdentity(null, name);
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  return admitted;
}

test('factory requires the complete sealed boundary and returns no filesystem or authority surface', async (t) => {
  const admitted = await admittedFixture(t, 'sealed-local-vessel-contract');
  const { createSealedLocalIdentityBoundMissionVessel } = await factoryModule();
  const native = identityTransport();
  const base = {
    genesisAdmission: admitted.admission,
    runtimeRoot: join(admitted.root, 'sealed-local-runtime'),
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    activationClassifier: () => ({
      taskClass: 'creative-generation',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    }),
    nativeTransport: native.adapter,
  };

  for (const [name, options, pattern] of [
    ['runtime root', { ...base, runtimeRoot: undefined }, /runtime.*root|required/i],
    ['classifier', { ...base, activationClassifier: undefined }, /classifier|required/i],
    ['native transport', { ...base, nativeTransport: undefined }, /native.*transport|required/i],
    ['mission clock', { ...base, clock: null }, /mission.*clock|required/i],
    ['process clock', { ...base, godskillsClock: null }, /process.*clock|required/i],
    ['checkpoint', { ...base, checkpoint: null }, /checkpoint|required/i],
    ['vessel lock options', { ...base, lockOptions: null }, /vessel.*lock.*object/i],
    ['Godskills lock options', { ...base, godskillsLockOptions: null }, /Godskills.*lock.*object/i],
    ['artifact cache', { ...base, artifactCache: new WeakMap() }, /artifact.*cache.*Map/i],
    ['routing root', {
      ...base,
      routingPin: pinnedGodskillsRoutingExecutable({
        executableReceipt: {
          ...pinnedGodskillsRoutingExecutable().executableReceipt,
          receiptDigest: '0'.repeat(64),
        },
      }),
    }, /routing|digest|receipt/i],
    ['activation root', {
      ...base,
      releasePin: (() => {
        const pin = pinnedGodskillsReviewRelease(godskillsRoot);
        delete pin.activation;
        return pin;
      })(),
    }, /activation.*required|activation.*unavailable/i],
  ]) {
    await assert.rejects(createSealedLocalIdentityBoundMissionVessel(options), pattern, name);
  }

  const vessel = await createSealedLocalIdentityBoundMissionVessel(base);
  assert.deepEqual(Object.keys(vessel).sort(), ['localExecution', 'releaseDigest', 'run']);
  assert.equal(typeof vessel.run, 'function');
  assert.match(vessel.releaseDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(vessel), true);
  assert.equal(Object.isFrozen(vessel.localExecution), true);
  assert.deepEqual(Object.keys(vessel.localExecution).sort(), [
    'activationDescriptorDigest',
    'activationTrustRootDigest',
    'routeDescriptorDigest',
    'routeMode',
    'routingTrustRootDigest',
  ]);
  const serialized = canonicalJson({
    releaseDigest: vessel.releaseDigest,
    localExecution: vessel.localExecution,
  });
  assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]|provider|credential|realmHand|continuity|keel|soul/i);
});

test('real route and activation recover into the complete identity-bound review loop without replay work', async (t) => {
  const admitted = await admittedFixture(t, 'sealed-local-vessel-full-loop');
  const { createSealedLocalIdentityBoundMissionVessel } = await factoryModule();
  const root = join(admitted.root, 'sealed-local-runtime');
  const native = identityTransport();
  const review = reviewTransport();
  const revision = revisionTransport();
  const { reviewExecutor, revisionExecutor } = await executors(godskillsRoot, review, revision);
  const classifications = { count: 0 };
  const launches = { route: 0, activation: 0 };
  const clock = missionClock();
  const godskillsClock = processClock();
  let crash = true;
  const common = {
    genesisAdmission: admitted.admission,
    runtimeRoot: root,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    activationClassifier: classifier(classifications),
    nativeTransport: native.adapter,
    reviewExecutor,
    revisionExecutor,
    clock,
    godskillsClock,
  };
  const first = await createSealedLocalIdentityBoundMissionVessel({
    ...common,
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') launches.route += 1;
      if (name === 'before-local-godskills-activation-process') launches.activation += 1;
      if (crash && name === 'after-local-godskills-activation-process') {
        crash = false;
        throw new Error('simulated process death after sealed activation success');
      }
    },
  });
  const request = creativeRequest();
  await assert.rejects(first.run(request), /simulated process death/i);
  assert.deepEqual(launches, { route: 1, activation: 1 });
  assert.equal(classifications.count, 1);

  const recovered = await createSealedLocalIdentityBoundMissionVessel({
    ...common,
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') throw new Error('route must not relaunch');
      if (name === 'before-local-godskills-activation-process') throw new Error('activation must not relaunch');
    },
  });
  const completed = await recovered.run(request);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.mission.verdict.reason, 'revision-review-accepted');
  assert.deepEqual(launches, { route: 1, activation: 1 });
  assert.equal(classifications.count, 2);
  assert.equal(native.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(review.calls.filter(({ type }) => type === 'execute').length, 2);
  assert.equal(revision.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(recovered.localExecution.routeMode, 'default');
  assert.equal(recovered.localExecution.routingTrustRootDigest, '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28');
  assert.equal(recovered.localExecution.activationTrustRootDigest, 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7');

  const files = await allFiles(root);
  assert.equal(files.every((path) => /^(?:godskills|mission-journals|vessel-admissions)\//.test(path)), true);
  assert.equal(files.some((path) => /^godskills\/local-process-terminal\/route\/.+\/success\.json$/.test(path)), true);
  assert.equal(files.some((path) => /^godskills\/local-process-terminal\/activation\/.+\/success\.json$/.test(path)), true);
  const admissionPath = files.find((path) => /^vessel-admissions\/.+\/admission\.json$/.test(path));
  assert.ok(admissionPath);
  const admission = JSON.parse(await readFile(join(root, ...admissionPath.split('/')), 'utf8'));
  assert.equal(admission.godskills.receipt.activation.decisions[0].mode, 'review');
  assert.equal(admission.godskills.receipt.selected[0].id, 'eternities-muse');

  const beforeReplay = {
    route: launches.route,
    activation: launches.activation,
    classifications: classifications.count,
    native: operationCalls(native.calls),
    review: operationCalls(review.calls),
    revision: operationCalls(revision.calls),
  };
  const replay = await recovered.run(request);
  const afterReplay = {
    route: launches.route,
    activation: launches.activation,
    classifications: classifications.count,
    native: operationCalls(native.calls),
    review: operationCalls(review.calls),
    revision: operationCalls(revision.calls),
  };
  assert.deepEqual(replay, completed);
  assert.deepEqual(afterReplay, beforeReplay);
});

test('factory source has no host policy, provider, Realm, continuity, or identity mutation dependency', async () => {
  const source = await readFile(
    new URL('../src/runtime/sealed-local-identity-bound-mission-vessel.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /createLocalRecoverableGodskillsAdapter/);
  assert.match(source, /createIdentityBoundMissionVessel/);
  assert.doesNotMatch(source, /host[\\/]policy|credential|provider|realm|continuity|keel|evolution|inspiration|soul/i);
});
