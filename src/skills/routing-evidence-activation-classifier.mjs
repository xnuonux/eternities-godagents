import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertVerifiedGodskillsRoutingExecutable } from './routing-executable-verifier.mjs';

const PROTOCOL_ID = 'eternities-routing-evidence-activation-classifier-v1';
const CAPABILITY_ID = /^[a-z0-9][a-z0-9-]*$/;
const FAMILY_TASK_CLASSES = Object.freeze({
  'agency-client-services': 'general',
  'architecture-specification': 'implementation',
  'audio-voice-media': 'creative-generation',
  'automation-mcp-integrations': 'implementation',
  'data-infrastructure': 'implementation',
  'debugging-recovery': 'debugging-recovery',
  'game-design-development': 'creative-generation',
  'governance-security': 'verification',
  'implementation-engineering': 'implementation',
  'knowledge-memory-context': 'continuity',
  'marketing-growth': 'general',
  'model-runtime-compute': 'research',
  'product-operations': 'general',
  'quarry-corpus-discovery': 'research',
  'release-publishing': 'verification',
  'repository-research': 'research',
  'scientific-epistemology': 'research',
  'skill-refinery': 'verification',
  'social-media-community': 'general',
  'visual-interface-narrative-media': 'creative-generation',
  'writing-narrative-canon': 'creative-generation',
});
const RISK_CONSEQUENCE_CLASSES = Object.freeze({
  low: 'low',
  moderate: 'consequential',
  high: 'critical',
});
const RISK_RANK = Object.freeze({ low: 0, moderate: 1, high: 2 });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} fields are invalid`);
  }
}

function nonEmptyString(value, label, { singleLine = false } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')
      || (singleLine && /[\r\n]/.test(value))) {
    throw new TypeError(`${label} must be a non-empty${singleLine ? ' single-line' : ''} string`);
  }
}

function verifyProjection(value, cardsById) {
  exactKeys(value, ['mission', 'selected'], 'routing-evidence classifier input');
  exactKeys(value.mission, ['requestId', 'text'], 'routing-evidence classifier mission');
  nonEmptyString(value.mission.requestId, 'routing-evidence classifier mission request id', { singleLine: true });
  nonEmptyString(value.mission.text, 'routing-evidence classifier mission text');
  if (!Array.isArray(value.selected) || value.selected.length < 1 || value.selected.length > 3) {
    throw new Error('routing-evidence classifier requires one to three selected capabilities');
  }
  const selected = [];
  const identities = new Set();
  for (const row of value.selected) {
    exactKeys(row, ['id'], 'routing-evidence classifier selected capability');
    if (typeof row.id !== 'string' || !CAPABILITY_ID.test(row.id)) {
      throw new TypeError('routing-evidence classifier selected identity is invalid');
    }
    if (identities.has(row.id)) {
      throw new Error('routing-evidence classifier selected identities must be unique');
    }
    identities.add(row.id);
    const card = cardsById.get(row.id);
    if (!card) throw new Error(`routing-evidence classifier selected identity is unknown: ${row.id}`);
    selected.push(card);
  }
  return selected;
}

function taxonomyValue() {
  return {
    schemaVersion: 1,
    unknownFamilyFallback: 'general',
    mixedTaskClassFallback: 'general',
    familyTaskClasses: Object.entries(FAMILY_TASK_CLASSES)
      .map(([family, taskClass]) => ({ family, taskClass })),
    riskConsequenceClasses: Object.entries(RISK_CONSEQUENCE_CLASSES)
      .map(([riskClass, consequenceClass]) => ({ riskClass, consequenceClass })),
  };
}

export function createRoutingEvidenceActivationClassifier({
  verifiedRoutingExecutable,
  reviewAvailable,
} = {}) {
  const verified = assertVerifiedGodskillsRoutingExecutable(verifiedRoutingExecutable);
  if (typeof reviewAvailable !== 'boolean') {
    throw new TypeError('routing-evidence classifier review availability must be a boolean');
  }
  const evidence = verified.routing.activationClassificationEvidence;
  exactKeys(evidence, ['cards', 'cardsLogicalDigest'], 'verified routing classification evidence');
  const cardsById = new Map(evidence.cards.map((card) => [card.id, card]));
  if (cardsById.size !== evidence.cards.length) {
    throw new Error('verified routing classification evidence contains duplicate identities');
  }
  const taxonomyDigest = sha256Value(taxonomyValue());
  const unsignedDescriptor = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    routingTrustRootDigest: verified.routing.trustRootDigest,
    cardsLogicalDigest: evidence.cardsLogicalDigest,
    taxonomyDigest,
    reviewAvailable,
    authorityExpanded: false,
  };
  const descriptor = deepFreeze({
    ...unsignedDescriptor,
    descriptorDigest: sha256Value(unsignedDescriptor),
  });

  function classify(input) {
    const selected = verifyProjection(input, cardsById);
    const taskClasses = new Set(selected.map(({ family }) => FAMILY_TASK_CLASSES[family] ?? 'general'));
    const highestRisk = selected.reduce(
      (highest, { riskClass }) => RISK_RANK[riskClass] > RISK_RANK[highest] ? riskClass : highest,
      'low',
    );
    return deepFreeze({
      taskClass: taskClasses.size === 1 ? [...taskClasses][0] : 'general',
      consequenceClass: RISK_CONSEQUENCE_CLASSES[highestRisk],
      reviewAvailable,
    });
  }

  return Object.freeze({ descriptor, classify });
}
