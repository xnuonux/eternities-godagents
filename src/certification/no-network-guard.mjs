import net from 'node:net';

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

