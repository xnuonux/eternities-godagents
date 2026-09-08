import { assertProviderPhaseHostInstance } from './provider-phase-host-sdk.mjs';
import { assertPortablePhaseHostInstance } from '../sdk/portable-phase-host.mjs';
import { launchAdmittedSealedIdentityMission } from './admitted-sealed-identity-launch.mjs';

const fields = new Set(['admissionRoot', 'policyPath', 'request', 'identityPolicyDigest',
  'registryRoot', 'clock', 'checkpoint', 'lockOptions']);
const required = ['admissionRoot', 'policyPath', 'request', 'identityPolicyDigest'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Native-only facade over an already issued host. It neither constructs review
// executors nor selects a provider, resolves credentials, or authors policy.
export function createAdmittedEffectOnlyIdentityLauncher(configuration) {
  if (!object(configuration) || Object.keys(configuration).length !== 2
      || !Object.hasOwn(configuration, 'host') || !Object.hasOwn(configuration, 'hostKind')
      || !['provider', 'portable'].includes(configuration.hostKind)) {
    throw new TypeError('effect-only launcher configuration is invalid');
  }
  const { host, hostKind } = configuration;
  const description = hostKind === 'provider'
    ? assertProviderPhaseHostInstance(host) : assertPortablePhaseHostInstance(host);
  const nativeTransport = host.native;
  const describe = () => ({ schemaVersion: 2,
    protocolId: 'eternities-admitted-effect-only-identity-launcher-v2', mode: 'effect-only',
    hostKind, host: structuredClone(description), nativeTransport: structuredClone(description.descriptors.native) });
  return Object.freeze({
    describe,
    async launch(input) {
      if (!object(input) || Object.keys(input).some(key => !fields.has(key))
          || required.some(key => !Object.hasOwn(input, key))) throw new TypeError('effect-only launch fields are invalid');
      if (typeof input.identityPolicyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.identityPolicyDigest)) {
        throw new TypeError('effect-only policy digest is invalid');
      }
      const request = structuredClone(input.request);
      if (request?.schemaVersion !== 2 || request.routeMode !== 'effect-only') {
        throw new TypeError('effect-only launcher requires a v2 effect-only request');
      }
      host.assertCredentialAbsent(request);
      return launchAdmittedSealedIdentityMission({ admissionRoot: input.admissionRoot,
        policyPath: input.policyPath, request,
        env: { GODAGENT_IDENTITY_POLICY_SHA256: input.identityPolicyDigest },
        nativeTransport, reviewExecutor: null, revisionExecutor: null,
        registryRoot: input.registryRoot, clock: input.clock, checkpoint: input.checkpoint,
        lockOptions: input.lockOptions });
    },
  });
}
