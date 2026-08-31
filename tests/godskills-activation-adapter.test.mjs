import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';

async function adapterModule() {
  try {
    return await import('../src/skills/activation-adapter.mjs');
  } catch (error) {
    assert.fail(`Godskills activation adapter is unavailable: ${error.message}`);
  }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';
const trustRootDigest = 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7';

function verifiedActivation(overrides = {}) {
  return {
    protocolId: 'eternities-godskills-activation-v1',
    trustRootDigest,
    root: 'C:/dev/eternities-godskills',
    executableReceipt: {
      path: 'receipts/adaptive-activation-executable-v1.json',
      sha256: '98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f',
      receiptDigest: trustRootDigest,
    },
    entrypoint: {
      path: 'scripts/activation.mjs',
      sha256: 'e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a',
      absolutePath: 'C:/dev/eternities-godskills/scripts/activation.mjs',
    },
    policy: {
      path: 'policies/adaptive-activation.v1.json',
      sha256: 'b87bbfaddecb42417e57202173220bf240204d27b7de5fffc9e609eb18138939',
      logicalDigest: policyDigest,
    },
    evidence: {
      path: 'artifacts/adaptive-activation/evidence.v1.json',
      sha256: 'b55a5cb4f7ff039cc7f4027c165b2f151bad723d9030913076a4225342fbe8c5',
      logicalDigest: evidenceDigest,
    },
    ...overrides,
  };
}

function mission(overrides = {}) {
  return {
    requestId: 'mission-activation-1',
    text: 'design and verify the bounded capability adapter',
    explicitMethodRequests: ['eternities-aegis'],
    ignoredSecret: 'must-not-reach-classification-or-activation',
    ...overrides,
  };
}

function selected() {
  return [
    { id: 'eternities-muse', entrypointSha256: '1'.repeat(64), contractSha256: '2'.repeat(64) },
    { id: 'eternities-aegis', entrypointSha256: '3'.repeat(64), contractSha256: '4'.repeat(64) },
  ];
}

function authority(overrides = {}) {
  return {
    availableAuthority: ['local-read', 'realm:write'],
    permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['realm-observed'],
    maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 4096,
    ...overrides,
  };
}

function classification(overrides = {}) {
  return {
    taskClass: 'implementation',
    consequenceClass: 'consequential',
    reviewAvailable: true,
    ...overrides,
  };
}

function decisionFor(request, index, overrides = {}) {
  const mode = overrides.mode ?? (request.selected[index].explicitMethodRequest ? 'method' : 'guardrail');
  const disclosure = { native: 'none', guardrail: 'guardrails-only', method: 'entrypoint-and-contract', review: 'none' };
  const unsigned = {
    schemaVersion: 1,
    selectedId: request.selected[index].selectedId,
    taskClass: request.classification.taskClass,
    consequenceClass: request.classification.consequenceClass,
    mode,
    reasonCodes: mode === 'method' ? ['explicit-method-request'] : ['consequence-guardrails'],
    preInferenceDisclosure: disclosure[mode],
    deferredReview: mode === 'review',
    methodEvidence: {
      eligible: false,
      matchedEvaluations: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winRate: 0,
      criticalRegressions: 0,
      overheadRatio: null,
      failedGates: ['reviewed-task-class-evidence'],
    },
    policyDigest,
    evidenceDigest,
    authorityProjection: structuredClone(request.authorityProjection),
    authorityExpanded: false,
    ...overrides,
  };
  delete unsigned.decisionDigest;
  return { ...unsigned, decisionDigest: sha256(canonicalJson(unsigned)) };
}

function resultFor(request, overrides = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: request.protocolId,
    requestId: request.requestId,
    requestDigest: sha256(canonicalJson(request)),
    trustRootDigest: request.trustRootDigest,
    policyDigest,
    evidenceDigest,
    classification: structuredClone(request.classification),
    decisions: request.selected.map((_, index) => decisionFor(request, index)),
    ...overrides,
  };
  delete unsigned.resultDigest;
  return { ...unsigned, resultDigest: sha256(canonicalJson(unsigned)) };
}

function resignResult(result) {
  const unsigned = structuredClone(result);
  delete unsigned.resultDigest;
  return { ...unsigned, resultDigest: sha256(canonicalJson(unsigned)) };
}

