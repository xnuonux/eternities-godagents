import { diagnosticFailure } from './attempt.mjs';

export function createBoundedDispatch(configuration, { fetchImpl, now = () => performance.now() }) {
  const config = Object.freeze({ ...configuration });
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash
      || typeof config.model !== 'string' || !config.model || typeof fetchImpl !== 'function'
      || ['maximumCalls', 'maximumReservedTokens', 'maximumRequestBytes', 'maximumWallMs', 'timeoutMs']
        .some(key => !Number.isSafeInteger(config[key]) || config[key] < 1)
      || config.timeoutMs > 2_147_483_647 || config.maximumWallMs > 2_147_483_647) {
    throw new Error('invalid dispatch configuration');
  }
  const started = now();
  let attemptedCalls = 0;
  let reservedCompletionTokens = 0;
  return Object.freeze({
    snapshot() { return { attemptedCalls, reservedCompletionTokens }; },
    async fetch(url, init) {
      let body;
      if (typeof init?.body !== 'string' || Buffer.byteLength(init.body) > config.maximumRequestBytes) {
        throw diagnosticFailure('dispatch-ceiling');
      }
      try { body = JSON.parse(init.body); }
      catch { throw diagnosticFailure('dispatch-ceiling'); }
      const remaining = config.maximumWallMs - (now() - started);
      if (String(url) !== config.endpoint || init.method !== 'POST' || body?.model !== config.model
          || body.reasoning_split !== true || attemptedCalls >= config.maximumCalls
          || !Number.isSafeInteger(body.max_completion_tokens) || body.max_completion_tokens < 1
          || body.max_completion_tokens > config.maximumReservedTokens - reservedCompletionTokens
          || !Number.isFinite(remaining) || remaining <= 0 || remaining > config.maximumWallMs) {
        throw diagnosticFailure('dispatch-ceiling');
      }
      const signal = AbortSignal.any([...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(Math.max(1, Math.floor(Math.min(config.timeoutMs, remaining))))]);
      // Reserve synchronously before physical dispatch; failure never refunds an
      // uncertain call and there is no internal retry.
      attemptedCalls++;
      reservedCompletionTokens += body.max_completion_tokens;
      return fetchImpl(url, { ...init, redirect: 'error', signal });
    },
  });
}
