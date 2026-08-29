import { sha256Text } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';

const sourceClasses = new Set(['imported', 'inferred', 'lived-observation']);
const perspectives = new Set(['lived', 'recorded-testimony']);

export function admitMemory({ record, policy }) {
  if (policy?.foreignHistoryPolicy !== 'provenance-only') {
    throw new IntegrityError('memory admission requires the provenance-only foreign history policy');
  }
  if (!record?.memoryId || !record?.sourceRef || !record?.content) {
    throw new IntegrityError('memory admission requires identity, source, and content');
  }
  if (!sourceClasses.has(record.sourceClass) || !perspectives.has(record.perspective)) {
    throw new IntegrityError('memory admission received an unsupported provenance class');
  }
  if (record.perspective === 'lived' && record.sourceClass !== 'lived-observation') {
    throw new IntegrityError('foreign or inferred content cannot be admitted as lived history');
  }

  return Object.freeze({
    schemaVersion: 1,
    ...record,
    contentDigest: sha256Text(record.content),
  });
}
