import { randomBytes, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../core/canonical-json.mjs';
import { sha256Value } from '../../core/digest.mjs';
import {
  CreatorWorkflowError,
  finalizeOperatorComposition,
  finalizeOperatorPreset,
  loadOperatorCatalog,
  previewOperatorComposition,
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

export function isPathWithinRoot(root, target) {
  const remainder = relative(resolve(root), resolve(target));
  return remainder !== ''
    && remainder !== '..'
    && !remainder.startsWith(`..${sep}`)
    && !isAbsolute(remainder);
}

async function assertConfinedDirectory(root, directory) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new WebBoundaryError('workspace-boundary-invalid', 409);
  }
  const canonical = await realpath(directory);
  if (!isPathWithinRoot(root, canonical)) {
    throw new WebBoundaryError('workspace-boundary-invalid', 409);
  }
  return canonical;
}

async function assertTargetAbsent(path) {
  try {
    await lstat(path);
    throw new WebBoundaryError('transaction-occupied', 409);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function removePendingSafely(buildsRoot, pendingRoot) {
  try {
    const stats = await lstat(pendingRoot);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return;
    const canonical = await realpath(pendingRoot);
    if (!isPathWithinRoot(buildsRoot, canonical)) return;
    await rm(pendingRoot, { recursive: true, force: true });
  } catch {
    // Failed staging is inert. Refuse risky cleanup rather than following changed filesystem state.
  }
}

export async function createCreatorWebApp({ operatorOptions, workspace, sessionToken }) {
  if (!TOKEN.test(sessionToken) || typeof workspace !== 'string' || workspace.length === 0) {
    throw new TypeError('visual creator application configuration is invalid');
  }
  const configuredWorkspace = resolve(workspace);
  await mkdir(configuredWorkspace, { recursive: true });
  const workspaceStats = await lstat(configuredWorkspace);
  if (!workspaceStats.isDirectory() || workspaceStats.isSymbolicLink()) {
    throw new TypeError('visual creator workspace is invalid');
  }
  const workspaceRoot = await realpath(configuredWorkspace);
  const configuredBuilds = join(workspaceRoot, 'builds');
  await mkdir(configuredBuilds, { recursive: true });
  const buildsRoot = await assertConfinedDirectory(workspaceRoot, configuredBuilds);
  const reviewConfirmations = new Map();
  const assets = Object.fromEntries(await Promise.all(Object.entries(staticTypes).map(async ([path, [name, type]]) => [
    path,
    [await readFile(join(assetDirectory, name), 'utf8'), type],
  ])));

  function bindingDigest(kind, input, previewDigest) {
    return sha256Value({ schemaVersion: 1, kind, input, previewDigest });
  }

  function issueConfirmation(binding) {
    const reviewConfirmation = randomBytes(32).toString('hex');
    if (reviewConfirmations.size >= 64) reviewConfirmations.delete(reviewConfirmations.keys().next().value);
    reviewConfirmations.set(reviewConfirmation, binding);
    return reviewConfirmation;
  }

  function consumeConfirmation(reviewConfirmation, binding) {
    const acknowledged = reviewConfirmations.get(reviewConfirmation);
    reviewConfirmations.delete(reviewConfirmation);
    if (acknowledged !== binding) throw new WebBoundaryError('review-confirmation-invalid', 409);
  }

  async function finalizeInWorkspace(expectedPreviewDigest, operation) {
    await assertConfinedDirectory(workspaceRoot, buildsRoot);
    const transactionRoot = resolve(buildsRoot, expectedPreviewDigest);
    if (!isPathWithinRoot(buildsRoot, transactionRoot)) throw new WebBoundaryError('workspace-boundary-invalid', 409);
    await assertTargetAbsent(transactionRoot);
    const pendingRoot = await mkdtemp(join(buildsRoot, '.pending-'));
    const sourceDirectory = join(pendingRoot, 'source');
    const outputDirectory = join(pendingRoot, 'output');
    try {
      await mkdir(sourceDirectory);
      await mkdir(outputDirectory);
      await assertConfinedDirectory(pendingRoot, sourceDirectory);
      await assertConfinedDirectory(pendingRoot, outputDirectory);
      const finalized = await operation({ sourceDirectory, outputDirectory });
      await assertConfinedDirectory(buildsRoot, pendingRoot);
      await assertConfinedDirectory(pendingRoot, sourceDirectory);
      await assertConfinedDirectory(pendingRoot, outputDirectory);
      await rename(pendingRoot, transactionRoot);
      return jsonResponse(finalized);
    } catch (error) {
      await removePendingSafely(buildsRoot, pendingRoot);
      if (error instanceof WebBoundaryError) throw error;
      return workflowFailure(error);
    }
  }

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
        if (url.pathname === '/api/preview-composition') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, ['foundation', 'creator', 'expression', 'moduleRefs']);
          try {
            return jsonResponse(await previewOperatorComposition({ ...operatorOptions, ...body }));
          } catch (error) {
            return workflowFailure(error);
          }
        }
        if (url.pathname === '/api/acknowledge-preview') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, ['preset', 'creator', 'expectedPreviewDigest']);
          if (!DIGEST.test(body.expectedPreviewDigest)) throw new WebBoundaryError('body-invalid', 400);
          let preview;
          try {
            preview = await previewOperatorPreset({ ...operatorOptions, preset: body.preset, creator: body.creator });
          } catch (error) {
            return workflowFailure(error);
          }
          if (preview.status !== 'ready') return failure('preview-not-ready', 409);
          if (preview.previewDigest !== body.expectedPreviewDigest) return failure('preview-digest-mismatch', 409);
          const reviewConfirmation = issueConfirmation(bindingDigest(
            'preset', { preset: body.preset, creator: body.creator }, body.expectedPreviewDigest,
          ));
          return jsonResponse({ schemaVersion: 1, status: 'acknowledged', reviewConfirmation });
        }
        if (url.pathname === '/api/acknowledge-composition') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, [
            'foundation', 'creator', 'expression', 'moduleRefs', 'expectedPreviewDigest',
          ]);
          if (!DIGEST.test(body.expectedPreviewDigest)) throw new WebBoundaryError('body-invalid', 400);
          const input = {
            foundation: body.foundation,
            creator: body.creator,
            expression: body.expression,
            moduleRefs: body.moduleRefs,
          };
          let preview;
          try {
            preview = await previewOperatorComposition({ ...operatorOptions, ...input });
          } catch (error) {
            return workflowFailure(error);
          }
          if (preview.status !== 'ready') return failure('preview-not-ready', 409);
          if (preview.previewDigest !== body.expectedPreviewDigest) return failure('preview-digest-mismatch', 409);
          const reviewConfirmation = issueConfirmation(bindingDigest(
            'composition', input, body.expectedPreviewDigest,
          ));
          return jsonResponse({ schemaVersion: 1, status: 'acknowledged', reviewConfirmation });
        }
        if (url.pathname === '/api/finalize-preset') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, ['preset', 'creator', 'expectedPreviewDigest', 'reviewConfirmation']);
          if (!DIGEST.test(body.expectedPreviewDigest) || !TOKEN.test(body.reviewConfirmation)) {
            throw new WebBoundaryError('body-invalid', 400);
          }
          consumeConfirmation(body.reviewConfirmation, bindingDigest(
            'preset', { preset: body.preset, creator: body.creator }, body.expectedPreviewDigest,
          ));
          return await finalizeInWorkspace(body.expectedPreviewDigest, ({ sourceDirectory, outputDirectory }) => (
            finalizeOperatorPreset({
              ...operatorOptions,
              preset: body.preset,
              creator: body.creator,
              expectedPreviewDigest: body.expectedPreviewDigest,
              sourceDir: sourceDirectory,
              outputDir: outputDirectory,
            })
          ));
        }
        if (url.pathname === '/api/finalize-composition') {
          if (request.method !== 'POST') return failure('method-invalid', 405);
          const body = await readJson(request, [
            'foundation', 'creator', 'expression', 'moduleRefs',
            'expectedPreviewDigest', 'reviewConfirmation',
          ]);
          if (!DIGEST.test(body.expectedPreviewDigest) || !TOKEN.test(body.reviewConfirmation)) {
            throw new WebBoundaryError('body-invalid', 400);
          }
          const input = {
            foundation: body.foundation,
            creator: body.creator,
            expression: body.expression,
            moduleRefs: body.moduleRefs,
          };
          consumeConfirmation(body.reviewConfirmation, bindingDigest(
            'composition', input, body.expectedPreviewDigest,
          ));
          return await finalizeInWorkspace(body.expectedPreviewDigest, ({ sourceDirectory, outputDirectory }) => (
            finalizeOperatorComposition({
              ...operatorOptions,
              ...input,
              expectedPreviewDigest: body.expectedPreviewDigest,
              sourceDir: sourceDirectory,
              outputDir: outputDirectory,
            })
          ));
        }
        return failure('route-invalid', 404);
      } catch (error) {
        if (error instanceof WebBoundaryError) return failure(error.code, error.status);
        return failure('operation-failed', 500);
      }
    },
  });
}
