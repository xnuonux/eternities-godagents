import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { previewOperatorComposition, previewOperatorPreset } from '../src/creator/operator-workflow.mjs';
import { createCreatorWebApp, isPathWithinRoot } from '../src/creator/web/app.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const operatorOptions = {
  policy: new URL('creation/creation-policy.json', fixtureRoot),
  policyDigest: expectedPolicyDigest,
  modules: new URL('creation/modules/', fixtureRoot),
  expressions: new URL('creator/expressions/', fixtureRoot),
  presets: new URL('creator/presets/', fixtureRoot),
};
const token = 'a'.repeat(64);

async function setup(context) {
  const workspace = await mkdtemp(join(tmpdir(), 'godagent-creator-web-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  return { workspace, app: await createCreatorWebApp({ operatorOptions, workspace, sessionToken: token }) };
}

function request(path, { method = 'GET', body, auth = token, contentType = 'application/json' } = {}) {
  const headers = {};
  if (auth !== null) headers['x-godagent-local-session'] = auth;
  if (body !== undefined) headers['content-type'] = contentType;
  return new Request(`http://127.0.0.1:43117${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function value(response) {
  const text = await response.text();
  return { text, body: JSON.parse(text) };
}

async function acknowledge(app, input, previewDigest) {
  const response = await app.handle(request('/api/acknowledge-preview', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: previewDigest },
  }));
  assert.equal(response.status, 200);
  return (await value(response)).body.reviewConfirmation;
}

async function compositionInput(foundation = 'preset:aether-architect@1.0.0') {
  const preset = await previewOperatorPreset({ ...operatorOptions, preset: foundation, creator: 'creator:dom' });
  return {
    foundation,
    creator: 'creator:dom',
    expression: preset.selection.expressionRef,
    moduleRefs: preset.selection.moduleRefs,
  };
}

async function acknowledgeComposition(app, input, previewDigest) {
  const response = await app.handle(request('/api/acknowledge-composition', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: previewDigest },
  }));
  assert.equal(response.status, 200);
  return (await value(response)).body.reviewConfirmation;
}

test('visual creator serves only fixed self-contained assets with hardened headers', async (context) => {
  const { app } = await setup(context);
  for (const [path, contentType] of [
    ['/', 'text/html'],
    ['/app.css', 'text/css'],
    ['/app.js', 'text/javascript'],
    ['/runtime-config.js', 'text/javascript'],
  ]) {
    const response = await app.handle(request(path, { auth: null }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), new RegExp(contentType));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    const text = await response.text();
    assert.doesNotMatch(text, /https?:\/\//);
    if (path === '/runtime-config.js') assert.match(text, new RegExp(token));
  }
  assert.equal((await app.handle(request('/unknown', { auth: null }))).status, 404);
});

test('every visual creator API route requires the exact launch token', async (context) => {
  const { app } = await setup(context);
  for (const auth of [null, 'b'.repeat(64), `${token}x`]) {
    const response = await app.handle(request('/api/catalog', { auth }));
    const result = await value(response);
    assert.equal(response.status, 401);
    assert.equal(result.text, `${canonicalJson({ schemaVersion: 1, status: 'failed', code: 'session-invalid' })}\n`);
  }
});

test('catalog and preset preview equal the bounded operator workflow', async (context) => {
  const { app } = await setup(context);
  const catalogResponse = await app.handle(request('/api/catalog'));
  const catalog = (await value(catalogResponse)).body;
  assert.equal(catalogResponse.status, 200);
  assert.match(catalog.catalogDigest, /^[a-f0-9]{64}$/);
  assert.equal(catalog.modules[0].payload, undefined);

  const input = { preset: 'preset:aether-architect@1.0.0', creator: 'creator:dom' };
  const previewResponse = await app.handle(request('/api/preview-preset', { method: 'POST', body: input }));
  const preview = (await value(previewResponse)).body;
  assert.deepEqual(preview, await previewOperatorPreset({ ...operatorOptions, ...input }));
  assert.equal(preview.candidate, undefined);
  assert.equal(preview.genome, undefined);
});

test('visual finalization is digest-gated and confined beneath the configured workspace', async (context) => {
  const { app, workspace } = await setup(context);
  const input = { preset: 'preset:aether-architect@1.0.0', creator: 'creator:dom' };
  const stale = await app.handle(request('/api/acknowledge-preview', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: 'f'.repeat(64) },
  }));
  assert.equal(stale.status, 409);
  await assert.rejects(() => access(join(workspace, 'builds', 'f'.repeat(64))));

  const preview = await previewOperatorPreset({ ...operatorOptions, ...input });
  const reviewConfirmation = await acknowledge(app, input, preview.previewDigest);
  const finalized = await app.handle(request('/api/finalize-preset', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation },
  }));
  const result = (await value(finalized)).body;
  assert.equal(finalized.status, 200);
  assert.equal(result.status, 'finalized');
  assert.equal(result.creationBuildId, '9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64');
  const transaction = join(workspace, 'builds', preview.previewDigest);
  assert.equal(JSON.parse(await readFile(join(transaction, 'source', 'creation-candidate.json'), 'utf8')).blueprint.id, 'aether-architect');
  assert.equal(JSON.parse(await readFile(join(transaction, 'output', 'creation-build-manifest.json'), 'utf8')).buildId, result.creationBuildId);
});

test('visual finalization requires one exact one-use review confirmation', async (context) => {
  const { app, workspace } = await setup(context);
  const input = { preset: 'preset:aether-architect@1.0.0', creator: 'creator:dom' };
  const preview = await previewOperatorPreset({ ...operatorOptions, ...input });
  const unacknowledged = await app.handle(request('/api/finalize-preset', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation: 'f'.repeat(64) },
  }));
  assert.equal(unacknowledged.status, 409);
  await assert.rejects(() => access(join(workspace, 'builds', preview.previewDigest)));

  const reviewConfirmation = await acknowledge(app, input, preview.previewDigest);
  const first = await app.handle(request('/api/finalize-preset', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation },
  }));
  assert.equal(first.status, 200);
  const replay = await app.handle(request('/api/finalize-preset', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation },
  }));
  assert.equal(replay.status, 409);
});

test('modular composition routes preserve parity and bind the full selection once', async (context) => {
  const { app, workspace } = await setup(context);
  const input = await compositionInput();
  const previewResponse = await app.handle(request('/api/preview-composition', { method: 'POST', body: input }));
  assert.equal(previewResponse.status, 200);
  const preview = (await value(previewResponse)).body;
  assert.deepEqual(preview, await previewOperatorComposition({ ...operatorOptions, ...input }));

  const reviewConfirmation = await acknowledgeComposition(app, input, preview.previewDigest);
  const changed = {
    ...input,
    moduleRefs: { ...input.moduleRefs, voice: 'voice:quiet-precise@1.0.0' },
  };
  const mismatch = await app.handle(request('/api/finalize-composition', {
    method: 'POST',
    body: { ...changed, expectedPreviewDigest: preview.previewDigest, reviewConfirmation },
  }));
  assert.equal(mismatch.status, 409);
  await assert.rejects(() => access(join(workspace, 'builds', preview.previewDigest)));

  const secondConfirmation = await acknowledgeComposition(app, input, preview.previewDigest);
  const finalized = await app.handle(request('/api/finalize-composition', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation: secondConfirmation },
  }));
  const result = (await value(finalized)).body;
  assert.equal(finalized.status, 200);
  assert.equal(result.creationBuildId, '9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64');

  const replay = await app.handle(request('/api/finalize-composition', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation: secondConfirmation },
  }));
  assert.equal(replay.status, 409);
});

test('known digest junctions cannot redirect visual finalization outside the workspace', async (context) => {
  const { app, workspace } = await setup(context);
  const outside = await mkdtemp(join(tmpdir(), 'godagent-creator-outside-'));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const input = { preset: 'preset:aether-architect@1.0.0', creator: 'creator:dom' };
  const preview = await previewOperatorPreset({ ...operatorOptions, ...input });
  const transaction = join(workspace, 'builds', preview.previewDigest);
  await mkdir(transaction, { recursive: true });
  await symlink(outside, join(transaction, 'source'), 'junction');
  const reviewConfirmation = await acknowledge(app, input, preview.previewDigest);
  const response = await app.handle(request('/api/finalize-preset', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest, reviewConfirmation },
  }));
  assert.ok(response.status >= 400);
  await assert.rejects(() => access(join(outside, 'creation-candidate.json')));
});

test('a junctioned builds root is rejected during visual creator startup', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'godagent-creator-workspace-'));
  const outside = await mkdtemp(join(tmpdir(), 'godagent-creator-builds-outside-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(workspace, 'builds'), 'junction');
  await assert.rejects(
    () => createCreatorWebApp({ operatorOptions, workspace, sessionToken: token }),
    /workspace|request failed/,
  );
});

test('workspace containment is root-aware', () => {
  assert.equal(isPathWithinRoot('C:\\', 'C:\\builds\\abc'), true);
  assert.equal(isPathWithinRoot('C:\\forge', 'C:\\forge\\builds\\abc'), true);
  assert.equal(isPathWithinRoot('C:\\forge', 'C:\\forge-escape\\abc'), false);
  assert.equal(isPathWithinRoot('C:\\forge', 'D:\\forge\\abc'), false);
});

test('methods, content types, body bounds, unknown fields, and canaries fail closed', async (context) => {
  const { app } = await setup(context);
  const canary = 'secret-web-canary';
  const rows = [
    request('/api/catalog', { method: 'POST', body: {} }),
    request('/api/preview-preset', { method: 'POST', body: {}, contentType: 'text/plain' }),
    request('/api/preview-preset', { method: 'POST', body: { preset: 'preset:aether-architect@1.0.0', creator: 'creator:dom', credential: canary } }),
    new Request('http://127.0.0.1:43117/api/preview-preset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-godagent-local-session': token },
      body: JSON.stringify({ padding: 'x'.repeat(20_000), canary }),
    }),
  ];
  for (const row of rows) {
    const response = await app.handle(row);
    const text = await response.text();
    assert.ok(response.status >= 400);
    assert.doesNotMatch(text, new RegExp(canary));
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['code', 'schemaVersion', 'status']);
  }
});
