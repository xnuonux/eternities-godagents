import { sha256Text, sha256Value } from '../../src/core/digest.mjs';

export function guidanceFixture(text = 'Preserve the current task and reconcile pending operations before dispatching again.\n') {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-operating-guidance-v1',
    sourceRepository: 'https://github.com/xnuonux/ultragod-prompt-os',
    sourceCommit: '0e615a09f331a4f7cca7086f75c1ead1ddb86620',
    phases: ['native'],
    sections: [{ id: 'continuity', path: 'prompts/modules/continuity.md', sha256: sha256Text(text), text }],
  };
  return { ...unsigned, packageDigest: sha256Value(unsigned) };
}
