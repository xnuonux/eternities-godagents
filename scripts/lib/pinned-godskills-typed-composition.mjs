export const pinnedGodskillsTypedCompositionSourceCommit =
  '7c1a183d55616310ac96255dd996536c53c8b577';

export function pinnedGodskillsTypedCompositionRelease(repositoryRoot, overrides = {}) {
  return {
    protocolId: 'eternities-godskills-typed-composition-consumer-v1',
    sourceCommit: pinnedGodskillsTypedCompositionSourceCommit,
    repositoryRoot,
    releaseReceipt: {
      path: 'receipts/typed-composition-v1.json',
      sha256: 'bf311f1eebce635b5217ecb69fda6b8741889bc60f0be8186d14a3bcbe900f11',
      bytes: 8349,
      receiptDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
    },
    module: {
      path: 'src/typed-composition.mjs',
      sha256: 'd2189dd88d0fad0d1255ff48f4429bdbb5baa9c06d14052551afd49d4bcef4f0',
    },
    policy: {
      path: 'policies/typed-composition.v1.json',
      sha256: 'f5934f9b22fc3ede905fec359cc9697f40b23ede4f7144eb298f4cd184b005fd',
    },
    expected: {
      capabilityLayerReceiptDigest: '1c19271951abb00e93529656a35e8fb52dccc2f3cf0b6208bcee6821361ab788',
      activationTrustRootDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
      registryDigest: '5143a9ca74b5676605c33e94c7d610d830c3aafe7d57c32a48558d5112b713b8',
      planDigest: '9849b421071a74535028cabd70d92db3cd4df6d4b0433f83bb562fb14d47d48f',
      methodDigest: '63b0a268841992c55953415b279f8e76277a80b0152f49260b3a22db9a75e3c2',
      executionDigest: 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7',
    },
    ...structuredClone(overrides),
  };
}
