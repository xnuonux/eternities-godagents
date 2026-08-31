import assert from 'node:assert/strict';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import {
  assertVerifiedGodskillsRoutingExecutable,
  verifyGodskillsRoutingExecutable,
} from '../src/skills/routing-executable-verifier.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const routingTrustRootDigest = '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28';
const cardsLogicalDigest = 'e1597571a8e456e4381522a945f6c4350f751d80d9536dac65fc1160ebd80233';

async function classifierModule() {
  try {
    return await import('../src/skills/routing-evidence-activation-classifier.mjs');
  } catch (error) {
    assert.fail(`routing-evidence activation classifier is unavailable: ${error.message}`);
  }
}

async function verifiedRouting() {
  return verifyGodskillsRoutingExecutable({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
  });
}

function projection(selected, text = 'classify this mission without interpreting its prose') {
  return {
    mission: { requestId: 'routing-evidence-classifier-1', text },
    selected: selected.map((id) => ({ id })),
  };
}

test('verified routing retains one minimal immutable classification projection for every release card', async () => {
  const verified = await verifiedRouting();
  const evidence = verified.routing.activationClassificationEvidence;

  assert.equal(assertVerifiedGodskillsRoutingExecutable(verified), verified);
  assert.equal(evidence.cardsLogicalDigest, cardsLogicalDigest);
  assert.equal(evidence.cards.length, 22);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.cards), true);
  assert.equal(Object.isFrozen(evidence.cards[0]), true);
  assert.deepEqual(Object.keys(evidence).sort(), ['cards', 'cardsLogicalDigest']);
  assert.equal(new Set(evidence.cards.map(({ id }) => id)).size, 22);
  assert.deepEqual(
    evidence.cards.find(({ id }) => id === 'eternities-muse'),
    {
      id: 'eternities-muse',
      family: 'visual-interface-narrative-media',
      riskClass: 'moderate',
    },
  );
  assert.equal(evidence.cards.every((card) => Object.keys(card).sort().join(',') === 'family,id,riskClass'), true);
});

test('classifies exact routing evidence without reading mission prose or choosing activation mode', async () => {
  const { createRoutingEvidenceActivationClassifier } = await classifierModule();
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: await verifiedRouting(),
    reviewAvailable: true,
  });

  const cases = [
    ['eternities-aegis', 'verification', 'critical'],
    ['eternities-agora', 'general', 'consequential'],
    ['eternities-arcadia', 'creative-generation', 'consequential'],
    ['eternities-architect', 'implementation', 'consequential'],
    ['eternities-athena', 'research', 'low'],
    ['eternities-atlas', 'implementation', 'consequential'],
    ['eternities-beacon', 'general', 'consequential'],
    ['eternities-chorus', 'general', 'consequential'],
    ['eternities-daedalus', 'implementation', 'critical'],
    ['eternities-forge', 'implementation', 'consequential'],
    ['eternities-hephaestus', 'research', 'consequential'],
    ['eternities-herald', 'verification', 'consequential'],
    ['eternities-hermes', 'implementation', 'critical'],
    ['eternities-logos', 'creative-generation', 'consequential'],
    ['eternities-mnemosyne', 'continuity', 'consequential'],
    ['eternities-muse', 'creative-generation', 'consequential'],
    ['eternities-omnibus', 'research', 'low'],
    ['eternities-oracle', 'research', 'low'],
    ['eternities-orpheus', 'creative-generation', 'critical'],
    ['eternities-phoenix', 'debugging-recovery', 'consequential'],
    ['eternities-prometheus', 'general', 'consequential'],
    ['sovereign-skill-refinery', 'verification', 'consequential'],
  ];
  for (const [id, taskClass, consequenceClass] of cases) {
    assert.deepEqual(await classifier.classify(projection([id])), {
      taskClass,
      consequenceClass,
      reviewAvailable: true,
    }, id);
  }

  const first = await classifier.classify(projection(['eternities-oracle'], 'write a poem about a debugger'));
  const second = await classifier.classify(projection(['eternities-oracle'], 'repair a production database'));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['consequenceClass', 'reviewAvailable', 'taskClass']);
  assert.doesNotMatch(JSON.stringify(first), /mode|authority|path|credential|provider|realm|continuityWriter|keel|soul/i);
  assert.equal(Object.isFrozen(first), true);
});