async function createAdapter({ classifier, transport, activation = verifiedActivation() } = {}) {
  const { createGodskillsActivationAdapter } = await adapterModule();
  return createGodskillsActivationAdapter({
    verifiedActivation: activation,
    classifier: classifier ?? (() => classification()),
    transport: transport ?? ((request) => resultFor(request)),
  });
}

test('minimizes and freezes classification input, then builds one exact ordered request', async () => {
  let classified;
  let transported;
  const adapter = await createAdapter({
    classifier(input) {
      classified = input;
      assert.equal(Object.isFrozen(input), true);
      assert.equal(Object.isFrozen(input.mission), true);
      assert.equal(Object.isFrozen(input.selected), true);
      assert.throws(() => { input.selected.push({ id: 'forged' }); }, TypeError);
      return classification();
    },
    transport(request) {
      transported = request;
      return resultFor(request);
    },
  });
  const binding = await adapter.compile({ mission: mission(), selected: selected(), authority: authority() });

  assert.deepEqual(classified, {
    mission: { requestId: 'mission-activation-1', text: 'design and verify the bounded capability adapter' },
    selected: [{ id: 'eternities-muse' }, { id: 'eternities-aegis' }],
  });
  assert.deepEqual(Object.keys(transported).sort(), [
    'authorityProjection', 'classification', 'protocolId', 'requestId', 'schemaVersion', 'selected', 'trustRootDigest',
  ].sort());
  assert.match(transported.requestId, /^godagent-activation-[a-f0-9]{64}$/);
  assert.deepEqual(transported.selected, [
    { selectedId: 'eternities-muse', explicitMethodRequest: false },
    { selectedId: 'eternities-aegis', explicitMethodRequest: true },
  ]);
  assert.deepEqual(transported.authorityProjection, authority());
  assert.equal(transported.trustRootDigest, trustRootDigest);
  assert.deepEqual(binding, resultFor(transported));
  assert.equal(Object.isFrozen(binding), true);
});

test('rejects mode-bearing, authority-bearing, unknown, and invalid classifier output before transport', async () => {
  const invalid = [
    classification({ mode: 'method' }),
    classification({ authority: ['realm:admin'] }),
    classification({ unexpected: true }),
    classification({ taskClass: 'invented' }),
    classification({ consequenceClass: 'catastrophic' }),
    classification({ reviewAvailable: 'yes' }),
  ];
  for (const output of invalid) {
    let transportCalls = 0;
    const adapter = await createAdapter({
      classifier: () => output,
      transport: () => { transportCalls += 1; },
    });
    await assert.rejects(
      adapter.compile({ mission: mission(), selected: selected(), authority: authority() }),
      /classification/i,
    );
    assert.equal(transportCalls, 0);
  }
});

test('rejects explicit method requests outside the selected set before classification', async () => {
  let classifierCalls = 0;
  const adapter = await createAdapter({ classifier: () => { classifierCalls += 1; return classification(); } });
  await assert.rejects(
    adapter.compile({
      mission: mission({ explicitMethodRequests: ['eternities-oracle'] }),
      selected: selected(),
      authority: authority(),
    }),
    /explicit method.*selected/i,
  );
  assert.equal(classifierCalls, 0);
});

