async function readBoundedBody(response, maxResponseBytes) {
  if (!response.body?.getReader) {
    const bodyText = await response.text();
    if (Buffer.byteLength(bodyText, 'utf8') > maxResponseBytes) {
      const error = new Error('response exceeded byte ceiling');
      error.name = 'ResponseTooLargeError';
      throw error;
    }
    return bodyText;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      const error = new Error('response exceeded byte ceiling');
      error.name = 'ResponseTooLargeError';
      throw error;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function createHttpsTransport({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  return async function httpsTransport({ url, method, headers, body, timeoutMs, maxResponseBytes = 1_048_576 }) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('network cortex transport requires HTTPS');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(parsed, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      const bodyText = await readBoundedBody(response, maxResponseBytes);
      return {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? '' },
        bodyText,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error('network cortex request timed out');
        timeoutError.name = 'AbortError';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

