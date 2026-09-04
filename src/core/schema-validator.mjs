import { readFileSync } from 'node:fs';

import { canonicalJson } from './canonical-json.mjs';
import { SchemaError } from './errors.mjs';

const schemaFiles = {
  'agent-genome': 'agent-genome.schema.json',
  'distribution-manifest': 'distribution-manifest.schema.json',
  'realm-contract': 'realm-contract.schema.json',
  'realm-negotiation': 'realm-negotiation.schema.json',
  'realm-negotiated-action': 'realm-negotiated-action.schema.json',
  'realm-negotiated-consequence': 'realm-negotiated-consequence.schema.json',
  'vessel-event': 'vessel-event.schema.json',
  'organ-proposal': 'organ-proposal.schema.json',
  'decision-commit': 'decision-commit.schema.json',
  'action-receipt': 'action-receipt.schema.json',
  'recoverable-realm-consequence-receipt': 'recoverable-realm-consequence-receipt.schema.json',
  'realm-compensation-relation': 'realm-compensation-relation.schema.json',
  'recoverable-realm-compensation': 'recoverable-realm-compensation.schema.json',
  'cortex-attempt': 'cortex-attempt.schema.json',
  'host-policy': 'host-policy.schema.json',
  'identity-host-policy': 'identity-host-policy.schema.json',
  'admitted-typed-execution-host-policy': 'admitted-typed-execution-host-policy.schema.json',
  'typed-capability-executor-descriptor': 'typed-capability-executor-descriptor.schema.json',
  'admitted-typed-execution-host-completion': 'admitted-typed-execution-host-completion.schema.json',
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
  'godskills-routing-executable-pin': 'godskills-routing-executable-pin.schema.json',
  'godskills-cycle-receipt': 'godskills-cycle-receipt.schema.json',
  'godskills-release-migration': 'godskills-release-migration.schema.json',
  'cortex-binding-request': 'cortex-binding-request.schema.json',
  'cortex-identity-envelope': 'cortex-identity-envelope.schema.json',
  'cortex-model-projection': 'cortex-model-projection.schema.json',
  'cortex-binding-candidate': 'cortex-binding-candidate.schema.json',
  'cortex-binding-registry-state': 'cortex-binding-registry-state.schema.json',
  'cortex-binding-receipt': 'cortex-binding-receipt.schema.json',
  'cortex-binding-lifecycle-receipt': 'cortex-binding-lifecycle-receipt.schema.json',
  'codex-bound-turn-request': 'codex-bound-turn-request.schema.json',
  'codex-task-reservation-receipt': 'codex-task-reservation-receipt.schema.json',
  'codex-bound-turn-envelope': 'codex-bound-turn-envelope.schema.json',
  'codex-task-transport-receipt': 'codex-task-transport-receipt.schema.json',
  'codex-bound-turn-receipt': 'codex-bound-turn-receipt.schema.json',
  'codex-task-execution-receipt': 'codex-task-execution-receipt.schema.json',
  'codex-turn-journal-event': 'codex-turn-journal-event.schema.json',
  'codex-turn-journal-state': 'codex-turn-journal-state.schema.json',
  'codex-task-recovery-descriptor': 'codex-task-recovery-descriptor.schema.json',
  'codex-recoverable-transport-binding': 'codex-recoverable-transport-binding.schema.json',
  'codex-recoverable-bound-turn-receipt': 'codex-recoverable-bound-turn-receipt.schema.json',
  'mission-review-admission': 'mission-review-admission.schema.json',
  'mission-phase-executor-descriptor': 'mission-phase-executor-descriptor.schema.json',
  'mission-phase-request': 'mission-phase-request.schema.json',
  'mission-phase-result': 'mission-phase-result.schema.json',
  'mission-verdict': 'mission-verdict.schema.json',
  'mission-review-completion': 'mission-review-completion.schema.json',
  'mission-review-journal-event': 'mission-review-journal-event.schema.json',
  'mission-review-journal-state': 'mission-review-journal-state.schema.json',
  'mission-native-package': 'mission-native-package.schema.json',
  'mission-native-transport-descriptor': 'mission-native-transport-descriptor.schema.json',
  'mission-native-dispatch': 'mission-native-dispatch.schema.json',
  'mission-native-transport-completion': 'mission-native-transport-completion.schema.json',
  'identity-bound-native-transport-descriptor': 'identity-bound-native-transport-descriptor.schema.json',
  'identity-bound-native-dispatch': 'identity-bound-native-dispatch.schema.json',
  'identity-bound-native-completion': 'identity-bound-native-completion.schema.json',
  'identity-bound-mission-vessel-request': 'identity-bound-mission-vessel-request.schema.json',
  'identity-bound-mission-vessel-admission': 'identity-bound-mission-vessel-admission.schema.json',
  'identity-bound-mission-vessel-completion': 'identity-bound-mission-vessel-completion.schema.json',
  'recoverable-godskills-transport-descriptor': 'recoverable-godskills-transport-descriptor.schema.json',
  'recoverable-godskills-dispatch': 'recoverable-godskills-dispatch.schema.json',
  'recoverable-godskills-completion': 'recoverable-godskills-completion.schema.json',
  'recoverable-godskills-binding-intent': 'recoverable-godskills-binding-intent.schema.json',
  'recoverable-godskills-binding-record': 'recoverable-godskills-binding-record.schema.json',
  'recoverable-godskills-pending': 'recoverable-godskills-pending.schema.json',
  'recoverable-typed-composition-topology': 'recoverable-typed-composition-topology.schema.json',
  'recoverable-typed-composition-intent': 'recoverable-typed-composition-intent.schema.json',
  'recoverable-typed-composition-record': 'recoverable-typed-composition-record.schema.json',
  'recoverable-typed-composition-pending': 'recoverable-typed-composition-pending.schema.json',
  'deferred-godskills-review-package': 'deferred-godskills-review-package.schema.json',
  'godskills-review-transport-descriptor': 'godskills-review-transport-descriptor.schema.json',
  'godskills-review-dispatch': 'godskills-review-dispatch.schema.json',
  'godskills-review-transport-completion': 'godskills-review-transport-completion.schema.json',
  'mission-revision-package': 'mission-revision-package.schema.json',
  'mission-revision-transport-descriptor': 'mission-revision-transport-descriptor.schema.json',
  'mission-revision-dispatch': 'mission-revision-dispatch.schema.json',
  'mission-revision-transport-completion': 'mission-revision-transport-completion.schema.json',
  'openai-compatible-phase-transport-policy': 'openai-compatible-phase-transport-policy.schema.json',
  'anthropic-messages-phase-transport-policy': 'anthropic-messages-phase-transport-policy.schema.json',
  'openai-compatible-phase-resolution-policy': 'openai-compatible-phase-resolution-policy.schema.json',
  'provider-phase-resolution-policy': 'provider-phase-resolution-policy.schema.json',
  'portable-phase-host-description': 'portable-phase-host-description.schema.json',
  'bounded-delegation-admission': 'bounded-delegation-admission.schema.json',
  'bounded-delegation-input': 'bounded-delegation-input.schema.json',
  'bounded-delegation-worker-descriptor': 'bounded-delegation-worker-descriptor.schema.json',
  'bounded-delegation-worker-dispatch': 'bounded-delegation-worker-dispatch.schema.json',
  'bounded-delegation-worker-completion': 'bounded-delegation-worker-completion.schema.json',
  'bounded-delegation-event': 'bounded-delegation-event.schema.json',
  'bounded-delegation-state': 'bounded-delegation-state.schema.json',
  'bounded-delegation-completion': 'bounded-delegation-completion.schema.json',
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
