import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  CreatorWebServerError,
  createWebSessionToken,
  handleCreatorHttpRequest,
  parseCreatorWebArgs,
  startCreatorWebServer,
} from '../src/creator/web/server.mjs';
import { createCreatorWebApp } from '../src/creator/web/app.mjs';

const policyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const operatorOptions = {
  policy: new URL('creation/creation-policy.json', fixtureRoot),
  policyDigest,
  modules: new URL('creation/modules/', fixtureRoot),
  expressions: new URL('creator/expressions/', fixtureRoot),
  presets: new URL('creator/presets/', fixtureRoot),
};
const args = [
  '--policy', 'C:/library/policy.json',
  '--policy-digest', policyDigest,
  '--modules', 'C:/library/modules',
  '--expressions', 'C:/library/expressions',
  '--presets', 'C:/library/presets',
  '--workspace', 'C:/creator-workspace',
];

test('visual creator server arguments are strict and default to one bounded port', () => {
  assert.deepEqual(parseCreatorWebArgs(args), {
    operatorOptions: {
      policy: 'C:/library/policy.json',
      policyDigest,
      modules: 'C:/library/modules',
      expressions: 'C:/library/expressions',
      presets: 'C:/library/presets',
    },
    workspace: 'C:/creator-workspace',
    port: 43117,
  });
  assert.equal(parseCreatorWebArgs([...args, '--port', '49152']).port, 49152);
  for (const invalid of [
    [],
    [...args, '--unknown', 'value'],
    [...args, '--workspace', 'C:/other'],
    args.slice(0, -2),
    [...args, '--port', '0'],
    [...args, '--port', '70000'],
    [...args, '--port', 'not-a-port'],
  ]) {
    assert.throws(() => parseCreatorWebArgs(invalid), CreatorWebServerError);
  }
});

test('session tokens are random fixed lowercase sha256-width values', () => {
  const left = createWebSessionToken();
  const right = createWebSessionToken();
  assert.match(left, /^[a-f0-9]{64}$/);
  assert.match(right, /^[a-f0-9]{64}$/);
  assert.notEqual(left, right);
});

test('visual creator server binds loopback and hides its token from launch output', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'godagent-web-server-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const server = await startCreatorWebServer({ operatorOptions, workspace, port: 0 });
  context.after(() => server.close());
  assert.equal(server.host, '127.0.0.1');
  assert.ok(server.port > 0);
  assert.equal(server.url, `http://127.0.0.1:${server.port}/`);
  assert.doesNotMatch(server.url, /[a-f0-9]{64}/);
});

test('visual creator application serves assets and token-gated catalog without a network socket', async (context) => {
  const sessionToken = createWebSessionToken();
  const workspace = await mkdtemp(join(tmpdir(), 'godagent-web-app-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const app = await createCreatorWebApp({ operatorOptions, workspace, sessionToken });
  const page = await app.handle(new Request('http://127.0.0.1/'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Godagent Forge/);
  const runtime = await app.handle(new Request('http://127.0.0.1/runtime-config.js'));
  assert.match(await runtime.text(), new RegExp(sessionToken));
  const denied = await app.handle(new Request('http://127.0.0.1/api/catalog'));
  assert.equal(denied.status, 401);
  const catalog = await app.handle(new Request('http://127.0.0.1/api/catalog', {
    headers: { 'x-godagent-local-session': sessionToken },
  }));
  assert.equal(catalog.status, 200);
  assert.match((await catalog.json()).catalogDigest, /^[a-f0-9]{64}$/);
});

function fakeIncoming(host, url = '/', { method = 'GET', headers = {}, body = '' } = {}) {
  const bytes = Buffer.from(body, 'utf8');
  const incoming = Readable.from(bytes.length === 0 ? [] : [bytes]);
  incoming.headers = { host, ...headers };
  if (bytes.length > 0) incoming.headers['content-length'] = String(bytes.length);
  incoming.method = method;
  incoming.url = url;
  return incoming;
}

function fakeOutgoing() {
  return {
    headersSent: false,
    status: null,
    headers: null,
    body: Buffer.alloc(0),
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk = Buffer.alloc(0)) { this.body = Buffer.from(chunk); },
    destroy() { this.destroyed = true; },
  };
}

test('guard-compatible HTTP adaptation serves the exact host and rejects host substitution', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'godagent-web-adapter-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const sessionToken = createWebSessionToken();
  const app = await createCreatorWebApp({ operatorOptions, workspace, sessionToken });
  const expectedHost = '127.0.0.1:43117';
  const accepted = fakeOutgoing();
  await handleCreatorHttpRequest({ incoming: fakeIncoming(expectedHost), outgoing: accepted, app, expectedHost });
  assert.equal(accepted.status, 200);
  assert.match(accepted.body.toString('utf8'), /Godagent Forge/);

  const denied = fakeOutgoing();
  await handleCreatorHttpRequest({ incoming: fakeIncoming('attacker.invalid'), outgoing: denied, app, expectedHost });
  assert.equal(denied.status, 421);
  assert.equal(JSON.parse(denied.body.toString('utf8')).code, 'host-invalid');

  const post = (path, body) => fakeIncoming(expectedHost, path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-godagent-local-session': sessionToken,
    },
    body: JSON.stringify(body),
  });
  const identity = { preset: 'preset:aether-architect@1.0.0', creator: 'creator:dom' };
  const previewResponse = fakeOutgoing();
  await handleCreatorHttpRequest({
    incoming: post('/api/preview-preset', identity), outgoing: previewResponse, app, expectedHost,
  });
  assert.equal(previewResponse.status, 200);
  const preview = JSON.parse(previewResponse.body.toString('utf8'));

  const acknowledgementResponse = fakeOutgoing();
  await handleCreatorHttpRequest({
    incoming: post('/api/acknowledge-preview', { ...identity, expectedPreviewDigest: preview.previewDigest }),
    outgoing: acknowledgementResponse,
    app,
    expectedHost,
  });
  assert.equal(acknowledgementResponse.status, 200);
  const acknowledgement = JSON.parse(acknowledgementResponse.body.toString('utf8'));

  const finalizationResponse = fakeOutgoing();
  await handleCreatorHttpRequest({
    incoming: post('/api/finalize-preset', {
      ...identity,
      expectedPreviewDigest: preview.previewDigest,
      reviewConfirmation: acknowledgement.reviewConfirmation,
    }),
    outgoing: finalizationResponse,
    app,
    expectedHost,
  });
  assert.equal(finalizationResponse.status, 200);
  assert.equal(JSON.parse(finalizationResponse.body.toString('utf8')).status, 'finalized');
});
