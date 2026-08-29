import net from 'node:net';

const importOption = `--import=${import.meta.url}`;
const existingNodeOptions = process.env.NODE_OPTIONS?.trim() ?? '';
if (!existingNodeOptions.includes(importOption)) {
  process.env.NODE_OPTIONS = [existingNodeOptions, importOption].filter(Boolean).join(' ');
}

function blockedNetworkError() {
  const error = new Error('external network disabled by certification guard');
  error.name = 'CertificationNetworkBlockedError';
  return error;
}

globalThis.fetch = async () => {
  throw blockedNetworkError();
};

net.Socket.prototype.connect = function blockedSocketConnect() {
  throw blockedNetworkError();
};