test('mixed task classes collapse to general while highest verified risk wins independent of order', async () => {
  const { createRoutingEvidenceActivationClassifier } = await classifierModule();
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: await verifiedRouting(),
    reviewAvailable: false,
  });
  const expected = {
    taskClass: 'general',
    consequenceClass: 'critical',
    reviewAvailable: false,
  };
  assert.deepEqual(
    await classifier.classify(projection(['eternities-muse', 'eternities-aegis'])),
    expected,
  );
  assert.deepEqual(
    await classifier.classify(projection(['eternities-aegis', 'eternities-muse'])),
    expected,
  );
});

test('descriptor binds exact evidence taxonomy and review availability deterministically', async () => {
  const { createRoutingEvidenceActivationClassifier } = await classifierModule();
  const verified = await verifiedRouting();
  const first = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verified,
    reviewAvailable: true,
  });
  const second = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verified,
    reviewAvailable: true,
  });
  const withoutReview = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verified,
    reviewAvailable: false,
  });

  assert.deepEqual(first.descriptor, second.descriptor);
  assert.notEqual(first.descriptor.descriptorDigest, withoutReview.descriptor.descriptorDigest);
  assert.deepEqual(Object.keys(first).sort(), ['classify', 'descriptor']);
  assert.deepEqual(Object.keys(first.descriptor).sort(), [
    'authorityExpanded', 'cardsLogicalDigest', 'descriptorDigest', 'protocolId',
    'reviewAvailable', 'routingTrustRootDigest', 'schemaVersion', 'taxonomyDigest',
  ].sort());
  assert.equal(first.descriptor.protocolId, 'eternities-routing-evidence-activation-classifier-v1');
  assert.equal(first.descriptor.routingTrustRootDigest, routingTrustRootDigest);
  assert.equal(first.descriptor.cardsLogicalDigest, cardsLogicalDigest);
  assert.match(first.descriptor.taxonomyDigest, /^[a-f0-9]{64}$/);
  assert.match(first.descriptor.descriptorDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.descriptor.authorityExpanded, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.descriptor), true);
});

test('rejects unverified provenance and malformed or unknown selected evidence before classification', async () => {
  const { createRoutingEvidenceActivationClassifier } = await classifierModule();
  assert.throws(
    () => createRoutingEvidenceActivationClassifier({
      verifiedRoutingExecutable: {
        routing: {
          trustRootDigest: routingTrustRootDigest,
          activationClassificationEvidence: { cardsLogicalDigest, cards: [] },
        },
      },
      reviewAvailable: true,
    }),
    /verified|provenance|brand/i,
  );
  const verified = await verifiedRouting();
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verified,
    reviewAvailable: true,
  });
  assert.throws(
    () => createRoutingEvidenceActivationClassifier({
      verifiedRoutingExecutable: verified,
      reviewAvailable: 'yes',
    }),
    /review.*boolean/i,
  );
  for (const [name, input, pattern] of [
    ['unknown', projection(['eternities-invented']), /unknown|selected|identity/i],
    ['duplicate', projection(['eternities-muse', 'eternities-muse']), /duplicate|unique/i],
    ['empty', projection([]), /one to three|selected/i],
    ['too many', projection(['eternities-muse', 'eternities-aegis', 'eternities-oracle', 'eternities-forge']), /one to three|selected/i],
    ['extra field', { ...projection(['eternities-muse']), mode: 'method' }, /field|input/i],
    ['bad mission', { mission: { requestId: '', text: 'x' }, selected: [{ id: 'eternities-muse' }] }, /mission|request/i],
  ]) {
    await assert.rejects(Promise.resolve().then(() => classifier.classify(input)), pattern, name);
  }
});