test('validates every compiler identity, digest, order, authority, and disclosure boundary', async () => {
  const mutations = [
    ['request digest', (result) => { result.requestDigest = '0'.repeat(64); }],
    ['trust root', (result) => { result.trustRootDigest = '0'.repeat(64); }],
    ['policy', (result) => {
      result.policyDigest = '0'.repeat(64);
      result.decisions.forEach((decision, index) => {
        result.decisions[index] = decisionFor({
          selected: [{ selectedId: decision.selectedId, explicitMethodRequest: false }],
          classification: result.classification,
          authorityProjection: decision.authorityProjection,
        }, 0, { policyDigest: result.policyDigest });
      });
    }],
    ['evidence', (result) => { result.evidenceDigest = '0'.repeat(64); }],
    ['classification echo', (result) => { result.classification.taskClass = 'research'; }],
    ['selected order', (result) => { result.decisions.reverse(); }],
    ['authority', (result) => {
      result.decisions[0] = decisionFor({
        selected: [{ selectedId: result.decisions[0].selectedId, explicitMethodRequest: false }],
        classification: result.classification,
        authorityProjection: authority({ contextBudget: 8192 }),
      }, 0);
    }],
    ['decision digest', (result) => { result.decisions[0].decisionDigest = '0'.repeat(64); }],
    ['aggregate digest', (result) => { result.resultDigest = '0'.repeat(64); }],
    ['unknown field', (result) => { result.unexpected = true; }],
    ['overflow', (result) => {
      result.decisions.push(
        { ...result.decisions[0], selectedId: 'fourth-capability' },
        { ...result.decisions[0], selectedId: 'fifth-capability' },
      );
    }],
    ['mode disclosure', (result) => {
      result.decisions[0] = decisionFor({
        selected: [{ selectedId: result.decisions[0].selectedId, explicitMethodRequest: false }],
        classification: result.classification,
        authorityProjection: result.decisions[0].authorityProjection,
      }, 0, { mode: 'method', preInferenceDisclosure: 'none' });
    }],
    ['authority expansion', (result) => {
      result.decisions[0] = decisionFor({
        selected: [{ selectedId: result.decisions[0].selectedId, explicitMethodRequest: false }],
        classification: result.classification,
        authorityProjection: result.decisions[0].authorityProjection,
      }, 0, { authorityExpanded: true });
    }],
  ];

  for (const [name, mutate] of mutations) {
    const adapter = await createAdapter({
      transport(request) {
        let result = resultFor(request);
        mutate(result);
        if (name !== 'aggregate digest' && name !== 'unknown field') result = resignResult(result);
        return result;
      },
    });
    await assert.rejects(
      adapter.compile({ mission: mission(), selected: selected(), authority: authority() }),
      /activation|classification|authority|decision|digest|disclosure|fields|count|order|policy|evidence|trust/i,
      name,
    );
  }
});

test('rehydrates without classifier or transport and rejects every changed binding input', async () => {
  let classifierCalls = 0;
  let transportCalls = 0;
  const adapter = await createAdapter({
    classifier: () => { classifierCalls += 1; return classification(); },
    transport: (request) => { transportCalls += 1; return resultFor(request); },
  });
  const inputs = { mission: mission(), selected: selected(), authority: authority() };
  const binding = await adapter.compile(inputs);
  assert.equal(classifierCalls, 1);
  assert.equal(transportCalls, 1);
  assert.deepEqual(adapter.rehydrate({ binding, ...inputs }), binding);
  assert.equal(classifierCalls, 1);
  assert.equal(transportCalls, 1);

  const attacks = [
    ['mission', { ...inputs, mission: mission({ text: 'changed mission' }) }],
    ['selected artifact', { ...inputs, selected: selected().map((row, index) => index === 0 ? { ...row, entrypointSha256: '9'.repeat(64) } : row) }],
    ['explicit request', { ...inputs, mission: mission({ explicitMethodRequests: [] }) }],
    ['authority', { ...inputs, authority: authority({ contextBudget: 2048 }) }],
  ];
  for (const [name, changed] of attacks) {
    assert.throws(() => adapter.rehydrate({ binding, ...changed }), /activation|request|digest|identity/i, name);
  }

  const changedTrustAdapter = await createAdapter({
    activation: verifiedActivation({ trustRootDigest: 'f'.repeat(64) }),
  });
  assert.throws(() => changedTrustAdapter.rehydrate({ binding, ...inputs }), /trust root/i);

  const tampered = structuredClone(binding);
  tampered.decisions[0].mode = 'method';
  assert.throws(() => adapter.rehydrate({ binding: tampered, ...inputs }), /decision|digest|disclosure/i);
});

test('local transport executes the verified Godskills process with a minimal environment', async () => {
  const { createGodskillsActivationAdapter, createLocalGodskillsActivationTransport } = await adapterModule();
  const transport = createLocalGodskillsActivationTransport({ verifiedActivation: verifiedActivation() });
  const adapter = createGodskillsActivationAdapter({
    verifiedActivation: verifiedActivation(),
    classifier: () => classification(),
    transport,
  });
  const binding = await adapter.compile({ mission: mission(), selected: selected(), authority: authority() });
  assert.equal(binding.decisions.length, 2);
  assert.equal(binding.decisions[0].mode, 'guardrail');
  assert.equal(binding.decisions[1].mode, 'method');
});

