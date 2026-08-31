export const pinnedGodskillsTypedExecutionStepperSourceCommit =
  '83e34059b3d384805047b00af7a865356ea18ecf';

export function pinnedGodskillsTypedExecutionStepperRelease(repositoryRoot, overrides = {}) {
  return {
    protocolId: 'eternities-godskills-typed-execution-stepper-consumer-v1',
    sourceCommit: pinnedGodskillsTypedExecutionStepperSourceCommit,
    repositoryRoot,
    releaseReceipt: {
      path: 'receipts/typed-execution-stepper-v1.json',
      sha256: 'c4e88277cc2b0047f3a428e94a185cbf6e0683c6ac1955bada0baebe71fe2d69',
      bytes: 14003,
      receiptDigest: '5caff10e19ec98020da451396af11a9e479afa61ba4d43546ce1559b23da2b17',
    },
    module: {
      path: 'src/typed-execution-stepper.mjs',
      sha256: '37adc58f65dc6dccdf02bfa3a5fb69dac293e7c3e4d29f9f181e8e252ebab993',
      bytes: 12030,
    },
    expected: {
      parentReceiptDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
      parentFileSha256: 'bf311f1eebce635b5217ecb69fda6b8741889bc60f0be8186d14a3bcbe900f11',
      fixtureDigest: 'f514832922c2a7bf9c941f1dbbeb5a257c52cd8558e49b6a283731a5812578df',
      fixtureFileSha256: '33b15ead306a78eee87315de02e054cd7de1d4e59a40622df42fc86147e35898',
      sourceClosureDigest: 'ea47d0ff68ad3a881f9c0507a9631494b508f2ebf4c913741c1a0f00d9e05b79',
      completionDigest: 'ced937d65ee7ebcb2e30db2828105be98608c0b6f9bd946e579d33e969d46191',
      executionDigest: 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7',
    },
    ...structuredClone(overrides),
  };
}
