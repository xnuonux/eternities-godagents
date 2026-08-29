import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
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

function get(url, headers = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(url, { method: 'GET', headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolvePromise({ status: response.statusCode, headers: response.headers, body }));
    });
    request.once('error', rejectPromise);
    request.end();
  });
}

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

test('visual creator server binds loopback, hides its token from launch output, and serves the app', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'godagent-web-server-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const server = await startCreatorWebServer({ operatorOptions, workspace, port: 0 });
  context.after(() => server.close());
  assert.equal(server.host, '127.0.0.1');
  assert.ok(server.port > 0);
  assert.equal(server.url, `http://127.0.0.1:${server.port}/`);
  assert.doesNotMatch(server.url, /[a-f0-9]{64}/);

  const page = await get(server.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /Godagent Forge/);
  const runtime = await get(`${server.url}runtime-config.js`);
  const token = runtime.body.match(/[a-f0-9]{64}/)?.[0];
  assert.match(token, /^[a-f0-9]{64}$/);
  const denied = await get(`${server.url}api/catalog`);
  assert.equal(denied.status, 401);
  const catalog = await get(`${server.url}api/catalog`, { 'x-godagent-local-session': token });
  assert.equal(catalog.status, 200);
  assert.match(JSON.parse(catalog.body).catalogDigest, /^[a-f0-9]{64}$/);
});
