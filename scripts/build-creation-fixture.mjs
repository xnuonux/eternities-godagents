import { fileURLToPath } from 'node:url';

import { compileCreation, verifyCreationBuild } from '../src/creation/compile.mjs';

const fixtureRoot = new URL('../fixtures/creation/', import.meta.url);
const outputDir = fileURLToPath(new URL('../artifacts/creation-fixture/', import.meta.url));

const result = await compileCreation({
  candidatePath: new URL('creation-candidate.json', fixtureRoot),
  policyPath: new URL('creation-policy.json', fixtureRoot),
  expressionPath: new URL('expression-overlay.json', fixtureRoot),
  moduleDirectory: new URL('modules/', fixtureRoot),
  outputDir,
});
const verified = await verifyCreationBuild(outputDir);
if (verified.buildId !== result.manifest.buildId) throw new Error('creation fixture verification changed build identity');
process.stdout.write(`${verified.buildId}\n`);
