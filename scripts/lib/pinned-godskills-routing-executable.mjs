export const pinnedGodskillsRoutingSourceCommit = '7aad930bdb5408ba65e03acf8a56d1978021bcaf';

export function pinnedGodskillsRoutingExecutable(overrides = {}) {
  return {
    protocolId: 'eternities-godskills-routing-executable-v1',
    executableReceipt: {
      path: 'receipts/routing-executable-v1.json',
      sha256: '27cd2bc10ab225f62916f684bd5a621a3ffeaec43ef93c36d8b5b53188193c7d',
      receiptDigest: '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28',
    },
    entrypoint: {
      path: 'scripts/routing.mjs',
      sha256: 'd739bfde833fb08e4675c4de5fe4ec8b46cfec29b3155a72bdf03550d45c60ce',
    },
    ...structuredClone(overrides),
  };
}
