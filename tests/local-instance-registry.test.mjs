import assert from 'node:assert/strict';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { defaultLocalInstanceRegistryRoot } from '../src/host/local-instance-registry.mjs';

test('default residency root comes from the OS account profile, not launch environment paths', () => {
  assert.equal(
    defaultLocalInstanceRegistryRoot(),
    join(userInfo().homedir, '.eternities', 'godagents', 'instances'),
  );
});
