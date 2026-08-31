import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { launchReceiptBoundAdmittedSealedTypedExecutionMission } from '../../src/host/receipt-bound-admitted-sealed-typed-execution-launch.mjs';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('receipt-bound child input path is required');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const completion = await launchReceiptBoundAdmittedSealedTypedExecutionMission(input);
process.stdout.write(`${canonicalJson(completion)}\n`);
