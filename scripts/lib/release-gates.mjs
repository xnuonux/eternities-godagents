import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { runTests } from './certification-support.mjs';

const execFileAsync = promisify(execFile);
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const MAX_PATH_LENGTH = 256;

export const CERTIFICATION_RELEASE_GATE_PROTOCOL_ID = 'eternities-certification-release-gates-v1';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assertFocusedTestFile(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_PATH_LENGTH
      || /[\0\r\n]/.test(value) || value.includes('\\') || value.includes('..')
      || !/^tests\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.test\.mjs$/.test(value)) {
    throw new TypeError('certification test file path is invalid');
  }
}

export function buildReleaseGatePlan({ certificationTestFile } = {}) {
  assertFocusedTestFile(certificationTestFile);
  return deepFreeze({
    protocolId: CERTIFICATION_RELEASE_GATE_PROTOCOL_ID,
    mode: 'direct-verifiers-after-final-receipt',
    steps: [
      { kind: 'focused-test', files: [certificationTestFile] },
      { kind: 'direct-verifier', script: 'src/certification/verify-ledger.mjs' },
      { kind: 'direct-verifier', script: 'src/certification/verify-release-lineage.mjs' },
    ],
    forbiddenRepeatedSuites: [
      'tests/certification-ledger.test.mjs',
      'tests/release-lineage.test.mjs',
    ],
  });
}

function cleanGitEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  return environment;
}

function localPath(value) {
  return resolve(value instanceof URL ? fileURLToPath(value) : value);
}

function parseVerifierOutput(stdout, script) {
  let value;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`${script} did not emit one JSON result`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.status !== 'verified') {
    throw new Error(`${script} did not verify`);
  }
  return value;
}

function verifyLedgerResult(value, script) {
  const receiptCount = Array.isArray(value.receipts) ? value.receipts.length : 0;
  if (receiptCount < 1 || !DIGEST.test(value.ledgerDigest ?? '')) {
    throw new Error(`${script} returned invalid verification evidence`);
  }
  return {
    script,
    status: value.status,
    receiptCount,
    ledgerDigest: value.ledgerDigest,
  };
}

function verifyLineageResult(value, ledger, script) {
  if (!COMMIT.test(value.headCommit ?? '') || !Number.isSafeInteger(value.receiptCount)
      || value.receiptCount !== ledger.receiptCount || value.ledgerDigest !== ledger.ledgerDigest
      || !DIGEST.test(value.releaseLineageDigest ?? '')) {
    throw new Error(`${script} returned evidence inconsistent with the ledger`);
  }
  return {
    script,
    status: value.status,
    headCommit: value.headCommit,
    receiptCount: value.receiptCount,
    ledgerDigest: value.ledgerDigest,
    releaseLineageDigest: value.releaseLineageDigest,
  };
}

async function runDirectVerifier(root, script) {
  const { stdout } = await execFileAsync(process.execPath, [script], {
    cwd: root,
    windowsHide: true,
    env: cleanGitEnvironment(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseVerifierOutput(stdout, script);
}

export async function runReleaseGates({ root, certificationTestFile } = {}) {
  const repositoryRoot = localPath(root);
  const plan = buildReleaseGatePlan({ certificationTestFile });
  const focused = await runTests(plan.steps[0].files, repositoryRoot);
  const ledgerRaw = await runDirectVerifier(repositoryRoot, plan.steps[1].script);
  const ledger = verifyLedgerResult(ledgerRaw, plan.steps[1].script);
  const lineageRaw = await runDirectVerifier(repositoryRoot, plan.steps[2].script);
  const lineage = verifyLineageResult(lineageRaw, ledger, plan.steps[2].script);
  return deepFreeze({
    status: 'pass',
    protocolId: plan.protocolId,
    gateCount: plan.steps.length,
    plan,
    focused,
    directVerifiers: [ledger, lineage],
  });
}
