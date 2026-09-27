// Host configuration policy only. This module does not inspect a registry,
// acquire a lease, reset revocation, load credentials, or dispatch a tool.
export function nativeOperatorRevocationEpoch(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('native-operator:shape');
  }
  if (!Object.hasOwn(config, 'revocationEpoch')) return 0;
  const epoch = config.revocationEpoch;
  if (!Number.isSafeInteger(epoch) || epoch < 0 || Object.is(epoch, -0)) {
    throw new Error('native-operator:revocation-epoch');
  }
  return epoch;
}
export function nativeOperatorTask(config, sessionId) {
  return { taskId: sessionId, hostAdapterId: 'pi-sdk-v1',
    revocationEpoch: nativeOperatorRevocationEpoch(config) };
}
export function nativeOperatorError(error) {
  // Translate only this typed, fixed registry condition. Never print the raw
  // registry message: it can contain sensitive source or host information.
  if (error?.name === 'CortexBindingRegistryError'
      && error.code === 'revocation-epoch-mismatch') {
    return 'native-operator:revocation-epoch-mismatch';
  }
  return /^(native-operator|native-pi|native-host|native-session-report|native-run-history|native-godskills):[a-z0-9-]{1,80}$/.test(error?.message ?? '')
    ? error.message : 'native-operator:operation-failed';
}
