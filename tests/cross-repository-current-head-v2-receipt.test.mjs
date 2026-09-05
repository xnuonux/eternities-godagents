import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildCrossRepositoryCurrentHeadCertificateV2,
  verifyCrossRepositoryCurrentHeadCertificateV2,
} from '../src/integration/current-head-certificate.mjs';
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from '../scripts/lib/pinned-godskills-review-release.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const godskillsRoot = 'C:/dev/eternities-godskills';
const certificatePath = new URL('../integrations/cross-repository-current-head-v2.json', import.meta.url);
const sourceRepositoryRoot = 'C:/dev/eternities-godagents';
const execFileAsync = promisify(execFile);
const certificationDocument = [
  '# cross-repository current-head certificate v2',
  '',
  'this document certifies the adjacent canonical v2 integration artifact.',
  '',
  'protocol: eternities-godagents-cross-repository-current-head-certificate-v2',
  '',
  'it binds exact source commits, refs, manifests, boundary evidence, and test gates.',
  '',
].join('\n');

const temporaryRoots = [];

async function reconciledHead(root, label) {
  const [main, originMain] = await Promise.all([
    git(root, ['rev-parse', 'main']),
    git(root, ['rev-parse', 'origin/main']),
  ]);
  assert.equal(main.stdout.trim(), originMain.stdout.trim(), `${label} refs must be reconciled`);
  return main.stdout.trim();
}

