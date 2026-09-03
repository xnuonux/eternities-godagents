const PROTOCOL_ID = 'eternities-godagents-sdk-v1';
const VERSION = '0.1.0';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const DESCRIPTION = deepFreeze({
  schemaVersion: 1,
  protocolId: PROTOCOL_ID,
  version: VERSION,
  status: 'experimental',
  supportedProviderFamilies: [
    'anthropic-messages-v1',
    'openai-compatible-chat-completions-v1',
  ],
  proofLimits: {
    liveProviderQuality: false,
    remoteExactlyOnce: false,
    defaultLaunchAdoption: false,
    publicPublication: false,
    realmAuthority: false,
    continuityAuthority: false,
    evolutionAuthority: false,
    inspirationAuthority: false,
    lunariAuthority: false,
    soulAuthority: false,
  },
});

export const GODAGENT_SDK_PROTOCOL_ID = PROTOCOL_ID;
export const GODAGENT_SDK_VERSION = VERSION;

export function describeGodagentSdk() {
  return deepFreeze(structuredClone(DESCRIPTION));
}

export {
  assertProviderPhaseHostInstance,
  createProviderPhaseHost,
  verifyProviderPhaseHostDescription,
} from '../host/provider-phase-host-sdk.mjs';

export {
  createAdmittedProviderBackedIdentityLauncher,
  verifyAdmittedProviderBackedIdentityLauncherDescription,
} from '../host/admitted-provider-backed-identity-launcher.mjs';
