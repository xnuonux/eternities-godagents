import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_DOCUMENT,
  CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH,
  CROSS_REPOSITORY_CURRENT_HEAD_V2_ARTIFACT_PATH,
  buildCrossRepositoryCurrentHeadCertificateV2,
  verifyCrossRepositoryCurrentHeadCertificateV2,
} from '../src/integration/current-head-certificate.mjs';
import {
  requireCleanExcept,
  runTests,
} from './lib/certification-support.mjs';
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from './lib/pinned-godskills-review-release.mjs';

const execFileAsync = promisify(execFile);
const GODSKILLS_ROOT = resolve(
  process.env.ETERNITIES_GODSKILLS_ROOT ?? 'C:/dev/eternities-godskills',
);
const OUTPUT_PATH = CROSS_REPOSITORY_CURRENT_HEAD_V2_ARTIFACT_PATH;
const LOCAL_WORKSPACE_PATHS = Object.freeze(['package-lock.json']);
const RECEIPT_TEST = 'tests/cross-repository-current-head-v2-receipt.test.mjs';
const PRELIMINARY_GODAGENTS_TESTS = [
  'tests/cross-repository-current-head-v2.test.mjs',
  'tests/mission-economics-ledger.test.mjs',
  'tests/portable-realm-consequence-sdk-certification.test.mjs',
  'tests/portable-realm-consequence-sdk.test.mjs',
  'tests/portable-phase-host-conformance-certification.test.mjs',
  'tests/portable-phase-host-conformance.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/admitted-portable-identity-launcher-certification.test.mjs',
  'tests/admitted-portable-identity-launcher-integration.test.mjs',
  'tests/admitted-portable-identity-launcher.test.mjs',
  'tests/portable-mission-dependencies.test.mjs',
  'tests/mission-program-certification.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/mission-program-forensics-certification.test.mjs',
  'tests/mission-program-forensics.test.mjs',
  'tests/agent-profile-contract.test.mjs',
  'tests/agent-profile-contract-certification.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-operation-adapter-certification.test.mjs',
  'tests/review-mission-operation-adapter.test.mjs',
  'tests/review-mission-operation-adapter-certification.test.mjs',
  'tests/revision-mission-operation-adapter.test.mjs',
  'tests/revision-mission-operation-adapter-certification.test.mjs',
  'tests/delegation-mission-operation-adapter.test.mjs',
  'tests/delegation-mission-operation-adapter-certification.test.mjs',
  'tests/realm-consequence-mission-operation-adapter.test.mjs',
  'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
  'tests/mission-operation-evidence.test.mjs',
  'tests/mission-operation-evidence-certification.test.mjs',
  'tests/mission-forensic-index.test.mjs',
  'tests/mission-forensic-index-certification.test.mjs',
  'tests/portable-phase-host-adversarial.test.mjs',
  'tests/portable-phase-host-adversarial-certification.test.mjs',
];
const FINAL_GODAGENTS_TESTS = [...PRELIMINARY_GODAGENTS_TESTS, RECEIPT_TEST];
const EXPECTED_FINAL_GODAGENTS_TEST_RUNS = Object.freeze({
  focused: { status: 'pass', tests: 129 },
  full: { status: 'pass', tests: 1081 },
});
const GODSKILLS_TESTS = [
  'tests/eternities-beacon-release.test.mjs',
  'tests/godskills-system-v3-certification.test.mjs',
  'tests/intent-compiler-v3-certification.test.mjs',
  'tests/portable-capability-manifest.test.mjs',
];

function cleanGitEnvironment() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}

async function gitRef(repositoryRoot, ref, label) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', ref], {
      encoding: 'utf8',
      windowsHide: true,
      env: cleanGitEnvironment(),
    });
    return stdout.trim();
  } catch {
    throw new Error(`${label} ref could not be resolved`);
  }
}