async function committedReceipt() {
  try {
    return JSON.parse(await readFile(certificatePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function buildReceipt() {
  const godagentsCommit = await reconciledHead(repositoryRoot, 'Godagents');
  const godskillsCommit = await reconciledHead(godskillsRoot, 'Godskills');
  return buildCrossRepositoryCurrentHeadCertificateV2({
    godagentsRoot: repositoryRoot,
    godskillsRoot,
    godagentsCommit,
    godskillsCommit,
    refs: {
      godagents: { main: godagentsCommit, originMain: godagentsCommit },
      godskills: { main: godskillsCommit, originMain: godskillsCommit },
    },
    adaptiveReviewPin: pinnedGodskillsReviewRelease(godskillsRoot),
    adaptiveReviewSource: {
      path: 'scripts/lib/pinned-godskills-review-release.mjs',
      sourceCommit: pinnedGodskillsReviewSourceCommit,
    },
    testRuns: {
      godagentsFocused: { status: 'pass', tests: 26 },
      godagentsFull: { status: 'pass', tests: 978 },
      godskillsFocused: { status: 'pass', tests: 12 },
    },
  });
}

async function git(root, args) {
  return execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

async function appendOnlyRoot(receipt) {
  const sourceCommit = receipt.source.godagents.commit;
  const root = await mkdtemp(join(tmpdir(), 'godagents-current-head-v2-'));
  temporaryRoots.push(root);
  await execFileAsync('git', ['clone', '--no-local', sourceRepositoryRoot, root], {
    encoding: 'utf8',
    windowsHide: true,
  });
  await git(root, ['checkout', '--detach', sourceCommit]);
  await git(root, ['update-ref', 'refs/heads/main', sourceCommit]);
  await git(root, ['update-ref', 'refs/remotes/origin/main', sourceCommit]);
  await writeFile(
    join(root, 'integrations', 'cross-repository-current-head-v2.json'),
    `${canonicalJson(receipt)}\n`,
    'utf8',
  );
  await writeFile(
    join(root, 'docs', 'cross-repository-current-head-v2-certification.md'),
    certificationDocument,
    'utf8',
  );
  await git(root, ['add', 'integrations/cross-repository-current-head-v2.json', 'docs/cross-repository-current-head-v2-certification.md']);
  await git(root, [
    '-c', 'user.name=godagents-test',
    '-c', 'user.email=godagents-test@invalid',
    'commit', '-m', 'certify: append current-head v2 artifact',
  ]);
  const { stdout } = await git(root, ['rev-parse', 'HEAD']);
  const tip = stdout.trim();
  await git(root, ['update-ref', 'refs/heads/main', tip]);
  await git(root, ['update-ref', 'refs/remotes/origin/main', tip]);
  return root;
}

test.after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test('the committed v2 certificate is canonical and verifies against both current heads when present', async () => {
  const text = await (async () => {
    try {
      return await readFile(certificatePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    }
  })();
  if (text === undefined) return;
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.equal(receipt.receiptDigest, sha256Value(Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== 'receiptDigest'),
  )));
  assert.deepEqual(
    await verifyCrossRepositoryCurrentHeadCertificateV2(receipt, {
      godagentsRoot: repositoryRoot,
      godskillsRoot,
      expectedGodagentsCommit: receipt.source.godagents.commit,
      expectedGodskillsCommit: receipt.source.godskills.commit,
      requireExactRefs: true,
    }),
    { status: 'verified', receiptDigest: receipt.receiptDigest },
  );
});

test('the committed v2 certificate binds the exact current heads and portable receipt when present', async () => {
  const receipt = await committedReceipt();
  if (receipt === undefined) return;
  assert.equal(receipt.status, 'certified');
  assert.match(receipt.source.godagents.commit, /^[a-f0-9]{40}$/);
  assert.match(receipt.source.godskills.commit, /^[a-f0-9]{40}$/);
  assert.equal(receipt.godagents.evidence.portablePhaseHost.certificationId, 'portable-phase-host-conformance-v1');
  assert.equal(receipt.godagents.evidence.portablePhaseHost.sourceCommit, '6680b64cf8c820e04a0045e445956f2c13e8afdf');
  assert.equal(receipt.godagents.evidence.portableRealmConsequenceSdk.certificationId, 'portable-realm-consequence-sdk-v1');
  assert.equal(receipt.godagents.evidence.portableRealmConsequenceSdk.sourceCommit, 'a0ebffe1373cd3af06b0aec8a392724d939e49b0');
  assert.equal(receipt.godagents.evidence.portableRealmConsequenceSdk.fullTests, 948);
  assert.deepEqual(receipt.testRuns, {
    godagentsFocused: { status: 'pass', tests: 26 },
    godagentsFull: { status: 'pass', tests: 978 },
    godskillsFocused: { status: 'pass', tests: 12 },
  });
});

test('strict v2 verification accepts only an artifact-and-certification append', async () => {
  const receipt = await committedReceipt() ?? await buildReceipt();
  const root = await appendOnlyRoot(receipt);
  assert.deepEqual(
    await verifyCrossRepositoryCurrentHeadCertificateV2(receipt, {
      godagentsRoot: root,
      godskillsRoot,
      expectedGodagentsCommit: receipt.source.godagents.commit,
      expectedGodskillsCommit: receipt.source.godskills.commit,
      requireExactRefs: true,
    }),
    { status: 'verified', receiptDigest: receipt.receiptDigest },
  );
});

test('strict v2 verification rejects unrelated or extra tip paths', async () => {
  const receipt = await committedReceipt() ?? await buildReceipt();
  const root = await appendOnlyRoot(receipt);
  await writeFile(join(root, 'unrelated-current-head-v2.txt'), 'unrelated\n', 'utf8');
  await git(root, ['add', 'unrelated-current-head-v2.txt']);
  await git(root, [
    '-c', 'user.name=godagents-test',
    '-c', 'user.email=godagents-test@invalid',
    'commit', '-m', 'test: add unrelated tip path',
  ]);
  const { stdout } = await git(root, ['rev-parse', 'HEAD']);
  const tip = stdout.trim();
  await git(root, ['update-ref', 'refs/heads/main', tip]);
  await git(root, ['update-ref', 'refs/remotes/origin/main', tip]);
  await assert.rejects(
    () => verifyCrossRepositoryCurrentHeadCertificateV2(receipt, {
      godagentsRoot: root,
      godskillsRoot,
      expectedGodagentsCommit: receipt.source.godagents.commit,
      expectedGodskillsCommit: receipt.source.godskills.commit,
      requireExactRefs: true,
    }),
    /ref|certificate|append|tip|path|drift/i,
  );
});
