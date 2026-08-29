import { resolve } from 'node:path';

import { loadHostPolicy } from '../src/host/policy.mjs';

if (process.argv.length !== 3) {
  process.stderr.write('usage: node scripts/hash-host-policy.mjs <policy-path>\n');
  process.exitCode = 2;
} else {
  try {
    const { digest } = await loadHostPolicy(resolve(process.argv[2]));
    process.stdout.write(`${digest}\n`);
  } catch {
    process.stderr.write('host policy digest failed\n');
    process.exitCode = 1;
  }
}
