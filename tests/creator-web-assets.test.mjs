import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/creator/web/', import.meta.url);

async function assets() {
  const [html, css, js] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('app.css', root), 'utf8'),
    readFile(new URL('app.js', root), 'utf8'),
  ]);
  return { html, css, js };
}

test('visual shell contains the complete semantic character-creator structure', async () => {
  const { html } = await assets();
  for (const value of [
    'Godagent Forge',
    'Validated creation paths',
    'Concordance halo',
    'Review ledger',
    'Creator identity',
    'Preview this path',
    'I reviewed this exact preview digest',
    'Forge reviewed build',
    'aria-live="polite"',
  ]) assert.match(html, new RegExp(value));
  assert.match(html, /<svg[^>]+id="concordance-halo"/);
  assert.match(html, /<button[^>]+id="forge-button"[^>]+disabled/);
  assert.doesNotMatch(html, /<script[^>]*>\s*[^<\s]/);
  assert.doesNotMatch(html, /style="/);
});

test('visual shell implements its specific palette, responsive reflow, focus, and reduced motion', async () => {
  const { css } = await assets();
  for (const value of ['#100b1d', '#1c2448', '#d8b66a', '#7cd4d9', '#eae7f2', '#e57b8c']) {
    assert.match(css, new RegExp(value));
  }
  assert.match(css, /grid-template-areas/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.halo-calibrating/);
});

test('visual shell script uses fixed same-origin APIs and text-safe DOM construction', async () => {
  const { js } = await assets();
  for (const route of ['/api/catalog', '/api/preview-preset', '/api/finalize-preset']) {
    assert.match(js, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(js, /x-godagent-local-session/);
  assert.match(js, /createElement/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|eval\(|new Function/);
  assert.doesNotMatch(js, /https?:\/\//);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/);
});
