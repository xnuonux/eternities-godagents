import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { sha256Text } from '../core/digest.mjs';

const metadataPattern = /^<!--\s*(ULTRAGOD Prompt OS)\s+([0-9]+(?:\.[0-9]+)*)\s+\|\s+Edition:\s*([a-z0-9-]+)\s+\|\s+Adapter:\s*([a-z0-9-]+)\s+\|\s+Receipt:\s*([^|>\s]+)\s*-->/;

function localPath(path) {
  return path instanceof URL ? fileURLToPath(path) : path;
}

export async function inspectPromptArtifact(path) {
  const resolvedPath = localPath(path);
  const content = await readFile(resolvedPath, 'utf8');
  const match = content.match(metadataPattern);
  if (!match) {
    throw new Error('Prompt OS metadata header is required');
  }

  return {
    path: resolvedPath,
    bytes: Buffer.byteLength(content, 'utf8'),
    sha256: sha256Text(content),
    metadata: {
      product: match[1],
      version: match[2],
      edition: match[3],
      adapter: match[4],
      receipt: match[5],
    },
  };
}
