import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  claimLocalInstanceResidency,
  defaultLocalInstanceRegistryRoot,
} from '../src/host/local-instance-registry.mjs';

test('default residency root comes from the OS account profile, not launch environment paths', () => {
  assert.equal(
    defaultLocalInstanceRegistryRoot(),
    join(userInfo().homedir, '.eternities', 'godagents', 'instances'),
  );
});

test('residency initialization recovers an abandoned pending publication without exposing partial final state', async (context) => {
  const registryRoot = await mkdtemp(join(tmpdir(), 'godagent-residency-publication-'));
  context.after(() => rm(registryRoot, { recursive: true, force: true }));
  const binding = {
    instanceId: 'agent-publication-recovery',
    genesisId: 'a'.repeat(64),
    keelId: `keel-${'b'.repeat(64)}`,
  };
  const key = createHash('sha256').update(binding.instanceId, 'utf8').digest('hex');
  const recordPath = join(registryRoot, `${key}.json`);
  const pendingPath = `${recordPath}.writing`;
  await writeFile(pendingPath, '{"schemaVersion":1', 'utf8');

  const first = await claimLocalInstanceResidency({
    registryRoot,
    binding,
    admissionRoot: join(registryRoot, 'admission'),
  });
  await assert.rejects(() => access(pendingPath), { code: 'ENOENT' });
  assert.equal(JSON.parse(await readFile(recordPath, 'utf8')).recordDigest, first.recordDigest);

  const second = await claimLocalInstanceResidency({
    registryRoot,
    binding,
    admissionRoot: join(registryRoot, 'admission'),
  });
  assert.deepEqual(second, first);
});
