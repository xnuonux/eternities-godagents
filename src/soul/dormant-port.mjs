export function createDormantSoulPort() {
  return Object.freeze({ schemaVersion: 1, status: 'dormant' });
}