async function processFixture(t, body, name) {
  const root = await mkdtemp(join(tmpdir(), `godagent-activation-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = join(root, 'scripts');
  const receipts = join(root, 'receipts');
  await mkdir(scripts, { recursive: true });
  await mkdir(receipts, { recursive: true });
  const entrypoint = join(scripts, 'activation.mjs');
  const receipt = join(receipts, 'activation.json');
  const marker = join(root, 'workspace-marker.txt');
  await writeFile(receipt, '{}\n', 'utf8');
  await writeFile(entrypoint, body(marker), 'utf8');
  return {
    root,
    marker,
    activation: verifiedActivation({
      root,
      executableReceipt: { path: 'receipts/activation.json', sha256: 'a'.repeat(64), receiptDigest: trustRootDigest },
      entrypoint: { path: 'scripts/activation.mjs', sha256: 'b'.repeat(64), absolutePath: entrypoint },
    }),
  };
}

const fixturePrelude = (marker) => `
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) values.set(process.argv[index], process.argv[index + 1]);
await writeFile(${JSON.stringify(marker)}, dirname(values.get('--request')), 'utf8');
`;

async function assertWorkspaceRemoved(marker) {
  const workspace = await readFile(marker, 'utf8');
  await assert.rejects(access(workspace), /ENOENT/i);
}

test('local transport bounds environment and removes its workspace after success', async (t) => {
  const fixture = await processFixture(t, (marker) => `${fixturePrelude(marker)}
await writeFile(values.get('--output'), JSON.stringify({ environment: process.env }), 'utf8');
`, 'environment');
  const priorSecret = process.env.GODAGENT_ACTIVATION_SECRET_CANARY;
  const priorNodeOptions = process.env.NODE_OPTIONS;
  process.env.GODAGENT_ACTIVATION_SECRET_CANARY = 'must-not-cross';
  process.env.NODE_OPTIONS = '--trace-warnings';
  try {
    const { createLocalGodskillsActivationTransport } = await adapterModule();
    const transport = createLocalGodskillsActivationTransport({ verifiedActivation: fixture.activation });
    const result = await transport({ fixture: true });
    assert.equal(result.environment.GODAGENT_ACTIVATION_SECRET_CANARY, undefined);
    assert.equal(result.environment.NODE_OPTIONS, undefined);
    assert.deepEqual(
      Object.keys(result.environment).filter((name) => !['SystemRoot', 'WINDIR'].includes(name)),
      [],
    );
    await assertWorkspaceRemoved(fixture.marker);
  } finally {
    if (priorSecret === undefined) delete process.env.GODAGENT_ACTIVATION_SECRET_CANARY;
    else process.env.GODAGENT_ACTIVATION_SECRET_CANARY = priorSecret;
    if (priorNodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = priorNodeOptions;
  }
});

test('local transport rejects process failure, timeout, missing, oversized, and invalid output with cleanup', async (t) => {
  const fixtures = [
    ['nonzero', (marker) => `${fixturePrelude(marker)}\nprocess.exitCode = 7;`, {}, /exited|code 7/i],
    ['timeout', (marker) => `${fixturePrelude(marker)}\nawait new Promise((resolve) => setTimeout(resolve, 1000));`, { timeoutMs: 500 }, /timed out/i],
    ['missing', (marker) => `${fixturePrelude(marker)}`, {}, /missing|output/i],
    ['oversized', (marker) => `${fixturePrelude(marker)}\nawait writeFile(values.get('--output'), JSON.stringify({ value: 'x'.repeat(512) }), 'utf8');`, { maximumResultBytes: 64 }, /byte|large|size/i],
    ['invalid', (marker) => `${fixturePrelude(marker)}\nawait writeFile(values.get('--output'), '{', 'utf8');`, {}, /JSON/i],
  ];
  const { createLocalGodskillsActivationTransport } = await adapterModule();
  for (const [name, body, options, pattern] of fixtures) {
    const fixture = await processFixture(t, body, name);
    const transport = createLocalGodskillsActivationTransport({
      verifiedActivation: fixture.activation,
      ...options,
    });
    await assert.rejects(transport({ fixture: name }), pattern, name);
    await assertWorkspaceRemoved(fixture.marker);
  }
});

test('local transport source fixes the child boundary to non-shell hidden execution', async () => {
  const source = await readFile(new URL('../src/skills/activation-adapter.mjs', import.meta.url), 'utf8');
  assert.match(source, /shell:\s*false/);
  assert.match(source, /windowsHide:\s*true/);
  assert.match(source, /env:\s*minimalChildEnvironment\(/);
  assert.doesNotMatch(source, /env:\s*process\.env/);
});
