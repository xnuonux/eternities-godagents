import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../../core/canonical-json.mjs';
import { createCreatorWebApp } from './app.mjs';

const DEFAULT_PORT = 43117;
const REQUIRED = Object.freeze([
  'policy', 'policy-digest', 'modules', 'expressions', 'presets', 'workspace',
]);
const ALLOWED = new Set([...REQUIRED, 'port']);
const KEY_MAP = Object.freeze({
  policy: 'policy',
  'policy-digest': 'policyDigest',
  modules: 'modules',
  expressions: 'expressions',
  presets: 'presets',
});
const DIGEST = /^[a-f0-9]{64}$/;
const MESSAGES = Object.freeze({
  'argument-invalid': 'visual creator server argument is invalid',
  'option-duplicate': 'visual creator server option is duplicated',
  'option-missing': 'visual creator server option is missing',
  'option-unexpected': 'visual creator server option is not allowed',
  'value-invalid': 'visual creator server value is invalid',
});

export class CreatorWebServerError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('visual creator server error code is invalid');
    super(MESSAGES[code]);
    this.name = 'CreatorWebServerError';
    this.code = code;
  }
}

function fail(code) {
  throw new CreatorWebServerError(code);
}

export function parseCreatorWebArgs(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) fail('argument-invalid');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? '')) fail('argument-invalid');
    const name = token.slice(2);
    if (!ALLOWED.has(name)) fail('option-unexpected');
    if (values.has(name)) fail('option-duplicate');
    if (value === undefined || value.startsWith('--')) fail('option-missing');
    if (value.length === 0 || /[\0\r\n]/.test(value)) fail('value-invalid');
    values.set(name, value);
  }
  if (REQUIRED.some((name) => !values.has(name))) fail('option-missing');
  if (!DIGEST.test(values.get('policy-digest'))) fail('value-invalid');
  const portText = values.get('port');
  const port = portText === undefined ? DEFAULT_PORT : Number(portText);
  if (!Number.isInteger(port) || port < 1024 || port > 65535
      || (portText !== undefined && String(port) !== portText)) fail('value-invalid');
  const operatorOptions = Object.fromEntries(Object.entries(KEY_MAP).map(([name, key]) => [key, values.get(name)]));
  return Object.freeze({
    operatorOptions: Object.freeze(operatorOptions),
    workspace: values.get('workspace'),
    port,
  });
}

export function createWebSessionToken() {
  return randomBytes(32).toString('hex');
}

function closedServerFailure(response, status, code) {
  const body = `${canonicalJson({ schemaVersion: 1, status: 'failed', code })}\n`;
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

export async function handleCreatorHttpRequest({ incoming, outgoing, app, expectedHost }) {
  try {
    if (incoming.headers.host !== expectedHost) {
      closedServerFailure(outgoing, 421, 'host-invalid');
      return;
    }
    const method = incoming.method ?? 'GET';
    const init = { method, headers: incoming.headers };
    if (!['GET', 'HEAD'].includes(method)) {
      init.body = Readable.toWeb(incoming);
      init.duplex = 'half';
    }
    const request = new Request(`http://${expectedHost}${incoming.url ?? '/'}`, init);
    const response = await app.handle(request);
    const headers = Object.fromEntries(response.headers.entries());
    outgoing.writeHead(response.status, headers);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent) closedServerFailure(outgoing, 500, 'server-failure');
    else outgoing.destroy();
  }
}

export async function startCreatorWebServer({ operatorOptions, workspace, port = DEFAULT_PORT }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError('visual creator server port is invalid');
  }
  const sessionToken = createWebSessionToken();
  const app = await createCreatorWebApp({ operatorOptions, workspace, sessionToken });
  let expectedHost;
  const server = createServer((incoming, outgoing) => {
    void handleCreatorHttpRequest({ incoming, outgoing, app, expectedHost });
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen({ host: '127.0.0.1', port }, resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    server.close();
    throw new Error('visual creator server did not bind loopback');
  }
  expectedHost = `127.0.0.1:${address.port}`;
  return Object.freeze({
    host: '127.0.0.1',
    port: address.port,
    url: `http://${expectedHost}/`,
    close: () => new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    }),
  });
}

async function main() {
  try {
    const options = parseCreatorWebArgs(process.argv.slice(2));
    const server = await startCreatorWebServer(options);
    process.stdout.write(`${server.url}\n`);
    const close = async () => {
      await server.close();
      process.exitCode = 0;
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  } catch (error) {
    const code = error instanceof CreatorWebServerError ? error.code : 'server-failure';
    process.stderr.write(`${canonicalJson({ schemaVersion: 1, status: 'failed', code })}\n`);
    process.exitCode = error instanceof CreatorWebServerError ? 2 : 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
