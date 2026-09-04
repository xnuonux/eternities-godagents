import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  buildCrossRepositoryIssuanceSnapshot,
  verifyCrossRepositoryIssuanceSnapshot,
} from '../src/integration/current-head-certificate.mjs';

const godagentsRoot = 'C:/dev/eternities-godagents';
const godskillsRoot = 'C:/dev/eternities-godskills';
const godagentsCommit = 'ddd1a231f23ca341103009ff648de891527096cb';
const godskillsCommit = '753db46dee767c167ce15ae7eb4129c3a2075689';
const execFileAsync = promisify(execFile);
const refs = Object.freeze({
  godagents: { main: godagentsCommit, originMain: godagentsCommit },
  godskills: { main: godskillsCommit, originMain: godskillsCommit },
});
const testRuns = Object.freeze({
  godagentsFocused: { status: 'pass', tests: 33 },
  godagentsFull: { status: 'pass', tests: 894 },
  godskillsFocused: { status: 'pass', tests: 12 },
});
const adaptiveReviewPin = pinnedGodskillsReviewRelease(godskillsRoot);
let isolatedRootPromise;

async function isolatedGodagentsRoot() {
  if (!isolatedRootPromise) {
    isolatedRootPromise = (async () => {
      const root = await mkdtemp(join(tmpdir(), 'godagents-cross-head-rebind-'));
      await execFileAsync('git', ['clone', '--no-local', godagentsRoot, root], {
        encoding: 'utf8',
        windowsHide: true,
      });
      await execFileAsync('git', ['-C', root, 'update-ref', 'refs/heads/main', godagentsCommit], {
        encoding: 'utf8',
        windowsHide: true,
      });
      await execFileAsync('git', ['-C', root, 'update-ref', 'refs/remotes/origin/main', godagentsCommit], {
        encoding: 'utf8',
        windowsHide: true,
      });
      return root;
    })();
  }
  return isolatedRootPromise;
}

test.after(async () => {
  if (isolatedRootPromise) await rm(await isolatedRootPromise, { recursive: true, force: true });
});

async function certificate() {
  const sourceRoot = await isolatedGodagentsRoot();
  const receipt = await buildCrossRepositoryIssuanceSnapshot({
    godagentsRoot: sourceRoot,
    godskillsRoot,
    godagentsCommit,
    godskillsCommit,
    refs,
    adaptiveReviewPin,
    adaptiveReviewSource: {
      path: 'scripts/lib/pinned-godskills-review-release.mjs',
      sourceCommit: pinnedGodskillsReviewSourceCommit,
    },
    testRuns,
  });
  return { receipt, sourceRoot };
}

function rehash(value) {
  const { receiptDigest: _old, ...unsigned } = value;
  return { ...value, receiptDigest: sha256Value(unsigned) };
}

test('builds and verifies an issuance-time reconciled source snapshot', async () => {
  const { receipt, sourceRoot } = await certificate();
  assert.equal(receipt.status, 'certified-issuance-snapshot');
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.source.godagents.commit, godagentsCommit);
  assert.equal(receipt.source.godskills.commit, godskillsCommit);
  assert.deepEqual(receipt.testRuns, testRuns);
  assert.deepEqual(
    await verifyCrossRepositoryIssuanceSnapshot(receipt, {
      godagentsRoot: sourceRoot,
      godskillsRoot,
      expectedGodagentsCommit: godagentsCommit,
      expectedGodskillsCommit: godskillsCommit,
      requireExactRefs: true,
    }),
    { status: 'verified', receiptDigest: receipt.receiptDigest },
  );
  assert.deepEqual(receipt.godagents.sdk.packageExports, { '.': './src/sdk/index.mjs' });
  assert.deepEqual(receipt.godagents.sdk.rootExports, [
    'GODAGENT_SDK_PROTOCOL_ID',
    'GODAGENT_SDK_VERSION',
    'assertProviderPhaseHostInstance',
    'createAdmittedProviderBackedIdentityLauncher',
    'createProviderPhaseHost',
    'describeGodagentSdk',
    'verifyAdmittedProviderBackedIdentityLauncherDescription',
    'verifyProviderPhaseHostDescription',
  ]);
  assert.equal(receipt.godskills.beacon.snapshot.status, 'frozen-historical-snapshot');
  assert.equal(receipt.godskills.beacon.snapshot.gitCommit, 'de76904685001e7b3cdce7c53ae458425cc0ab37');
  assert.equal(receipt.boundaries.noImplicitActivation.canonicalHostActivation, 'absent');
  assert.equal(receipt.boundaries.noAuthorityExpansion.authorityExpansions, 0);
});

test('fails closed on exact-head, SDK, Beacon, trust-root, boundary, and digest drift', async () => {
  const { receipt: original, sourceRoot } = await certificate();
  const cases = [
    ['outer receipt digest', () => ({ ...original, receiptDigest: '0'.repeat(64) }), /receipt digest/i],
    ['Godagents head expectation', () => original, /Godagents.*head|head.*Godagents/i, { expectedGodagentsCommit: '0'.repeat(40) }],
    ['SDK entrypoint', () => rehash({
      ...structuredClone(original),
      godagents: {
        ...structuredClone(original.godagents),
        sdk: { ...structuredClone(original.godagents.sdk), entrypoint: { ...original.godagents.sdk.entrypoint, sha256: 'f'.repeat(64) } },
      },
    }), /SDK|entrypoint|digest/i],
    ['Beacon snapshot', () => rehash({
      ...structuredClone(original),
      godskills: {
        ...structuredClone(original.godskills),
        beacon: { ...structuredClone(original.godskills.beacon), snapshot: { ...original.godskills.beacon.snapshot, gitCommit: '0'.repeat(40) } },
      },
    }), /Beacon|snapshot|ancestor|commit/i],
    ['adaptive activation trust root', () => rehash({
      ...structuredClone(original),
      godskills: {
        ...structuredClone(original.godskills),
        releaseInputs: {
          ...structuredClone(original.godskills.releaseInputs),
          adaptiveReview: {
            ...structuredClone(original.godskills.releaseInputs.adaptiveReview),
            pin: {
              ...structuredClone(original.godskills.releaseInputs.adaptiveReview.pin),
              activation: {
                ...structuredClone(original.godskills.releaseInputs.adaptiveReview.pin.activation),
                executableReceipt: {
                  ...original.godskills.releaseInputs.adaptiveReview.pin.activation.executableReceipt,
                  sha256: 'e'.repeat(64),
                },
              },
            },
          },
        },
      },
    }), /trust|activation|root|digest/i],
    ['implicit activation assertion', () => rehash({
      ...structuredClone(original),
      boundaries: {
        ...structuredClone(original.boundaries),
        noImplicitActivation: {
          ...original.boundaries.noImplicitActivation,
          canonicalHostActivation: 'enabled',
        },
      },
    }), /implicit|activation|boundary/i],
  ];

  for (const [label, mutate, pattern, options = {}] of cases) {
    await assert.rejects(
      () => verifyCrossRepositoryIssuanceSnapshot(mutate(), {
        godagentsRoot: sourceRoot,
        godskillsRoot,
        expectedGodagentsCommit: godagentsCommit,
        expectedGodskillsCommit: godskillsCommit,
        requireExactRefs: true,
        ...options,
      }),
      pattern,
      label,
    );
  }
});
