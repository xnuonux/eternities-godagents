export function pinnedGodskillsReviewRelease(repositoryRoot, overrides = {}) {
  return {
    adapterProtocol: 'eternities-godskills-adapter-v1',
    repositoryRoot,
    systemReceipt: {
      path: 'receipts/godskills-system-certification-v3.json',
      sha256: '228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57',
    },
    routerReceipt: {
      path: 'receipts/agent-native-router-v8.json',
      sha256: 'b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3',
    },
    compilerReceipt: {
      path: 'receipts/intent-compiler-v3.json',
      sha256: '1ca40ec9138c1d0583068ee4dc3db58f0b77b07f631a2b38d9c47eb28ccce49a',
    },
    portableReceipt: {
      path: 'receipts/portable-capability-manifest-v1.json',
      sha256: 'f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d',
    },
    portableManifest: {
      path: 'artifacts/portable-capabilities/manifest.v1.json',
      sha256: 'ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a',
      manifestDigest: 'df646600e601dae7208d460135773f5d436b75117c45a3acad85fae6ff91c3c8',
    },
    semanticEffectBindings: { read: ['local-read'], write: ['local-write'] },
    maximumSelected: 3,
    maximumPackageBytes: 32768,
    activation: {
      protocolId: 'eternities-godskills-activation-v1',
      executableReceipt: {
        path: 'receipts/adaptive-activation-executable-v1.json',
        sha256: '98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f',
        receiptDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
      },
      parentReceipt: {
        path: 'receipts/adaptive-activation-v1.json',
        sha256: '6c6d689ecf9df14823407a917e89a5848776fb50eca3b7acc0d70056ae305f70',
        receiptDigest: 'a28a0af7e588f2abbbe1d51a15775dfbeb8d565109d0a176711bfa73b520440f',
      },
      entrypoint: {
        path: 'scripts/activation.mjs',
        sha256: 'e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a',
      },
      compiler: {
        path: 'src/adaptive-activation.mjs',
        sha256: '9844aee1147f7129f3e37067424ccebb88ff478de1b7a9a9fb7306d5f2fdbd82',
      },
      dependencies: [
        {
          path: 'scripts/build-adaptive-activation-executable-receipt.mjs',
          sha256: 'd35fa44632711c64c1e23f84f80fc0edfb5adbed4261ef88b7d9c32de2d96486',
        },
        {
          path: 'src/adaptive-activation-protocol.mjs',
          sha256: 'e697fe37d18a76de22ca4fdcd8ade6089bceddb20baad971e895bc49c9b0172e',
        },
        {
          path: 'src/io.mjs',
          sha256: '48dca2b203947e12ca3d5500b70a25066a8166d86bc2284aaeed6abf622a5c37',
        },
        {
          path: 'src/static-module-closure.mjs',
          sha256: '3bb0d825e6838b901315e685f9e5b02c94dac316ccb7788f54cd6fd18cd6a6ab',
        },
      ],
      schemas: {
        request: {
          path: 'schemas/adaptive-activation-request.v1.schema.json',
          sha256: 'bcadd846b96809733837183e12dba6f8d094409aa7c16e5676fa63357e3c2cde',
        },
        result: {
          path: 'schemas/adaptive-activation-result.v1.schema.json',
          sha256: '0a069a5eb121e625aa4ea529cbb48783e266e4c7c7f36f93ee24749303dd4391',
        },
      },
      policy: {
        path: 'policies/adaptive-activation.v1.json',
        sha256: 'b87bbfaddecb42417e57202173220bf240204d27b7de5fffc9e609eb18138939',
        logicalDigest: 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d',
      },
      evidence: {
        path: 'artifacts/adaptive-activation/evidence.v1.json',
        sha256: 'b55a5cb4f7ff039cc7f4027c165b2f151bad723d9030913076a4225342fbe8c5',
        logicalDigest: '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07',
      },
      contract: {
        path: 'artifacts/adaptive-activation/neutral-contract.json',
        sha256: 'feade348d3fd31afd5103eb296181f68000186d3193a995e4b77c25a06e57c92',
      },
    },
    ...overrides,
  };
}
