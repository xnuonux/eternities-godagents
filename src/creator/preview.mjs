import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { CreationCompatibilityError } from '../creation/compatibility-error.mjs';
import { assertCreationCompatibility, resolveSelectedModules } from '../creation/compatibility.mjs';
import { MODULE_KINDS, deepFreeze } from '../creation/contracts.mjs';
import { deriveAttributes } from '../creation/derive-attributes.mjs';
import { projectGenome } from '../creation/project-genome.mjs';
import { creatorDraftProjection } from './draft.mjs';

const REQUIRED_FIELDS = Object.freeze([
  'blueprint', 'genesis', 'expressionRef', 'telos', 'constitution',
  'promptOs', 'memory', 'realm',
]);
const EXCLUDED = Object.freeze([
  'credentials', 'genesis-admission', 'host-policy', 'inspiration', 'keel',
  'provider-routing', 'realm-authority', 'soul-runtime',
]);

function catalogProjection(catalog) {
  return {
    schemaVersion: catalog.schemaVersion,
    policyDigest: catalog.policyDigest,
    modules: catalog.modules,
    expressions: catalog.expressions,
    presets: catalog.presets,
  };
}

function seal(unsigned) {
  return deepFreeze(structuredClone({ ...unsigned, previewDigest: sha256Value(unsigned) }));
}

function assertBoundary(draft, catalog, sourceLoader) {
  creatorDraftProjection(draft);
  if (!catalog || typeof catalog !== 'object'
      || sha256Value(catalogProjection(catalog)) !== catalog.catalogDigest
      || draft.catalogDigest !== catalog.catalogDigest
      || sourceLoader?.catalogDigest !== catalog.catalogDigest
      || typeof sourceLoader.resolvePolicy !== 'function'
      || typeof sourceLoader.resolveModule !== 'function'
      || typeof sourceLoader.resolveExpression !== 'function') {
    throw new TypeError('creator preview trust boundary mismatch');
  }
  const policy = sourceLoader.resolvePolicy();
  if (sha256Value(policy) !== catalog.policyDigest) {
    throw new TypeError('creator preview trust boundary mismatch');
  }
  return policy;
}

function missingIssues(draft) {
  const codes = [];
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(draft, field)) {
      const label = field === 'expressionRef' ? 'expression' : field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      codes.push(`missing-${label}`);
    }
  }
  for (const kind of MODULE_KINDS) {
    if (!Object.hasOwn(draft.moduleRefs, kind)) codes.push(`missing-module-${kind}`);
  }
  return codes.sort().map((code) => ({ code }));
}

function candidateFromDraft(draft) {
  const candidate = {
    schemaVersion: 1,
    blueprint: draft.blueprint,
    genesis: draft.genesis,
    telos: draft.telos,
    constitution: draft.constitution,
    promptOs: draft.promptOs,
    memory: draft.memory,
    moduleRefs: draft.moduleRefs,
    expressionRef: draft.expressionRef,
    realm: draft.realm,
    evolution: draft.evolution,
    soulPort: draft.soulPort,
  };
  assertSchema('creation-candidate', candidate);
  return candidate;
}

export function previewCreatorDraft({ draft, catalog, sourceLoader }) {
  const policy = assertBoundary(draft, catalog, sourceLoader);
  const common = {
    schemaVersion: 1,
    status: 'incomplete',
    catalogDigest: catalog.catalogDigest,
    draftDigest: draft.draftDigest,
    selection: {
      expressionRef: draft.expressionRef ?? null,
      moduleRefs: draft.moduleRefs,
    },
    excludedFromAuthority: [...EXCLUDED],
  };
  const missing = missingIssues(draft);
  if (missing.length > 0) return seal({ ...common, issues: missing });

  const candidate = candidateFromDraft(draft);
  const moduleMap = new Map();
  for (const kind of MODULE_KINDS) {
    const ref = candidate.moduleRefs[kind];
    const source = sourceLoader.resolveModule(ref);
    const row = catalog.modules.find((entry) => entry.ref === ref);
    if (!row || sha256Value(source) !== row.sourceDigest) {
      throw new TypeError('creator preview trust boundary mismatch');
    }
    moduleMap.set(ref, source);
  }
  const selectedModules = resolveSelectedModules({ candidate, modulesByRef: moduleMap });
  const expression = sourceLoader.resolveExpression(candidate.expressionRef);
  const expressionRow = catalog.expressions.find((entry) => entry.ref === candidate.expressionRef);
  if (!expressionRow || sha256Value(expression) !== expressionRow.sourceDigest) {
    throw new TypeError('creator preview trust boundary mismatch');
  }

  let validations;
  try {
    validations = assertCreationCompatibility({ candidate, policy, selectedModules });
  } catch (error) {
    if (!(error instanceof CreationCompatibilityError)) throw error;
    return seal({
      ...common,
      status: 'blocked',
      issues: [{ code: error.code }],
      candidate,
      expression,
    });
  }

  const derivedAttributes = deriveAttributes({
    attributes: selectedModules.attributes.payload.values,
    lineage: selectedModules.lineage.payload.attributeModifiers,
    archetype: selectedModules.archetype.payload.attributeModifiers,
  });
  const genome = projectGenome({ candidate, selectedModules, derivedAttributes });
  return seal({
    ...common,
    status: 'ready',
    issues: [],
    candidate,
    expression,
    derivedAttributes,
    validations,
    genome,
    genomeDigest: sha256Value(genome),
  });
}
