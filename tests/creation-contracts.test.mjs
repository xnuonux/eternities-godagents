import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  moduleRef,
  parseModuleRef,
  validateModuleContract,
} from '../src/creation/contracts.mjs';
import { loadCreationSources } from '../src/creation/load.mjs';

const creationRoot = new URL('../fixtures/creation/', import.meta.url);
const readFixture = async (name) => JSON.parse(await readFile(new URL(name, creationRoot), 'utf8'));

async function temporarySources() {
  const root = await mkdtemp(join(tmpdir(), 'godagent-creation-'));
  await cp(creationRoot, root, { recursive: true });
  return {
    root,
    candidatePath: join(root, 'creation-candidate.json'),
    policyPath: join(root, 'creation-policy.json'),
    expressionPath: join(root, 'expression-overlay.json'),
    moduleDirectory: join(root, 'modules'),
  };
}

async function rewriteJson(path, mutate) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, `${JSON.stringify(mutate(value), null, 2)}\n`, 'utf8');
}

test('every module kind closes its payload and canonical reference', async () => {
  const kinds = ['lineage', 'archetype', 'attributes', 'personality', 'voice', 'organs', 'godskills', 'cortex', 'embodiment'];

  for (const kind of kinds) {
    const module = await readFixture(`modules/${kind}.json`);
    const validated = validateModuleContract(module);
    const ref = moduleRef(validated);
    assert.equal(parseModuleRef(ref).kind, kind);
    assert.equal(moduleRef(parseModuleRef(ref)), ref);
    assert.equal(Object.isFrozen(validated), true);
    assert.equal(Object.isFrozen(validated.payload), true);
  }
});

test('module contracts reject unknown payload keys and authority-shaped data', async () => {
  const module = await readFixture('modules/lineage.json');

  assert.throws(() => validateModuleContract({
    ...module,
    payload: { ...module.payload, allowedEffects: ['realm.admin'] },
  }), /forbidden module key allowedEffects/);
  assert.throws(() => validateModuleContract({
    ...module,
    payload: { ...module.payload, nested: { credentialEnv: 'SECRET' } },
  }), /forbidden module key credentialEnv/);
  assert.throws(() => validateModuleContract({
    ...module,
    payload: { ...module.payload, unknownSetting: true },
  }), /lineage payload key unknownSetting/);
  assert.throws(() => validateModuleContract({
    ...module,
    capabilities: ['realm.admin'],
  }), /forbidden capability token/);
});

test('module references reject ambiguous delimiters and fail round-trip changes', () => {
  assert.throws(() => parseModuleRef('lineage:bad:id@1.0.0'), /invalid module reference/);
  assert.throws(() => parseModuleRef('lineage:valid@1.0.0+build'), /invalid module reference/);
  assert.throws(() => moduleRef({ moduleKind: 'lineage', id: 'bad/id', version: '1.0.0' }), /invalid module id/);
});

test('creation source loading resolves exactly one frozen module per selected kind', async (context) => {
  const paths = await temporarySources();
  context.after(() => rm(paths.root, { recursive: true, force: true }));

  const loaded = await loadCreationSources(paths);
  assert.equal(loaded.modulesByRef.size, 9);
  assert.equal(loaded.policyDigest.length, 64);
  assert.equal(Object.isFrozen(loaded.candidate), true);
  assert.equal(Object.isFrozen(loaded.policy), true);
  assert.equal(Object.isFrozen(loaded.expression), true);
  assert.equal(Object.isFrozen(loaded.modulesByRef), true);
  assert.throws(() => loaded.modulesByRef.clear(), /read-only/);
});

test('creation source loading rejects duplicate refs and missing selections', async (context) => {
  const duplicate = await temporarySources();
  const missing = await temporarySources();
  context.after(() => Promise.all([
    rm(duplicate.root, { recursive: true, force: true }),
    rm(missing.root, { recursive: true, force: true }),
  ]));

  await cp(join(duplicate.moduleDirectory, 'lineage.json'), join(duplicate.moduleDirectory, 'duplicate.json'));
  await assert.rejects(() => loadCreationSources(duplicate), /duplicate module ref/);

  await rm(join(missing.moduleDirectory, 'voice.json'));
  await assert.rejects(() => loadCreationSources(missing), /selected module not found/);
});

test('creation source loading rejects kind and expression identity mismatches', async (context) => {
  const wrongKind = await temporarySources();
  const wrongExpression = await temporarySources();
  context.after(() => Promise.all([
    rm(wrongKind.root, { recursive: true, force: true }),
    rm(wrongExpression.root, { recursive: true, force: true }),
  ]));

  await rewriteJson(wrongKind.candidatePath, (candidate) => ({
    ...candidate,
    moduleRefs: { ...candidate.moduleRefs, lineage: candidate.moduleRefs.archetype },
  }));
  await assert.rejects(() => loadCreationSources(wrongKind), /module kind mismatch/);

  await rewriteJson(wrongExpression.expressionPath, (expression) => ({ ...expression, id: 'other-expression' }));
  await assert.rejects(() => loadCreationSources(wrongExpression), /expression reference mismatch/);
});
