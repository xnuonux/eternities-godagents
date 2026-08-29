function normalize(value, ancestors) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonical JSON requires a finite number');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new TypeError(`canonical JSON cannot represent ${typeof value}`);
  }

  if (ancestors.has(value)) {
    throw new TypeError('canonical JSON cannot represent a cyclic value');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => normalize(entry, ancestors));
    }

    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalize(value[key], ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value, new Set()));
}
