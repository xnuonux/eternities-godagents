import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  CreatorWebServerError,
  createWebSessionToken,
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

test('visual creator application serves assets and token-gated catalog without a network socket', async () => {
  const sessionToken = createWebSessionToken();
  const app = await createCreatorWebApp({ operatorOptions, workspace: 'C:/creator-workspace', sessionToken });
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
