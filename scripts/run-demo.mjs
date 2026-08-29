import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import { createVessel } from '../src/runtime/vessel.mjs';
import { createLocalGodskillsTransport } from '../src/skills/godskills-adapter.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = resolve(repositoryRoot, 'artifacts', 'demo-runtime');
if (dirname(runtimeRoot) !== resolve(repositoryRoot, 'artifacts')) {
  throw new Error('demo runtime escaped the repository artifacts directory');
}
await rm(runtimeRoot, { recursive: true, force: true });

const contract = JSON.parse(await readFile(resolve(repositoryRoot, 'fixtures', 'realm-contract.json'), 'utf8'));
const realm = createFixtureRealm({ contract });
const transport = await createLocalGodskillsTransport({ repositoryRoot: 'C:\\dev\\eternities-godskills' });
const vessel = await createVessel({
  distributionDir: resolve(repositoryRoot, 'dist', 'fixture-agent'),
  instanceId: 'godagent-demo-1',
  journalPath: resolve(runtimeRoot, 'events.jsonl'),
  snapshotPath: resolve(runtimeRoot, 'snapshot.json'),
  cortex: createFixtureCortexA(),
  realm,
  godskillsTransport: transport,
  clock: () => '2026-08-28T00:00:00.000Z',
});
const result = await vessel.runCycle({
  requestId: 'demo-mission-1',
  text: 'increment the fixture counter once with a verified local receipt',
  authority: ['realm:write'],
  hostContext: {
    permittedEffects: ['local-read', 'local-write'],
    availableAuthority: ['local-read', 'local-write', 'realm:write'],
    availablePreconditions: ['realm-observed', 'realm-present'],
    forbiddenCapabilities: [],
    maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 4000,
    maxCompositionSize: 3,
  },
});
const inspected = vessel.inspect();
process.stdout.write(`${JSON.stringify({
  instanceId: inspected.instanceId,
  cortexAdapterId: inspected.cortexAdapterId,
  decisionId: result.decision.decisionId,
  actionId: result.receipt.actionId,
  expectedCounter: result.receipt.expectedTransition.counter,
  observedCounter: result.receipt.observedTransition.counter,
  discrepancyClass: result.receipt.discrepancyClass,
  journalPath: inspected.journalPath,
}, null, 2)}\n`);
