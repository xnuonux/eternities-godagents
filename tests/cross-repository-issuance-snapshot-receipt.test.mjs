import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { verifyCrossRepositoryIssuanceSnapshot } from '../src/integration/current-head-certificate.mjs';

const godagentsRoot = fileURLToPath(new URL('../', import.meta.url));
const godskillsRoot = 'C:/dev/eternities-godskills';
const certificatePath = join(godagentsRoot, 'integrations', 'cross-repository-issuance-snapshot-v1.json');
const godagentsCommit = 'ddd1a231f23ca341103009ff648de891527096cb';
const godskillsCommit = '753db46dee767c167ce15ae7eb4129c3a2075689';
const certificateDigest = '89a2caa6da4713e958234296a9848405330a7bcd9625bb56ca85c37dc2a671f0';

test('committed issuance snapshot is canonical and verifies its bound evidence', async () => {
  const text = await readFile(certificatePath, 'utf8');
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.equal(receipt.receiptDigest, certificateDigest);
  assert.deepEqual(
    await verifyCrossRepositoryIssuanceSnapshot(receipt, {
      godagentsRoot,
      godskillsRoot,
      expectedGodagentsCommit: godagentsCommit,
      expectedGodskillsCommit: godskillsCommit,
    }),
    { status: 'verified', receiptDigest: certificateDigest },
  );
  await assert.rejects(
    () => verifyCrossRepositoryIssuanceSnapshot(receipt, {
      godagentsRoot,
      godskillsRoot,
      expectedGodagentsCommit: godagentsCommit,
      expectedGodskillsCommit: godskillsCommit,
      requireExactRefs: true,
    }),
    /ref does not match certificate/i,
  );
  const historical = await readFile(
    join(godagentsRoot, 'receipts', 'godskills-v3-integration.json'),
    'utf8',
  );
  assert.equal(
    sha256Text(historical),
    receipt.godagents.evidence.integrationReceipt.sha256,
  );
});
