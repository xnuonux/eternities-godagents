import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const receiptDigest = '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28';

const routingPin = (overrides = {}) => pinnedGodskillsRoutingExecutable(overrides);

async function verifier() {
  try {
    return await import('../src/skills/routing-executable-verifier.mjs');
  } catch (error) {
    assert.fail(`routing executable verifier is unavailable: ${error.message}`);
  }
}

function changedReader(relativePath) {
  const target = resolve(godskillsRoot, ...relativePath.split('/'));
  return {
    realpath,
    async readFile(path) {
      const bytes = await readFile(path);
      return resolve(path).toLowerCase() === target.toLowerCase()
        ? Buffer.concat([bytes, Buffer.from('\n')])
        : bytes;
    },
  };
}

test('verifies and brands the exact pushed Godskills routing executable', async () => {
  const {
    assertVerifiedGodskillsRoutingExecutable,
    verifyGodskillsRoutingExecutable,
  } = await verifier();
  const verified = await verifyGodskillsRoutingExecutable({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: routingPin(),
  });

  assert.equal(verified.routing.protocolId, 'eternities-godskills-routing-executable-v1');
  assert.equal(verified.routing.trustRootDigest, receiptDigest);
  assert.deepEqual(verified.routing.modes, ['default', 'specialist']);
  assert.equal(verified.routing.localModules.length, 17);
  assert.equal(verified.routing.routingArtifacts.length, 3);
  assert.equal(verified.routing.parents.length, 5);
  assert.equal(verified.routing.entrypoint.path, 'scripts/routing.mjs');
  assert.match(verified.routing.entrypoint.absolutePath, /scripts[\\/]routing\.mjs$/i);
  assert.equal(assertVerifiedGodskillsRoutingExecutable(verified), verified);
  assert.throws(
    () => assertVerifiedGodskillsRoutingExecutable({ release: verified.release, routing: verified.routing }),
    /verified|provenance|brand/i,
  );
});

test('routing sidecar schema is closed and fixes the executable paths', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/godskills-routing-executable-pin.schema.json', import.meta.url)));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['protocolId', 'executableReceipt', 'entrypoint']);
  assert.equal(schema.properties.protocolId.const, 'eternities-godskills-routing-executable-v1');
  assert.equal(schema.properties.executableReceipt.properties.path.const, 'receipts/routing-executable-v1.json');
  assert.equal(schema.properties.entrypoint.properties.path.const, 'scripts/routing.mjs');
  assert.equal(schema.$defs.digest.pattern, '^[a-f0-9]{64}$');
});

test('rejects forged, malformed, or aliased routing sidecars', async () => {
  const { verifyGodskillsRoutingExecutable } = await verifier();
  const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
  for (const [name, pin] of [
    ['protocol', routingPin({ protocolId: 'other' })],
    ['receipt digest', routingPin({ executableReceipt: { ...routingPin().executableReceipt, receiptDigest: '0'.repeat(64) } })],
    ['entrypoint digest', routingPin({ entrypoint: { ...routingPin().entrypoint, sha256: '0'.repeat(64) } })],
    ['aliased path', routingPin({ entrypoint: { ...routingPin().entrypoint, path: 'scripts/../scripts/routing.mjs' } })],
    ['extra field', { ...routingPin(), provider: 'forbidden' }],
  ]) {
    await assert.rejects(
      verifyGodskillsRoutingExecutable({ releasePin, routingPin: pin }),
      /routing|protocol|digest|field|path|relative|entrypoint|pin/i,
      name,
    );
  }
});

test('changed receipt, module, routing data, and parent bytes fail before branding', async () => {
  const { verifyGodskillsRoutingExecutable } = await verifier();
  const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
  for (const relativePath of [
    'receipts/routing-executable-v1.json',
    'src/router.mjs',
    'artifacts/routing/cards.jsonl',
    'receipts/specialist-preference-routing-v1.json',
  ]) {
    await assert.rejects(
      verifyGodskillsRoutingExecutable({
        releasePin,
        routingPin: routingPin(),
        io: changedReader(relativePath),
      }),
      /routing|digest|bytes|receipt|artifact|parent/i,
      relativePath,
    );
  }
});