async function reconciledRefs(repositoryRoot, repository) {
  const [main, originMain] = await Promise.all([
    gitRef(repositoryRoot, 'main', `${repository} main`),
    gitRef(repositoryRoot, 'origin/main', `${repository} origin/main`),
  ]);
  if (main !== originMain) {
    throw new Error(`${repository} main and origin/main are not reconciled`);
  }
  return { main, originMain };
}

function writeReceipt(repositoryRoot, receipt) {
  const outputPath = join(repositoryRoot, OUTPUT_PATH);
  const certificationPath = join(repositoryRoot, CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH);
  return Promise.all([
    mkdir(dirname(outputPath), { recursive: true }),
    mkdir(dirname(certificationPath), { recursive: true }),
  ]).then(() => Promise.all([
    writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8'),
    writeFile(certificationPath, CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_DOCUMENT, 'utf8'),
  ]));
}

async function buildReceipt({ repositoryRoot, godagentsCommit, godskillsCommit, refs, testRuns }) {
  return buildCrossRepositoryCurrentHeadCertificateV2({
    godagentsRoot: repositoryRoot,
    godskillsRoot: GODSKILLS_ROOT,
    godagentsCommit,
    godskillsCommit,
    refs,
    adaptiveReviewPin: pinnedGodskillsReviewRelease(GODSKILLS_ROOT),
    adaptiveReviewSource: {
      path: 'scripts/lib/pinned-godskills-review-release.mjs',
      sourceCommit: pinnedGodskillsReviewSourceCommit,
    },
    testRuns,
  });
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  await requireCleanExcept(repositoryRoot, [
    OUTPUT_PATH,
    CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH,
    ...LOCAL_WORKSPACE_PATHS,
  ]);
  const [godagentsRefs, godskillsRefs] = await Promise.all([
    reconciledRefs(repositoryRoot, 'Godagents'),
    reconciledRefs(GODSKILLS_ROOT, 'Godskills'),
  ]);
  const godagentsCommit = godagentsRefs.main;
  const godskillsCommit = godskillsRefs.main;
  const refs = { godagents: godagentsRefs, godskills: godskillsRefs };
  const godskillsFocused = await runTests(GODSKILLS_TESTS, GODSKILLS_ROOT);

  // The previous artifact may describe an earlier source boundary. Seed the
  // new receipt before any Godagents suite so append-only compatibility tests
  // validate this source head rather than the stale artifact.
  await writeReceipt(repositoryRoot, await buildReceipt({
    repositoryRoot,
    godagentsCommit,
    godskillsCommit,
    refs,
    testRuns: {
      godagentsFocused: EXPECTED_FINAL_GODAGENTS_TEST_RUNS.focused,
      godagentsFull: EXPECTED_FINAL_GODAGENTS_TEST_RUNS.full,
      godskillsFocused,
    },
  }));

  // Both gates use the same checkout and several tests create bounded
  // temporary roots. Run the full suite from the seeded checkout first, then
  // run the focused receipt-aware set so cleanup cannot cross gate boundaries.
  const godagentsFull = await runTests([], repositoryRoot);
  const godagentsFocused = await runTests(FINAL_GODAGENTS_TESTS, repositoryRoot);
  const receipt = await buildReceipt({
    repositoryRoot,
    godagentsCommit,
    godskillsCommit,
    refs,
    testRuns: { godagentsFocused, godagentsFull, godskillsFocused },
  });
  await writeReceipt(repositoryRoot, receipt);
  const verified = await verifyCrossRepositoryCurrentHeadCertificateV2(receipt, {
    godagentsRoot: repositoryRoot,
    godskillsRoot: GODSKILLS_ROOT,
    expectedGodagentsCommit: godagentsCommit,
    expectedGodskillsCommit: godskillsCommit,
    requireExactRefs: true,
  });
  process.stdout.write(`${canonicalJson({
    ...verified,
    status: receipt.status,
    outputPath: join(repositoryRoot, OUTPUT_PATH),
    godagentsCommit,
    godskillsCommit,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
