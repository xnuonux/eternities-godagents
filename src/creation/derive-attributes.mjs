import { ATTRIBUTE_NAMES, byteCompare, deepFreeze } from './contracts.mjs';

function assertMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertKnownIntegerMap(value, label, minimum, maximum) {
  assertMap(value, label);
  const allowed = new Set(ATTRIBUTE_NAMES);
  for (const [name, amount] of Object.entries(value)) {
    if (!allowed.has(name)) throw new TypeError(`unknown attribute ${name}`);
    if (!Number.isInteger(amount) || amount < minimum || amount > maximum) {
      throw new TypeError(`invalid ${label} ${name}`);
    }
  }
}

export function deriveAttributes({ attributes, lineage, archetype }) {
  assertKnownIntegerMap(attributes, 'base attribute', 0, 100);
  assertKnownIntegerMap(lineage, 'lineage modifier', -25, 25);
  assertKnownIntegerMap(archetype, 'archetype modifier', -25, 25);

  const output = {};
  for (const name of [...ATTRIBUTE_NAMES].sort(byteCompare)) {
    if (!Object.hasOwn(attributes, name)) throw new TypeError(`base attribute ${name} is required`);
    const derived = attributes[name] + (lineage[name] ?? 0) + (archetype[name] ?? 0);
    if (derived > 100) throw new TypeError(`derived attribute ${name} exceeds 100`);
    if (derived < 0) throw new TypeError(`derived attribute ${name} falls below 0`);
    output[name] = derived;
  }
  return deepFreeze(output);
}
