import net from 'node:net';
import '../../src/certification/no-network-guard.mjs';

// Observe attempts, then delegate to the existing deny-all guard. No URL/header/body is reported.
const blockedFetch = globalThis.fetch;
globalThis.fetch = (...args) => {
  process.send?.({ event: 'network-attempt', transport: 'fetch' });
  return blockedFetch(...args);
};
const blockedConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  process.send?.({ event: 'network-attempt', transport: 'socket' });
  return blockedConnect.apply(this, args);
};
