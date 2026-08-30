import { readFileSync } from 'node:fs';

import { canonicalJson } from './canonical-json.mjs';
import { SchemaError } from './errors.mjs';

const schemaFiles = {
  'agent-genome': 'agent-genome.schema.json',
  'distribution-manifest': 'distribution-manifest.schema.json',
  'realm-contract': 'realm-contract.schema.json',
  'vessel-event': 'vessel-event.schema.json',
  'organ-proposal': 'organ-proposal.schema.json',
  'decision-commit': 'decision-commit.schema.json',
  'action-receipt': 'action-receipt.schema.json',
  'cortex-attempt': 'cortex-attempt.schema.json',
  'host-policy': 'host-policy.schema.json',
  'creation-candidate': 'creation-candidate.schema.json',
  'expression-overlay': 'expression-overlay.schema.json',
  'creation-policy': 'creation-policy.schema.json',
  'creation-module': 'creation-module.schema.json',
  'module-manifest': 'module-manifest.schema.json',
  'creation-build-manifest': 'creation-build-manifest.schema.json',
  'genesis-intent': 'genesis-intent.schema.json',
  'genesis-state': 'genesis-state.schema.json',
  'genesis-receipt': 'genesis-receipt.schema.json',
  'keel-record': 'keel-record.schema.json',
  'creator-command': 'creator-command.schema.json',
  'creator-draft': 'creator-draft.schema.json',
  'creator-preset': 'creator-preset.schema.json',
  'creator-review-seal': 'creator-review-seal.schema.json',
  'godskills-release-pin': 'godskills-release-pin.schema.json',
  'godskills-cycle-receipt': 'godskills-cycle-receipt.schema.json',
};

const schemas = new Map(Object.entries(schemaFiles).map(([name, file]) => {
  const url = new URL(`../../schemas/${file}`, import.meta.url);
  return [name, JSON.parse(readFileSync(url, 'utf8'))];
}));

const pointerPart = (part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1');
const childPointer = (pointer, part) => `${pointer}/${pointerPart(part)}`;

function matchesType(type, value) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function resolveReference(root, reference, schemaName, pointer) {
  if (!reference.startsWith('#/')) {
    throw new SchemaError(schemaName, pointer, 'only local schema references are supported');
  }

  let current = root;
  for (const rawPart of reference.slice(2).split('/')) {
    const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
    current = current?.[part];
  }
  if (!current) {
    throw new SchemaError(schemaName, pointer, 'schema reference does not resolve');
  }
  return current;
}

function validateNode({ schemaName, root, rule, value, pointer }) {
  if (rule.$ref) {
    validateNode({ schemaName, root, rule: resolveReference(root, rule.$ref, schemaName, pointer), value, pointer });
    return;
  }

  if (rule.const !== undefined && value !== rule.const) {
    throw new SchemaError(schemaName, pointer, 'const');
  }
  if (rule.enum && !rule.enum.includes(value)) {
    throw new SchemaError(schemaName, pointer, 'enum');
  }
  if (rule.type && !matchesType(rule.type, value)) {
    throw new SchemaError(schemaName, pointer, `type ${rule.type}`);
  }
  if (typeof value === 'string' && rule.minLength !== undefined && value.length < rule.minLength) {
    throw new SchemaError(schemaName, pointer, `minLength ${rule.minLength}`);
  }
  if (typeof value === 'string' && rule.maxLength !== undefined && value.length > rule.maxLength) {
    throw new SchemaError(schemaName, pointer, `maxLength ${rule.maxLength}`);
  }
  if (typeof value === 'number' && rule.minimum !== undefined && value < rule.minimum) {
    throw new SchemaError(schemaName, pointer, `minimum ${rule.minimum}`);
  }
  if (typeof value === 'number' && rule.maximum !== undefined && value > rule.maximum) {
    throw new SchemaError(schemaName, pointer, `maximum ${rule.maximum}`);
  }

  if (Array.isArray(value) && rule.minItems !== undefined && value.length < rule.minItems) {
    throw new SchemaError(schemaName, pointer, `minItems ${rule.minItems}`);
  }
  if (Array.isArray(value) && rule.maxItems !== undefined && value.length > rule.maxItems) {
    throw new SchemaError(schemaName, pointer, `maxItems ${rule.maxItems}`);
  }
  if (Array.isArray(value) && rule.uniqueItems === true) {
    const canonicalItems = value.map((entry) => canonicalJson(entry));
    if (new Set(canonicalItems).size !== canonicalItems.length) {
      throw new SchemaError(schemaName, pointer, 'uniqueItems');
    }
  }

  if (Array.isArray(value) && rule.items) {
    value.forEach((entry, index) => validateNode({
      schemaName,
      root,
      rule: rule.items,
      value: entry,
      pointer: childPointer(pointer, index),
    }));
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = rule.properties ?? {};
    for (const required of rule.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        throw new SchemaError(schemaName, childPointer(pointer, required), 'required');
      }
    }

    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateNode({
          schemaName,
          root,
          rule: properties[key],
          value: entry,
          pointer: childPointer(pointer, key),
        });
      } else if (rule.additionalProperties === false) {
        throw new SchemaError(schemaName, childPointer(pointer, key), 'additionalProperties');
      } else if (typeof rule.additionalProperties === 'object') {
        validateNode({
          schemaName,
          root,
          rule: rule.additionalProperties,
          value: entry,
          pointer: childPointer(pointer, key),
        });
      }
    }
  }
}

export function validateAgainstSchema(schemaName, schema, value) {
  validateNode({ schemaName, root: schema, rule: schema, value, pointer: '' });
  return value;
}

export function assertSchema(schemaName, value) {
  const schema = schemas.get(schemaName);
  if (!schema) {
    throw new SchemaError(schemaName, '', 'unknown schema');
  }
  return validateAgainstSchema(schemaName, schema, value);
}
