import { join } from 'node:path';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';

// Path assembly only. Callers still authenticate the admission tree, binding,
// policy and genesis through the existing verifiers before using the result.
export function localGenesisAdmission(root, binding) {
  return {
    receiptPath: join(root, 'transaction', 'genesis-receipt.json'),
    creationDir: join(root, 'creation'),
    distributionDir: join(root, 'distribution'),
    expectedPolicyDigest: binding.policyDigest,
    expectedCreationBuildId: binding.creationBuildId,
    instanceId: binding.instanceId,
    creatorRef: binding.creatorRef,
    transactionDir: join(root, 'transaction'),
    journalPath: join(root, 'vessel', 'journal.jsonl'),
    snapshotPath: join(root, 'vessel', 'snapshot.json'),
    keelAdapter: createLocalKeelBackend({ root: join(root, 'keels') }),
  };
}
