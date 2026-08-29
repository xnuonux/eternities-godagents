import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCreatorCommand,
  createCreatorDraft,
  creatorDraftProjection,
} from '../src/creator/draft.mjs';

const digest = (character) => character.repeat(64);

function command(draft, kind, payload) {
  return { schemaVersion: 1, kind, expectedDraftDigest: draft.draftDigest, payload };
}

test('creator draft starts inert, content-addressed, and deeply frozen', () => {
  const draft = createCreatorDraft({ catalogDigest: digest('c'), creatorRef: 'creator:dom' });
  assert.equal(draft.revision, 0);
  assert.equal(draft.previousDraftDigest, digest('0'));
  assert.deepEqual(draft.moduleRefs, {});
  assert.deepEqual(draft.evolution, { policy: 'frozen-v0' });
  assert.deepEqual(draft.soulPort, { schemaVersion: 1, status: 'dormant' });
  assert.equal(Object.isFrozen(draft), true);
  assert.equal(Object.isFrozen(draft.moduleRefs), true);
  assert.equal(Object.hasOwn(creatorDraftProjection(draft), 'draftDigest'), false);
});

test('creator commands append deterministic immutable draft revisions', () => {
  const initial = createCreatorDraft({ catalogDigest: digest('c'), creatorRef: 'creator:dom' });
  const blueprint = applyCreatorCommand({
    draft: initial,
    command: command(initial, 'set-blueprint', { version: '1.0.0', id: 'aether-architect' }),
  });
  const reordered = applyCreatorCommand({
    draft: initial,
    command: command(initial, 'set-blueprint', { id: 'aether-architect', version: '1.0.0' }),
  });
  assert.equal(blueprint.draftDigest, reordered.draftDigest);
  assert.equal(blueprint.revision, 1);
  assert.equal(blueprint.previousDraftDigest, initial.draftDigest);
  assert.deepEqual(blueprint.blueprint, { id: 'aether-architect', version: '1.0.0' });
  assert.equal(Object.hasOwn(initial, 'blueprint'), false);

  const selected = applyCreatorCommand({
    draft: blueprint,
    command: command(blueprint, 'select-module', {
      kind: 'lineage',
      ref: 'lineage:synthetic-explorer@1.0.0',
    }),
  });
  assert.equal(selected.revision, 2);
  assert.deepEqual(selected.moduleRefs, { lineage: 'lineage:synthetic-explorer@1.0.0' });
  assert.deepEqual(blueprint.moduleRefs, {});
  assert.equal(Object.isFrozen(selected.moduleRefs), true);
});

test('creator draft rejects stale commands, malformed roots, and hidden mutation attempts', () => {
  const initial = createCreatorDraft({ catalogDigest: digest('c'), creatorRef: 'creator:dom' });
  const valid = command(initial, 'set-expression', { ref: 'expression:aether-architect@1.0.0' });
  const next = applyCreatorCommand({ draft: initial, command: valid });
  assert.throws(
    () => applyCreatorCommand({ draft: next, command: valid }),
    /creator command does not match current draft/,
  );
  assert.throws(() => createCreatorDraft({ catalogDigest: 'bad', creatorRef: 'creator:dom' }), /creator draft is invalid/);
  assert.throws(() => createCreatorDraft({ catalogDigest: digest('c'), creatorRef: '../dom' }), /creator draft is invalid/);
  assert.throws(
    () => applyCreatorCommand({ draft: { ...initial, revision: 99 }, command: valid }),
    /creator draft is invalid/,
  );
});

