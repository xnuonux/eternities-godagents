import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderResolutionAuthorityOutbox } from '../src/host/provider-resolution-authority-outbox.mjs';

test('authority outbox requires a closed durable root and certified host surfaces', async () => {
  await assert.rejects(
    createProviderResolutionAuthorityOutbox(),
    /authority outbox|root|host|controller/i,
  );
  await assert.rejects(
    createProviderResolutionAuthorityOutbox({
      root: 'C:\\fixture-authority-outbox',
      host: {},
      controller: {},
      signer: () => 'forbidden',
    }),
    /field|sign|authority outbox/i,
  );
});

