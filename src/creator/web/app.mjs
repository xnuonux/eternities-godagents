import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../core/canonical-json.mjs';
import {
  CreatorWorkflowError,
  finalizeOperatorPreset,
  loadOperatorCatalog,
  previewOperatorPreset,
} from '../operator-workflow.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const TOKEN = /^[a-f0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const assetDirectory = dirname(fileURLToPath(import.meta.url));
const securityHeaders = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  'cross-origin-opener-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
});
const staticTypes = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
});

class WebBoundaryError extends Error {
  constructor(code, status) {
    super('visual creator request failed');
    this.name = 'WebBoundaryError';
    this.code = code;
    this.status = status;
  }
}

function jsonResponse(value, status = 200) {
  return new Response(`${canonicalJson(value)}\n`, {
    status,
    headers: { ...securityHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function failure(code, status) {
  return jsonResponse({ schemaVersion: 1, status: 'failed', code }, status);
}

function staticResponse(body, contentType) {
  return new Response(body, { status: 200, headers: { ...securityHeaders, 'content-type': contentType } });
}

function exactToken(actual, expected) {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expected, 'utf8'));
}

function assertExactObject(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new WebBoundaryError('body-invalid', 400);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new WebBoundaryError('body-invalid', 400);
  }
  return value;
}

async function readJson(request, fields) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new WebBoundaryError('content-type-invalid', 415);
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new WebBoundaryError('body-too-large', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new WebBoundaryError('body-invalid', 400);
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new WebBoundaryError('body-too-large', 413);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return assertExactObject(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)), fields);
  } catch (error) {
    if (error instanceof WebBoundaryError) throw error;
    throw new WebBoundaryError('body-invalid', 400);
  }
}

function workflowFailure(error) {
  if (!(error instanceof CreatorWorkflowError)) return failure('operation-failed', 409);
  const status = error.code === 'preview-digest-mismatch' || error.code === 'preview-not-ready' ? 409 : 400;
  return failure(error.code, status);
}

export async function createCreatorWebApp({ operatorOptions, workspace, sessionToken }) {
  if (!TOKEN.test(sessionToken) || typeof workspace !== 'string' || workspace.length === 0) {
    throw new TypeError('visual creator application configuration is invalid');
  }
  const workspaceRoot = resolve(workspace);
  const assets = Object.fromEntries(await Promise.all(Object.entries(staticTypes).map(async ([path, [name, type]]) => [
    path,
    [await readFile(join(assetDirectory, name), 'utf8'), type],
  ])));

  return Object.freeze({
    async handle(request) {
      try {
        const url = new URL(request.url);
        if (url.search !== '') return failure('route-invalid', 404);
        if (Object.hasOwn(assets, url.pathname)) {
          if (request.method !== 'GET') return failure('method-invalid', 405);
          return staticResponse(...assets[url.pathname]);
        }
        if (url.pathname === '/runtime-config.js') {
          if (request.method !== 'GET') return failure('method-invalid', 405);
          const body = `globalThis.__GODAGENT_LOCAL__=Object.freeze({sessionToken:${JSON.stringify(sessionToken)}});\n`;
          return staticResponse(body, 'text/javascript; charset=utf-8');
        }
        if (!url.pathname.startsWith('/api/')) return failure('route-invalid', 404);
        if (!exactToken(request.headers.get('x-godagent-local-session'), sessionToken)) {
          return failure('session-invalid', 401);
        }
        if (url.pathname === '/api/catalog') {
          if (request.method !== 'GET') return failure('method-invalid', 405);
          return jsonResponse(await loadOperatorCatalog(operatorOptions));
        }
        if (url.pathname === '/api/preview-preset') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, ['preset', 'creator']);
          try {
            return jsonResponse(await previewOperatorPreset({ ...operatorOptions, ...body }));
          } catch (error) {
            return workflowFailure(error);
          }
        }
        if (url.pathname === '/api/finalize-preset') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, ['preset', 'creator', 'expectedPreviewDigest']);
          if (!DIGEST.test(body.expectedPreviewDigest)) throw new WebBoundaryError('body-invalid', 400);
          const transactionRoot = resolve(workspaceRoot, 'builds', body.expectedPreviewDigest);
          if (!transactionRoot.startsWith(`${workspaceRoot}${sep}`)) {
            throw new WebBoundaryError('workspace-boundary-invalid', 400);
          }
          try {
            return jsonResponse(await finalizeOperatorPreset({
              ...operatorOptions,
              ...body,
              sourceDir: join(transactionRoot, 'source'),
              outputDir: join(transactionRoot, 'output'),
            }));
          } catch (error) {
            return workflowFailure(error);
          }
        }
        return failure('route-invalid', 404);
      } catch (error) {
        if (error instanceof WebBoundaryError) return failure(error.code, error.status);
        return failure('operation-failed', 500);
      }
    },
  });
}
