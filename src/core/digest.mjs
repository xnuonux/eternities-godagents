import { createHash } from 'node:crypto';

import { canonicalJson } from './canonical-json.mjs';

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256Value(value) {
  return sha256Text(canonicalJson(value));
}
